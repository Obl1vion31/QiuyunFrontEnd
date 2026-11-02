import {lockPromotionWorkflow} from '../../db/promotion-pauses';
import { readNonPromotionReview } from '../../db/non-promotion-read-model';
import {readNonPromotionFingerprint} from '../../db/non-promotion-record';
import type { APIRoute } from 'astro';
import { and, eq, isNull } from 'drizzle-orm';
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
  operationsSubject,
} from '../../db/schema';
import { shanghaiDateKey, summarizeRates } from '../../db/stage-review-rules.mjs';
import { formObject, issuesByField, nonPromotionItemSchema } from '../../db/stage-review-validation';
import {reviewIdentity,activeReviewAnchorIds} from '../../db/non-promotion-plan';
import {nodeCanRecord,reviewNodeWindow} from '../../db/non-promotion-nodes';

export const prerender = false;

export const POST: APIRoute = async ({ request, url, locals }) => {
  if (request.headers.get('origin') !== url.origin) return new Response('拒绝跨站写入。', { status: 403 });
  let form: FormData;
  try { form = await request.formData(); } catch { return Response.json({ message: '请求必须使用有效表单。' }, { status: 400 }); }
  const result = nonPromotionItemSchema.safeParse(formObject(form));
  if (!result.success) return Response.json({ message: '请检查复盘数据。', fields: issuesByField(result.error.issues) }, { status: 422 });

  try {
    const saved = await getDb().transaction(async (transaction) => {
      await lockPromotionWorkflow(transaction);
      await lockSchedule(transaction, result.data.scheduleId);
      const [content] = await transaction.select({ id: operationsContentVersion.contentId }).from(operationsContentSchedule)
        .innerJoin(operationsContentVersion, eq(operationsContentSchedule.contentVersionId, operationsContentVersion.id))
        .where(eq(operationsContentSchedule.id, result.data.scheduleId)).limit(1);
      if(!content)return {kind:'invalid-schedule' as const};
      // 不同版本共用一个笔记 ID，首次补齐必须在读取身份前锁住同一帖子。
      await transaction.select({ id: operationsContent.id }).from(operationsContent).where(eq(operationsContent.id, content.id)).for('update');
      const post=await reviewIdentity(transaction,result.data.scheduleId),node=post.nodes.find(n=>n.type===result.data.checkpointType);
      if(post.id!==result.data.scheduleId||!post.reviewActive||!node)return {kind:'invalid-schedule' as const};
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
      if (!identity?.actualPublishAt) {
        return { kind: 'invalid-schedule' as const };
      }
      const fingerprint=await readNonPromotionFingerprint(transaction,result.data.scheduleId,result.data.checkpointType);
      if(form.get('fingerprint')!==fingerprint)return {kind:'conflict' as const};
      const window=reviewNodeWindow(identity.actualPublishAt,node,shanghaiDateKey(new Date()));
      if(!window.open||result.data.recordedThrough<window.min||result.data.recordedThrough>window.max)return {kind:'date-window' as const,min:window.min,max:window.max};
      const completed = await transaction.select({ type: operationsNonPromotionReview.checkpointType })
        .from(operationsNonPromotionReview).where(eq(operationsNonPromotionReview.scheduleId, result.data.scheduleId));
      const existing = completed.some((row) => row.type === result.data.checkpointType);
      const events = await readCheckpointEvents(transaction, result.data.scheduleId);
      if (events.get(`${result.data.scheduleId}:${result.data.checkpointType}`)?.action === 'skip') return { kind: 'skipped' as const };
      const resolved = [...completed.map(row => row.type), ...[...events.values()].filter(row => row.action === 'skip').map(row => row.checkpointType)];
      if (!existing && !nodeCanRecord(post.nodes,node,resolved,shanghaiDateKey(new Date()))) return { kind: 'out-of-order' as const, expected:'day_7' };

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
        customCheckpointId:node.nodeId,exposureCount:result.data.exposureCount,readCount:result.data.readCount,
        recordedThrough: result.data.recordedThrough,
        clickRate: result.data.clickRate?.toFixed(4)??null,
        threeSecondReadRate: result.data.threeSecondReadRate.toFixed(4),
      }).onConflictDoUpdate({
        target: [operationsContentPerformanceMetric.scheduleId, operationsContentPerformanceMetric.checkpointType],
        set: {
          recordedThrough: result.data.recordedThrough,
          exposureCount:result.data.exposureCount,readCount:result.data.readCount,
          clickRate: result.data.clickRate?.toFixed(4)??null,
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
      const anchors=await activeReviewAnchorIds(transaction);
      const comparableRows = node.kind==='custom'?[]:cohortRows.filter(row => anchors.has(row.scheduleId)&&cohortEvents.get(`${row.scheduleId}:${result.data.checkpointType}`)?.action !== 'skip');
      const cohortSnapshot = {
        subjectId: identity.subjectId,
        categoryId: identity.categoryId,
        checkpointType: result.data.checkpointType,
        clickRate: summarizeRates(comparableRows.flatMap((row) => row.clickRate==null?[]:[Number(row.clickRate)])),
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
        customCheckpointId:node.nodeId,exposureCountSnapshot:result.data.exposureCount,readCountSnapshot:result.data.readCount,
        clickRateSnapshot: clickRate?.toFixed(4)??null,
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
      return { kind: 'saved' as const, id: review.id, versionNumber,fingerprint:await readNonPromotionFingerprint(transaction,result.data.scheduleId,result.data.checkpointType) };
    });
    if (saved.kind === 'invalid-schedule') return Response.json({ message: '只能复盘已实发、当前分类允许复盘的非推广内容。' }, { status: 409 });
    if(saved.kind==='conflict')return Response.json({code:'STALE_RECORD',message:'这条复盘已发生变化，当前输入已保留。请刷新页面核对最新记录后再填写。'},{status:409});
    if(saved.kind==='date-window')return Response.json({message:`数据截止日须在 ${saved.min} 至 ${saved.max}，且只能填写昨天及以前的数据。`,fields:{recordedThrough:['请选择窗口内的历史日期']}},{status:422});
    if (saved.kind === 'note-id-required') return Response.json({ message: '首次保存复盘前，请填写这篇帖子的小红书笔记 ID。', fields: { platformNoteId: ['请填写笔记 ID'] } }, { status: 422 });
    if (saved.kind === 'skipped') return Response.json({ message: '请先恢复这个节点，再补录复盘。' }, { status: 409 });
    if (saved.kind === 'out-of-order') return Response.json({ message: saved.expected ? '请先完成前一个复盘节点。' : '这个节点尚未到期。' }, { status: 409 });
    return Response.json({ ok: true, id: saved.id,fingerprint:saved.fingerprint }, { status: 201 });
  } catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } }).code ?? (error as { cause?: { code?: string } }).cause?.code;
    if (code === '23505') return Response.json({ message: '笔记 ID 或复盘记录已存在，请刷新核对后重试。', fields: { platformNoteId: ['请核对已有笔记 ID'] } }, { status: 409 });
    return workflowErrorResponse(error);
  }
};

export const GET: APIRoute = async ({ url }) => {
  // 未传方式的旧客户端继续取得完整队列；页面总是显式传递当前方式。
  const model = await readNonPromotionReview(url,{includeAllModes:!url.searchParams.has('mode')});
  if (model.loadError) return new Response(JSON.stringify({message:model.loadError}), {status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  return new Response(JSON.stringify({mode:model.mode,upcoming:model.upcoming,categoryGroups:model.categoryGroups,sampleRows:model.sampleRows,awaitingDates:model.awaitingDates,tableRows:model.tableRows,pendingCount:model.pending.length,completedCount:model.rows.reduce((sum,row)=>sum+row.completed.length,0)}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
};
