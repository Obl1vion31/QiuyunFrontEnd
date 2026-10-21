import {normalizePromotionActualStatus,promotionNextOptions} from '../../../db/promotion-successors.mjs';
import {WorkflowError} from '../../../db/schedule-workflow';
import type { APIRoute } from 'astro';
import {randomUUID} from 'node:crypto';
import {promotionSnapshot} from '../../../db/promotion-timeline';
import { requireAdmin, permissionErrorResponse } from '../../../auth/permissions';
import { asc, eq, inArray,sql } from 'drizzle-orm';
import { getDb } from '../../../db/client';
import {
  operationsContentSchedule,
  operationsPromotionCampaign,
  operationsPromotionDailyMetric,
  operationsPromotionStage,
  operationsPromotionHold,
  operationsPromotionWaitRange,
  operationsPromotionDayDecision,operationsPromotionTimelineAudit,
} from '../../../db/schema';
import { replayPromotionHistory,shanghaiDateKey,nextDateKey } from '../../../db/promotion-rules.mjs';
import { lockPromotionWorkflow, readPromotionContext } from '../../../db/promotion-pauses';
import { promotionReplayOptions } from '../../../db/promotion-state.mjs';
import {
  promotionDailyUpdateInputFromForm,
  promotionDailyUpdateSchema,
} from '../../../db/promotion-validation';

export const prerender = false;

const validationResponse = (issues: Array<{ path: PropertyKey[]; message: string }>) => {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? 'form');
    (fields[field] ??= []).push(issue.message);
  }
  return Response.json({ message: '请检查日度数据。', fields }, { status: 422 });
};

export const PATCH: APIRoute = async ({ request, url, params, locals }) => {
  if (request.headers.get('origin') !== url.origin) return new Response('拒绝跨站写入。', { status: 403 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ message: '请求必须使用有效的表单格式。' }, { status: 400 });
  }
  const parsed = promotionDailyUpdateSchema.safeParse(promotionDailyUpdateInputFromForm(form));
  if (!parsed.success) return validationResponse(parsed.error.issues);

  try {
    const result = await getDb().transaction(async (transaction) => {
      await lockPromotionWorkflow(transaction);
      const [reference] = await transaction.select({ campaignId: operationsPromotionDailyMetric.campaignId }).from(operationsPromotionDailyMetric)
        .where(eq(operationsPromotionDailyMetric.id, params.id!)).limit(1);
      if (!reference) return { kind: 'missing' as const };
      await transaction.execute(sql`select id from operations_promotion_campaign where id = ${reference.campaignId} for update`);
      // 排队期间管理员可能已更正或删除此事实，锁定活动后重新读取，避免用旧决定绕过权限。
      const [existing] = await transaction.select().from(operationsPromotionDailyMetric)
        .where(eq(operationsPromotionDailyMetric.id, params.id!)).limit(1);
      if (!existing) return { kind: 'missing' as const };

      const [campaign] = await transaction.select().from(operationsPromotionCampaign)
        .where(eq(operationsPromotionCampaign.id, existing.campaignId)).limit(1);
      if (!campaign) return { kind: 'missing' as const };
      const residual=existing.recordKind==='test_residual';
      if(parsed.data.actualStatusSnapshot&&existing.actualStatusSnapshot&&parsed.data.actualStatusSnapshot!==existing.actualStatusSnapshot)throw new WorkflowError('请通过修改当日状态更正实际状态。',422);
      if(parsed.data.recordKind==='test_residual'&&!residual)throw new WorkflowError('记录类型不能更改。',422);
      if(residual&&(parsed.data.stageTypeSnapshot!=='testing'||parsed.data.reviewDecision!=='test_discarded'||parsed.data.dailyStatus!=='waiting_action'))throw new WorkflowError('淘汰后残留不改变推广状态或后续安排。',422);
      if(!residual&&existing.actualStatusSnapshot){
        const expectedStatus=['testing','scaling'].includes(existing.actualStatusSnapshot)?'active':'waiting_action';
        if(parsed.data.dailyStatus!==expectedStatus||parsed.data.stageTypeSnapshot!==existing.stageTypeSnapshot)throw new WorkflowError('请通过修改当日状态更正该日阶段。',422);
        const options=promotionNextOptions(existing.actualStatusSnapshot);
        if(options.length?!options.some(o=>o.value===parsed.data.reviewDecision):parsed.data.reviewDecision!==existing.actualStatusSnapshot)throw new WorkflowError('下一步与该日实际状态不匹配。',422);
      }
      const lifecycleChanged = !residual&&(existing.reviewDecision !== parsed.data.reviewDecision
        || existing.dailyStatus !== parsed.data.dailyStatus
        || existing.stageTypeSnapshot !== parsed.data.stageTypeSnapshot);
      if (lifecycleChanged) requireAdmin(locals.user);
      const before=lifecycleChanged?await promotionSnapshot(transaction,campaign.scheduleId):null;
      const allMetrics = await transaction.select().from(operationsPromotionDailyMetric)
        .where(eq(operationsPromotionDailyMetric.campaignId, existing.campaignId))
        .orderBy(asc(operationsPromotionDailyMetric.metricDate));
      const context = await readPromotionContext(transaction);
      const candidate=allMetrics.map(m=>m.id===existing.id?{...m,dailyStatus:parsed.data.dailyStatus,stageTypeSnapshot:parsed.data.stageTypeSnapshot,reviewDecision:parsed.data.reviewDecision}:m);
      let replayed=lifecycleChanged?replayPromotionHistory(campaign.startedOn,candidate,{...promotionReplayOptions(campaign,context),asOf:shanghaiDateKey(new Date())}):null;
      let later:typeof allMetrics=[];
      let affectedRanges:typeof context.waitRanges=[];
      let affectedDecisions:typeof context.stateChanges=[];
      if(lifecycleChanged&&!replayed){
        affectedRanges=context.waitRanges.filter(r=>r.campaignId===campaign.id&&(!r.nextEffectiveOn||r.nextEffectiveOn>existing.metricDate));
        affectedDecisions=context.stateChanges.filter(r=>r.campaignId===campaign.id&&r.businessDate>existing.metricDate);
        context.waitRanges=context.waitRanges.filter(r=>!affectedRanges.some(a=>a.id===r.id));
        context.stateChanges=context.stateChanges.filter(r=>!affectedDecisions.some(a=>a.id===r.id));
        context.holds=context.holds.filter(h=>h.campaignId!==campaign.id||h.endedOn<=existing.metricDate);
        const retained:typeof allMetrics=[];
        for(const metric of candidate){
          if(metric.recordKind==='test_residual'||replayPromotionHistory(campaign.startedOn,[...retained,metric],{...promotionReplayOptions(campaign,context),asOf:nextDateKey(metric.metricDate)}))retained.push(metric);else if(metric.metricDate>existing.metricDate)later.push(metric);else return {kind:'invalid-decision' as const};
        }
        replayed=replayPromotionHistory(campaign.startedOn,retained,{...promotionReplayOptions(campaign,context),asOf:shanghaiDateKey(new Date())});
        if(!replayed)return {kind:'invalid-decision' as const};
        if((later.length||affectedRanges.length||affectedDecisions.length)&&!parsed.data.confirmCascade)return {kind:'confirmation' as const,dailyMetrics:later.length,stages:replayed.stages.length,waitRanges:affectedRanges.length,dayDecisions:affectedDecisions.length};
        if(later.length)await transaction.delete(operationsPromotionDailyMetric).where(inArray(operationsPromotionDailyMetric.id,later.map(m=>m.id)));
        for(const range of affectedRanges)await transaction.delete(operationsPromotionWaitRange).where(eq(operationsPromotionWaitRange.id,range.id));
        for(const decision of affectedDecisions)await transaction.delete(operationsPromotionDayDecision).where(eq(operationsPromotionDayDecision.id,decision.id));
        await transaction.delete(operationsPromotionHold).where(sql`${operationsPromotionHold.campaignId} = ${campaign.id} and ${operationsPromotionHold.endedOn} > ${existing.metricDate}`);
      }
      await transaction.update(operationsPromotionDailyMetric).set({
        dailyStatus: parsed.data.dailyStatus,
        stageTypeSnapshot: parsed.data.stageTypeSnapshot,
        spend: parsed.data.spend.toFixed(2),
        platformOpenCount: parsed.data.platformOpenCount,
        actualOpenCount: parsed.data.actualOpenCount,
        platformLeadCount: parsed.data.platformLeadCount,
        actualLeadCount: parsed.data.actualLeadCount,
        reviewDecision: parsed.data.reviewDecision,
        note: parsed.data.note ?? null,
        updatedAt: new Date(),
      }).where(eq(operationsPromotionDailyMetric.id, existing.id));

      if (!lifecycleChanged) return { kind: 'saved' as const, deleted: 0 };

      await transaction.delete(operationsPromotionStage)
        .where(eq(operationsPromotionStage.campaignId, existing.campaignId));
      for (const stage of replayed!.stages) {
        await transaction.insert(operationsPromotionStage).values({ campaignId: campaign.id, ...stage });
      }
      await transaction.update(operationsPromotionCampaign).set({
        currentStage: replayed!.currentStage,
        currentStatus: replayed!.currentStatus,
        endedOn: replayed!.endedOn,
        updatedAt: new Date(),
      }).where(eq(operationsPromotionCampaign.id, campaign.id));
      await transaction.update(operationsContentSchedule).set({
        promotionStatus: replayed!.currentStatus,
        updatedAt: new Date(),
      }).where(eq(operationsContentSchedule.id, campaign.scheduleId));
      if(before)await transaction.insert(operationsPromotionTimelineAudit).values({scheduleId:campaign.scheduleId,requestKey:randomUUID(),businessDate:existing.metricDate,action:'metric_correction',reason:parsed.data.note||'更正历史复盘决定',before,after:await promotionSnapshot(transaction,campaign.scheduleId),changedById:locals.user!.id,changedByLabel:locals.user!.username});
      return { kind: 'saved' as const, deleted: later.length };
    });

    if (result.kind === 'missing') return Response.json({ message: '没有找到这条日度记录。' }, { status: 404 });
    if (result.kind === 'invalid-decision') return Response.json({ message: '下一步与该日阶段不匹配。' }, { status: 409 });
    if (result.kind === 'confirmation') {
      return Response.json({
        message: `修改下一步会归档后续 ${result.dailyMetrics} 条日度记录，并重置 ${result.waitRanges} 个待定区间及 ${result.dayDecisions} 项当日安排。`,
        correctionRequired: true,
        impact: { dailyMetrics: result.dailyMetrics, stages: result.stages, waitRanges: result.waitRanges,dayDecisions:result.dayDecisions },
      }, { status: 409 });
    }
    return Response.json({ ok: true, deleted: result.deleted });
  } catch (error) {
    const denied = permissionErrorResponse(error); if (denied) return denied;
    if(error instanceof WorkflowError)return Response.json({message:error.message},{status:error.status});
    console.error('promotion daily update failed', error);
    return Response.json({ message: '历史日度数据保存失败，请稍后重试。' }, { status: 503 });
  }
};
