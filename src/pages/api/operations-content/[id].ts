import type { APIRoute } from 'astro';
import { count, eq, inArray } from 'drizzle-orm';
import { getDb } from '../../../db/client';
import {
  operationsContentSchedule,
  operationsContentVersion,
  operationsPromotionCampaign,
  operationsPromotionDailyMetric,
  operationsPromotionStage,
} from '../../../db/schema';
import { shanghaiDateKey } from '../../../db/promotion-rules.mjs';
import {
  editScheduleInputFromForm,
  editScheduleSchema,
  issuesByField,
  normalizeCompletionStatus,
} from '../../../db/validation';

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request, url }) => {
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
      const resetCampaigns = campaignCount > 0 && (actualChanged || !result.data.isPromoted);

      if (resetCampaigns && !confirmPromotionReset) {
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
          impact: { campaigns: campaignCount, dailyMetrics: Number(metricCountRow?.value ?? 0) },
        };
      }

      await transaction.update(operationsContentVersion).set({
        contentName: result.data.contentName,
        subjectId: result.data.subjectId,
        categoryId: result.data.categoryId,
        projectDocName: result.data.projectDocName,
        projectDocUrl: result.data.projectDocUrl,
        updatedAt: new Date(),
      }).where(eq(operationsContentVersion.id, schedule.versionId));

      if (resetCampaigns) {
        await transaction.delete(operationsPromotionCampaign)
          .where(eq(operationsPromotionCampaign.scheduleId, params.id!));
      }

      const shouldStartCampaign = result.data.isPromoted && result.data.actualPublishAt
        && (campaignCount === 0 || resetCampaigns);
      const promotionStatus = !result.data.isPromoted
        ? 'none'
        : shouldStartCampaign
          ? 'testing'
          : result.data.actualPublishAt
            ? schedule.promotionStatus
            : 'pending';
      const [saved] = await transaction.update(operationsContentSchedule).set({
        syncToMoments: result.data.syncToMoments,
        isPromoted: result.data.isPromoted,
        promotionStatus,
        plannedPublishAt: result.data.plannedPublishAt,
        actualPublishAt: result.data.actualPublishAt,
        completionStatus,
        delayReason: completionStatus === 'delayed' ? result.data.delayReason : null,
        updatedAt: new Date(),
      }).where(eq(operationsContentSchedule.id, params.id!)).returning({ id: operationsContentSchedule.id });
      if (shouldStartCampaign) {
        const startedOn = shanghaiDateKey(result.data.actualPublishAt!);
        const [campaign] = await transaction.insert(operationsPromotionCampaign).values({
          scheduleId: saved.id,
          startedOn,
          currentStage: 'testing',
          currentStatus: 'testing',
        }).returning({ id: operationsPromotionCampaign.id });
        await transaction.insert(operationsPromotionStage).values({
          campaignId: campaign.id,
          stageType: 'testing',
          startedOn,
        });
      }
      return saved;
    });
    if (!updated) return Response.json({ message: '没有找到这条排期。' }, { status: 404 });
    if ('resetRequired' in updated) {
      return Response.json({
        message: '修改实发日期会删除关联的推广日历和日度数据。',
        resetRequired: true,
        impact: updated.impact,
      }, { status: 409 });
    }
  } catch (error) {
    console.error('operations schedule update failed', error);
    return Response.json({ message: '数据库暂时不可用，请稍后重试。' }, { status: 503 });
  }
  return Response.json({ ok: true });
};
