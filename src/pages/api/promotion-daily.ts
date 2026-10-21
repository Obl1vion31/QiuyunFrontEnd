import {normalizePromotionActualStatus,promotionNextOptions} from '../../db/promotion-successors.mjs';
import {timelineFingerprint,promotionSnapshot} from '../../db/promotion-timeline';
import {platformNoteIdSchema} from '../../db/platform-note-id';
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
  operationsSubject,operationsPromotionTimelineAudit,
} from '../../db/schema';
import {
  calculateActualPromotionCosts,
  replayPromotionHistory,
  shanghaiDateKey,nextDateKey,
} from '../../db/promotion-rules.mjs';
import { promotionDailyInputFromForm, promotionDailySchema } from '../../db/promotion-validation';
import { attachPromotionToActivePause, guardPromotionStart, lockPromotionWorkflow, readPromotionContext } from '../../db/promotion-pauses';
import { campaignPauseWindows, campaignWaitWindows, promotionStateOn, effectivePromotionStatus, firstMissingPromotionDate, promotionReplayOptions } from '../../db/promotion-state.mjs';
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
 if(url.searchParams.has('noteId')){
  const parsed=platformNoteIdSchema.safeParse(url.searchParams.get('noteId'));
  if(!parsed.success)return Response.json({message:'请输入有效的 24 位笔记 ID。'},{status:422});
  try{const candidates=await getDb().select({campaignId:operationsPromotionCampaign.id,scheduleId:operationsContentSchedule.id,contentName:operationsContentVersion.contentName,versionNumber:operationsContentVersion.versionNumber,platformNoteId:operationsContent.platformNoteId,startedOn:operationsPromotionCampaign.startedOn,endedOn:operationsPromotionCampaign.endedOn,sourceStageStartedOn:operationsPromotionCampaign.startedOn}).from(operationsPromotionCampaign).innerJoin(operationsContentSchedule,eq(operationsPromotionCampaign.scheduleId,operationsContentSchedule.id)).innerJoin(operationsContentVersion,eq(operationsContentSchedule.contentVersionId,operationsContentVersion.id)).innerJoin(operationsContent,eq(operationsContentVersion.contentId,operationsContent.id)).where(and(eq(operationsContent.platformNoteId,parsed.data),eq(operationsPromotionCampaign.currentStatus,'test_discarded')));
   return Response.json({residualCandidates:candidates.map(c=>({...c,earliestDate:c.endedOn?nextDateKey(c.endedOn):null,latestDate:previousDateKey(shanghaiDateKey(new Date()))}))},{headers:{'Cache-Control':'no-store'}});
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
      categoryName: operationsCategory.name,
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
      await transaction.execute(
        // Serialize reviews for the same campaign so two dates cannot be finalized out of order.
        sql`select id from operations_promotion_campaign where id = ${result.data.campaignId} for update`,
      );
      const [campaign] = await transaction.select({
        id: operationsPromotionCampaign.id,
        scheduleId: operationsPromotionCampaign.scheduleId,
        startedOn: operationsPromotionCampaign.startedOn,
        initialStage: operationsPromotionCampaign.initialStage,
        dailyReviewEnabledOn:operationsPromotionCampaign.dailyReviewEnabledOn,endedOn:operationsPromotionCampaign.endedOn,
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
      if(result.data.requestKey){const [repeat]=await transaction.select().from(operationsPromotionTimelineAudit).where(eq(operationsPromotionTimelineAudit.requestKey,result.data.requestKey));if(repeat){const prior=(repeat.after.metrics as Array<Record<string,unknown>>|undefined)?.find(m=>m.id===repeat.after.metricId);if(repeat.scheduleId!==campaign.scheduleId||repeat.changedById!==locals.user!.id||repeat.businessDate!==result.data.metricDate||!prior||['spend','platformOpenCount','actualOpenCount','platformLeadCount','actualLeadCount'].some(key=>Number(prior[key])!==Number(result.data[key as 'spend']))||prior.reviewDecision!==result.data.reviewDecision||prior.recordKind!==result.data.recordKind)throw new WorkflowError('请求编号已被使用，请重新保存。');return {kind:'saved' as const,id:String(repeat.after.metricId),nextStatus:String(repeat.after.nextStatus)};}}
      const before=result.data.requestKey||result.data.fingerprint?await promotionSnapshot(transaction,campaign.scheduleId):null;
      if(result.data.fingerprint&&timelineFingerprint(before)!==result.data.fingerprint)throw new WorkflowError('推广记录已变化，请刷新后核对。');

      if (!campaign.platformNoteId && !result.data.platformNoteId) return { kind: 'note-id-required' as const };
      const allMetrics = await transaction.select().from(operationsPromotionDailyMetric)
        .where(eq(operationsPromotionDailyMetric.campaignId, campaign.id))
        .orderBy(asc(operationsPromotionDailyMetric.metricDate));
      if(allMetrics.some(m=>m.metricDate===result.data.metricDate))return {kind:'duplicate' as const};
      const context = await readPromotionContext(transaction);
      const residual=result.data.recordKind==='test_residual';
      const windows = [...campaignPauseWindows(campaign, context), ...campaignWaitWindows(campaign, context), ...context.holds.filter(hold => hold.campaignId === campaign.id)];
      const expectedDate = firstMissingPromotionDate(allMetrics.filter(m=>m.recordKind!=='test_residual'), campaign.startedOn, windows);
      const dailyState = promotionStateOn(campaign, context, result.data.metricDate);
      const actualStatus=dailyState?normalizePromotionActualStatus(dailyState.currentStatus,dailyState.currentStage):null;
      if(residual){
        if(campaign.currentStatus!=='test_discarded'||!campaign.endedOn||result.data.metricDate<=campaign.endedOn||result.data.stageTypeSnapshot!=='testing'||result.data.reviewDecision!=='test_discarded')return {kind:'invalid-residual' as const};
      }else{
        if(result.data.metricDate!==expectedDate)return {kind:'out-of-order' as const,expectedDate};
        const terminalToday=context.stateChanges.find(c=>c.campaignId===campaign.id&&c.businessDate===result.data.metricDate&&c.actualStatus===actualStatus&&['test_discarded','formal_discarded','ended'].includes(c.actualStatus??''));
        if(!dailyState?.currentStage&&!terminalToday)return {kind:'closed' as const};
        const expectedDailyStatus=['testing','scaling'].includes(actualStatus!)?'active':'waiting_action';
        if(result.data.dailyStatus!==expectedDailyStatus||result.data.stageTypeSnapshot!==(dailyState?.currentStage??terminalToday?.stageType)||(!terminalToday&&!promotionNextOptions(actualStatus!).some(o=>o.value===result.data.reviewDecision))||(terminalToday&&result.data.reviewDecision!==actualStatus))return {kind:'invalid-decision' as const};
      }
      const sourceStages=await transaction.select().from(operationsPromotionStage).where(eq(operationsPromotionStage.campaignId,campaign.id)).orderBy(asc(operationsPromotionStage.startedOn));
      const sourceStageStartedOn=result.data.stageTypeSnapshot==='testing'?campaign.startedOn:[...sourceStages.filter(s=>s.stageType==='scaling').map(s=>s.startedOn),...context.stateChanges.filter(c=>c.campaignId===campaign.id&&c.stageType==='scaling').map(c=>c.businessDate),...allMetrics.filter(m=>m.reviewDecision==='start_scaling').map(m=>nextDateKey(m.metricDate)),...(campaign.initialStage==='scaling'?[campaign.startedOn]:[])].sort()[0]??result.data.metricDate;
      const newFact={...result.data,actualStatusSnapshot:residual?'test_discarded':actualStatus,sourceStageStartedOn};
      const replayed=residual?null:replayPromotionHistory(campaign.startedOn,[...allMetrics,newFact].sort((a,b)=>a.metricDate.localeCompare(b.metricDate)),{...promotionReplayOptions(campaign,context),asOf:today});
      if(!residual&&!replayed)return {kind:'invalid-decision' as const};
      if (!campaign.platformNoteId && result.data.platformNoteId) {
        await transaction.update(operationsContent).set({
          platformNoteId: result.data.platformNoteId,
          updatedAt: new Date(),
        }).where(eq(operationsContent.id, campaign.contentId));
      }
      const [metric] = await transaction.insert(operationsPromotionDailyMetric).values({
        campaignId: campaign.id,
        metricDate: result.data.metricDate,
        dailyStatus: residual?'waiting_action':result.data.dailyStatus,
        actualStatusSnapshot:newFact.actualStatusSnapshot,recordKind:result.data.recordKind,sourceStageStartedOn,
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

      const audit=async(nextStatus:string)=>{if(result.data.requestKey)await transaction.insert(operationsPromotionTimelineAudit).values({scheduleId:campaign.scheduleId,requestKey:result.data.requestKey,businessDate:result.data.metricDate,action:residual?'test_residual':'daily_review',reason:result.data.note||'完成每日复盘',before:before??{},after:{...await promotionSnapshot(transaction,campaign.scheduleId),metricId:metric.id,nextStatus},changedById:locals.user!.id,changedByLabel:locals.user!.username});};
      if(residual){await audit(campaign.currentStatus);return {kind:'saved' as const,id:metric.id,nextStatus:campaign.currentStatus};}
      if(!replayed)throw new Error('Missing validated lifecycle');
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

      await audit(replayed.currentStatus);
      return { kind: 'saved' as const, id: metric.id, nextStatus: replayed.currentStatus };
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
    if (error instanceof WorkflowError) return Response.json({ message: error.message }, { status: error.status });
    const postgresError = error as { code?: string;cause?:{code?:string} };
    if ((postgresError.code??postgresError.cause?.code) === '23505') {
      return Response.json({ message: '这一天已经完成复盘，或笔记 ID 已属于另一篇帖子，请刷新并核对。' }, { status: 409 });
    }
    console.error('promotion daily save failed', error);
    return Response.json({ message: '推广日度数据保存失败，请稍后重试。' }, { status: 503 });
  }
};
