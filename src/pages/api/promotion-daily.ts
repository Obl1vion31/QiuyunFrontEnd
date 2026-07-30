import type { APIRoute } from 'astro';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { getDb } from '../../db/client';
import {
  operationsCategory,
  operationsContentSchedule,
  operationsContentVersion,
  operationsPromotionCampaign,
  operationsPromotionDailyMetric,
  operationsPromotionStage,
  operationsSubject,
} from '../../db/schema';
import {
  calculatePromotionCosts,
  isDecisionAllowed,
  nextDateKey,
  nextPromotionState,
  shanghaiDateKey,
} from '../../db/promotion-rules.mjs';
import { promotionDailyInputFromForm, promotionDailySchema } from '../../db/promotion-validation';

export const prerender = false;

const previousDateKey = (dateKey: string) => {
  const date = new Date(`${dateKey}T00:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() - 1);
  return shanghaiDateKey(date);
};

const requestedDate = (url: URL) => {
  const value = url.searchParams.get('date');
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : previousDateKey(shanghaiDateKey(new Date()));
};

export const GET: APIRoute = async ({ url }) => {
  const metricDate = requestedDate(url);
  try {
    const rows = await getDb().select({
      campaignId: operationsPromotionCampaign.id,
      scheduleId: operationsContentSchedule.id,
      contentName: operationsContentVersion.contentName,
      versionNumber: operationsContentVersion.versionNumber,
      subjectName: operationsSubject.name,
      categoryName: operationsCategory.name,
      currentStatus: operationsPromotionCampaign.currentStatus,
      currentStage: operationsPromotionCampaign.currentStage,
      startedOn: operationsPromotionCampaign.startedOn,
      endedOn: operationsPromotionCampaign.endedOn,
      stageTypeSnapshot: operationsPromotionDailyMetric.stageTypeSnapshot,
      spend: operationsPromotionDailyMetric.spend,
      clickRate: operationsPromotionDailyMetric.clickRate,
      platformOpenCount: operationsPromotionDailyMetric.platformOpenCount,
      actualOpenCount: operationsPromotionDailyMetric.actualOpenCount,
      platformLeadCount: operationsPromotionDailyMetric.platformLeadCount,
      actualLeadCount: operationsPromotionDailyMetric.actualLeadCount,
      reviewDecision: operationsPromotionDailyMetric.reviewDecision,
      note: operationsPromotionDailyMetric.note,
    }).from(operationsPromotionCampaign)
      .innerJoin(operationsContentSchedule, eq(operationsPromotionCampaign.scheduleId, operationsContentSchedule.id))
      .innerJoin(operationsContentVersion, eq(operationsContentSchedule.contentVersionId, operationsContentVersion.id))
      .innerJoin(operationsSubject, eq(operationsContentVersion.subjectId, operationsSubject.id))
      .leftJoin(operationsCategory, eq(operationsContentVersion.categoryId, operationsCategory.id))
      .leftJoin(operationsPromotionDailyMetric, and(
        eq(operationsPromotionDailyMetric.campaignId, operationsPromotionCampaign.id),
        eq(operationsPromotionDailyMetric.metricDate, metricDate),
      ))
      .where(or(
        inArray(operationsPromotionCampaign.currentStatus, ['testing', 'scaling']),
        eq(operationsPromotionDailyMetric.metricDate, metricDate),
      ))
      .orderBy(operationsContentVersion.contentName);

    return Response.json({
      date: metricDate,
      rows: rows.map((row) => {
        const costs = row.spend == null ? null : calculatePromotionCosts({
          spend: Number(row.spend),
          platformOpenCount: row.platformOpenCount ?? 0,
          actualOpenCount: row.actualOpenCount ?? 0,
          platformLeadCount: row.platformLeadCount ?? 0,
          actualLeadCount: row.actualLeadCount ?? 0,
        });
        return { ...row, costs, completed: row.reviewDecision != null };
      }),
    });
  } catch (error) {
    console.error('promotion daily read failed', error);
    return Response.json({ message: '推广日度数据暂时不可用。' }, { status: 503 });
  }
};

export const POST: APIRoute = async ({ request, url }) => {
  const origin = request.headers.get('origin');
  if (!origin || origin !== url.origin) return new Response('拒绝跨站写入。', { status: 403 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ message: '请求必须使用有效的表单格式。' }, { status: 400 });
  }

  const result = promotionDailySchema.safeParse(promotionDailyInputFromForm(form));
  if (!result.success) {
    const fields: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const field = String(issue.path[0] ?? 'form');
      (fields[field] ??= []).push(issue.message);
    }
    return Response.json({ message: '请检查日度数据。', fields }, { status: 422 });
  }

  const today = shanghaiDateKey(new Date());
  if (result.data.metricDate >= today) {
    return Response.json({ message: '日度复盘按 T+1 填写，只能保存今天以前的数据。' }, { status: 422 });
  }

  try {
    const saved = await getDb().transaction(async (transaction) => {
      await transaction.execute(
        // Serialize reviews for the same campaign so two dates cannot be finalized out of order.
        sql`select id from operations_promotion_campaign where id = ${result.data.campaignId} for update`,
      );
      const [campaign] = await transaction.select({
        id: operationsPromotionCampaign.id,
        scheduleId: operationsPromotionCampaign.scheduleId,
        startedOn: operationsPromotionCampaign.startedOn,
        currentStage: operationsPromotionCampaign.currentStage,
        currentStatus: operationsPromotionCampaign.currentStatus,
      }).from(operationsPromotionCampaign)
        .where(eq(operationsPromotionCampaign.id, result.data.campaignId))
        .limit(1);
      if (!campaign) return { kind: 'missing' as const };
      if (!campaign.currentStage) return { kind: 'closed' as const };
      const [activeStage] = await transaction.select({
        startedOn: operationsPromotionStage.startedOn,
      }).from(operationsPromotionStage)
        .where(and(
          eq(operationsPromotionStage.campaignId, campaign.id),
          eq(operationsPromotionStage.stageType, campaign.currentStage),
        ))
        .orderBy(desc(operationsPromotionStage.startedOn))
        .limit(1);
      if (!activeStage) return { kind: 'closed' as const };

      const [latest] = await transaction.select({
        metricDate: operationsPromotionDailyMetric.metricDate,
      }).from(operationsPromotionDailyMetric)
        .where(eq(operationsPromotionDailyMetric.campaignId, campaign.id))
        .orderBy(desc(operationsPromotionDailyMetric.metricDate))
        .limit(1);
      const expectedDate = latest ? nextDateKey(latest.metricDate) : activeStage.startedOn;
      if (result.data.metricDate !== expectedDate) {
        return { kind: 'out-of-order' as const, expectedDate };
      }
      if (!isDecisionAllowed(campaign.currentStage, result.data.reviewDecision)) {
        return { kind: 'invalid-decision' as const };
      }
      const nextState = nextPromotionState(campaign.currentStage, result.data.reviewDecision);
      if (!nextState) return { kind: 'invalid-decision' as const };

      const [metric] = await transaction.insert(operationsPromotionDailyMetric).values({
        campaignId: campaign.id,
        metricDate: result.data.metricDate,
        stageTypeSnapshot: campaign.currentStage,
        spend: result.data.spend.toFixed(2),
        clickRate: result.data.clickRate.toFixed(4),
        platformOpenCount: result.data.platformOpenCount,
        actualOpenCount: result.data.actualOpenCount,
        platformLeadCount: result.data.platformLeadCount,
        actualLeadCount: result.data.actualLeadCount,
        reviewDecision: result.data.reviewDecision,
        note: result.data.note ?? null,
      }).returning({ id: operationsPromotionDailyMetric.id });

      const stageChanged = nextState.stage !== campaign.currentStage;
      if (stageChanged) {
        await transaction.update(operationsPromotionStage).set({
          endedOn: result.data.metricDate,
          outcome: nextState.outcome,
          updatedAt: new Date(),
        }).where(and(
          eq(operationsPromotionStage.campaignId, campaign.id),
          eq(operationsPromotionStage.stageType, campaign.currentStage),
        ));
        if (nextState.stage === 'scaling') {
          await transaction.insert(operationsPromotionStage).values({
            campaignId: campaign.id,
            stageType: 'scaling',
            startedOn: nextDateKey(result.data.metricDate),
          });
        }
      }

      await transaction.update(operationsPromotionCampaign).set({
        currentStage: nextState.stage,
        currentStatus: nextState.status,
        endedOn: nextState.stage ? null : result.data.metricDate,
        updatedAt: new Date(),
      }).where(eq(operationsPromotionCampaign.id, campaign.id));
      await transaction.update(operationsContentSchedule).set({
        promotionStatus: nextState.status,
        updatedAt: new Date(),
      }).where(eq(operationsContentSchedule.id, campaign.scheduleId));

      return { kind: 'saved' as const, id: metric.id, nextStatus: nextState.status };
    });

    if (saved.kind === 'missing') return Response.json({ message: '没有找到推广活动。' }, { status: 404 });
    if (saved.kind === 'closed') return Response.json({ message: '该推广活动已经结束。' }, { status: 409 });
    if (saved.kind === 'out-of-order') {
      return Response.json({ message: `请先完成 ${saved.expectedDate} 的日度复盘。`, expectedDate: saved.expectedDate }, { status: 409 });
    }
    if (saved.kind === 'invalid-decision') {
      return Response.json({ message: '复盘选择与当前推广阶段不匹配。' }, { status: 409 });
    }
    return Response.json({ ok: true, id: saved.id, nextStatus: saved.nextStatus }, { status: 201 });
  } catch (error) {
    const postgresError = error as { code?: string };
    if (postgresError.code === '23505') {
      return Response.json({ message: '这一天已经完成复盘，请刷新后查看。' }, { status: 409 });
    }
    console.error('promotion daily save failed', error);
    return Response.json({ message: '推广日度数据保存失败，请稍后重试。' }, { status: 503 });
  }
};
