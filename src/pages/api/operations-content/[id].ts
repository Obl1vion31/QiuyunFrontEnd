import {readPostSchemas} from '../../../db/taxonomy-store';
import type { APIRoute } from 'astro';
import { lockPromotionWorkflow } from '../../../db/promotion-pauses';
import {promotionSnapshot} from '../../../db/promotion-timeline';
import {randomUUID} from 'node:crypto';
import {shanghaiDateKey} from '../../../db/promotion-rules.mjs';
import { changeSchedulePlan, WorkflowError } from '../../../db/schedule-workflow';
import { workflowErrorResponse } from '../../../db/workflow-api';
import {requireBusinessOperation} from '../../../auth/business-permissions';
import { and, count, eq, inArray, isNull } from 'drizzle-orm';
import { getDb } from '../../../db/client';
import {
  operationsContent,
  operationsContentPerformanceMetric,
  operationsContentSchedule,
  operationsContentVersion,
  operationsNonPromotionReview,
  operationsPromotionCampaign,
  operationsPromotionDailyMetric,
  operationsPromotionStage,
  operationsScheduleUsageEvent,
  operationsSchedulePlanHistory,
  operationsScheduleChangeRequest,
  operationsScheduleDelayReason,
  operationsNonPromotionCheckpointEvent,
  operationsPublicationReservation,operationsPublicationEvent,operationsPromotionStartPlan,operationsPromotionTimelineAudit,
} from '../../../db/schema';
import {
  editScheduleInputFromForm,
  issuesByField,
} from '../../../db/validation';

export const prerender = false;

export const DELETE: APIRoute = async ({ params, request, url }) => {
  const origin = request.headers.get('origin');
  if (!origin || origin !== url.origin) return new Response('拒绝跨站写入。', { status: 403 });
  if (!params.id) return Response.json({ message: '缺少排期编号。' }, { status: 400 });

  try {
    const result = await getDb().transaction(async (transaction) => {
      const [schedule] = await transaction.select({
        id: operationsContentSchedule.id,
        versionId: operationsContentSchedule.contentVersionId,
      }).from(operationsContentSchedule)
        .where(eq(operationsContentSchedule.id, params.id!))
        .limit(1)
        .for('update');
      if (!schedule) return { kind: 'missing' as const };

      const [version] = await transaction.select({
        id: operationsContentVersion.id,
        contentId: operationsContentVersion.contentId,
      }).from(operationsContentVersion)
        .where(eq(operationsContentVersion.id, schedule.versionId))
        .limit(1)
        .for('update');
      if (!version) return { kind: 'missing' as const };

      const [versionCountRow, campaignCountRow, metricCountRow, reviewCountRow, usageCountRow, planCountRow, requestCountRow, reasonCountRow, checkpointCountRow, reservationCountRow, publicationCountRow] = await Promise.all([
        transaction.select({ value: count() }).from(operationsContentVersion)
          .where(eq(operationsContentVersion.contentId, version.contentId)),
        transaction.select({ value: count() }).from(operationsPromotionCampaign)
          .where(eq(operationsPromotionCampaign.scheduleId, schedule.id)),
        transaction.select({ value: count() }).from(operationsContentPerformanceMetric)
          .where(eq(operationsContentPerformanceMetric.scheduleId, schedule.id)),
        transaction.select({ value: count() }).from(operationsNonPromotionReview)
          .where(eq(operationsNonPromotionReview.scheduleId, schedule.id)),
        transaction.select({ value: count() }).from(operationsScheduleUsageEvent)
          .where(eq(operationsScheduleUsageEvent.scheduleId, schedule.id)),
        transaction.select({ value: count() }).from(operationsSchedulePlanHistory).where(eq(operationsSchedulePlanHistory.scheduleId, schedule.id)),
        transaction.select({ value: count() }).from(operationsScheduleChangeRequest).where(eq(operationsScheduleChangeRequest.scheduleId, schedule.id)),
        transaction.select({ value: count() }).from(operationsScheduleDelayReason).where(eq(operationsScheduleDelayReason.scheduleId, schedule.id)),
        transaction.select({ value: count() }).from(operationsNonPromotionCheckpointEvent).where(eq(operationsNonPromotionCheckpointEvent.scheduleId, schedule.id)),
        transaction.select({value:count()}).from(operationsPublicationReservation).where(eq(operationsPublicationReservation.scheduleId,schedule.id)),
        transaction.select({value:count()}).from(operationsPublicationEvent).where(eq(operationsPublicationEvent.scheduleId,schedule.id)),
      ]);
      const [startPlanRows,timelineAuditRows]=await Promise.all([
        transaction.select({value:count()}).from(operationsPromotionStartPlan).where(eq(operationsPromotionStartPlan.scheduleId,schedule.id)),
        transaction.select({value:count()}).from(operationsPromotionTimelineAudit).where(eq(operationsPromotionTimelineAudit.scheduleId,schedule.id)),
      ]);
      const blockers = {startPlans:Number(startPlanRows[0]?.value??0),timelineAudits:Number(timelineAuditRows[0]?.value??0),
        reservations:Number(reservationCountRow[0]?.value??0),publicationEvents:Number(publicationCountRow[0]?.value??0),
        versions: Number(versionCountRow?.[0]?.value ?? 0) > 1,
        campaigns: Number(campaignCountRow?.[0]?.value ?? 0),
        performanceMetrics: Number(metricCountRow?.[0]?.value ?? 0),
        reviews: Number(reviewCountRow?.[0]?.value ?? 0),
        usageEvents: Number(usageCountRow?.[0]?.value ?? 0),
        planHistory: Number(planCountRow?.[0]?.value ?? 0), changeRequests: Number(requestCountRow?.[0]?.value ?? 0),
        delayReasons: Number(reasonCountRow?.[0]?.value ?? 0), checkpointEvents: Number(checkpointCountRow?.[0]?.value ?? 0),
      };
      if (blockers.startPlans || blockers.timelineAudits || blockers.versions || blockers.campaigns || blockers.performanceMetrics || blockers.reviews || blockers.usageEvents || blockers.planHistory || blockers.changeRequests || blockers.delayReasons || blockers.checkpointEvents || blockers.reservations || blockers.publicationEvents) {
        return { kind: 'blocked' as const, blockers };
      }

      await transaction.delete(operationsContentSchedule).where(eq(operationsContentSchedule.id, schedule.id));
      await transaction.delete(operationsContentVersion).where(eq(operationsContentVersion.id, version.id));
      await transaction.delete(operationsContent).where(eq(operationsContent.id, version.contentId));
      return { kind: 'deleted' as const, id: schedule.id };
    });

    if (result.kind === 'missing') return Response.json({ message: '没有找到这条排期。' }, { status: 404 });
    if (result.kind === 'blocked') {
      return Response.json({
        message: '这条排期已有改帖、推广、复盘、改期、延期、预约或实发记录，为保护历史记录不能删除。',
        blockers: result.blockers,
      }, { status: 409 });
    }
    return Response.json({ ok: true, id: result.id });
  } catch (error) {
    if ((error as { code?: string }).code === '23503') {
      return Response.json({ message: '这条排期刚刚产生了关联数据，不能删除。' }, { status: 409 });
    }
    console.error('operations schedule delete failed', error);
    return Response.json({ message: '删除失败，请稍后重试。' }, { status: 503 });
  }
};

export const PATCH: APIRoute = async ({ params, request, url, locals }) => {
  const origin = request.headers.get('origin');
  if (!origin || origin !== url.origin) return new Response('拒绝跨站写入。', { status: 403 });
  if (!params.id) return Response.json({ message: '缺少排期编号。' }, { status: 400 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ message: '请求必须使用有效的表单格式。' }, { status: 400 });
  }

  const result = (await readPostSchemas(getDb())).editScheduleSchema.safeParse(editScheduleInputFromForm(form));
  if (!result.success) {
    return Response.json({ message: '请检查标记的字段。', fields: issuesByField(result.error.issues) }, { status: 422 });
  }

  try {
    const confirmPromotionReset = form.get('confirmPromotionReset') === '1';
    const usageChangeReason = String(form.get('usageChangeReason') ?? '').trim();
    const updated = await getDb().transaction(async (transaction) => {
      await lockPromotionWorkflow(transaction);
      const [schedule] = await transaction.select({
        versionId: operationsContentSchedule.contentVersionId,
        isPromoted: operationsContentSchedule.isPromoted,
        promotionStatus: operationsContentSchedule.promotionStatus,
        actualPublishAt: operationsContentSchedule.actualPublishAt,
        id: operationsContentSchedule.id, plannedPublishAt: operationsContentSchedule.plannedPublishAt,
        planRevision: operationsContentSchedule.planRevision, planEffectiveAt: operationsContentSchedule.planEffectiveAt,
      })
        .from(operationsContentSchedule)
        .where(eq(operationsContentSchedule.id, params.id!))
        .limit(1).for('update');
      if (!schedule) return null;
      const planChanged = schedule.plannedPublishAt.getTime() !== result.data.plannedPublishAt.getTime();
      if (planChanged) {
        if (form.get('expectedPlanRevision') === null || Number(form.get('expectedPlanRevision')) !== schedule.planRevision) throw new WorkflowError('排期已更新，请刷新后重试。');
        if (!String(form.get('planChangeReason') ?? '').trim()) throw new WorkflowError('请填写改期理由。', 422);
      }

      const [campaignCountRow] = await transaction.select({ value: count() })
        .from(operationsPromotionCampaign)
        .where(eq(operationsPromotionCampaign.scheduleId, params.id!));
      const campaignCount = Number(campaignCountRow?.value ?? 0);
      const oldTimeline=schedule.isPromoted!==result.data.isPromoted?await promotionSnapshot(transaction,schedule.id):null;
      const endCampaigns = campaignCount > 0 && schedule.isPromoted && !result.data.isPromoted;
      if (endCampaigns) await requireBusinessOperation(transaction,locals.user!,'schedule.endPromotion');

      if (endCampaigns && !confirmPromotionReset) {
        const campaigns = await transaction.select({ id: operationsPromotionCampaign.id })
          .from(operationsPromotionCampaign)
          .where(eq(operationsPromotionCampaign.scheduleId, params.id!));
        const ids = campaigns.map((campaign) => campaign.id);
        const [metricCountRow] = ids.length
          ? await transaction.select({ value: count() }).from(operationsPromotionDailyMetric)
            .where(inArray(operationsPromotionDailyMetric.campaignId, ids))
          : [{ value: 0 }];
        return {
          resetRequired: true as const,
          preserveHistory: true,
          impact: { campaigns: campaignCount, dailyMetrics: Number(metricCountRow?.value ?? 0) },
        };
      }
      if (endCampaigns && !usageChangeReason) return { usageReasonRequired: true as const };

      await transaction.update(operationsContentVersion).set({
        contentName: result.data.contentName,
        subjectId: result.data.subjectId,
        categoryId: result.data.categoryId,
        projectDocUrl: result.data.projectDocUrl,
        updatedAt: new Date(),
      }).where(eq(operationsContentVersion.id, schedule.versionId));

      if (endCampaigns) {
        const effectiveOn = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
        const openCampaigns = await transaction.select({
          id: operationsPromotionCampaign.id,
          currentStage: operationsPromotionCampaign.currentStage,
          startedOn: operationsPromotionCampaign.startedOn,
        }).from(operationsPromotionCampaign).where(and(
          eq(operationsPromotionCampaign.scheduleId, params.id!),
          isNull(operationsPromotionCampaign.endedOn),
        ));
        for (const campaign of openCampaigns) {
          const endedOn = effectiveOn < campaign.startedOn ? campaign.startedOn : effectiveOn;
          const finalStatus = campaign.currentStage === 'testing' ? 'test_discarded' : 'ended';
          await transaction.update(operationsPromotionStage).set({
            endedOn,
            outcome: campaign.currentStage === 'testing' ? 'test_discarded' : 'ended',
            updatedAt: new Date(),
          }).where(and(eq(operationsPromotionStage.campaignId, campaign.id), isNull(operationsPromotionStage.endedOn)));
          await transaction.update(operationsPromotionCampaign).set({
            endedOn,
            currentStage: null,
            currentStatus: finalStatus,
            updatedAt: new Date(),
          }).where(eq(operationsPromotionCampaign.id, campaign.id));
        }
        await transaction.insert(operationsScheduleUsageEvent).values({
          scheduleId: params.id!,
          fromUsage: 'promotion',
          toUsage: 'non_promotion',
          effectiveOn,
          reason: usageChangeReason,
          changedByLabel: locals.operationsUser || 'unknown',
        });
      }

      const promotionStatus = !result.data.isPromoted
        ? 'none'
        : !schedule.actualPublishAt
          ? 'pending'
          : campaignCount === 0
            ? 'awaiting_promotion'
            : schedule.promotionStatus;
      if (planChanged) {
        const [fullSchedule] = await transaction.select().from(operationsContentSchedule).where(eq(operationsContentSchedule.id, params.id!));
        await changeSchedulePlan(transaction, fullSchedule, result.data.plannedPublishAt, String(form.get('planChangeReason')), locals.user!);
      }
      const [saved] = await transaction.update(operationsContentSchedule).set({
        syncToMoments: result.data.syncToMoments,
        isPromoted: result.data.isPromoted,
        promotionStatus,
        promotionDeferredThrough: promotionStatus === 'awaiting_promotion'
          ? schedule.promotionStatus === 'awaiting_promotion'
            ? undefined
            : null
          : null,
        updatedAt: new Date(),
      }).where(eq(operationsContentSchedule.id, params.id!)).returning({ id: operationsContentSchedule.id });
      if(oldTimeline?.plan){
        await transaction.delete(operationsPromotionStartPlan).where(eq(operationsPromotionStartPlan.scheduleId,schedule.id));
        await transaction.insert(operationsPromotionTimelineAudit).values({scheduleId:schedule.id,requestKey:randomUUID(),businessDate:shanghaiDateKey(new Date()),action:'usage_change',reason:usageChangeReason||'调整推广身份',before:oldTimeline,after:await promotionSnapshot(transaction,schedule.id),changedById:locals.user!.id,changedByLabel:locals.user!.username});
      }
      return saved;
    });
    if (!updated) return Response.json({ message: '没有找到这条排期。' }, { status: 404 });
    if ('resetRequired' in updated) {
      return Response.json({
        message: updated.preserveHistory
          ? '改为非推广会结束仍开放的推广阶段；已有推广活动和日度数据将完整保留。'
          : '排期变更需要确认。',
        resetRequired: true,
        preserveHistory: updated.preserveHistory,
        impact: updated.impact,
      }, { status: 409 });
    }
    if ('usageReasonRequired' in updated) return Response.json({ message: '请填写改为非推广的原因。', fields: { usageChangeReason: ['请填写用途变更原因'] } }, { status: 422 });
  } catch (error) {
    return workflowErrorResponse(error);
  }
  return Response.json({ ok: true });
};
