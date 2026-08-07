import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../../../db/client';
import { operationsReviewActionItem, operationsReviewActionProgress, operationsReviewMeeting, operationsReviewMeetingVersion, type WeeklyMeetingDraft } from '../../../db/schema';

export const prerender = false;

const validStatus = new Set(['pending', 'validating', 'resolved', 'paused']);
const emptyDraft: WeeklyMeetingDraft = { schemaVersion: 1, coreConclusion: '', nextAction: '', promotionInputs: {}, issues: [] };

export const PATCH: APIRoute = async ({ params, request, url, locals }) => {
  if (request.headers.get('origin') !== url.origin) return new Response('拒绝跨站写入。', { status: 403 });
  if (!params.id) return Response.json({ message: '缺少会议编号。' }, { status: 400 });
  let payload: { action?: string; draft?: WeeklyMeetingDraft; generated?: Record<string, unknown>; changeSummary?: string };
  try { payload = await request.json(); } catch { return Response.json({ message: '请求格式无效。' }, { status: 400 }); }
  const draft = payload.draft ?? emptyDraft;
  if (draft.schemaVersion !== 1 || !Array.isArray(draft.issues) || typeof draft.promotionInputs !== 'object') return Response.json({ message: '会议草稿格式无效。' }, { status: 422 });
  if (draft.issues.some((item) => !item.problem.trim() || !validStatus.has(item.status))) return Response.json({ message: '请检查问题和状态。' }, { status: 422 });
  try {
    const result = await getDb().transaction(async (transaction) => {
      const [meeting] = await transaction.select().from(operationsReviewMeeting).where(eq(operationsReviewMeeting.id, params.id!)).limit(1);
      if (!meeting) return null;
      if (payload.action === 'save') {
        await transaction.update(operationsReviewMeeting).set({ draftSnapshot: draft, updatedAt: new Date() }).where(eq(operationsReviewMeeting.id, meeting.id));
        return { versionNumber: meeting.currentVersionNumber };
      }
      if (payload.action !== 'finalize') throw new Error('unsupported-action');
      const versionNumber = meeting.status === 'completed' ? meeting.currentVersionNumber + 1 : 0;
      const snapshot = { schemaVersion: 1, meeting: { name: meeting.name, periodStart: meeting.periodStart, periodEnd: meeting.periodEnd, meetingAt: meeting.meetingAt }, generated: payload.generated ?? {}, draft };
      await transaction.insert(operationsReviewMeetingVersion).values({ meetingId: meeting.id, versionNumber, snapshot, changeSummary: payload.changeSummary?.trim() || (versionNumber ? '更正周度复盘' : '首次定稿'), finalizedByLabel: locals.operationsUser || 'unknown' });
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
      return { versionNumber };
    });
    if (!result) return Response.json({ message: '没有找到这场会议。' }, { status: 404 });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if ((error as Error).message === 'unsupported-action') return Response.json({ message: '不支持的会议操作。' }, { status: 400 });
    console.error('meeting review update failed', error);
    return Response.json({ message: '数据库暂时不可用，请稍后重试。' }, { status: 503 });
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
