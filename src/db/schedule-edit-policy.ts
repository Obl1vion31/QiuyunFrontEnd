import {effectiveCategoryName} from './content-config';
import {and,eq,inArray,isNull} from 'drizzle-orm';
import type {Database} from './client';
import type {OperationsUser} from '../auth/permissions';
import {requireAdmin} from '../auth/permissions';
import {lockPromotionWorkflow} from './promotion-pauses';
import {ArrangementError,assertMeetingMutable,dateMonth} from './monthly-arrangement';
import {WorkflowError,ScheduleReasonError} from './schedule-workflow';
import * as s from './schema';
import {readSchedulePlanContexts} from './schedule-history-context';

const structure=(r:Record<string,any>)=>({id:r.id,versionId:r.versionId,name:r.name,subjectId:r.subjectId,subjectName:r.subjectName,categoryId:r.categoryId,categoryName:r.categoryName,projectDocUrl:r.projectDocUrl,operationType:r.operationType,contentRole:r.contentRole,plannedAt:r.plannedAt,cancelledAt:r.cancelledAt,syncToMoments:r.syncToMoments,isPromoted:r.isPromoted,platformNoteId:r.platformNoteId});
async function records(db:Database,contentIds:string[]){
 if(!contentIds.length)return [];
 return db.select({platformNoteId:s.operationsContent.platformNoteId,id:s.operationsContentSchedule.id,versionId:s.operationsContentVersion.id,name:s.operationsContentVersion.contentName,subjectId:s.operationsContentVersion.subjectId,subjectName:s.operationsSubject.name,categoryName:effectiveCategoryName(s.operationsContentVersion.subjectId,s.operationsContentVersion.categoryId,s.operationsCategory.name),categoryId:s.operationsContentVersion.categoryId,projectDocUrl:s.operationsContentVersion.projectDocUrl,operationType:s.operationsContent.operationType,contentRole:s.operationsContent.contentRole,plannedAt:s.operationsContentSchedule.plannedPublishAt,cancelledAt:s.operationsContentSchedule.cancelledAt,syncToMoments:s.operationsContentSchedule.syncToMoments,isPromoted:s.operationsContentSchedule.isPromoted})
 .from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentVersion.id,s.operationsContentSchedule.contentVersionId)).innerJoin(s.operationsContent,eq(s.operationsContent.id,s.operationsContentVersion.contentId)).innerJoin(s.operationsSubject,eq(s.operationsSubject.id,s.operationsContentVersion.subjectId)).leftJoin(s.operationsCategory,eq(s.operationsCategory.id,s.operationsContentVersion.categoryId)).where(inArray(s.operationsContent.id,contentIds));
}
async function bodyOf(request:Request):Promise<Record<string,any>>{
 try{const copy=request.clone();return copy.headers.get('content-type')?.includes('application/json')?await copy.json():Object.fromEntries((await copy.formData()).entries());}catch{return {};}
}
export async function readScheduleStructures(db:Database,contentIds:string[]){return (await records(db,contentIds)).map(structure);}
/** 单帖和成对改期共用月份门禁；事务调用者负责短期锁和原子写入。 */
export async function assertScheduleMonthRules(db:Database,input:{months:string[];current?:Pick<typeof s.operationsContentSchedule.$inferSelect,'actualPublishAt'|'cancelledAt'>;newMonth:string;creating:boolean;moving:boolean;reason:string}){
 const {current,newMonth,creating,moving,reason}=input;
 const plans=input.months.length?await db.select({month:s.operationsMonthlyPlan.month,firstFinalizedAt:s.operationsMonthlyPlan.firstFinalizedAt,arrangementStatus:s.operationsMonthlyPlan.arrangementStatus}).from(s.operationsMonthlyPlan).where(inArray(s.operationsMonthlyPlan.month,input.months)):[];
 for(const month of input.months){
  const plan=plans.find(p=>p.month===month);
  if((creating||moving)&&month===newMonth&&!plan?.firstFinalizedAt)throw new ArrangementError('MONTHLY_PREPLAN_REQUIRED',month+' 尚未确认预排期，不能新增或移入排期。当前输入已保留。',422);
  if(current&&!moving&&!plan?.firstFinalizedAt&&!current.actualPublishAt&&!current.cancelledAt)throw new ArrangementError('MONTHLY_PREPLAN_REQUIRED','遗留内容在月例会确认预排期前保持原安排，不能提前改动。',422);
 }
 if(plans.some(p=>p.arrangementStatus==='confirmed')&&!reason)throw new ScheduleReasonError('月排期V0已定稿，请填写本次调整原因。当前输入已保留。');
}
export async function captureScheduleExecution(db:Database,scheduleIds:string[]){
 const links=await db.select({contentId:s.operationsContentVersion.contentId}).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentVersion.id,s.operationsContentSchedule.contentVersionId)).where(inArray(s.operationsContentSchedule.id,scheduleIds));
 const contentIds=[...new Set(links.map(r=>r.contentId))],before=await records(db,contentIds);
 return {contentIds,before,contexts:await readSchedulePlanContexts(db,before.map(r=>r.id))};
}
export type PlacementReceipt={requestKey:string;inputHash:string;actorId:string;action:'move'|'swap';sourceId:string;targetId?:string;ids:string[]};
export async function appendScheduleExecution(db:Database,captured:{contentIds:string[];before:Awaited<ReturnType<typeof records>>;contexts:Awaited<ReturnType<typeof readSchedulePlanContexts>>},actor:OperationsUser,reason:string,placement?:PlacementReceipt){
 const after=await records(db,captured.contentIds),afterContexts=await readSchedulePlanContexts(db,after.map(r=>r.id));
 for(const row of after){
  const old=captured.before.find(r=>r.id===row.id),a=structure(row),b=old?structure(old):null;
  const planContext={before:captured.contexts.get(row.id)??[],after:afterContexts.get(row.id)??[]};
  if(JSON.stringify(a)===JSON.stringify(b)&&JSON.stringify(planContext.before)===JSON.stringify(planContext.after))continue;
  const [saved]=await db.select({history:s.operationsContentSchedule.executionHistory}).from(s.operationsContentSchedule).where(eq(s.operationsContentSchedule.id,row.id));
  await db.update(s.operationsContentSchedule).set({executionHistory:[...saved.history,{at:new Date().toISOString(),actor:actor.username,reason:reason||'首轮排期填写',before:b,after:a,planContext,...(placement?{placement}:{})}]}).where(eq(s.operationsContentSchedule.id,row.id));
 }
}
/** 请求与审批重放共用；持锁到写入完成，不能在前端禁用或审批预览后绕过。 */
export async function guardedScheduleWrite(db:Database,request:Request,actor:OperationsUser,next:()=>Promise<Response>){
 const path=new URL(request.url).pathname,parts=path.split('/').filter(Boolean);
 const values=await bodyOf(request);
 // 成对改期在专用事务内对两端共用上述门禁与历史，不能只检查 URL 中的一篇。
 if(parts[1]==='operations-content'&&parts[3]==='placement')return next();
 if(parts[1]==='meeting-attachments'){let meetingId=String(values.meetingId??'');if(parts[2]){const [attachment]=await db.select({meetingId:s.operationsMeetingAttachment.meetingId}).from(s.operationsMeetingAttachment).where(eq(s.operationsMeetingAttachment.id,parts[2]));meetingId=attachment?.meetingId??'';}if(meetingId)await assertMeetingMutable(db,meetingId);return next();}
 if(parts[1]==='meeting-reviews'){
  const ids=parts[2]?[parts[2]]:Array.isArray(values.ids)?values.ids:[];
  for(const id of ids)if(/^[0-9a-f-]{36}$/i.test(id)){
   if(values.action==='revise_sealed_text')continue;
   await assertMeetingMutable(db,id);
   const [plan]=await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.meetingId,id));
   const confirming=values.stage==='post'||values.action==='finalize_post';
   if(plan&&!plan.firstFinalizedAt&&confirming)requireAdmin(actor);
  }
  return next();
 }
 const schedulePath=parts[1]==='operations-content',monthlyLink=parts[1]==='monthly-plans'&&parts[3]==='links',legacyApproval=parts[1]==='schedule-change-requests';
 if(!schedulePath&&!monthlyLink&&!legacyApproval)return next();
 await lockPromotionWorkflow(db);
 let id=schedulePath&&parts[2]!=='versions'?parts[2]:String(values.sourceScheduleId??values.scheduleId??'');
 if(legacyApproval){const [r]=await db.select().from(s.operationsScheduleChangeRequest).where(eq(s.operationsScheduleChangeRequest.id,parts[2]));id=r?.scheduleId;}
 if(parts[3]==='change-requests'&&parts[4]){const [r]=await db.select().from(s.operationsScheduleChangeRequest).where(eq(s.operationsScheduleChangeRequest.id,parts[4]));if(r)values.plannedPublishAt=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(r.requestedPublishAt).replace(' ','T');}
 if(parts[3]==='platform-note-id')return next();
 const [current]=id?await db.select({contentId:s.operationsContentVersion.contentId,schedule:s.operationsContentSchedule,operationType:s.operationsContent.operationType}).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentVersion.id,s.operationsContentSchedule.contentVersionId)).innerJoin(s.operationsContent,eq(s.operationsContent.id,s.operationsContentVersion.contentId)).where(eq(s.operationsContentSchedule.id,id)):[];
 const contentIds=current?[current.contentId]:[],before=await records(db,contentIds);
 const months=new Set(before.filter(r=>!r.cancelledAt).map(r=>dateMonth(r.plannedAt)));
 if(values.plannedPublishAt&&/^\d{4}-\d{2}/.test(String(values.plannedPublishAt)))months.add(String(values.plannedPublishAt).slice(0,7));
 if(monthlyLink){const [plan]=await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.id,parts[2]));if(plan)months.add(plan.month);}
 const publication=parts[3]==='publication'&&values.action!=='reviewPlan';
 if(publication)return next();
 const newMonth=String(values.plannedPublishAt??'').slice(0,7);
 const creating=schedulePath&&(!parts[2]||parts[2]==='versions'||!!current?.schedule.cancelledAt);
 const moving=!!current&&!!newMonth&&newMonth!==dateMonth(current.schedule.plannedPublishAt);
 const reason=String(values.changeReason||values.monthlyPlanReason||values.planChangeReason||values.reason||'').trim();
 await assertScheduleMonthRules(db,{months:[...months],current:current?.schedule,newMonth,creating,moving,reason});
 if(request.method==='DELETE'){requireAdmin(actor);if(!reason)throw new WorkflowError('请填写取消排期的原因。',422);}
 const beforeContexts=await readSchedulePlanContexts(db,before.map(r=>r.id));
 const response=await next();
 if(!response.ok)return response;
 const result=await response.clone().json().catch(()=>({}));
 if(!contentIds.length&&result.id){const [created]=await db.select({contentId:s.operationsContentVersion.contentId}).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentVersion.id,s.operationsContentSchedule.contentVersionId)).where(eq(s.operationsContentSchedule.id,result.id));if(created)contentIds.push(created.contentId);}
 await appendScheduleExecution(db,{contentIds,before,contexts:beforeContexts},actor,reason);
 return response;
}
