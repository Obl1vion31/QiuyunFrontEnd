import type { APIRoute } from 'astro';
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import { getDb } from '../../db/client';
import {
  operationsCategory,
  operationsContent,
  operationsContentSchedule,
  operationsContentVersion,
  operationsPromotionCampaign,
  operationsPromotionDailyMetric,
  operationsPromotionStage,
  operationsSubject,
} from '../../db/schema';
import {
  calculateActualPromotionCosts,
  replayPromotionHistory,
  shanghaiDateKey,
} from '../../db/promotion-rules.mjs';
import { promotionDailyInputFromForm, promotionDailySchema } from '../../db/promotion-validation';
import { attachPromotionToActivePause, guardPromotionStart, lockPromotionWorkflow, readPromotionContext } from '../../db/promotion-pauses';
import { campaignPauseWindows, effectivePromotionStatus, nextReviewDate, promotionReplayOptions } from '../../db/promotion-state.mjs';
import { WorkflowError } from '../../db/schedule-workflow';

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
    const context = await readPromotionContext(getDb());
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
      dailyStatus: operationsPromotionDailyMetric.dailyStatus,
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
        inArray(operationsPromotionCampaign.currentStatus, ['testing', 'scaling', 'waiting_action']),
        eq(operationsPromotionDailyMetric.metricDate, metricDate),
      ))
      .orderBy(operationsContentVersion.contentName);

    return Response.json({
      date: metricDate,
      rows: rows.map((row) => {
        const costs = row.spend == null ? null : calculateActualPromotionCosts({
          spend: Number(row.spend),
          actualOpenCount: row.actualOpenCount ?? 0,
          actualLeadCount: row.actualLeadCount ?? 0,
        });
        return { ...row, effectiveStatus: effectivePromotionStatus(row.currentStatus, row.currentStage, row.campaignId, context), costs, completed: row.reviewDecision != null };
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
      await lockPromotionWorkflow(transaction);
      await transaction.execute(
        // Serialize reviews for the same campaign so two dates cannot be finalized out of order.
        sql`select id from operations_promotion_campaign where id = ${result.data.campaignId} for update`,
      );
      const [campaign] = await transaction.select({
        id: operationsPromotionCampaign.id,
        scheduleId: operationsPromotionCampaign.scheduleId,
        startedOn: operationsPromotionCampaign.startedOn,
        initialStage: operationsPromotionCampaign.initialStage,
        currentStage: operationsPromotionCampaign.currentStage,
        currentStatus: operationsPromotionCampaign.currentStatus,
        contentId: operationsContent.id,
        platformNoteId: operationsContent.platformNoteId,
      }).from(operationsPromotionCampaign)
        .innerJoin(operationsContentSchedule, eq(operationsPromotionCampaign.scheduleId, operationsContentSchedule.id))
        .innerJoin(operationsContentVersion, eq(operationsContentSchedule.contentVersionId, operationsContentVersion.id))
        .innerJoin(operationsContent, eq(operationsContentVersion.contentId, operationsContent.id))
        .where(eq(operationsPromotionCampaign.id, result.data.campaignId))
        .limit(1);
      if (!campaign) return { kind: 'missing' as const };
      if (!campaign.currentStage) return { kind: 'closed' as const };
      if (!campaign.platformNoteId && !result.data.platformNoteId) return { kind: 'note-id-required' as const };
      if (!campaign.platformNoteId && result.data.platformNoteId) {
        await transaction.update(operationsContent).set({
          platformNoteId: result.data.platformNoteId,
          updatedAt: new Date(),
        }).where(eq(operationsContent.id, campaign.contentId));
      }
      const allMetrics = await transaction.select().from(operationsPromotionDailyMetric)
        .where(eq(operationsPromotionDailyMetric.campaignId, campaign.id))
        .orderBy(asc(operationsPromotionDailyMetric.metricDate));
      const latest = allMetrics.at(-1);
      const context = await readPromotionContext(transaction);
      const windows = [...campaignPauseWindows(campaign, context), ...context.holds.filter(hold => hold.campaignId === campaign.id)];
      const expectedDate = nextReviewDate(latest?.metricDate, campaign.startedOn, windows);
      if (result.data.metricDate !== expectedDate) {
        return { kind: 'out-of-order' as const, expectedDate };
      }
      const expectedDailyStatus = campaign.currentStatus === 'waiting_action' ? 'waiting_action' : 'active';
      if (result.data.dailyStatus !== expectedDailyStatus || result.data.stageTypeSnapshot !== campaign.currentStage) {
        return { kind: 'invalid-decision' as const };
      }
      if (expectedDailyStatus === 'waiting_action' && ['test_continue','start_scaling','scaling_continue'].includes(result.data.reviewDecision)) {
        const nextDay = new Date(`${result.data.metricDate}T00:00:00+08:00`); nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        await guardPromotionStart(transaction, shanghaiDateKey(nextDay));
      }
      const replayed = replayPromotionHistory(campaign.startedOn, [...allMetrics, result.data], promotionReplayOptions(campaign, context));
      if (!replayed) return { kind: 'invalid-decision' as const };
      if (['testing','scaling'].includes(replayed.currentStatus) && replayed.currentStage) await attachPromotionToActivePause(transaction, campaign.id, replayed.currentStage);

      const [metric] = await transaction.insert(operationsPromotionDailyMetric).values({
        campaignId: campaign.id,
        metricDate: result.data.metricDate,
        dailyStatus: result.data.dailyStatus,
        stageTypeSnapshot: result.data.stageTypeSnapshot,
        spend: result.data.spend.toFixed(2),
        clickRate: null,
        platformOpenCount: result.data.platformOpenCount,
        actualOpenCount: result.data.actualOpenCount,
        platformLeadCount: result.data.platformLeadCount,
        actualLeadCount: result.data.actualLeadCount,
        reviewDecision: result.data.reviewDecision,
        note: result.data.note ?? null,
      }).returning({ id: operationsPromotionDailyMetric.id });

      await transaction.delete(operationsPromotionStage)
        .where(eq(operationsPromotionStage.campaignId, campaign.id));
      for (const stage of replayed.stages) {
        await transaction.insert(operationsPromotionStage).values({ campaignId: campaign.id, ...stage });
      }

      await transaction.update(operationsPromotionCampaign).set({
        currentStage: replayed.currentStage,
        currentStatus: replayed.currentStatus,
        endedOn: replayed.endedOn,
        updatedAt: new Date(),
      }).where(eq(operationsPromotionCampaign.id, campaign.id));
      await transaction.update(operationsContentSchedule).set({
        promotionStatus: replayed.currentStatus,
        updatedAt: new Date(),
      }).where(eq(operationsContentSchedule.id, campaign.scheduleId));

      return { kind: 'saved' as const, id: metric.id, nextStatus: replayed.currentStatus };
    });

    if (saved.kind === 'missing') return Response.json({ message: '没有找到推广活动。' }, { status: 404 });
    if (saved.kind === 'closed') return Response.json({ message: '该推广活动已经结束。' }, { status: 409 });
    if (saved.kind === 'note-id-required') return Response.json({ message: '保存日度复盘前，请补填这篇帖子的小红书笔记 ID。' }, { status: 422 });
    if (saved.kind === 'out-of-order') {
      return Response.json({ message: `请先完成 ${saved.expectedDate} 的日度复盘。`, expectedDate: saved.expectedDate }, { status: 409 });
    }
    if (saved.kind === 'invalid-decision') {
      return Response.json({ message: '复盘选择与当前推广阶段不匹配。' }, { status: 409 });
    }
    return Response.json({ ok: true, id: saved.id, nextStatus: saved.nextStatus }, { status: 201 });
  } catch (error) {
    if (error instanceof WorkflowError) return Response.json({ message: error.message }, { status: error.status });
    const postgresError = error as { code?: string };
    if (postgresError.code === '23505') {
      return Response.json({ message: '这一天已经完成复盘，或笔记 ID 已属于另一篇帖子，请刷新并核对。' }, { status: 409 });
    }
    console.error('promotion daily save failed', error);
    return Response.json({ message: '推广日度数据保存失败，请稍后重试。' }, { status: 503 });
  }
};
