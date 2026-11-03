import {and,eq,inArray} from 'drizzle-orm';
import {z} from 'zod';
import {AsyncLocalStorage} from 'node:async_hooks';
import type {Database} from './client';
import * as s from './schema';
import {WorkflowError} from './schedule-workflow';
import {lockPromotionWorkflow} from './promotion-pauses';
import {shanghaiDateKey} from './promotion-rules.mjs';
import {adjacentMonth,monthWeeks,weekOf,type PlanContent,type PlanGroup} from './monthly-plan-types';
import {meetingValueKey as sourceHash} from './meeting-discussion-values';
import {formatSlotRange,normalizeBlock} from './annual-plan-rules.mjs';

const groupSchema=z.object({id:z.string().min(1),annualPlanId:z.uuid().nullable(),annualVersion:z.number().int().nullable(),name:z.string().min(1).max(200),subjectId:z.string(),categoryId:z.string(),note:z.string().max(4000),reason:z.string().max(2000),quantity:z.number().int().min(0).max(1000).nullable()}).strict();
const itemSchema=z.object({id:z.uuid(),groupId:z.string(),week:z.number().int().min(1).max(5).nullable(),kind:z.enum(['new','carry','existing']),scheduleId:z.uuid().nullable()}).strict();
export const planContentSchema=z.object({groups:z.array(groupSchema).max(200),items:z.array(itemSchema).max(2000)}).strict();
export const monthlyPlanDraftSchema=z.object({id:z.uuid(),expectedRevision:z.number().int().nonnegative(),editorSteps:z.record(z.string(),z.enum(['quantity','weeks','confirmed'])).optional(),content:planContentSchema,additions:z.array(z.object({id:z.uuid(),reason:z.string().max(2000),content:planContentSchema})).max(100)}).strict();
export type MonthlyPlanDraft=z.infer<typeof monthlyPlanDraftSchema>;
const proposalScope=new AsyncLocalStorage<string>();
export const withMonthlyProposal=<T>(id:string,action:()=>Promise<T>)=>proposalScope.run(id,action);
const dateKey=(date:Date)=>shanghaiDateKey(date);
export const allPlanItems=(plan:{content:PlanContent;additions:Array<{content:PlanContent}>})=>[...plan.content.items,...plan.additions.flatMap(b=>b.content.items)];
export const allPlanGroups=(plan:{content:PlanContent;additions:Array<{content:PlanContent}>})=>[...plan.content.groups,...plan.additions.flatMap(b=>b.content.groups)];
export async function monthlyPlanCandidates(db:Database,month:string){
 const rows=await db.select({id:s.operationsContentSchedule.id,name:s.operationsContentVersion.contentName,subjectId:s.operationsContentVersion.subjectId,categoryId:s.operationsContentVersion.categoryId,versionNumber:s.operationsContentVersion.versionNumber,plannedAt:s.operationsContentSchedule.plannedPublishAt,actualAt:s.operationsContentSchedule.actualPublishAt}).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentVersion.id,s.operationsContentSchedule.contentVersionId));
 return rows.filter(r=>(!r.actualAt&&dateKey(r.plannedAt).startsWith(adjacentMonth(month,-1)))||dateKey(r.plannedAt).startsWith(month)||r.actualAt&&dateKey(r.actualAt).startsWith(month)).map(r=>({...r,plannedAt:r.plannedAt.toISOString(),actualAt:r.actualAt?.toISOString()??null,kind:!r.actualAt&&dateKey(r.plannedAt).startsWith(adjacentMonth(month,-1))?'carry' as const:'existing' as const}));
}
export async function createMonthlyPlan(db:Database,meetingId:string,month:string):Promise<MonthlyPlanDraft>{
 await lockPromotionWorkflow(db);
 const [existing]=await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.month,month));
 if(existing&&existing.meetingId!==meetingId)throw new WorkflowError('这个执行月已有月计划，请继续原月会，避免重复制定。',409);
 const [plan]=existing?[existing]:await db.insert(s.operationsMonthlyPlan).values({meetingId,month}).returning();
 const annual=await db.select().from(s.operationsAnnualPlan).where(and(eq(s.operationsAnnualPlan.year,Number(month.slice(0,4))),eq(s.operationsAnnualPlan.isActive,true)));
 const blocks=annual.length?await db.select().from(s.operationsAnnualPlanBlock).where(inArray(s.operationsAnnualPlanBlock.planId,annual.map(r=>r.id))):[];
 const n=Number(month.slice(5,7));const groups:PlanGroup[]=annual.filter(row=>row.subjectId&&row.categoryId&&blocks.some(b=>b.planId===row.id&&b.startMonth<=n&&b.endMonth>=n)).map(row=>({id:row.id,annualPlanId:row.id,annualVersion:row.currentVersionNumber,name:row.rowName,subjectId:row.subjectId!,categoryId:row.categoryId!,note:[row.note,...blocks.filter(b=>b.planId===row.id&&b.startMonth<=n&&b.endMonth>=n).map(b=>`${formatSlotRange(normalizeBlock(b))} ${b.label??''} ${b.note??''}`)].filter(Boolean).join('；'),reason:'',quantity:null}));
 return {id:plan.id,expectedRevision:plan.revision,content:{groups,items:[]},additions:[]};
}
export async function checkMonthlyPlan(db:Database,draft:MonthlyPlanDraft,finalizing=false){
 const [plan]=await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.id,draft.id)).for('update');if(!plan)throw new WorkflowError('月计划不存在。',404);
 if(plan.revision!==draft.expectedRevision){if(sourceHash(plan.content)!==sourceHash(draft.content))throw new WorkflowError('月计划已更新，请刷新并核对，输入已保留。',409);draft.expectedRevision=plan.revision;}
 for(const old of plan.additions){const supplied=draft.additions.find(b=>b.id===old.id);if(supplied&&(sourceHash(supplied.content)!==sourceHash(old.content)||supplied.reason!==old.reason))throw new WorkflowError('已有追加任务保留原记录，请另加追加批次。',422);}
 draft.additions=[...plan.additions.map(({id,reason,content})=>({id,reason,content})),...draft.additions.filter(b=>!plan.additions.some(old=>old.id===b.id))];
 if(plan.firstFinalizedAt&&draft.content.items.some(i=>!plan.content.items.some(old=>old.id===i.id)))throw new WorkflowError('首次定稿后新增任务须单列追加，不能补入原名额。',422);
 if(plan.firstFinalizedAt&&draft.content.items.some(i=>i.scheduleId!==plan.content.items.find(old=>old.id===i.id)?.scheduleId))throw new WorkflowError('定稿后纳入已有排期须作为追加项。',422);
 if(plan.lockedAt&&sourceHash(plan.content)!==sourceHash(draft.content))throw new WorkflowError('首次周会已经锁定原计划，只能修改说明或新增追加项。',422);
 if(finalizing&&draft.editorSteps){const ids=[...(!plan.lockedAt?['original']:[]),...draft.additions.filter(b=>!plan.additions.some(old=>old.id===b.id)).map(b=>b.id)];if(ids.some(id=>draft.editorSteps?.[id]&&draft.editorSteps[id]!=='confirmed'))throw new WorkflowError('请先确认数量、分完Week并确认安排，再定稿。',422);}
 const taxonomy=await db.select().from(s.operationsSubjectCategory);const candidates=await monthlyPlanCandidates(db,plan.month);const scheduleIds=new Set<string>(),ids=new Set<string>(),groupIds=new Set<string>();
 const annual=await db.select().from(s.operationsAnnualPlan),knownGroups=allPlanGroups(plan),knownItems=allPlanItems(plan);
 for(const content of [draft.content,...draft.additions.map(a=>a.content)]){
  for(const g of content.groups){if(groupIds.has(g.id)||!taxonomy.some(m=>m.subjectId===g.subjectId&&m.categoryId===g.categoryId))throw new WorkflowError('月计划来源重复或学科分类失效。',422);groupIds.add(g.id);
   if(!g.annualPlanId&&!g.reason.trim())throw new WorkflowError('年度规划外的内容请补充原因。',422);
   if(g.annualPlanId&&!knownGroups.some(old=>old.id===g.id&&old.annualPlanId===g.annualPlanId)&&!annual.some(a=>a.id===g.annualPlanId&&a.subjectId===g.subjectId&&a.categoryId===g.categoryId&&a.year===Number(plan.month.slice(0,4))))throw new WorkflowError('年度来源与学科分类不匹配。',422);
   const items=content.items.filter(i=>i.groupId===g.id);if(items.length>(g.quantity??0)||finalizing&&items.length!==(g.quantity??0))throw new WorkflowError(`${g.name} 的数量尚未分配完整，请核对总数（已含遗留）。`,422);
  }
  for(const item of content.items){if(ids.has(item.id)||!content.groups.some(g=>g.id===item.groupId)||item.week&&item.week>monthWeeks(plan.month).length||finalizing&&!item.week)throw new WorkflowError('请核对名额身份，并在会后定稿前分完Week。',422);ids.add(item.id);
   if(item.kind!=='new'&&!item.scheduleId)throw new WorkflowError('遗留／已有名额必须选择真实排期。',422);
   if(item.scheduleId){const candidate=candidates.find(c=>c.id===item.scheduleId),g=content.groups.find(g=>g.id===item.groupId)!,known=knownItems.some(i=>i.id===item.id&&i.scheduleId===item.scheduleId&&i.kind===item.kind);if(scheduleIds.has(item.scheduleId)||!known&&(!candidate||candidate.subjectId!==g.subjectId||candidate.categoryId!==g.categoryId||candidate.kind!==item.kind))throw new WorkflowError('遗留／已有排期不匹配，或重复占用名额。',422);scheduleIds.add(item.scheduleId);}
  }
 }
 for(const batch of draft.additions)if(!batch.reason.trim())throw new WorkflowError('追加任务请填写原因。',422);
 // 已发布的追加记录和已提交的原名额不能在修订里消失。
 for(const batch of plan.additions){const next=draft.additions.find(b=>b.id===batch.id);if(!next||sourceHash(batch.content)!==sourceHash(next.content)||batch.reason!==next.reason)throw new WorkflowError('已有追加任务保留原记录，请另加追加批次。',422);}
 const assignments=await db.select().from(s.operationsMonthlyPlanAssignment).where(eq(s.operationsMonthlyPlanAssignment.planId,plan.id));
 if(assignments.some(a=>a.firstSubmittedAt&&!ids.has(a.itemId)))throw new WorkflowError('已有提交或排期的名额不能从计划中删除。',422);
 return plan;
}
export async function publishMonthlyPlan(db:Database,draft:MonthlyPlanDraft,meetingId:string,versionId:string,actor:string,now=new Date()){
 const plan=await checkMonthlyPlan(db,draft,true);if(plan.meetingId!==meetingId)throw new WorkflowError('月计划与会议不匹配。',422);
 const additions=[...plan.additions,...draft.additions.filter(b=>!plan.additions.some(old=>old.id===b.id)).map(b=>({...b,at:now.toISOString(),actor}))];
 const changed=!plan.firstFinalizedAt||sourceHash(plan.content)!==sourceHash(draft.content)||additions.length!==plan.additions.length;
 if(changed)await db.update(s.operationsMonthlyPlan).set({content:draft.content,additions,firstFinalizedAt:plan.firstFinalizedAt??now,sourceVersionId:versionId,revision:plan.revision+1,updatedAt:now}).where(eq(s.operationsMonthlyPlan.id,plan.id));
 for(const item of [...draft.content.items,...additions.flatMap(b=>b.content.items)].filter(i=>i.scheduleId)){
  const [schedule]=await db.select().from(s.operationsContentSchedule).where(eq(s.operationsContentSchedule.id,item.scheduleId!));
  const ready=dateKey(schedule.plannedPublishAt).startsWith(plan.month)||!!schedule.actualPublishAt&&dateKey(schedule.actualPublishAt).startsWith(plan.month);
  await db.insert(s.operationsMonthlyPlanAssignment).values({planId:plan.id,itemId:item.id,scheduleId:item.scheduleId,firstSubmittedAt:ready?now:null,history:[]}).onConflictDoNothing();
 }
 return {...draft,expectedRevision:plan.revision+(changed?1:0)};
}
export async function readMonthlyPlan(db:Database,month:string,now=new Date()){
 const [plan]=await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.month,month));if(!plan)return null;
 const assignments=await db.select().from(s.operationsMonthlyPlanAssignment).where(eq(s.operationsMonthlyPlanAssignment.planId,plan.id));
 const proposalIds=assignments.flatMap(a=>a.proposalId?[a.proposalId]:[]),proposals=proposalIds.length?await db.select().from(s.operationsChangeProposal).where(inArray(s.operationsChangeProposal.id,proposalIds)):[];
 const ids=assignments.flatMap(a=>a.scheduleId?[a.scheduleId]:[]);const schedules=ids.length?await db.select({id:s.operationsContentSchedule.id,name:s.operationsContentVersion.contentName,plannedAt:s.operationsContentSchedule.plannedPublishAt,actualAt:s.operationsContentSchedule.actualPublishAt}).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentSchedule.contentVersionId,s.operationsContentVersion.id)).where(inArray(s.operationsContentSchedule.id,ids)):[];
 const groups=allPlanGroups(plan);const items=allPlanItems(plan).map(item=>{const assignment=assignments.find(a=>a.itemId===item.id),schedule=schedules.find(r=>r.id===assignment?.scheduleId),proposal=proposals.find(p=>p.id===assignment?.proposalId),batch=plan.additions.find(b=>b.content.items.some(i=>i.id===item.id));
  const start=batch?.at??plan.firstFinalizedAt?.toISOString()??null,deadline=start?new Date(new Date(start).getTime()+48*3600000).toISOString():null;
  const pending=proposal?.status==='pending',ready=!!schedule&&(dateKey(schedule.plannedAt).startsWith(month)||!!schedule.actualAt&&dateKey(schedule.actualAt).startsWith(month)||assignment?.history.some(h=>h.phase==='applied'));
  return {...item,ordinal:allPlanItems(plan).filter(i=>i.groupId===item.groupId).findIndex(i=>i.id===item.id)+1,group:groups.find(g=>g.id===item.groupId)!,addition:!!batch,reason:batch?.reason??'',deadline,submittedAt:assignment?.firstSubmittedAt?.toISOString()??null,timely:deadline&&assignment?.firstSubmittedAt?assignment.firstSubmittedAt.getTime()<=new Date(deadline).getTime():null,overdue:!!deadline&&now.getTime()>new Date(deadline).getTime()&&!assignment?.firstSubmittedAt,pending,status:pending?'pending':proposal&&['rejected','obsolete'].includes(proposal.status)?'rejected':ready?'scheduled':'unassigned',crossWeek:!!schedule&&(dateKey(schedule.plannedAt).slice(0,7)!==month||weekOf(dateKey(schedule.plannedAt))!==item.week),schedule:schedule?{...schedule,plannedAt:schedule.plannedAt.toISOString(),actualAt:schedule.actualAt?.toISOString()??null}:null,history:assignment?.history??[]};
 });
 return {id:plan.id,month,meetingId:plan.meetingId,revision:plan.revision,content:plan.content,additions:plan.additions,firstFinalizedAt:plan.firstFinalizedAt?.toISOString()??null,sourceVersionId:plan.sourceVersionId,lockedAt:plan.lockedAt?.toISOString()??null,lockedByVersionId:plan.lockedByVersionId,items};
}
export type MonthlyPlanView=NonNullable<Awaited<ReturnType<typeof readMonthlyPlan>>>;
async function checkedMonthlyReference(db:Database,ref:{id:string;expectedRevision:number}){
 const [plan]=await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.id,ref.id)).for('update');if(!plan?.firstFinalizedAt)throw new WorkflowError('请先完成月计划会后定稿。',422);if(plan.revision!==ref.expectedRevision)throw new WorkflowError('月计划已变化，请刷新核对后再定稿。',409);return plan;
}
export async function readReferencedMonthlyPlan(db:Database,ref:{id:string;expectedRevision:number},now=new Date()){const plan=await checkedMonthlyReference(db,ref);return readMonthlyPlan(db,plan.month,now);}
export async function lockReferencedMonthlyPlan(db:Database,ref:{id:string;expectedRevision:number}|undefined,versionId:string,now=new Date()){
 if(!ref)return null;const plan=await checkedMonthlyReference(db,ref);
 if(!plan.lockedAt)await db.update(s.operationsMonthlyPlan).set({lockedAt:now,lockedByVersionId:versionId,updatedAt:now}).where(eq(s.operationsMonthlyPlan.id,plan.id));return readMonthlyPlan(db,plan.month,now);
}
export async function deleteUnpublishedMonthlyPlan(db:Database,meetingId:string){const plans=await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.meetingId,meetingId));if(plans.some(p=>p.firstFinalizedAt))throw new WorkflowError('已有生效月计划，不能删除。',409);await db.delete(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.meetingId,meetingId));}

export type MonthlyScheduleInput={planId:string;itemId:string;requestId:string;reason:string;expectedRevision:number};
export function monthlyScheduleInput(form:FormData):MonthlyScheduleInput|null{
 const planId=String(form.get('monthlyPlanId')??'');if(!planId)return null;
 const parsed=z.object({planId:z.uuid(),itemId:z.union([z.literal(''),z.uuid()]),requestId:z.uuid(),reason:z.string().trim().max(2000),expectedRevision:z.coerce.number().int().nonnegative()}).safeParse({planId,itemId:String(form.get('monthlyPlanItemId')??''),requestId:String(form.get('monthlyRequestId')??''),reason:String(form.get('monthlyPlanReason')||form.get('planChangeReason')||form.get('reason')||''),expectedRevision:form.get('monthlyExpectedRevision')});
 if(!parsed.success)throw new WorkflowError('请重新选择月计划来源。',422);return parsed.data;
}
async function claim(db:Database,input:MonthlyScheduleInput,scheduleId:string|null,proposalId:string|null,actor:string,details:{subjectId:string;categoryId:string|null;name:string;plannedAt:Date},now=new Date()){
 await lockPromotionWorkflow(db);const [plan]=await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.id,input.planId)).for('update');if(!plan?.firstFinalizedAt)throw new WorkflowError('月计划尚未会后定稿。',422);
 if(plan.revision!==input.expectedRevision&&!proposalId)throw new WorkflowError('月计划已变化，请刷新核对，输入已保留。',409);
 const itemId=input.itemId||input.requestId;let item=allPlanItems(plan).find(i=>i.id===itemId),group=item&&allPlanGroups(plan).find(g=>g.id===item!.groupId);
 if(!item){if(input.itemId||!input.reason)throw new WorkflowError('计划外追加请填写原因。',422);const content:PlanContent={groups:[{id:itemId,annualPlanId:null,annualVersion:null,name:details.name,subjectId:details.subjectId,categoryId:details.categoryId!,quantity:1,note:'',reason:input.reason}],items:[{id:itemId,groupId:itemId,week:weekOf(dateKey(details.plannedAt)),kind:'new',scheduleId:null}]};
  const batch={id:itemId,at:now.toISOString(),actor,reason:input.reason,content};await db.update(s.operationsMonthlyPlan).set({additions:[...plan.additions,batch],revision:plan.revision+1,updatedAt:now}).where(eq(s.operationsMonthlyPlan.id,plan.id));item=content.items[0];group=content.groups[0];
 }
 if(group!.subjectId!==details.subjectId||group!.categoryId!==details.categoryId)throw new WorkflowError('帖子学科或分类与所选计划不一致，请更换来源。',422);
 const cross=dateKey(details.plannedAt).slice(0,7)!==plan.month||weekOf(dateKey(details.plannedAt))!==item.week;if(cross&&!input.reason)throw new WorkflowError('跨Week安排请填写调整原因。',422);
 const [old]=await db.select().from(s.operationsMonthlyPlanAssignment).where(and(eq(s.operationsMonthlyPlanAssignment.planId,plan.id),eq(s.operationsMonthlyPlanAssignment.itemId,itemId))).for('update');
 if(old?.proposalId&&old.proposalId!==proposalId){const [proposal]=await db.select().from(s.operationsChangeProposal).where(eq(s.operationsChangeProposal.id,old.proposalId));if(proposal?.status==='pending')throw new WorkflowError('该名额已有待审核提交，请先处理。',409);}
 if(old?.scheduleId&&old.scheduleId!==scheduleId)throw new WorkflowError('这个原计划名额已关联其他排期。',409);
 if(scheduleId){const occupied=await db.select().from(s.operationsMonthlyPlanAssignment).where(and(eq(s.operationsMonthlyPlanAssignment.planId,plan.id),eq(s.operationsMonthlyPlanAssignment.scheduleId,scheduleId)));if(occupied.some(a=>a.itemId!==itemId))throw new WorkflowError('同一排期不能重复占用本月名额。',409);}
 const values={scheduleId:scheduleId??old?.scheduleId??null,proposalId,firstSubmittedAt:old?.firstSubmittedAt??now,updatedAt:now,history:[...(old?.history??[]),{phase:proposalId&&!proposalScope.getStore()?'submitted' as const:'applied' as const,at:now.toISOString(),actor,...(scheduleId?{scheduleId}:{}),...(proposalId?{proposalId}:{}),reason:input.reason}]};
 if(old)await db.update(s.operationsMonthlyPlanAssignment).set(values).where(eq(s.operationsMonthlyPlanAssignment.id,old.id));else await db.insert(s.operationsMonthlyPlanAssignment).values({planId:plan.id,itemId,...values});
}
export async function claimMonthlySchedule(db:Database,input:MonthlyScheduleInput|null,scheduleId:string,actor:string,creating=false){
 const [row]=await db.select({subjectId:s.operationsContentVersion.subjectId,categoryId:s.operationsContentVersion.categoryId,name:s.operationsContentVersion.contentName,plannedAt:s.operationsContentSchedule.plannedPublishAt}).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentVersion.id,s.operationsContentSchedule.contentVersionId)).where(eq(s.operationsContentSchedule.id,scheduleId));
 if(input){if(input.itemId&&!creating){const linked=await db.select().from(s.operationsMonthlyPlanAssignment).where(and(eq(s.operationsMonthlyPlanAssignment.planId,input.planId),eq(s.operationsMonthlyPlanAssignment.itemId,input.itemId)));if(!linked.some(a=>a.scheduleId===scheduleId))throw new WorkflowError('未关联帖子事后纳入须选择追加项，不能占用原空名额。',422);}await claim(db,input,scheduleId,proposalScope.getStore()??null,actor,row);}
 else{const linked=await db.select().from(s.operationsMonthlyPlanAssignment).where(eq(s.operationsMonthlyPlanAssignment.scheduleId,scheduleId));if(linked.length)throw new WorkflowError('请保留月计划来源，并填写必要的跨周调整原因。',422);}
}
export async function reserveMonthlyProposal(db:Database,proposalId:string,request:Request,actor:string){
 if(!request.headers.get('content-type')?.includes('form'))return;const form=await request.clone().formData(),input=monthlyScheduleInput(form);if(!input)return;
 const [proposal]=await db.select().from(s.operationsChangeProposal).where(eq(s.operationsChangeProposal.id,proposalId));
 const existingId=proposal.target.startsWith('schedule:')?proposal.target.slice(9):null;
 await claim(db,input,existingId,proposalId,actor,{subjectId:String(form.get('subjectId')),categoryId:String(form.get('categoryId')),name:String(form.get('contentName')),plannedAt:new Date(String(form.get('plannedPublishAt'))+':00+08:00')});
}
