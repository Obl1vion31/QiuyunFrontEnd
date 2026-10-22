import {readWeeklyMaterial,selectWeeklyMaterial,type WeeklyMaterial} from '../../../db/meeting-weekly-material';
import {lockPromotionWorkflow} from '../../../db/promotion-pauses';
import {shanghaiDateKey} from '../../../db/promotion-rules.mjs';
import {businessDate} from '../../../db/promotion-wait-ranges';
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
  let payload: { action?: string; draft?: WeeklyMeetingDraft; expectedUpdatedAt?: string; changeSummary?: string;periodStart?:string;periodEnd?:string };
  try { payload = await request.json(); } catch { return Response.json({ message: '请求格式无效。' }, { status: 400 }); }
  const parsed = meetingDraftSchema.safeParse(payload.draft ?? emptyDraft);
  if (!parsed.success) return Response.json({ message: parsed.error.issues[0].message }, { status: 422 });
  const draft:WeeklyMeetingDraft = parsed.data;
  try {
    const result = await getDb().transaction(async (transaction) => {
      if(draft.schemaVersion===4)await lockPromotionWorkflow(transaction);
      const [meeting] = await transaction.select().from(operationsReviewMeeting).where(eq(operationsReviewMeeting.id, params.id!)).for('update');
      if (!meeting) return null;
      if (payload.expectedUpdatedAt && payload.expectedUpdatedAt !== meeting.updatedAt.toISOString()) throw new WorkflowError('会议已被更新，请刷新后再保存。');
      for (const id of [...new Set(draft.nonPromotionSelections.map(item => item.scheduleId))].sort()) await lockSchedule(transaction, id);
      if((meeting.draftSnapshot.schemaVersion===4)!==(draft.schemaVersion===4))throw new WorkflowError('请使用此会议对应版本的编辑器。',422);
      const v4=draft.schemaVersion===4;
      if(v4&&!payload.expectedUpdatedAt)throw new WorkflowError('缺少会议版本，请刷新后再保存。',422);
      const range={periodStart:payload.periodStart??meeting.periodStart,periodEnd:payload.periodEnd??meeting.periodEnd};
      if(v4&&(!businessDate.safeParse(range.periodStart).success||!businessDate.safeParse(range.periodEnd).success||range.periodStart>range.periodEnd||range.periodEnd>=shanghaiDateKey(new Date())))throw new WorkflowError('请选择有效的历史数据区间。',422);
      if(meeting.status==='completed'&&(range.periodStart!==meeting.periodStart||range.periodEnd!==meeting.periodEnd))throw new WorkflowError('定稿后保留原区间，请另建会议。',422);
      const target={...meeting,...(v4?range:{})};
      let snapshot:Record<string,unknown>;
      if(v4){
       const fresh=await readWeeklyMaterial(transaction,target);
       const cached=meeting.draftSnapshot.materialSnapshot as unknown as WeeklyMaterial|undefined;
       if(payload.action==='finalize'&&draft.materialFingerprint!==fresh.fingerprint)throw new WorkflowError('来源数据已变化，请点击“刷新数据”核对候选和比较值后再定稿。');
       const material=draft.materialFingerprint===fresh.fingerprint?fresh:cached&&cached.fingerprint===draft.materialFingerprint&&cached.periodStart===range.periodStart&&cached.periodEnd===range.periodEnd?cached:null;
       if(!material)throw new WorkflowError('请刷新当前区间的数据后再保存，输入已保留。');
       if((draft.promotionSelections??[]).some(key=>!material.promotions.some(p=>p.key===key))||draft.nonPromotionSelections.some(s=>!material.nonPromotions.some(n=>n.scheduleId===s.scheduleId&&n.checkpointType===s.checkpointType)))throw new WorkflowError('部分勾选已不在当前候选中，请刷新后核对。');
       const common=await assembleMeetingSnapshot(transaction,target,{...draft,nonPromotionSelections:[],promotionSnapshotIds:[]});
       draft.materialSnapshot=material as unknown as Record<string,unknown>;
       snapshot={schemaVersion:4,meeting:common.meeting,draft,generated:{...selectWeeklyMaterial(material,draft.promotionSelections??[],draft.nonPromotionSelections),summary:material.summary,attachments:common.generated.attachments}};
      }else snapshot=await assembleMeetingSnapshot(transaction,meeting,draft);

      const updatedAt = new Date();
      if (payload.action === 'save') {
        await transaction.update(operationsReviewMeeting).set({ draftSnapshot: draft,...(v4?range:{}), updatedAt }).where(eq(operationsReviewMeeting.id, meeting.id));
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
      await transaction.update(operationsReviewMeeting).set({ ...(v4?range:{}),status: 'completed', currentVersionNumber: versionNumber, draftSnapshot: { ...draft, issues: persistedIssues }, finalizedAt: new Date(), updatedAt: new Date() }).where(and(eq(operationsReviewMeeting.id, meeting.id)));
      return { versionNumber, updatedAt: updatedAt.toISOString() };
    },{isolationLevel:'repeatable read'});
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
