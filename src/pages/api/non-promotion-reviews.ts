import type { APIRoute } from 'astro';
import { and, eq, gte } from 'drizzle-orm';
import { getDb } from '../../db/client';
import {
  operationsCategory,
  operationsContentPerformanceMetric,
  operationsContentSchedule,
  operationsContentVersion,
  operationsNonPromotionReview,
  operationsSubject,
} from '../../db/schema';
import { nextReviewCheckpoint, nonPromotionReviewStart, shanghaiDateKey, summarizeRates } from '../../db/stage-review-rules.mjs';
import { formObject, issuesByField, stageReviewItemSchema } from '../../db/stage-review-validation';

export const prerender = false;

export const POST: APIRoute = async ({ request, url, locals }) => {
  if (request.headers.get('origin') !== url.origin) return new Response('拒绝跨站写入。', { status: 403 });
  let form: FormData;
  try { form = await request.formData(); } catch { return Response.json({ message: '请求必须使用有效表单。' }, { status: 400 }); }
  const result = stageReviewItemSchema.safeParse(formObject(form));
  if (!result.success) return Response.json({ message: '请检查复盘数据。', fields: issuesByField(result.error.issues) }, { status: 422 });

  try {
    const saved = await getDb().transaction(async (transaction) => {
      const [identity] = await transaction.select({
        actualPublishAt: operationsContentSchedule.actualPublishAt,
        isPromoted: operationsContentSchedule.isPromoted,
        contentName: operationsContentVersion.contentName,
        subjectId: operationsContentVersion.subjectId,
        subjectName: operationsSubject.name,
        categoryId: operationsContentVersion.categoryId,
        categoryName: operationsCategory.name,
      }).from(operationsContentSchedule)
        .innerJoin(operationsContentVersion, eq(operationsContentSchedule.contentVersionId, operationsContentVersion.id))
        .innerJoin(operationsSubject, eq(operationsContentVersion.subjectId, operationsSubject.id))
        .leftJoin(operationsCategory, eq(operationsContentVersion.categoryId, operationsCategory.id))
        .where(eq(operationsContentSchedule.id, result.data.scheduleId)).limit(1);
      if (!identity?.actualPublishAt || identity.isPromoted || shanghaiDateKey(identity.actualPublishAt) < nonPromotionReviewStart) {
        return { kind: 'invalid-schedule' as const };
      }

      const completed = await transaction.select({ type: operationsNonPromotionReview.checkpointType })
        .from(operationsNonPromotionReview).where(eq(operationsNonPromotionReview.scheduleId, result.data.scheduleId));
      const existing = completed.some((row) => row.type === result.data.checkpointType);
      const expected = nextReviewCheckpoint(identity.actualPublishAt, completed.map((row) => row.type), shanghaiDateKey(new Date()));
      if (!existing && expected?.type !== result.data.checkpointType) return { kind: 'out-of-order' as const, expected: expected?.type ?? null };

      const [metric] = await transaction.insert(operationsContentPerformanceMetric).values({
        scheduleId: result.data.scheduleId,
        checkpointType: result.data.checkpointType,
        recordedThrough: result.data.recordedThrough,
        clickRate: result.data.clickRate.toFixed(4),
        threeSecondReadRate: result.data.threeSecondReadRate.toFixed(4),
      }).onConflictDoUpdate({
        target: [operationsContentPerformanceMetric.scheduleId, operationsContentPerformanceMetric.checkpointType],
        set: {
          recordedThrough: result.data.recordedThrough,
          clickRate: result.data.clickRate.toFixed(4),
          threeSecondReadRate: result.data.threeSecondReadRate.toFixed(4),
          updatedAt: new Date(),
        },
      }).returning({ id: operationsContentPerformanceMetric.id });

      const cohortRows = await transaction.select({
        clickRate: operationsContentPerformanceMetric.clickRate,
        readRate: operationsContentPerformanceMetric.threeSecondReadRate,
      }).from(operationsContentPerformanceMetric)
        .innerJoin(operationsContentSchedule, eq(operationsContentPerformanceMetric.scheduleId, operationsContentSchedule.id))
        .innerJoin(operationsContentVersion, eq(operationsContentSchedule.contentVersionId, operationsContentVersion.id))
        .where(and(
          eq(operationsContentPerformanceMetric.checkpointType, result.data.checkpointType),
          eq(operationsContentVersion.subjectId, identity.subjectId),
          identity.categoryId ? eq(operationsContentVersion.categoryId, identity.categoryId) : undefined,
          eq(operationsContentSchedule.isPromoted, false),
          gte(operationsContentSchedule.actualPublishAt, new Date(`${nonPromotionReviewStart}T00:00:00+08:00`)),
        ));
      const cohortSnapshot = {
        subjectId: identity.subjectId,
        categoryId: identity.categoryId,
        checkpointType: result.data.checkpointType,
        clickRate: summarizeRates(cohortRows.map((row) => Number(row.clickRate))),
        threeSecondReadRate: summarizeRates(cohortRows.map((row) => Number(row.readRate))),
      };
      const clickRate = result.data.clickRate;
      const readRate = result.data.threeSecondReadRate;
      const values = {
        metricId: metric.id,
        actualPublishAtSnapshot: identity.actualPublishAt,
        subjectIdSnapshot: identity.subjectId,
        subjectNameSnapshot: identity.subjectName,
        categoryIdSnapshot: identity.categoryId,
        categoryNameSnapshot: identity.categoryName,
        contentNameSnapshot: identity.contentName,
        clickRateSnapshot: clickRate.toFixed(4),
        threeSecondReadRateSnapshot: readRate.toFixed(4),
        cohortSnapshot,
        conclusion: result.data.conclusion,
        cause: null,
        nextAction: null,
        reviewedByLabel: locals.operationsUser || 'unknown',
        reviewedAt: new Date(),
        updatedAt: new Date(),
      };
      const [review] = await transaction.insert(operationsNonPromotionReview).values({
        scheduleId: result.data.scheduleId,
        checkpointType: result.data.checkpointType,
        ...values,
      }).onConflictDoUpdate({
        target: [operationsNonPromotionReview.scheduleId, operationsNonPromotionReview.checkpointType],
        set: values,
      }).returning({ id: operationsNonPromotionReview.id });
      return { kind: 'saved' as const, id: review.id };
    });
    if (saved.kind === 'invalid-schedule') return Response.json({ message: '只复盘 2026 年 7 月起已经实发的非推广内容。' }, { status: 409 });
    if (saved.kind === 'out-of-order') return Response.json({ message: saved.expected ? '请先完成前一个复盘节点。' : '这个节点尚未到期。' }, { status: 409 });
    return Response.json({ ok: true, id: saved.id }, { status: 201 });
  } catch (error) {
    console.error('non-promotion review save failed', error);
    return Response.json({ message: '非推广复盘保存失败，请稍后重试。' }, { status: 503 });
  }
};
