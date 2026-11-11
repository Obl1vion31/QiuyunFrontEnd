import {effectiveCategoryName} from '../../db/content-config';
import {writePromotionDaily} from '../../db/promotion-daily-write';
import {platformNoteIdSchema} from '../../db/platform-note-id';
import {readVersionNotes} from '../../db/note-identities';
import {noteIdOn} from '../../db/note-identity-rules';
import type { APIRoute } from 'astro';
import { and, eq, inArray, or } from 'drizzle-orm';
import { getDb } from '../../db/client';
import {
  operationsCategory,
  operationsContent,
  operationsContentSchedule,
  operationsContentVersion,
  operationsPromotionCampaign,
  operationsPromotionDailyMetric,
  operationsSubject,
} from '../../db/schema';
import {
  calculateActualPromotionCosts,
  shanghaiDateKey,nextDateKey,
} from '../../db/promotion-rules.mjs';
import { promotionDailyInputFromForm, promotionDailySchema } from '../../db/promotion-validation';
import { lockPromotionWorkflow, readPromotionContext } from '../../db/promotion-pauses';
import { effectivePromotionStatus } from '../../db/promotion-state.mjs';
import { WorkflowError,StaleWriteError } from '../../db/schedule-workflow';
import {promotionSnapshot,timelineFingerprint} from '../../db/promotion-timeline';

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
 if(url.searchParams.has('noteId')){
  const parsed=platformNoteIdSchema.safeParse(url.searchParams.get('noteId'));
  if(!parsed.success)return Response.json({message:'请输入有效的 24 位笔记 ID。'},{status:422});
  try{const candidates=await getDb().select({versionId:operationsContentVersion.id,campaignId:operationsPromotionCampaign.id,scheduleId:operationsContentSchedule.id,contentName:operationsContentVersion.contentName,versionNumber:operationsContentVersion.versionNumber,platformNoteId:operationsContent.platformNoteId,startedOn:operationsPromotionCampaign.startedOn,endedOn:operationsPromotionCampaign.endedOn,sourceStageStartedOn:operationsPromotionCampaign.startedOn}).from(operationsPromotionCampaign).innerJoin(operationsContentSchedule,eq(operationsPromotionCampaign.scheduleId,operationsContentSchedule.id)).innerJoin(operationsContentVersion,eq(operationsContentSchedule.contentVersionId,operationsContentVersion.id)).innerJoin(operationsContent,eq(operationsContentVersion.contentId,operationsContent.id)).where(eq(operationsPromotionCampaign.currentStatus,'test_discarded'));
   const states=await readVersionNotes(getDb(),candidates.map(c=>c.versionId));
   const matched=candidates.filter(c=>states.get(c.versionId)!.periods.some(p=>p.platformNoteId===parsed.data));
   const date=url.searchParams.get('metricDate');
   const selected=url.searchParams.get('campaignId'),candidate=selected?matched.find(c=>c.campaignId===selected&&(!date||noteIdOn(states.get(c.versionId)!.periods,date)===parsed.data)):null;
   if(selected&&!candidate)return Response.json({message:'该活动已不适合补录，请重新查询并选择。'},{status:409});
   const fingerprint=candidate?timelineFingerprint(await promotionSnapshot(getDb(),candidate.scheduleId)):undefined;
   return Response.json({residualCandidates:matched.map(c=>({...c,platformNoteId:parsed.data,earliestDate:c.endedOn?nextDateKey(c.endedOn):null,latestDate:previousDateKey(shanghaiDateKey(new Date()))})),...(fingerprint?{fingerprint}:{})},{headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({message:'笔记查询失败，请重试。'},{status:503});}
 }
  const metricDate = requestedDate(url);
  try {
    const context = await readPromotionContext(getDb());
    const rows = await getDb().select({
      campaignId: operationsPromotionCampaign.id,
      scheduleId: operationsContentSchedule.id,
      contentName: operationsContentVersion.contentName,
      versionNumber: operationsContentVersion.versionNumber,
      subjectName: operationsSubject.name,
      categoryName: effectiveCategoryName(operationsContentVersion.subjectId,operationsContentVersion.categoryId,operationsCategory.name),
      currentStatus: operationsPromotionCampaign.currentStatus,
      currentStage: operationsPromotionCampaign.currentStage,
      startedOn: operationsPromotionCampaign.startedOn,
      endedOn: operationsPromotionCampaign.endedOn,
      dailyStatus: operationsPromotionDailyMetric.dailyStatus,
      actualStatusSnapshot:operationsPromotionDailyMetric.actualStatusSnapshot,recordKind:operationsPromotionDailyMetric.recordKind,sourceStageStartedOn:operationsPromotionDailyMetric.sourceStageStartedOn,
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
        inArray(operationsPromotionCampaign.currentStatus, ['testing', 'test_paused','test_pending','scaling', 'scaling_paused','waiting_action']),
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

export const POST: APIRoute = async ({ request, url,locals }) => {
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
      if(!result.data.fingerprint)throw new StaleWriteError('缺少保存版本，请刷新页面后继续。');
      return writePromotionDaily(transaction,result.data,locals.user!);
    });

    if(saved.kind==='duplicate')return Response.json({message:'这一天已经完成复盘，请核对后更正原记录。'},{status:409});
    if (saved.kind === 'missing') return Response.json({ message: '没有找到推广活动。' }, { status: 404 });
    if (saved.kind === 'closed') return Response.json({ message: '该推广活动已经结束。' }, { status: 409 });
    if (saved.kind === 'note-id-required') return Response.json({ message: '保存日度复盘前，请补填这篇帖子的小红书笔记 ID。' }, { status: 422 });
    if (saved.kind === 'out-of-order') {
      return Response.json({ message: `请先完成 ${saved.expectedDate} 的日度复盘。`, expectedDate: saved.expectedDate }, { status: 409 });
    }
    if(saved.kind==='invalid-residual')return Response.json({message:'只允许为测试淘汰活动补录结束日之后的真实残留数据。'},{status:422});
    if (saved.kind === 'invalid-decision') {
      return Response.json({ message: '复盘选择与当前推广阶段不匹配。' }, { status: 409 });
    }
    return Response.json({ ok: true, id: saved.id, nextStatus: saved.nextStatus }, { status: 201 });
  } catch (error) {
    if (error instanceof WorkflowError) return Response.json({ message: error.message,...(error.code?{code:error.code}:{}) }, { status: error.status });
    const postgresError = error as { code?: string;cause?:{code?:string} };
    if ((postgresError.code??postgresError.cause?.code) === '23505') {
      return Response.json({ message: '这一天已经完成复盘，或笔记 ID 已属于另一篇帖子，请刷新并核对。' }, { status: 409 });
    }
    console.error('promotion daily save failed', error);
    return Response.json({ message: '推广日度数据保存失败，请稍后重试。' }, { status: 503 });
  }
};
