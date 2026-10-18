import type { APIRoute } from 'astro';
import {randomUUID} from 'node:crypto';
import {promotionSnapshot} from '../../../db/promotion-timeline';
import { requireAdmin, permissionErrorResponse } from '../../../auth/permissions';
import { asc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../../db/client';
import {
  operationsContentSchedule,
  operationsPromotionCampaign,
  operationsPromotionDailyMetric,
  operationsPromotionStage,
  operationsPromotionHold,
  operationsPromotionWaitRange,
  operationsPromotionDayDecision,operationsPromotionTimelineAudit,
} from '../../../db/schema';
import { replayPromotionHistory } from '../../../db/promotion-rules.mjs';
import { lockPromotionWorkflow, readPromotionContext } from '../../../db/promotion-pauses';
import { promotionReplayOptions } from '../../../db/promotion-state.mjs';
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

export const PATCH: APIRoute = async ({ request, url, params, locals }) => {
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
      await lockPromotionWorkflow(transaction);
      const [reference] = await transaction.select({ campaignId: operationsPromotionDailyMetric.campaignId }).from(operationsPromotionDailyMetric)
        .where(eq(operationsPromotionDailyMetric.id, params.id!)).limit(1);
      if (!reference) return { kind: 'missing' as const };
      await transaction.execute(sql`select id from operations_promotion_campaign where id = ${reference.campaignId} for update`);
      // 排队期间管理员可能已更正或删除此事实，锁定活动后重新读取，避免用旧决定绕过权限。
      const [existing] = await transaction.select().from(operationsPromotionDailyMetric)
        .where(eq(operationsPromotionDailyMetric.id, params.id!)).limit(1);
      if (!existing) return { kind: 'missing' as const };

      const [campaign] = await transaction.select().from(operationsPromotionCampaign)
        .where(eq(operationsPromotionCampaign.id, existing.campaignId)).limit(1);
      if (!campaign) return { kind: 'missing' as const };
      const lifecycleChanged = existing.reviewDecision !== parsed.data.reviewDecision
        || existing.dailyStatus !== parsed.data.dailyStatus
        || existing.stageTypeSnapshot !== parsed.data.stageTypeSnapshot;
      if (lifecycleChanged) requireAdmin(locals.user);
      const before=lifecycleChanged?await promotionSnapshot(transaction,campaign.scheduleId):null;
      const allMetrics = await transaction.select().from(operationsPromotionDailyMetric)
        .where(eq(operationsPromotionDailyMetric.campaignId, existing.campaignId))
        .orderBy(asc(operationsPromotionDailyMetric.metricDate));
      const later = lifecycleChanged ? allMetrics.filter((metric) => metric.metricDate > existing.metricDate) : [];
      const context = await readPromotionContext(transaction);
      const affectedRanges = lifecycleChanged ? context.waitRanges.filter(r => r.campaignId === campaign.id && (!r.nextEffectiveOn || r.nextEffectiveOn > existing.metricDate)) : [];
      const affectedDecisions=lifecycleChanged?context.stateChanges.filter(row=>row.campaignId===campaign.id&&row.businessDate>existing.metricDate):[];
      if ((later.length > 0 || affectedRanges.length > 0 || affectedDecisions.length>0) && !parsed.data.confirmCascade) {
        const laterStages = await transaction.select({ id: operationsPromotionStage.id })
          .from(operationsPromotionStage)
          .where(sql`${operationsPromotionStage.campaignId} = ${existing.campaignId} and ${operationsPromotionStage.startedOn} > ${existing.metricDate}`);
        return { kind: 'confirmation' as const, dailyMetrics: later.length, stages: laterStages.length, waitRanges: affectedRanges.length,dayDecisions:affectedDecisions.length };
      }

      const retainedCandidate = allMetrics
        .filter((metric) => !lifecycleChanged || metric.metricDate <= existing.metricDate)
        .map((metric) => metric.id === existing.id ? {
          ...metric,
          dailyStatus: parsed.data.dailyStatus,
          stageTypeSnapshot: parsed.data.stageTypeSnapshot,
          reviewDecision: parsed.data.reviewDecision,
        } : metric);
      if (lifecycleChanged) context.waitRanges = context.waitRanges.filter(r => !affectedRanges.some(a => a.id === r.id));
      if (lifecycleChanged) context.holds = context.holds.filter(hold => hold.campaignId !== campaign.id || hold.endedOn <= existing.metricDate);
      if(lifecycleChanged)context.stateChanges=context.stateChanges.filter(row=>!affectedDecisions.some(affected=>affected.id===row.id));
      const replayed = lifecycleChanged ? replayPromotionHistory(campaign.startedOn, retainedCandidate, promotionReplayOptions(campaign, context)) : null;
      if (lifecycleChanged && !replayed) return { kind: 'invalid-decision' as const };

      if (lifecycleChanged && later.length > 0) {
        await transaction.delete(operationsPromotionDailyMetric).where(sql`${operationsPromotionDailyMetric.campaignId} = ${existing.campaignId} and ${operationsPromotionDailyMetric.metricDate} > ${existing.metricDate}`);
      }
      for (const range of affectedRanges) await transaction.delete(operationsPromotionWaitRange).where(eq(operationsPromotionWaitRange.id, range.id));
      for(const decision of affectedDecisions)await transaction.delete(operationsPromotionDayDecision).where(eq(operationsPromotionDayDecision.id,decision.id));
      if (lifecycleChanged) await transaction.delete(operationsPromotionHold).where(sql`${operationsPromotionHold.campaignId} = ${campaign.id} and ${operationsPromotionHold.endedOn} > ${existing.metricDate}`);
      await transaction.update(operationsPromotionDailyMetric).set({
        dailyStatus: parsed.data.dailyStatus,
        stageTypeSnapshot: parsed.data.stageTypeSnapshot,
        spend: parsed.data.spend.toFixed(2),
        platformOpenCount: parsed.data.platformOpenCount,
        actualOpenCount: parsed.data.actualOpenCount,
        platformLeadCount: parsed.data.platformLeadCount,
        actualLeadCount: parsed.data.actualLeadCount,
        reviewDecision: parsed.data.reviewDecision,
        note: parsed.data.note ?? null,
        updatedAt: new Date(),
      }).where(eq(operationsPromotionDailyMetric.id, existing.id));

      if (!lifecycleChanged) return { kind: 'saved' as const, deleted: 0 };

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
      if(before)await transaction.insert(operationsPromotionTimelineAudit).values({scheduleId:campaign.scheduleId,requestKey:randomUUID(),businessDate:existing.metricDate,action:'metric_correction',reason:parsed.data.note||'更正历史复盘决定',before,after:await promotionSnapshot(transaction,campaign.scheduleId),changedById:locals.user!.id,changedByLabel:locals.user!.username});
      return { kind: 'saved' as const, deleted: later.length };
    });

    if (result.kind === 'missing') return Response.json({ message: '没有找到这条日度记录。' }, { status: 404 });
    if (result.kind === 'invalid-decision') return Response.json({ message: '下一步与该日阶段不匹配。' }, { status: 409 });
    if (result.kind === 'confirmation') {
      return Response.json({
        message: `修改下一步会归档后续 ${result.dailyMetrics} 条日度记录，并重置 ${result.waitRanges} 个待定区间及 ${result.dayDecisions} 项当日安排。`,
        correctionRequired: true,
        impact: { dailyMetrics: result.dailyMetrics, stages: result.stages, waitRanges: result.waitRanges,dayDecisions:result.dayDecisions },
      }, { status: 409 });
    }
    return Response.json({ ok: true, deleted: result.deleted });
  } catch (error) {
    const denied = permissionErrorResponse(error); if (denied) return denied;
    console.error('promotion daily update failed', error);
    return Response.json({ message: '历史日度数据保存失败，请稍后重试。' }, { status: 503 });
  }
};
