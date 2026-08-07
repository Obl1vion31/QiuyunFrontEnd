import type { APIRoute } from 'astro';
import { and, count, eq, inArray, isNull } from 'drizzle-orm';
import { getDb } from '../../../db/client';
import {
  operationsContentSchedule,
  operationsContentVersion,
  operationsPromotionCampaign,
  operationsPromotionDailyMetric,
  operationsPromotionStage,
  operationsScheduleUsageEvent,
} from '../../../db/schema';
import {
  editScheduleInputFromForm,
  editScheduleSchema,
  issuesByField,
  normalizeCompletionStatus,
} from '../../../db/validation';

export const prerender = false;

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

  const result = editScheduleSchema.safeParse(editScheduleInputFromForm(form));
  if (!result.success) {
    return Response.json({ message: '请检查标记的字段。', fields: issuesByField(result.error.issues) }, { status: 422 });
  }

  try {
    const completionStatus = normalizeCompletionStatus(result.data);
    const confirmPromotionReset = form.get('confirmPromotionReset') === '1';
    const usageChangeReason = String(form.get('usageChangeReason') ?? '').trim();
    const updated = await getDb().transaction(async (transaction) => {
      const [schedule] = await transaction.select({
        versionId: operationsContentSchedule.contentVersionId,
        isPromoted: operationsContentSchedule.isPromoted,
        promotionStatus: operationsContentSchedule.promotionStatus,
        actualPublishAt: operationsContentSchedule.actualPublishAt,
      })
        .from(operationsContentSchedule)
        .where(eq(operationsContentSchedule.id, params.id!))
        .limit(1);
      if (!schedule) return null;

      const actualChanged = schedule.actualPublishAt?.getTime() !== result.data.actualPublishAt?.getTime();
      const [campaignCountRow] = await transaction.select({ value: count() })
        .from(operationsPromotionCampaign)
        .where(eq(operationsPromotionCampaign.scheduleId, params.id!));
      const campaignCount = Number(campaignCountRow?.value ?? 0);
      const endCampaigns = campaignCount > 0 && schedule.isPromoted && !result.data.isPromoted;
      const resetCampaigns = campaignCount > 0 && actualChanged && !endCampaigns;

      if ((resetCampaigns || endCampaigns) && !confirmPromotionReset) {
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
          preserveHistory: endCampaigns && !resetCampaigns,
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

      if (resetCampaigns) {
        await transaction.delete(operationsPromotionCampaign)
          .where(eq(operationsPromotionCampaign.scheduleId, params.id!));
      }
      if (endCampaigns && !resetCampaigns) {
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
        : !result.data.actualPublishAt
          ? 'pending'
          : resetCampaigns || campaignCount === 0
            ? 'awaiting_promotion'
            : schedule.promotionStatus;
      const [saved] = await transaction.update(operationsContentSchedule).set({
        syncToMoments: result.data.syncToMoments,
        isPromoted: result.data.isPromoted,
        promotionStatus,
        promotionDeferredThrough: promotionStatus === 'awaiting_promotion'
          ? schedule.actualPublishAt?.getTime() === result.data.actualPublishAt?.getTime()
            ? undefined
            : null
          : null,
        plannedPublishAt: result.data.plannedPublishAt,
        actualPublishAt: result.data.actualPublishAt,
        completionStatus,
        delayReason: completionStatus === 'delayed' ? result.data.delayReason : null,
        updatedAt: new Date(),
      }).where(eq(operationsContentSchedule.id, params.id!)).returning({ id: operationsContentSchedule.id });
      return saved;
    });
    if (!updated) return Response.json({ message: '没有找到这条排期。' }, { status: 404 });
    if ('resetRequired' in updated) {
      return Response.json({
        message: updated.preserveHistory
          ? '改为非推广会结束仍开放的推广阶段；已有推广活动和日度数据将完整保留。'
          : '修改实发日期会删除关联的推广日历和日度数据。',
        resetRequired: true,
        preserveHistory: updated.preserveHistory,
        impact: updated.impact,
      }, { status: 409 });
    }
    if ('usageReasonRequired' in updated) return Response.json({ message: '请填写改为非推广的原因。', fields: { usageChangeReason: ['请填写用途变更原因'] } }, { status: 422 });
  } catch (error) {
    console.error('operations schedule update failed', error);
    return Response.json({ message: '数据库暂时不可用，请稍后重试。' }, { status: 503 });
  }
  return Response.json({ ok: true });
};
