import {randomUUID} from 'node:crypto';
import {pruneScheduleDelayReasons} from './schedule-delay-cleanup';
import {promotionSnapshot} from './promotion-timeline';
import {shanghaiDateKey} from './promotion-rules.mjs';
import { and, eq, ne, isNotNull, desc, inArray,sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './client';
import { type OperationsUser } from '../auth/permissions';
import {requireBusinessOperation} from '../auth/business-permissions';
import { lockSchedule, reasonSchema, readScheduleWorkflow, saveDelayReason, WorkflowError } from './schedule-workflow';
import { lockPromotionWorkflow } from './promotion-pauses';
import { publicationSchema, normalizeCompletionStatus } from './validation';
import { operationsContent as contents, operationsNonPromotionReviewPlan as reviewPlans,operationsContentSchedule as schedules, operationsContentVersion as versions,
  operationsPublicationReservation as reservations, operationsPublicationEvent as events,
  operationsPromotionCampaign as campaigns, operationsPromotionDailyMetric as metrics,
  operationsPromotionWaitRange as ranges, operationsPromotionHold as holds, operationsScheduleChangeRequest as changes, operationsPromotionStartPlan as startPlans, operationsPromotionDayDecision as decisions, operationsPromotionTimelineAudit as audits } from './schema';
import { count } from 'drizzle-orm';
import { mayKeepEmptyPublicationLink } from './publication-rules.mjs';
import {switchContinuousReviewCycle,saveReviewPlan,reviewIdentity} from './non-promotion-plan';

const historyEntry=(status:string,actor:OperationsUser,now:Date,reason:string|null=null)=>[{status,actorId:actor.id,actorLabel:actor.username,at:now.toISOString(),reason}];
function checkRevision(schedule:{planRevision:number;publicationRevision:number},input:{expectedPlanRevision:number;expectedPublicationRevision:number}) {
  if(schedule.planRevision!==input.expectedPlanRevision || schedule.publicationRevision!==input.expectedPublicationRevision)throw new WorkflowError('排期或发布记录已更新，请刷新后重试。');
}
/** 统一发布登记；允许定时发布的未来时间，保存后直接已发送。 */
export async function registerPublication(db:Database,id:string,input:z.infer<typeof publicationSchema>,dailyReasons:z.infer<typeof reasonSchema>[],confirmReset:boolean,actor:OperationsUser,now=new Date()) {
  return db.transaction(async tx=>{
    await lockPromotionWorkflow(tx);
    const schedule=await lockSchedule(tx,id);checkRevision(schedule,input);
    const requiresMomentsConfirmation=!schedule.actualPublishAt&&schedule.syncToMoments;
    if(requiresMomentsConfirmation&&(!input.momentsSentConfirmed||!input.momentsRequestSentConfirmed))throw new WorkflowError('请确认朋友圈及对应需求均已发送；若未显示确认项，请刷新页面。',422);
    const actual=input.actualPublishAt??schedule.actualPublishAt;
    if(!actual)throw new WorkflowError('请填写实际发送时间。',422);
    const publicationUrl=input.publicationUrl??null;
    if(!publicationUrl&&!mayKeepEmptyPublicationLink(schedule,actual))throw new WorkflowError('请粘贴对应的小红书帖子链接或完整分享文案。',422);
    const actualChanged=schedule.actualPublishAt?.getTime()!==actual.getTime();
    if(schedule.actualPublishAt&&actualChanged) {
      await requireBusinessOperation(tx,actor,'schedule.correctPublication');
      if(!input.correctionReason?.trim())throw new WorkflowError('更正已有实发时间必须填写原因。',422);
    }
    const [version]=await tx.select().from(versions).where(eq(versions.id,schedule.contentVersionId));
    const projectDocUrl=input.projectDocUrl||version.projectDocUrl;
    if(!schedule.actualPublishAt&&!projectDocUrl)throw new WorkflowError('首次实发登记请补充项目文档链接。',422);
    const campaignRows=await tx.select({id:campaigns.id}).from(campaigns).where(eq(campaigns.scheduleId,id));
    const oldTimeline=actualChanged?await promotionSnapshot(tx,id):null;
    if(actualChanged&&oldTimeline?.plan&&schedule.actualPublishAt&&!confirmReset)return {kind:'reset-required' as const,campaigns:campaignRows.length,dailyMetrics:oldTimeline.metrics.length,startPlans:1};
    if(actualChanged&&campaignRows.length)await requireBusinessOperation(tx,actor,'schedule.correctPublication');
    if(actualChanged&&campaignRows.length&&!confirmReset) {
      const [metricCount]=await tx.select({value:count()}).from(metrics).where(inArray(metrics.campaignId,campaignRows.map(row=>row.id)));
      return {kind:'reset-required' as const,campaigns:campaignRows.length,dailyMetrics:Number(metricCount.value)};
    }
    await pruneScheduleDelayReasons(tx,{...schedule,actualPublishAt:actual},now);
    for(const reason of dailyReasons)await saveDelayReason(tx,schedule,reason,actor,now,actual);
    const workflow=await readScheduleWorkflow(tx,id,actual,now);
    if(workflow.days.some(day=>!day.saved&&!day.archived))throw new WorkflowError('请为每一天延期选择责任方并填写原因，再保存实发登记。',422);
    if(actualChanged&&campaignRows.length) {
      const ids=campaignRows.map(row=>row.id);
      await tx.delete(decisions).where(inArray(decisions.campaignId,ids));
      await tx.delete(ranges).where(inArray(ranges.campaignId,ids));await tx.delete(holds).where(inArray(holds.campaignId,ids));
      await tx.delete(campaigns).where(eq(campaigns.scheduleId,id));
    }
    if(actualChanged&&oldTimeline?.plan)await tx.delete(startPlans).where(eq(startPlans.scheduleId,id));
    const previousConfirmation=workflow.publicationHistory[0]?.after.momentsConfirmation;
    const momentsConfirmation=requiresMomentsConfirmation?{momentsSent:true as const,requestSent:true as const}:previousConfirmation;
    const before={actualPublishAt:schedule.actualPublishAt?.toISOString()??null,publicationUrl:schedule.publicationUrl,projectDocUrl:version.projectDocUrl,...(previousConfirmation?{momentsConfirmation:previousConfirmation}:{})};
    const after={actualPublishAt:actual.toISOString(),publicationUrl,projectDocUrl,...(momentsConfirmation?{momentsConfirmation}:{})};
    if(JSON.stringify(before)===JSON.stringify(after)){
      await switchContinuousReviewCycle(tx,version.contentId,id,actual,actor.username);
      if(input.reviewPlan)await saveReviewPlan(tx,id,input.reviewPlan,actor.username);
      return {kind:'saved' as const,unchanged:true};
    }
    await tx.update(versions).set({projectDocUrl,updatedAt:now}).where(eq(versions.id,version.id));
    const promotionStatus=!schedule.isPromoted?'none':actualChanged||!campaignRows.length?'awaiting_promotion':schedule.promotionStatus;
    await tx.update(schedules).set({actualPublishAt:actual,publicationUrl,publicationRevision:schedule.publicationRevision+1,
      completionStatus:normalizeCompletionStatus({plannedPublishAt:schedule.plannedPublishAt,actualPublishAt:actual,delayThresholdHours:schedule.delayThresholdHours}),promotionStatus,
      promotionDeferredThrough:promotionStatus==='awaiting_promotion'&&actualChanged?null:undefined,updatedAt:now}).where(eq(schedules.id,id));
    await tx.insert(events).values({scheduleId:id,revision:schedule.publicationRevision+1,before,after,reason:input.correctionReason||null,changedById:actor.id,changedByLabel:actor.username,createdAt:now});
    const [content]=await tx.select().from(contents).where(eq(contents.id,version.contentId));
    await switchContinuousReviewCycle(tx,version.contentId,id,actual,actor.username);
    const [configured]=await tx.select().from(reviewPlans).where(eq(reviewPlans.contentId,version.contentId));
    const priorPublished=await tx.select({id:schedules.id}).from(schedules).innerJoin(versions,eq(schedules.contentVersionId,versions.id)).where(and(eq(versions.contentId,version.contentId),ne(schedules.id,id),isNotNull(schedules.actualPublishAt)));
    if(!schedule.actualPublishAt&&content.operationType&&!schedule.isPromoted&&!priorPublished.length){
      const mode=content.operationType==='non_promotion_instant'?'instant':'standard';
      const dueOn=input.reviewDueOn||input.reviewPlan?.dueOn||configured?.draftDueOn||'';
      if(mode==='instant'&&!dueOn)throw new WorkflowError('请补齐即时复盘截止日期。',422);
      const root=await reviewIdentity(tx,id);
      if(configured&&configured.anchorScheduleId!==root.id)await tx.update(reviewPlans).set({anchorScheduleId:root.id}).where(eq(reviewPlans.contentId,version.contentId));
      await saveReviewPlan(tx,root.id,{mode,day7:configured?.day7??mode==='standard',day15:configured?.day15??mode==='standard',dueOn,expectedRevision:configured?.revision??-1},actor.username);
      await tx.update(reviewPlans).set({draftDueOn:null}).where(eq(reviewPlans.contentId,version.contentId));
    }else if(input.reviewPlan&&!content.operationType)await saveReviewPlan(tx,id,input.reviewPlan,actor.username);
    else if(!schedule.actualPublishAt&&!schedule.isPromoted){
      const [previous]=await tx.select({isPromoted:schedules.isPromoted}).from(schedules).innerJoin(versions,eq(schedules.contentVersionId,versions.id)).where(and(eq(versions.contentId,version.contentId),ne(schedules.id,id),isNotNull(schedules.actualPublishAt))).orderBy(desc(versions.versionNumber)).limit(1);
      if(previous?.isPromoted){const post=await reviewIdentity(tx,id);await saveReviewPlan(tx,post.id,{mode:'continuous',day7:false,day15:false,expectedRevision:post.plan?.revision??-1},actor.username);}
    }
    await tx.update(reservations).set({status:'fulfilled',history:sql`${reservations.history} || ${JSON.stringify(historyEntry('fulfilled',actor,now,'已登记实发'))}::jsonb`,decisionReason:'已登记实发，预约流程结束',updatedAt:now}).where(and(eq(reservations.scheduleId,id),inArray(reservations.status,['pending','approved'])));
    await tx.update(changes).set({status:'obsolete',decidedAt:now,decisionReason:'帖子已经实发'}).where(and(eq(changes.scheduleId,id),eq(changes.status,'pending')));
    if(oldTimeline&&(oldTimeline.plan||oldTimeline.campaigns.length))await tx.insert(audits).values({scheduleId:id,requestKey:randomUUID(),businessDate:shanghaiDateKey(actual),action:'publication_reset',reason:input.correctionReason||'发布时间更正',before:oldTimeline,after:await promotionSnapshot(tx,id),changedById:actor.id,changedByLabel:actor.username,createdAt:now});
    return {kind:'saved' as const,unchanged:false};
  });
}
