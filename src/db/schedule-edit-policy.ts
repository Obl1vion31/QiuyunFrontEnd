import {and,eq,inArray,isNull} from 'drizzle-orm';
import type {Database} from './client';
import type {OperationsUser} from '../auth/permissions';
import {requireAdmin} from '../auth/permissions';
import {lockPromotionWorkflow} from './promotion-pauses';
import {ArrangementError,assertMeetingMutable,dateMonth} from './monthly-arrangement';
import {WorkflowError} from './schedule-workflow';
import * as s from './schema';

const structure=(r:Record<string,any>)=>({id:r.id,versionId:r.versionId,name:r.name,subjectId:r.subjectId,subjectName:r.subjectName,categoryId:r.categoryId,categoryName:r.categoryName,projectDocUrl:r.projectDocUrl,operationType:r.operationType,contentRole:r.contentRole,plannedAt:r.plannedAt,cancelledAt:r.cancelledAt,syncToMoments:r.syncToMoments,isPromoted:r.isPromoted});
async function records(db:Database,contentIds:string[]){
 if(!contentIds.length)return [];
 return db.select({id:s.operationsContentSchedule.id,versionId:s.operationsContentVersion.id,name:s.operationsContentVersion.contentName,subjectId:s.operationsContentVersion.subjectId,subjectName:s.operationsSubject.name,categoryName:s.operationsCategory.name,categoryId:s.operationsContentVersion.categoryId,projectDocUrl:s.operationsContentVersion.projectDocUrl,operationType:s.operationsContent.operationType,contentRole:s.operationsContent.contentRole,plannedAt:s.operationsContentSchedule.plannedPublishAt,cancelledAt:s.operationsContentSchedule.cancelledAt,syncToMoments:s.operationsContentSchedule.syncToMoments,isPromoted:s.operationsContentSchedule.isPromoted})
 .from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentVersion.id,s.operationsContentSchedule.contentVersionId)).innerJoin(s.operationsContent,eq(s.operationsContent.id,s.operationsContentVersion.contentId)).innerJoin(s.operationsSubject,eq(s.operationsSubject.id,s.operationsContentVersion.subjectId)).leftJoin(s.operationsCategory,eq(s.operationsCategory.id,s.operationsContentVersion.categoryId)).where(inArray(s.operationsContent.id,contentIds));
}
async function bodyOf(request:Request):Promise<Record<string,any>>{
 try{const copy=request.clone();return copy.headers.get('content-type')?.includes('application/json')?await copy.json():Object.fromEntries((await copy.formData()).entries());}catch{return {};}
}
/** 请求与审批重放共用；持锁到写入完成，不能在前端禁用或审批预览后绕过。 */
export async function guardedScheduleWrite(db:Database,request:Request,actor:OperationsUser,next:()=>Promise<Response>){
 const path=new URL(request.url).pathname,parts=path.split('/').filter(Boolean);
 const values=await bodyOf(request);
 if(parts[1]==='meeting-attachments'){let meetingId=String(values.meetingId??'');if(parts[2]){const [attachment]=await db.select({meetingId:s.operationsMeetingAttachment.meetingId}).from(s.operationsMeetingAttachment).where(eq(s.operationsMeetingAttachment.id,parts[2]));meetingId=attachment?.meetingId??'';}if(meetingId)await assertMeetingMutable(db,meetingId);return next();}
 if(parts[1]==='meeting-reviews'){
  const ids=parts[2]?[parts[2]]:Array.isArray(values.ids)?values.ids:[];
  for(const id of ids)if(/^[0-9a-f-]{36}$/i.test(id)){await assertMeetingMutable(db,id);const [plan]=await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.meetingId,id));if(plan&&actor.role!=='admin'&&(plan.firstFinalizedAt||values.stage==='post'||values.action==='finalize_post'))throw new ArrangementError('MONTHLY_ADMIN_CONFIRMATION','预排期由管理员确认；预排期后请在排期页落实首轮安排。',403);}
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
 if(publication){
  // 实发登记例外只覆盖既有安排；不能以同一路径提交独立复盘编辑或未来预约。
  const stamp=String(values.actualPublishAt??''),actual=stamp?new Date(stamp+(stamp.endsWith('Z')?'':':00+08:00')):null;
  const initial=!!current&&!current.schedule.actualPublishAt;
  const unchanged=current?.schedule.actualPublishAt&&actual?.getTime()===current.schedule.actualPublishAt.getTime();
  let reviewChanged=false;
  if(!initial&&values.reviewMode){const [review]=await db.select().from(s.operationsNonPromotionReviewPlan).where(eq(s.operationsNonPromotionReviewPlan.contentId,current!.contentId));reviewChanged=!review||review.mode!==values.reviewMode||review.day7!==(values.reviewDay7==='on')||review.day15!==(values.reviewDay15==='on')||(review.draftDueOn??'')!==String(values.reviewDueOn??'');}
  const pure=!reviewChanged&&values.action!=='reviewPlan'&&(!values.operationType||values.operationType===current?.operationType)&&(initial||unchanged)&&actual&&actual.getTime()<=Date.now();
  const pending=months.size?await db.select().from(s.operationsMonthlyPlan).where(inArray(s.operationsMonthlyPlan.month,[...months])):[];
  if(actor.role==='employee'&&pending.some(p=>p.arrangementStatus==='review_pending')&&!pure)throw new ArrangementError('MONTHLY_REVIEW_PENDING','请等待管理员核对并确认；目前仅允许登记真实实发，不能修改排期或保存预约。',403);
  return next();
 }
 const plans=months.size?await db.select().from(s.operationsMonthlyPlan).where(inArray(s.operationsMonthlyPlan.month,[...months])):[];
 const newMonth=String(values.plannedPublishAt??'').slice(0,7);
 const creating=schedulePath&&(!parts[2]||parts[2]==='versions'||!!current?.schedule.cancelledAt);
 const moving=!!current&&!!newMonth&&newMonth!==dateMonth(current.schedule.plannedPublishAt);
 for(const month of months){
  const plan=plans.find(p=>p.month===month);
  if(plan?.arrangementStatus==='review_pending'&&actor.role==='employee')throw new ArrangementError('MONTHLY_REVIEW_PENDING','请等待管理员核对并确认；本月不能新增、取消或调整排期，仅允许实发登记。',403);
  if((creating||moving)&&month===newMonth&&!plan?.firstFinalizedAt)throw new ArrangementError('MONTHLY_PREPLAN_REQUIRED',month+' 尚未确认预排期，不能新增或移入排期。当前输入已保留。',422);
  if(current&&!moving&&!plan?.firstFinalizedAt&&!current.schedule.actualPublishAt&&!current.schedule.cancelledAt)throw new ArrangementError('MONTHLY_PREPLAN_REQUIRED','遗留内容在月例会确认预排期前保持原安排，不能提前改动。',422);
 }
 const reason=String(values.changeReason||values.monthlyPlanReason||values.planChangeReason||values.reason||'').trim();
 if(plans.some(p=>p.arrangementStatus==='confirmed')&&!reason)throw new WorkflowError('月例会已封存，请填写本次排期调整原因。当前输入已保留。',422);
 if(request.method==='DELETE'){requireAdmin(actor);if(!reason)throw new WorkflowError('请填写取消排期的原因。',422);}
 const response=await next();
 if(!response.ok)return response;
 const result=await response.clone().json().catch(()=>({}));
 if(!contentIds.length&&result.id){const [created]=await db.select({contentId:s.operationsContentVersion.contentId}).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentVersion.id,s.operationsContentSchedule.contentVersionId)).where(eq(s.operationsContentSchedule.id,result.id));if(created)contentIds.push(created.contentId);}
 const after=await records(db,contentIds);
 for(const row of after){
  const old=before.find(r=>r.id===row.id),a=structure(row),b=old?structure(old):null;
  if(JSON.stringify(a)===JSON.stringify(b))continue;
  const [saved]=await db.select({history:s.operationsContentSchedule.executionHistory}).from(s.operationsContentSchedule).where(eq(s.operationsContentSchedule.id,row.id));
  await db.update(s.operationsContentSchedule).set({executionHistory:[...saved.history,{at:new Date().toISOString(),actor:actor.username,reason:reason||'首轮排期填写',before:b,after:a}]}).where(eq(s.operationsContentSchedule.id,row.id));
 }
 return response;
}
