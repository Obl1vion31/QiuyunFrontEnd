import {and,eq,inArray,or,gte,lt,sql} from 'drizzle-orm';
import type {Database} from './client';
import * as s from './schema';
import {allPlanGroups,readMonthlyPlan,currentMonthlyProposal} from './monthly-plans';
import {adjacentMonth,weekOf} from './monthly-plan-types';
import {shanghaiDateKey} from './promotion-rules.mjs';
import {StaleWriteError,WorkflowError} from './schedule-workflow';
import {lockPromotionWorkflow} from './promotion-pauses';
import {scheduleWriteVersion} from './schedule-write-version';
import {monthlySubmittedAt,monthlyLinkState,linkScope,assignmentVersion,linkRequestHash,type MonthlyLinksInput,type MonthlyLinkState} from './monthly-link-state';

const monthStart=(month:string)=>new Date(month+'-01T00:00:00+08:00');
export async function readMonthlyCalendar(db:Database,month:string){
 const plan=await readMonthlyPlan(db,month);if(!plan?.firstFinalizedAt)return plan?{...plan,linkGroups:[],occupiedScheduleIds:[],reservedScheduleIds:[]}:null;
 const state=(await monthlyLinkState(db,plan.id))!;
 const keys=[...new Set(state.items.filter(i=>i.kind==='new'&&!i.scheduleId).map(i=>JSON.stringify([i.groupId,i.week])))];
 const linkGroups=keys.map(key=>{
  const [groupId,week]=JSON.parse(key) as [string,number],items=linkScope(state,groupId,week),rows=state.assignments.filter(a=>items.some(i=>i.id===a.itemId));
  const pending=items.filter(i=>plan.items.find(p=>p.id===i.id)?.pending).length;
  const scheduleIds=rows.flatMap(a=>a.scheduleId&&plan.items.some(i=>i.id===a.itemId&&i.linked)?[a.scheduleId]:[]);
  return {key,groupId,week,name:allPlanGroups(state.plan).find(g=>g.id===groupId)!.name,
   subjectId:allPlanGroups(state.plan).find(g=>g.id===groupId)!.subjectId,categoryId:allPlanGroups(state.plan).find(g=>g.id===groupId)!.categoryId,
   quantity:items.length,linked:scheduleIds.length,pending,remaining:items.length-scheduleIds.length-items.filter(i=>plan.items.find(p=>p.id===i.id)?.pending&&!scheduleIds.includes(rows.find(a=>a.itemId===i.id)?.scheduleId??'')).length,
   scheduleIds,itemIds:items.map(i=>i.id),assignmentVersion:assignmentVersion(state,groupId,week),
   addition:plan.items.find(i=>i.id===items[0]?.id)?.addition??false,
   overdue:items.some(i=>plan.items.find(p=>p.id===i.id)?.overdue)};
 });
 return {...plan,linkGroups,occupiedScheduleIds:state.assignments.flatMap(a=>a.scheduleId?[a.scheduleId]:[]),
  reservedScheduleIds:[...new Set(state.pending.flatMap(p=>p.input.scheduleIds))]};
}
export type MonthlyCalendarView=NonNullable<Awaited<ReturnType<typeof readMonthlyCalendar>>>;
export async function monthlyLinkCandidates(db:Database,planId:string,groupId:string,week:number){
 const state=await monthlyLinkState(db,planId);if(!state?.plan.firstFinalizedAt)throw new WorkflowError('月计划尚未会后定稿。',422);
 if(state.plan.arrangementStatus==='confirmed')throw new WorkflowError('月会及计划已封存，不能更改原计划关联；后续调整请在排期页留原因。',403);
 const group=allPlanGroups(state.plan).find(g=>g.id===groupId);if(!group||!linkScope(state,groupId,week).length)throw new WorkflowError('请选择有效计划。',422);
 const related=state.assignments.filter(a=>linkScope(state,groupId,week).some(i=>i.id===a.itemId)).flatMap(a=>a.scheduleId?[a.scheduleId]:[]);
 return readCandidates(db,or(and(gte(s.operationsContentSchedule.plannedPublishAt,monthStart(state.plan.month)),lt(s.operationsContentSchedule.plannedPublishAt,monthStart(adjacentMonth(state.plan.month,1)))),related.length?inArray(s.operationsContentSchedule.id,related):sql`false`),group.subjectId,group.categoryId);
}
async function readCandidates(db:Database,where:ReturnType<typeof and>,subjectId?:string,categoryId?:string){
 return db.select({id:s.operationsContentSchedule.id,name:s.operationsContentVersion.contentName,subjectId:s.operationsContentVersion.subjectId,categoryId:s.operationsContentVersion.categoryId,
  plannedAt:s.operationsContentSchedule.plannedPublishAt,writeVersion:scheduleWriteVersion,
  createdAt:s.operationsContentSchedule.createdAt,versionCreatedAt:s.operationsContentVersion.createdAt,versionUpdatedAt:s.operationsContentVersion.updatedAt,planEffectiveAt:s.operationsContentSchedule.planEffectiveAt})
 .from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentVersion.id,s.operationsContentSchedule.contentVersionId)).innerJoin(s.operationsContent,eq(s.operationsContent.id,s.operationsContentVersion.contentId))
 .where(and(where,subjectId?eq(s.operationsContentVersion.subjectId,subjectId):undefined,categoryId?eq(s.operationsContentVersion.categoryId,categoryId):undefined));
}
function scopeRows(state:MonthlyLinkState,input:MonthlyLinksInput){const ids=new Set(linkScope(state,input.groupId,input.week).map(i=>i.id));return state.assignments.filter(a=>ids.has(a.itemId));}
export async function monthlyLinksSnapshot(db:Database,planId:string,input:MonthlyLinksInput,ignoreProposalId?:string){
 const state=await monthlyLinkState(db,planId);if(!state)throw new WorkflowError('月计划不存在。',404);
 const rows=scopeRows(state,input),ids=[...new Set([...input.scheduleIds,...rows.flatMap(a=>a.scheduleId?[a.scheduleId]:[])])];
 const posts=ids.length?await readCandidates(db,inArray(s.operationsContentSchedule.id,ids)):[];
 return {monthlyLinks:{name:allPlanGroups(state.plan).find(g=>g.id===input.groupId)?.name??'',week:input.week,
  revision:state.plan.revision,assignmentVersion:assignmentVersion(state,input.groupId,input.week,ignoreProposalId),
  bindings:linkScope(state,input.groupId,input.week).map(i=>{const a=rows.find(a=>a.itemId===i.id);return {itemId:i.id,scheduleId:a?.scheduleId??null,name:posts.find(p=>p.id===a?.scheduleId)?.name??''};}),
  posts:posts.map(p=>({id:p.id,name:p.name,writeVersion:p.writeVersion})).sort((a,b)=>a.id.localeCompare(b.id))}};
}
export async function repeatedMonthlyLinks(db:Database,planId:string,input:MonthlyLinksInput){
 const state=await monthlyLinkState(db,planId);if(!state)return null;
 const entry=state.assignments.flatMap(a=>a.history).find(h=>h.linkRequestId===input.requestId);
 if(!entry)return null;
 if(entry.linkRequestHash!==linkRequestHash(input))throw new WorkflowError('请求标识已使用，请重新操作。',422);
 if(entry.proposalId){const [p]=await db.select({status:s.operationsChangeProposal.status,result:s.operationsChangeProposal.result}).from(s.operationsChangeProposal).where(eq(s.operationsChangeProposal.id,entry.proposalId));if(p?.status==='pending')return Response.json({status:'pending_approval',requestId:entry.proposalId,message:'已提交管理员审核。'},{status:202});if(p?.status!=='approved')return Response.json({status:p?.status,message:'这次关联申请已处理，请重新选择。'},{status:409});}
 return Response.json({ok:true,repeated:true,plan:await readMonthlyCalendar(db,state.plan.month)});
}
async function validateLinks(db:Database,planId:string,input:MonthlyLinksInput,ignoreProposalId?:string){
 const state=await monthlyLinkState(db,planId);if(!state?.plan.firstFinalizedAt)throw new WorkflowError('月计划尚未会后定稿。',422);
 const items=linkScope(state,input.groupId,input.week),group=allPlanGroups(state.plan).find(g=>g.id===input.groupId);
 if(!group||!items.length)throw new WorkflowError('原计划明确指定的帖子不能在此替换。',422);
 if(state.plan.revision!==input.expectedRevision||assignmentVersion(state,input.groupId,input.week,ignoreProposalId)!==input.expectedAssignmentVersion)throw new StaleWriteError();
 if(input.scheduleIds.length>items.length)throw new WorkflowError('选择数量超过原计划名额，额外任务请单列追加。',422);
 if(state.pending.some(p=>p.id!==ignoreProposalId&&p.input.groupId===input.groupId&&p.input.week===input.week)||scopeRows(state,input).some(a=>a.proposalId!==ignoreProposalId&&state.proposals.some(p=>p.id===a.proposalId&&p.status==='pending')))throw new WorkflowError('这项计划已有待审核关联，请先处理。',422);
 const old=scopeRows(state,input),oldIds=old.flatMap(a=>a.scheduleId?[a.scheduleId]:[]),ids=[...new Set([...oldIds,...input.scheduleIds])],posts=ids.length?await readCandidates(db,inArray(s.operationsContentSchedule.id,ids)):[];
 for(const id of ids)if(!input.versions[id]||posts.find(p=>p.id===id)?.writeVersion!==input.versions[id])throw new StaleWriteError();
 for(const id of input.scheduleIds){
  const post=posts.find(p=>p.id===id)!;
  if(post.subjectId!==group.subjectId||post.categoryId!==group.categoryId)throw new WorkflowError('请选择相同学科、相同帖子分类的排期。',422);
  const same=oldIds.includes(id);
  if(!same&&!shanghaiDateKey(post.plannedAt).startsWith(state.plan.month))throw new WorkflowError('请选择执行月月历中的帖子。',422);
  if(state.assignments.some(a=>a.scheduleId===id&&!items.some(i=>i.id===a.itemId))||state.pending.some(p=>p.id!==ignoreProposalId&&(p.input.groupId!==input.groupId||p.input.week!==input.week)&&p.input.scheduleIds.includes(id)))throw new StaleWriteError('该帖子刚被关联到其他计划，请刷新页面。');
 }
 const removed=oldIds.some(id=>!input.scheduleIds.includes(id));
 const cross=input.scheduleIds.some(id=>!oldIds.includes(id)&&weekOf(shanghaiDateKey(posts.find(p=>p.id===id)!.plannedAt))!==input.week);
 if((removed||cross)&&!input.reason)throw new WorkflowError(removed?'更正或解除关联请填写原因。':'跨Week关联请填写调整原因。',422);
 if(oldIds.length===input.scheduleIds.length&&oldIds.every(id=>input.scheduleIds.includes(id)))throw new WorkflowError('关联内容没有变化。',422);
 // 保留已有配对，再按日期和ID分配剩余空位，避免勾选顺序改变名额身份。
 const available=input.scheduleIds.filter(id=>!oldIds.includes(id)).sort((a,b)=>posts.find(p=>p.id===a)!.plannedAt.getTime()-posts.find(p=>p.id===b)!.plannedAt.getTime()||a.localeCompare(b));
 const desired=items.map(item=>{const current=old.find(a=>a.itemId===item.id)?.scheduleId;return {itemId:item.id,scheduleId:current&&input.scheduleIds.includes(current)?current:available.shift()??null};});
 return {state,items,old,posts,desired};
}
export async function saveMonthlyLinks(db:Database,planId:string,input:MonthlyLinksInput,actor:string,proposalId?:string,reserve=false){
 await lockPromotionWorkflow(db);
 const [locked]=await db.select({id:s.operationsMonthlyPlan.id}).from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.id,planId)).for('update');
 if(!locked)throw new WorkflowError('月计划不存在。',404);
 if(!reserve&&!proposalId){const repeated=await repeatedMonthlyLinks(db,planId,input);if(repeated)return repeated;}
 const checked=await validateLinks(db,planId,input,proposalId),now=new Date(),hash=linkRequestHash(input);
 // 未改变的名额不产生业务历史；请求键保存在真实变更记录中。
 const changes=checked.desired.filter(d=>d.scheduleId!==(checked.old.find(a=>a.itemId===d.itemId)?.scheduleId??null));
 const changedRows=checked.old.filter(a=>changes.some(d=>d.itemId===a.itemId));
 if(!reserve&&changedRows.length)await db.update(s.operationsMonthlyPlanAssignment).set({scheduleId:null}).where(inArray(s.operationsMonthlyPlanAssignment.id,changedRows.map(a=>a.id)));
 for(const desired of changes){
  const old=checked.old.find(a=>a.itemId===desired.itemId),post=checked.posts.find(p=>p.id===desired.scheduleId);
  const first=old?.firstSubmittedAt??(post?await monthlySubmittedAt(db,post,now):null);
  const entry={phase:reserve?'submitted' as const:'applied' as const,at:now.toISOString(),actor,reason:input.reason,...(proposalId?{proposalId}:{}),...(desired.scheduleId?{scheduleId:desired.scheduleId}:{}),
   previousScheduleId:old?.scheduleId??null,previousScheduleName:checked.posts.find(p=>p.id===old?.scheduleId)?.name??null,scheduleName:post?.name??null,linkRequestId:input.requestId,linkRequestHash:hash,action:'link' as const};
  const values={scheduleId:reserve?old?.scheduleId??null:desired.scheduleId,proposalId:reserve&&desired.scheduleId!==(old?.scheduleId??null)?proposalId??null:null,firstSubmittedAt:first,updatedAt:now,history:[...(old?.history??[]),entry]};
  if(old)await db.update(s.operationsMonthlyPlanAssignment).set(values).where(eq(s.operationsMonthlyPlanAssignment.id,old.id));
  else await db.insert(s.operationsMonthlyPlanAssignment).values({planId,itemId:desired.itemId,...values});
 }
 if(reserve)return;
 return Response.json({ok:true,plan:await readMonthlyCalendar(db,checked.state.plan.month)});
}
export async function applyMonthlyLinks(db:Database,planId:string,input:MonthlyLinksInput,actor:string){return saveMonthlyLinks(db,planId,input,actor,currentMonthlyProposal());}
