import { readNonPromotionReview } from '../../db/non-promotion-read-model';
import type { APIRoute } from 'astro';
import { and, desc, eq, isNull, lte } from 'drizzle-orm';
import { lockSchedule } from '../../db/schedule-workflow';
import { readCheckpointEvents } from '../../db/non-promotion-workflow';
import { workflowErrorResponse } from '../../db/workflow-api';
import { getDb } from '../../db/client';
import {
  operationsCategory,
  operationsContent,
  operationsContentPerformanceMetric,
  operationsContentSchedule,
  operationsContentVersion,
  operationsNonPromotionReview,
  operationsNonPromotionReviewVersion,
  operationsCategoryPolicyVersion,
  operationsSubject,
} from '../../db/schema';
import { nextReviewCheckpoint, shanghaiDateKey, summarizeRates } from '../../db/stage-review-rules.mjs';
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
      await lockSchedule(transaction, result.data.scheduleId);
      const [content] = await transaction.select({ id: operationsContentVersion.contentId }).from(operationsContentSchedule)
        .innerJoin(operationsContentVersion, eq(operationsContentSchedule.contentVersionId, operationsContentVersion.id))
        .where(eq(operationsContentSchedule.id, result.data.scheduleId)).limit(1);
      // 不同版本共用一个笔记 ID，首次补齐必须在读取身份前锁住同一帖子。
      await transaction.select({ id: operationsContent.id }).from(operationsContent).where(eq(operationsContent.id, content.id)).for('update');
      const [identity] = await transaction.select({
        contentId: operationsContent.id,
        platformNoteId: operationsContent.platformNoteId,
        actualPublishAt: operationsContentSchedule.actualPublishAt,
        isPromoted: operationsContentSchedule.isPromoted,
        contentName: operationsContentVersion.contentName,
        subjectId: operationsContentVersion.subjectId,
        subjectName: operationsSubject.name,
        categoryId: operationsContentVersion.categoryId,
        categoryName: operationsCategory.name,
      }).from(operationsContentSchedule)
        .innerJoin(operationsContentVersion, eq(operationsContentSchedule.contentVersionId, operationsContentVersion.id))
        .innerJoin(operationsContent, eq(operationsContentVersion.contentId, operationsContent.id))
        .innerJoin(operationsSubject, eq(operationsContentVersion.subjectId, operationsSubject.id))
        .leftJoin(operationsCategory, eq(operationsContentVersion.categoryId, operationsCategory.id))
        .where(eq(operationsContentSchedule.id, result.data.scheduleId)).limit(1);
      if (!identity?.actualPublishAt || identity.isPromoted) {
        return { kind: 'invalid-schedule' as const };
      }

      if (identity.categoryId) {
        const [policy] = await transaction.select({ requires: operationsCategoryPolicyVersion.requiresNonPromotionReview })
          .from(operationsCategoryPolicyVersion)
          .where(and(
            eq(operationsCategoryPolicyVersion.categoryId, identity.categoryId),
            lte(operationsCategoryPolicyVersion.effectiveOn, shanghaiDateKey(new Date())),
          ))
          .orderBy(desc(operationsCategoryPolicyVersion.versionNumber)).limit(1);
        if (policy?.requires === false) return { kind: 'invalid-schedule' as const };
      }

      const completed = await transaction.select({ type: operationsNonPromotionReview.checkpointType })
        .from(operationsNonPromotionReview).where(eq(operationsNonPromotionReview.scheduleId, result.data.scheduleId));
      const existing = completed.some((row) => row.type === result.data.checkpointType);
      const events = await readCheckpointEvents(transaction, result.data.scheduleId);
      if (events.get(`${result.data.scheduleId}:${result.data.checkpointType}`)?.action === 'skip') return { kind: 'skipped' as const };
      const resolved = [...completed.map(row => row.type), ...[...events.values()].filter(row => row.action === 'skip').map(row => row.checkpointType)];
      const expected = nextReviewCheckpoint(identity.actualPublishAt, resolved, shanghaiDateKey(new Date()));
      if (!existing && expected?.type !== result.data.checkpointType) return { kind: 'out-of-order' as const, expected: expected?.type ?? null };

      if (!identity.platformNoteId && !result.data.platformNoteId) return { kind: 'note-id-required' as const };
      if (!identity.platformNoteId && result.data.platformNoteId) {
        await transaction.update(operationsContent).set({
          platformNoteId: result.data.platformNoteId,
          updatedAt: new Date(),
        }).where(eq(operationsContent.id, identity.contentId));
      }

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
        scheduleId: operationsContentPerformanceMetric.scheduleId,
        clickRate: operationsContentPerformanceMetric.clickRate,
        readRate: operationsContentPerformanceMetric.threeSecondReadRate,
      }).from(operationsContentPerformanceMetric)
        .innerJoin(operationsContentSchedule, eq(operationsContentPerformanceMetric.scheduleId, operationsContentSchedule.id))
        .innerJoin(operationsContentVersion, eq(operationsContentSchedule.contentVersionId, operationsContentVersion.id))
        .where(and(
          eq(operationsContentPerformanceMetric.checkpointType, result.data.checkpointType),
          eq(operationsContentVersion.subjectId, identity.subjectId),
          identity.categoryId ? eq(operationsContentVersion.categoryId, identity.categoryId) : isNull(operationsContentVersion.categoryId),
          eq(operationsContentSchedule.isPromoted, false),
        ));
      const cohortEvents = await readCheckpointEvents(transaction);
      const comparableRows = cohortRows.filter(row => cohortEvents.get(`${row.scheduleId}:${result.data.checkpointType}`)?.action !== 'skip');
      const cohortSnapshot = {
        subjectId: identity.subjectId,
        categoryId: identity.categoryId,
        checkpointType: result.data.checkpointType,
        clickRate: summarizeRates(comparableRows.map((row) => Number(row.clickRate))),
        threeSecondReadRate: summarizeRates(comparableRows.map((row) => Number(row.readRate))),
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
        conclusion: result.data.conclusion ?? null,
        cause: null,
        nextAction: null,
        reviewedByLabel: locals.operationsUser || 'unknown',
        reviewedAt: new Date(),
        updatedAt: new Date(),
      };
      const [currentReview] = await transaction.select({ id: operationsNonPromotionReview.id, version: operationsNonPromotionReview.currentVersionNumber })
        .from(operationsNonPromotionReview).where(and(
          eq(operationsNonPromotionReview.scheduleId, result.data.scheduleId),
          eq(operationsNonPromotionReview.checkpointType, result.data.checkpointType),
        )).limit(1);
      const versionNumber = currentReview ? currentReview.version + 1 : 0;
      const [review] = currentReview
        ? await transaction.update(operationsNonPromotionReview).set({ ...values, currentVersionNumber: versionNumber })
          .where(eq(operationsNonPromotionReview.id, currentReview.id)).returning({ id: operationsNonPromotionReview.id })
        : await transaction.insert(operationsNonPromotionReview).values({
          scheduleId: result.data.scheduleId,
          checkpointType: result.data.checkpointType,
          ...values,
          currentVersionNumber: 0,
        }).returning({ id: operationsNonPromotionReview.id });
      await transaction.insert(operationsNonPromotionReviewVersion).values({
        reviewId: review.id,
        versionNumber,
        snapshot: { ...values, scheduleId: result.data.scheduleId, checkpointType: result.data.checkpointType, recordedThrough: result.data.recordedThrough },
        changeSummary: versionNumber ? '更新复盘指标或结论' : '完成首次复盘',
        changedByLabel: locals.operationsUser || 'unknown',
      });
      return { kind: 'saved' as const, id: review.id, versionNumber };
    });
    if (saved.kind === 'invalid-schedule') return Response.json({ message: '只能复盘已实发、当前分类允许复盘的非推广内容。' }, { status: 409 });
    if (saved.kind === 'note-id-required') return Response.json({ message: '首次保存复盘前，请填写这篇帖子的小红书笔记 ID。', fields: { platformNoteId: ['请填写笔记 ID'] } }, { status: 422 });
    if (saved.kind === 'skipped') return Response.json({ message: '请先恢复这个节点，再补录复盘。' }, { status: 409 });
    if (saved.kind === 'out-of-order') return Response.json({ message: saved.expected ? '请先完成前一个复盘节点。' : '这个节点尚未到期。' }, { status: 409 });
    return Response.json({ ok: true, id: saved.id }, { status: 201 });
  } catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } }).code ?? (error as { cause?: { code?: string } }).cause?.code;
    if (code === '23505') return Response.json({ message: '笔记 ID 或复盘记录已存在，请刷新核对后重试。', fields: { platformNoteId: ['请核对已有笔记 ID'] } }, { status: 409 });
    return workflowErrorResponse(error);
  }
};

export const GET: APIRoute = async ({ url }) => {
  const model = await readNonPromotionReview(url);
  if (model.loadError) return new Response(JSON.stringify({message:model.loadError}), {status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  return new Response(JSON.stringify({tableRows:model.tableRows,pendingCount:model.pending.length,completedCount:model.rows.reduce((sum,row)=>sum+row.completed.length,0)}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
};
