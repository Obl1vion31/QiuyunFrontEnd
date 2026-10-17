import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { assembleMeetingSnapshot, meetingDraftSchema } from '../../../db/meeting-snapshots';
import { lockSchedule, WorkflowError } from '../../../db/schedule-workflow';
import { workflowErrorResponse } from '../../../db/workflow-api';
import { getDb } from '../../../db/client';
import { operationsReviewActionItem, operationsReviewActionProgress, operationsReviewMeeting, operationsReviewMeetingVersion, type WeeklyMeetingDraft } from '../../../db/schema';

export const prerender = false;

const emptyDraft: WeeklyMeetingDraft = { schemaVersion: 2, coreConclusion: '', nextAction: '', promotionInputs: {}, issues: [], nonPromotionSelections: [] };

export const PATCH: APIRoute = async ({ params, request, url, locals }) => {
  if (request.headers.get('origin') !== url.origin) return new Response('拒绝跨站写入。', { status: 403 });
  if (!params.id) return Response.json({ message: '缺少会议编号。' }, { status: 400 });
  let payload: { action?: string; draft?: WeeklyMeetingDraft; expectedUpdatedAt?: string; changeSummary?: string };
  try { payload = await request.json(); } catch { return Response.json({ message: '请求格式无效。' }, { status: 400 }); }
  const parsed = meetingDraftSchema.safeParse(payload.draft ?? emptyDraft);
  if (!parsed.success) return Response.json({ message: parsed.error.issues[0].message }, { status: 422 });
  const draft = parsed.data;
  try {
    const result = await getDb().transaction(async (transaction) => {
      const [meeting] = await transaction.select().from(operationsReviewMeeting).where(eq(operationsReviewMeeting.id, params.id!)).for('update');
      if (!meeting) return null;
      if (payload.expectedUpdatedAt && payload.expectedUpdatedAt !== meeting.updatedAt.toISOString()) throw new WorkflowError('会议已被更新，请刷新后再保存。');
      for (const id of [...new Set(draft.nonPromotionSelections.map(item => item.scheduleId))].sort()) await lockSchedule(transaction, id);
      const snapshot = await assembleMeetingSnapshot(transaction, meeting, draft);
      const updatedAt = new Date();
      if (payload.action === 'save') {
        await transaction.update(operationsReviewMeeting).set({ draftSnapshot: draft, updatedAt }).where(eq(operationsReviewMeeting.id, meeting.id));
        return { versionNumber: meeting.currentVersionNumber, updatedAt: updatedAt.toISOString() };
      }
      if (payload.action !== 'finalize') throw new Error('unsupported-action');
      const versionNumber = meeting.status === 'completed' ? meeting.currentVersionNumber + 1 : 0;
      await transaction.insert(operationsReviewMeetingVersion).values({ meetingId: meeting.id, versionNumber, snapshot: snapshot as unknown as Record<string, unknown>, changeSummary: payload.changeSummary?.trim() || (versionNumber ? '更正周度复盘' : '首次定稿'), finalizedByLabel: locals.operationsUser || 'unknown' });
      const persistedIssues: WeeklyMeetingDraft['issues'] = [];
      for (const issue of draft.issues) {
        let itemId = issue.id;
        if (itemId) {
          const [existing] = await transaction.select({ id: operationsReviewActionItem.id }).from(operationsReviewActionItem).where(eq(operationsReviewActionItem.id, itemId)).limit(1);
          if (!existing) itemId = undefined;
        }
        if (!itemId) {
          const [created] = await transaction.insert(operationsReviewActionItem).values({ problem: issue.problem.trim(), status: issue.status, createdMeetingId: meeting.id, resolvedMeetingId: issue.status === 'resolved' ? meeting.id : null }).returning({ id: operationsReviewActionItem.id });
          itemId = created.id;
        } else {
          await transaction.update(operationsReviewActionItem).set({ problem: issue.problem.trim(), status: issue.status, resolvedMeetingId: issue.status === 'resolved' ? meeting.id : null, updatedAt: new Date() }).where(eq(operationsReviewActionItem.id, itemId));
        }
        await transaction.insert(operationsReviewActionProgress).values({ itemId, meetingId: meeting.id, conclusion: issue.conclusion.trim() || '本周暂无新进展', statusSnapshot: issue.status, recordedByLabel: locals.operationsUser || 'unknown' }).onConflictDoUpdate({ target: [operationsReviewActionProgress.itemId, operationsReviewActionProgress.meetingId], set: { conclusion: issue.conclusion.trim() || '本周暂无新进展', statusSnapshot: issue.status, recordedByLabel: locals.operationsUser || 'unknown' } });
        persistedIssues.push({ ...issue, id: itemId });
      }
      await transaction.update(operationsReviewMeeting).set({ status: 'completed', currentVersionNumber: versionNumber, draftSnapshot: { ...draft, issues: persistedIssues }, finalizedAt: new Date(), updatedAt: new Date() }).where(and(eq(operationsReviewMeeting.id, meeting.id)));
      return { versionNumber, updatedAt: updatedAt.toISOString() };
    });
    if (!result) return Response.json({ message: '没有找到这场会议。' }, { status: 404 });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if ((error as Error).message === 'unsupported-action') return Response.json({ message: '不支持的会议操作。' }, { status: 400 });
    return workflowErrorResponse(error);
  }
};

export const DELETE: APIRoute = async ({ params, request, url }) => {
  if (request.headers.get('origin') !== url.origin) return new Response('拒绝跨站写入。', { status: 403 });
  if (!params.id) return Response.json({ message: '缺少会议编号。' }, { status: 400 });
  try {
    const [deleted] = await getDb().delete(operationsReviewMeeting).where(and(
      eq(operationsReviewMeeting.id, params.id), eq(operationsReviewMeeting.status, 'draft'),
    )).returning({ id: operationsReviewMeeting.id });
    if (deleted) return Response.json({ ok: true });
    const [meeting] = await getDb().select({ status: operationsReviewMeeting.status }).from(operationsReviewMeeting).where(eq(operationsReviewMeeting.id, params.id)).limit(1);
    if (!meeting) return Response.json({ message: '没有找到这份草稿。' }, { status: 404 });
    return Response.json({ message: '已定稿会议不允许删除。' }, { status: 409 });
  } catch (error) {
    console.error('meeting review delete failed', error);
    return Response.json({ message: '草稿删除失败，请稍后重试。' }, { status: 503 });
  }
};
