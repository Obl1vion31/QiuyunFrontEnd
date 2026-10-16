import { and, desc, eq, inArray,sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './client';
import { requireAdmin, type OperationsUser } from '../auth/permissions';
import { lockSchedule, reasonSchema, readScheduleWorkflow, saveDelayReason, WorkflowError } from './schedule-workflow';
import { lockPromotionWorkflow } from './promotion-pauses';
import { publicationSchema, shanghaiDateTime, normalizeCompletionStatus } from './validation';
import { operationsContentSchedule as schedules, operationsContentVersion as versions,
  operationsPublicationReservation as reservations, operationsPublicationEvent as events,
  operationsPromotionCampaign as campaigns, operationsPromotionDailyMetric as metrics,
  operationsPromotionWaitRange as ranges, operationsPromotionHold as holds, operationsScheduleChangeRequest as changes } from './schema';
import { count } from 'drizzle-orm';

const revisionFields={expectedPlanRevision:z.coerce.number().int().min(0),expectedPublicationRevision:z.coerce.number().int().min(0)};
export const reservationSchema=z.object({...revisionFields,scheduledPublishAt:shanghaiDateTime,requestKey:z.uuid()});
export const reservationDecisionSchema=z.object({...revisionFields,action:z.enum(['approve','reject','cancel']),reason:z.string().trim().max(500).default('')}).superRefine((value,context)=>{
  if(value.action==='reject'&&!value.reason)context.addIssue({code:'custom',path:['reason'],message:'请填写驳回原因'});
});
const historyEntry=(status:string,actor:OperationsUser,now:Date,reason:string|null=null)=>[{status,actorId:actor.id,actorLabel:actor.username,at:now.toISOString(),reason}];
function checkRevision(schedule:{planRevision:number;publicationRevision:number},input:{expectedPlanRevision:number;expectedPublicationRevision:number}) {
  if(schedule.planRevision!==input.expectedPlanRevision || schedule.publicationRevision!==input.expectedPublicationRevision)throw new WorkflowError('排期或发布记录已更新，请刷新后重试。');
}
export async function createReservation(db:Database,id:string,input:z.infer<typeof reservationSchema>,actor:OperationsUser,now=new Date()) {
  return db.transaction(async tx=>{
    const schedule=await lockSchedule(tx,id);
    const [existing]=await tx.select().from(reservations).where(eq(reservations.requestKey,input.requestKey));
    if(existing) {
      if(existing.scheduleId!==id||existing.requestedById!==actor.id||existing.planRevision!==input.expectedPlanRevision||existing.scheduledPublishAt.getTime()!==input.scheduledPublishAt.getTime())throw new WorkflowError('提交标识已用于其他预约，请重新提交。');
      return {id:existing.id,status:existing.status,repeated:true};
    }
    checkRevision(schedule,input);
    if(schedule.actualPublishAt)throw new WorkflowError('这条排期已经实发，不能再登记预约。');
    if(input.scheduledPublishAt<=now)throw new WorkflowError('预约发送请选择晚于当前时间的时间。',422);
    const [active]=await tx.select().from(reservations).where(and(eq(reservations.scheduleId,id),inArray(reservations.status,['pending','approved']))).limit(1);
    if(active&&active.planRevision===schedule.planRevision&&active.scheduledPublishAt.getTime()===input.scheduledPublishAt.getTime())return {id:active.id,status:active.status,repeated:true};
    await tx.update(reservations).set({status:'obsolete',history:sql`${reservations.history} || ${JSON.stringify(historyEntry('obsolete',actor,now,'已重新提交预约'))}::jsonb`,decisionReason:'已重新提交预约',updatedAt:now}).where(and(eq(reservations.scheduleId,id),inArray(reservations.status,['pending','approved'])));
    const [created]=await tx.insert(reservations).values({scheduleId:id,planRevision:schedule.planRevision,scheduledPublishAt:input.scheduledPublishAt,requestKey:input.requestKey,
      status:actor.role==='admin'?'approved':'pending',history:historyEntry(actor.role==='admin'?'approved':'pending',actor,now),requestedById:actor.id,requestedByLabel:actor.username,createdAt:now,updatedAt:now,
      ...(actor.role==='admin'?{decidedById:actor.id,decidedByLabel:actor.username,decidedAt:now}:{})}).returning();
    await tx.update(schedules).set({publicationRevision:schedule.publicationRevision+1,updatedAt:now}).where(eq(schedules.id,id));
    return {id:created.id,status:created.status,repeated:false};
  });
}
export async function decideReservation(db:Database,id:string,reservationId:string,input:z.infer<typeof reservationDecisionSchema>,actor:OperationsUser,now=new Date()) {
  if(input.action!=='cancel')requireAdmin(actor);
  return db.transaction(async tx=>{
    const schedule=await lockSchedule(tx,id);checkRevision(schedule,input);
    const [application]=await tx.select().from(reservations).where(and(eq(reservations.id,reservationId),eq(reservations.scheduleId,id))).limit(1);
    if(!application || schedule.actualPublishAt || application.planRevision!==schedule.planRevision || !(input.action==='cancel'?['pending','approved']:['pending']).includes(application.status))throw new WorkflowError('预约已处理、已失效或已实发，请刷新。');
    const status=input.action==='approve'?'approved':input.action==='reject'?'rejected':'cancelled';
    await tx.update(reservations).set({status,history:sql`${reservations.history} || ${JSON.stringify(historyEntry(status,actor,now,input.reason||null))}::jsonb`,decidedById:actor.id,decidedByLabel:actor.username,decidedAt:now,decisionReason:input.reason||null,updatedAt:now}).where(eq(reservations.id,reservationId));
    await tx.update(schedules).set({publicationRevision:schedule.publicationRevision+1,updatedAt:now}).where(eq(schedules.id,id));
    return {id:reservationId,status};
  });
}

/** 只有此事务写入实发；预约审核不调用它。 */
export async function registerPublication(db:Database,id:string,input:z.infer<typeof publicationSchema>,dailyReasons:z.infer<typeof reasonSchema>[],confirmReset:boolean,actor:OperationsUser,now=new Date()) {
  return db.transaction(async tx=>{
    await lockPromotionWorkflow(tx);
    const schedule=await lockSchedule(tx,id);checkRevision(schedule,input);
    const actual=input.actualPublishAt??schedule.actualPublishAt;
    if(!actual)throw new WorkflowError('请填写实际发送时间。',422);
    if(actual>now)throw new WorkflowError('实发时间不能晚于当前时间；未来发送请选择预约发送。',422);
    const actualChanged=schedule.actualPublishAt?.getTime()!==actual.getTime();
    if(schedule.actualPublishAt&&actualChanged) {
      requireAdmin(actor);
      if(!input.correctionReason?.trim())throw new WorkflowError('更正已有实发时间必须填写原因。',422);
    }
    const [version]=await tx.select().from(versions).where(eq(versions.id,schedule.contentVersionId));
    const projectDocUrl=input.projectDocUrl||version.projectDocUrl;
    if(!schedule.actualPublishAt&&!projectDocUrl)throw new WorkflowError('首次实发登记请补充项目文档链接。',422);
    const campaignRows=await tx.select({id:campaigns.id}).from(campaigns).where(eq(campaigns.scheduleId,id));
    if(actualChanged&&campaignRows.length)requireAdmin(actor);
    if(actualChanged&&campaignRows.length&&!confirmReset) {
      const [metricCount]=await tx.select({value:count()}).from(metrics).where(inArray(metrics.campaignId,campaignRows.map(row=>row.id)));
      return {kind:'reset-required' as const,campaigns:campaignRows.length,dailyMetrics:Number(metricCount.value)};
    }
    for(const reason of dailyReasons)await saveDelayReason(tx,schedule,reason,actor,now,actual);
    const workflow=await readScheduleWorkflow(tx,id,actual,now);
    if(workflow.days.some(day=>!day.saved&&!day.archived))throw new WorkflowError('请为每一天延期选择责任方并填写原因，再保存实发登记。',422);
    if(actualChanged&&campaignRows.length) {
      const ids=campaignRows.map(row=>row.id);
      await tx.delete(ranges).where(inArray(ranges.campaignId,ids));await tx.delete(holds).where(inArray(holds.campaignId,ids));
      await tx.delete(campaigns).where(eq(campaigns.scheduleId,id));
    }
    const before={actualPublishAt:schedule.actualPublishAt?.toISOString()??null,publicationUrl:schedule.publicationUrl,projectDocUrl:version.projectDocUrl};
    const after={actualPublishAt:actual.toISOString(),publicationUrl:input.publicationUrl,projectDocUrl};
    if(JSON.stringify(before)===JSON.stringify(after))return {kind:'saved' as const,unchanged:true};
    await tx.update(versions).set({projectDocUrl,updatedAt:now}).where(eq(versions.id,version.id));
    const promotionStatus=!schedule.isPromoted?'none':actualChanged||!campaignRows.length?'awaiting_promotion':schedule.promotionStatus;
    await tx.update(schedules).set({actualPublishAt:actual,publicationUrl:input.publicationUrl,publicationRevision:schedule.publicationRevision+1,
      completionStatus:normalizeCompletionStatus({plannedPublishAt:schedule.plannedPublishAt,actualPublishAt:actual}),promotionStatus,
      promotionDeferredThrough:promotionStatus==='awaiting_promotion'&&actualChanged?null:undefined,updatedAt:now}).where(eq(schedules.id,id));
    await tx.insert(events).values({scheduleId:id,revision:schedule.publicationRevision+1,before,after,reason:input.correctionReason||null,changedById:actor.id,changedByLabel:actor.username,createdAt:now});
    await tx.update(reservations).set({status:'fulfilled',history:sql`${reservations.history} || ${JSON.stringify(historyEntry('fulfilled',actor,now,'已登记实发'))}::jsonb`,decisionReason:'已登记实发，预约流程结束',updatedAt:now}).where(and(eq(reservations.scheduleId,id),inArray(reservations.status,['pending','approved'])));
    await tx.update(changes).set({status:'obsolete',decidedAt:now,decisionReason:'帖子已经实发'}).where(and(eq(changes.scheduleId,id),eq(changes.status,'pending')));
    return {kind:'saved' as const,unchanged:false};
  });
}

export async function readReservations(db:Database) {
  return db.select().from(reservations).orderBy(desc(reservations.createdAt));
}
