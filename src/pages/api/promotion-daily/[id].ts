import type { APIRoute } from 'astro';
import { asc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../../db/client';
import {
  operationsContentSchedule,
  operationsPromotionCampaign,
  operationsPromotionDailyMetric,
  operationsPromotionStage,
} from '../../../db/schema';
import { isDecisionAllowed, replayPromotionHistory } from '../../../db/promotion-rules.mjs';
import {
  promotionDailyUpdateInputFromForm,
  promotionDailyUpdateSchema,
} from '../../../db/promotion-validation';

export const prerender = false;

const validationResponse = (issues: Array<{ path: PropertyKey[]; message: string }>) => {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? 'form');
    (fields[field] ??= []).push(issue.message);
  }
  return Response.json({ message: '请检查日度数据。', fields }, { status: 422 });
};

export const PATCH: APIRoute = async ({ request, url, params }) => {
  if (request.headers.get('origin') !== url.origin) return new Response('拒绝跨站写入。', { status: 403 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ message: '请求必须使用有效的表单格式。' }, { status: 400 });
  }
  const parsed = promotionDailyUpdateSchema.safeParse(promotionDailyUpdateInputFromForm(form));
  if (!parsed.success) return validationResponse(parsed.error.issues);

  try {
    const result = await getDb().transaction(async (transaction) => {
      const [existing] = await transaction.select().from(operationsPromotionDailyMetric)
        .where(eq(operationsPromotionDailyMetric.id, params.id!)).limit(1);
      if (!existing) return { kind: 'missing' as const };
      await transaction.execute(sql`select id from operations_promotion_campaign where id = ${existing.campaignId} for update`);

      const [campaign] = await transaction.select().from(operationsPromotionCampaign)
        .where(eq(operationsPromotionCampaign.id, existing.campaignId)).limit(1);
      if (!campaign) return { kind: 'missing' as const };
      if (!isDecisionAllowed(existing.stageTypeSnapshot, parsed.data.reviewDecision)) {
        return { kind: 'invalid-decision' as const };
      }

      const decisionChanged = existing.reviewDecision !== parsed.data.reviewDecision;
      const allMetrics = await transaction.select().from(operationsPromotionDailyMetric)
        .where(eq(operationsPromotionDailyMetric.campaignId, existing.campaignId))
        .orderBy(asc(operationsPromotionDailyMetric.metricDate));
      const later = decisionChanged ? allMetrics.filter((metric) => metric.metricDate > existing.metricDate) : [];
      if (later.length > 0 && !parsed.data.confirmCascade) {
        const laterStages = await transaction.select({ id: operationsPromotionStage.id })
          .from(operationsPromotionStage)
          .where(sql`${operationsPromotionStage.campaignId} = ${existing.campaignId} and ${operationsPromotionStage.startedOn} > ${existing.metricDate}`);
        return { kind: 'confirmation' as const, dailyMetrics: later.length, stages: laterStages.length };
      }

      const retainedCandidate = allMetrics
        .filter((metric) => !decisionChanged || metric.metricDate <= existing.metricDate)
        .map((metric) => metric.id === existing.id ? { ...metric, reviewDecision: parsed.data.reviewDecision } : metric);
      const replayed = decisionChanged ? replayPromotionHistory(campaign.startedOn, retainedCandidate) : null;
      if (decisionChanged && !replayed) return { kind: 'invalid-decision' as const };

      if (decisionChanged && later.length > 0) {
        await transaction.delete(operationsPromotionDailyMetric).where(sql`${operationsPromotionDailyMetric.campaignId} = ${existing.campaignId} and ${operationsPromotionDailyMetric.metricDate} > ${existing.metricDate}`);
      }
      await transaction.update(operationsPromotionDailyMetric).set({
        spend: parsed.data.spend.toFixed(2),
        platformOpenCount: parsed.data.platformOpenCount,
        actualOpenCount: parsed.data.actualOpenCount,
        platformLeadCount: parsed.data.platformLeadCount,
        actualLeadCount: parsed.data.actualLeadCount,
        reviewDecision: parsed.data.reviewDecision,
        note: parsed.data.note ?? null,
        updatedAt: new Date(),
      }).where(eq(operationsPromotionDailyMetric.id, existing.id));

      if (!decisionChanged) return { kind: 'saved' as const, deleted: 0 };

      await transaction.delete(operationsPromotionStage)
        .where(eq(operationsPromotionStage.campaignId, existing.campaignId));
      for (const stage of replayed!.stages) {
        await transaction.insert(operationsPromotionStage).values({ campaignId: campaign.id, ...stage });
      }
      await transaction.update(operationsPromotionCampaign).set({
        currentStage: replayed!.currentStage,
        currentStatus: replayed!.currentStatus,
        endedOn: replayed!.endedOn,
        updatedAt: new Date(),
      }).where(eq(operationsPromotionCampaign.id, campaign.id));
      await transaction.update(operationsContentSchedule).set({
        promotionStatus: replayed!.currentStatus,
        updatedAt: new Date(),
      }).where(eq(operationsContentSchedule.id, campaign.scheduleId));
      return { kind: 'saved' as const, deleted: later.length };
    });

    if (result.kind === 'missing') return Response.json({ message: '没有找到这条日度记录。' }, { status: 404 });
    if (result.kind === 'invalid-decision') return Response.json({ message: '下一步与该日阶段不匹配。' }, { status: 409 });
    if (result.kind === 'confirmation') {
      return Response.json({
        message: `修改下一步会删除后续 ${result.dailyMetrics} 条日度记录，并重建生命周期。`,
        correctionRequired: true,
        impact: { dailyMetrics: result.dailyMetrics, stages: result.stages },
      }, { status: 409 });
    }
    return Response.json({ ok: true, deleted: result.deleted });
  } catch (error) {
    console.error('promotion daily update failed', error);
    return Response.json({ message: '历史日度数据保存失败，请稍后重试。' }, { status: 503 });
  }
};
