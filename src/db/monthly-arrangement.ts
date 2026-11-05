import {createHash} from 'node:crypto';
import {and,eq,desc,gte,lt,isNull,sql} from 'drizzle-orm';
import type {Database} from './client';
import type {OperationsUser} from '../auth/permissions';
import {requireAdmin} from '../auth/permissions';
import {WorkflowError} from './schedule-workflow';
import {lockPromotionWorkflow} from './promotion-pauses';
import {adjacentMonth,weekOf,type PlanContent,type PlanGroup} from './monthly-plan-types';
import * as s from './schema';

export class ArrangementError extends WorkflowError {
 constructor(public override readonly code:string,message:string,status=409){super(message,status);}
}
export const dateMonth=(date:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).format(date);
const dateKey=(date:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(date);
export async function arrangementRows(db:Database,month:string){
 return db.select({id:s.operationsContentSchedule.id,contentId:s.operationsContentVersion.contentId,versionId:s.operationsContentVersion.id,
  subjectName:s.operationsSubject.name,categoryName:s.operationsCategory.name,versionNumber:s.operationsContentVersion.versionNumber,name:s.operationsContentVersion.contentName,subjectId:s.operationsContentVersion.subjectId,
  categoryId:s.operationsContentVersion.categoryId,operationType:s.operationsContent.operationType,contentRole:s.operationsContent.contentRole,
  isPromoted:s.operationsContentSchedule.isPromoted,syncToMoments:s.operationsContentSchedule.syncToMoments,
  plannedItemId:sql<string|null>`(select a.item_id from operations_monthly_plan_assignment a join operations_monthly_plan p on p.id=a.plan_id where a.schedule_id=${s.operationsContentSchedule.id} and p.month=${month} limit 1)`,
  plannedAt:s.operationsContentSchedule.plannedPublishAt,actualAt:s.operationsContentSchedule.actualPublishAt})
 .from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentVersion.id,s.operationsContentSchedule.contentVersionId))
 .innerJoin(s.operationsContent,eq(s.operationsContent.id,s.operationsContentVersion.contentId))
 .innerJoin(s.operationsSubject,eq(s.operationsSubject.id,s.operationsContentVersion.subjectId)).leftJoin(s.operationsCategory,eq(s.operationsCategory.id,s.operationsContentVersion.categoryId))
 .where(and(isNull(s.operationsContentSchedule.cancelledAt),gte(s.operationsContentSchedule.plannedPublishAt,new Date(month+'-01T00:00:00+08:00')),lt(s.operationsContentSchedule.plannedPublishAt,new Date(adjacentMonth(month,1)+'-01T00:00:00+08:00'))))
 .orderBy(s.operationsContentSchedule.plannedPublishAt,s.operationsContentSchedule.id);
}
type Plan=typeof s.operationsMonthlyPlan.$inferSelect;
export const arrangementFingerprint=(plan:Plan,rows:Awaited<ReturnType<typeof arrangementRows>>)=>createHash('sha256').update(JSON.stringify({
 revision:plan.revision,content:plan.content,additions:plan.additions,
 rows:rows.map(({actualAt,...structure})=>structure)
})).digest('hex');
export async function readArrangement(db:Database,month:string){
 const [plan]=await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.month,month));
 if(!plan)return {month,stage:'closed' as const,planId:null,rows:[],fingerprint:'',preplanned:0,history:[]};
 const rows=await arrangementRows(db,month);
 return {month,planId:plan.id,stage:!plan.firstFinalizedAt?'closed' as const:plan.arrangementStatus,
  rows,fingerprint:arrangementFingerprint(plan,rows),preplanned:plan.content.items.length+plan.additions.reduce((n,b)=>n+b.content.items.length,0),
  history:plan.arrangementHistory};
}
export async function assertMeetingMutable(db:Database,meetingId:string){
 const [plan]=await db.select({sealed:s.operationsMonthlyPlan.sealedVersionId}).from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.meetingId,meetingId));
 if(plan?.sealed)throw new ArrangementError('MONTHLY_MEETING_SEALED','月例会已封存，会议和计划不能再编辑。后续调整请在排期页填写原因。',403);
}
/** 原预排期保留在既有版本；最终基准由管理员看到的首轮实际安排形成。 */
export async function arrangedContent(db:Database,plan:Plan,rows:Awaited<ReturnType<typeof arrangementRows>>):Promise<PlanContent>{
 const original=[...plan.content.items,...plan.additions.flatMap(b=>b.content.items)];
 const groups:PlanGroup[]=structuredClone([...plan.content.groups,...plan.additions.flatMap(b=>b.content.groups)]).map(g=>({...g,quantity:0}));
 const assignments=await db.select().from(s.operationsMonthlyPlanAssignment).where(eq(s.operationsMonthlyPlanAssignment.planId,plan.id));
 const used=new Set<string>();
 const items=rows.map(row=>{
  const link=assignments.find(a=>a.scheduleId===row.id);
  const old=original.find(i=>i.id===link?.itemId||i.scheduleId===row.id)??original.find(i=>!used.has(i.id)&&groups.some(g=>g.id===i.groupId&&g.subjectId===row.subjectId&&g.categoryId===row.categoryId)&&i.week===weekOf(dateKey(row.plannedAt)))??original.find(i=>!used.has(i.id)&&groups.some(g=>g.id===i.groupId&&g.subjectId===row.subjectId&&g.categoryId===row.categoryId));
  if(old)used.add(old.id);
  let group=groups.find(g=>g.id===old?.groupId&&g.subjectId===row.subjectId&&g.categoryId===row.categoryId)??groups.find(g=>g.subjectId===row.subjectId&&g.categoryId===row.categoryId);
  if(!group){const id='calendar:'+row.subjectId+':'+row.categoryId;group=groups.find(g=>g.id===id);if(!group){group={id,annualPlanId:null,annualVersion:null,name:row.name,subjectId:row.subjectId,categoryId:row.categoryId!,quantity:0,note:'',reason:'首轮排期核对确认'};groups.push(group);}}
  group.quantity=(group.quantity??0)+1;
  return {id:old?.id??link?.itemId??row.id,groupId:group.id,week:weekOf(dateKey(row.plannedAt)),kind:old?.kind??'existing' as const,scheduleId:row.id};
 });
 return {groups,items};
}
export async function changeArrangement(db:Database,id:string,input:{action:'submit'|'confirm'|'return';fingerprint:string;requestId:string;reason:string},actor:OperationsUser){
 return db.transaction(async tx=>{
  await lockPromotionWorkflow(tx);
  const [plan]=await tx.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.id,id)).for('update');
  if(!plan?.firstFinalizedAt)throw new ArrangementError('MONTHLY_PREPLAN_REQUIRED','本月尚未确认预排期，不能提交首轮排期。',422);
  if(input.action!=='submit')requireAdmin(actor);
  const repeat=plan.arrangementHistory.find(h=>h.requestId===input.requestId);
  if(repeat){if(repeat.action!==input.action||repeat.actor!==actor.username||repeat.fingerprint!==input.fingerprint)throw new WorkflowError('请求标识已使用，请重新核对。',422);return readArrangement(tx,plan.month);}
  if(plan.arrangementStatus==='confirmed')throw new ArrangementError('MONTHLY_MEETING_SEALED','月例会已封存。',403);
  if(input.action==='submit'&&plan.arrangementStatus!=='editing'||input.action!=='submit'&&plan.arrangementStatus!=='review_pending')throw new ArrangementError('MONTHLY_STAGE_CHANGED','本月核对阶段已变化，请重新载入核对结果。');
  const rows=await arrangementRows(tx,plan.month),fingerprint=arrangementFingerprint(plan,rows);
  if(input.fingerprint!==fingerprint)throw new ArrangementError('ARRANGEMENT_CHANGED','首轮排期已有调整，请更新核对清单后再确认。当前填写已保留。');
  if(!input.reason.trim())throw new WorkflowError(input.action==='return'?'请填写退回修改的原因。':'请填写本次首轮排期的核对说明，调整过的内容请说明原因。',422);
  const pending=await tx.select({target:s.operationsChangeProposal.target,after:s.operationsChangeProposal.after}).from(s.operationsChangeProposal).where(and(eq(s.operationsChangeProposal.module,'schedule'),eq(s.operationsChangeProposal.status,'pending')));
  const ids=new Set(rows.map(r=>'schedule:'+r.id));
  if(input.action!=='return'&&pending.some(p=>ids.has(p.target)||p.target.startsWith('monthly:'+id)||String((p.after.schedule as any)?.plannedPublishAt??'').slice(0,7)===plan.month))throw new WorkflowError('请先处理本月待审核排期，再提交整月核对。',422);
  const now=new Date(),history:Plan['arrangementHistory']=[...plan.arrangementHistory,{at:now.toISOString(),actor:actor.username,action:input.action,reason:input.reason.trim(),requestId:input.requestId,fingerprint}];
  if(input.action!=='confirm'){
   await tx.update(s.operationsMonthlyPlan).set({arrangementStatus:input.action==='submit'?'review_pending':'editing',arrangementSubmittedAt:input.action==='submit'?now:null,arrangementHistory:history,updatedAt:now}).where(eq(s.operationsMonthlyPlan.id,id));
   return readArrangement(tx,plan.month);
  }
  const content=await arrangedContent(tx,plan,rows);
  await tx.update(s.operationsMonthlyPlan).set({content,additions:[],revision:plan.revision+1,updatedAt:now}).where(eq(s.operationsMonthlyPlan.id,id));
  const [meeting]=await tx.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,plan.meetingId)).for('update');
  const all=await tx.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId,plan.meetingId)).orderBy(desc(s.operationsReviewMeetingVersion.versionNumber));
  const source=all.find(v=>!v.invalidatedAt&&v.lifecycleStatus==='finalized');
  if(!meeting||!source)throw new WorkflowError('预排期来源会议不存在，请核对。',422);
  const snapshot:any=structuredClone(source.snapshot),versionNumber=(all[0]?.versionNumber??-1)+1;
  snapshot.versionNumber=versionNumber;snapshot.finalizationStage='post';snapshot.arrangementSealed=true;
  snapshot.draft={...meeting.draftSnapshot,monthlyPlan:{id:plan.id,expectedRevision:plan.revision+1,content,additions:[]},finalizationStage:'post'};
  snapshot.generated={...snapshot.generated,monthly:await (await import('./monthly-meeting')).readMonthlyMeeting(tx,meeting)};
  const [version]=await tx.insert(s.operationsReviewMeetingVersion).values({meetingId:meeting.id,versionNumber,snapshot,sourceVersionId:source.id,lifecycleStatus:'finalized',versionKind:'revision',changeSummary:'首轮排期核对通过，月例会及计划封存',finalizedAt:now,finalizedByLabel:actor.username,updatedAt:now,pdfStatus:'pending',businessEffects:[]}).returning();
  for(const item of content.items){
   const old=await tx.select({id:s.operationsMonthlyPlanAssignment.id,itemId:s.operationsMonthlyPlanAssignment.itemId}).from(s.operationsMonthlyPlanAssignment).where(and(eq(s.operationsMonthlyPlanAssignment.planId,id),eq(s.operationsMonthlyPlanAssignment.scheduleId,item.scheduleId!)));
   if(!old.length)await tx.insert(s.operationsMonthlyPlanAssignment).values({planId:id,itemId:item.id,scheduleId:item.scheduleId,firstSubmittedAt:now,history:[]}).onConflictDoNothing();
  }
  history[history.length-1]={...history[history.length-1],versionId:version.id} as typeof history[number];
  await tx.update(s.operationsMonthlyPlan).set({arrangementStatus:'confirmed',sealedVersionId:version.id,lockedAt:now,lockedByVersionId:version.id,sourceVersionId:version.id,arrangementHistory:history}).where(eq(s.operationsMonthlyPlan.id,id));
  await tx.update(s.operationsReviewMeeting).set({currentVersionNumber:versionNumber,draftSnapshot:snapshot.draft,updatedAt:now,finalizedAt:now,status:'completed'}).where(eq(s.operationsReviewMeeting.id,meeting.id));
  return readArrangement(tx,plan.month);
 });
}
