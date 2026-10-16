import { and, eq, inArray,sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './client';
import { requireAdmin, type OperationsUser } from '../auth/permissions';
import { lockSchedule, reasonSchema, readScheduleWorkflow, saveDelayReason, WorkflowError } from './schedule-workflow';
import { lockPromotionWorkflow } from './promotion-pauses';
import { publicationSchema, normalizeCompletionStatus } from './validation';
import { operationsContentSchedule as schedules, operationsContentVersion as versions,
  operationsPublicationReservation as reservations, operationsPublicationEvent as events,
  operationsPromotionCampaign as campaigns, operationsPromotionDailyMetric as metrics,
  operationsPromotionWaitRange as ranges, operationsPromotionHold as holds, operationsScheduleChangeRequest as changes } from './schema';
import { count } from 'drizzle-orm';
import { mayKeepEmptyPublicationLink } from './publication-rules.mjs';

const historyEntry=(status:string,actor:OperationsUser,now:Date,reason:string|null=null)=>[{status,actorId:actor.id,actorLabel:actor.username,at:now.toISOString(),reason}];
function checkRevision(schedule:{planRevision:number;publicationRevision:number},input:{expectedPlanRevision:number;expectedPublicationRevision:number}) {
  if(schedule.planRevision!==input.expectedPlanRevision || schedule.publicationRevision!==input.expectedPublicationRevision)throw new WorkflowError('排期或发布记录已更新，请刷新后重试。');
}
/** 统一发布登记；允许定时发布的未来时间，保存后直接已发送。 */
export async function registerPublication(db:Database,id:string,input:z.infer<typeof publicationSchema>,dailyReasons:z.infer<typeof reasonSchema>[],confirmReset:boolean,actor:OperationsUser,now=new Date()) {
  return db.transaction(async tx=>{
    await lockPromotionWorkflow(tx);
    const schedule=await lockSchedule(tx,id);checkRevision(schedule,input);
    const actual=input.actualPublishAt??schedule.actualPublishAt;
    if(!actual)throw new WorkflowError('请填写实际发送时间。',422);
    const publicationUrl=input.publicationUrl??null;
    if(!publicationUrl&&!mayKeepEmptyPublicationLink(schedule,actual))throw new WorkflowError('请粘贴对应的小红书帖子链接或完整分享文案。',422);
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
    const after={actualPublishAt:actual.toISOString(),publicationUrl,projectDocUrl};
    if(JSON.stringify(before)===JSON.stringify(after))return {kind:'saved' as const,unchanged:true};
    await tx.update(versions).set({projectDocUrl,updatedAt:now}).where(eq(versions.id,version.id));
    const promotionStatus=!schedule.isPromoted?'none':actualChanged||!campaignRows.length?'awaiting_promotion':schedule.promotionStatus;
    await tx.update(schedules).set({actualPublishAt:actual,publicationUrl,publicationRevision:schedule.publicationRevision+1,
      completionStatus:normalizeCompletionStatus({plannedPublishAt:schedule.plannedPublishAt,actualPublishAt:actual}),promotionStatus,
      promotionDeferredThrough:promotionStatus==='awaiting_promotion'&&actualChanged?null:undefined,updatedAt:now}).where(eq(schedules.id,id));
    await tx.insert(events).values({scheduleId:id,revision:schedule.publicationRevision+1,before,after,reason:input.correctionReason||null,changedById:actor.id,changedByLabel:actor.username,createdAt:now});
    await tx.update(reservations).set({status:'fulfilled',history:sql`${reservations.history} || ${JSON.stringify(historyEntry('fulfilled',actor,now,'已登记实发'))}::jsonb`,decisionReason:'已登记实发，预约流程结束',updatedAt:now}).where(and(eq(reservations.scheduleId,id),inArray(reservations.status,['pending','approved'])));
    await tx.update(changes).set({status:'obsolete',decidedAt:now,decisionReason:'帖子已经实发'}).where(and(eq(changes.scheduleId,id),eq(changes.status,'pending')));
    return {kind:'saved' as const,unchanged:false};
  });
}
