import {syncContinuousCheckpoints} from '../../../db/continuous-schedule';
import {correctPromotionHistory,PromotionHistoryPreview} from '../../../db/promotion-history-correction';
import {promotionMetricStatus} from '../../../db/promotion-state.mjs';
import {promotionNextOptions} from '../../../db/promotion-successors.mjs';
import {WorkflowError,StaleWriteError} from '../../../db/schedule-workflow';
import type { APIRoute } from 'astro';
import {randomUUID} from 'node:crypto';
import {promotionSnapshot,timelineFingerprint} from '../../../db/promotion-timeline';
import { requireAdmin, permissionErrorResponse } from '../../../auth/permissions';
import { eq,sql } from 'drizzle-orm';
import { getDb } from '../../../db/client';
import {
  operationsContentSchedule,
  operationsPromotionCampaign,
  operationsPromotionDailyMetric,
  operationsPromotionStage,
  operationsPromotionTimelineAudit,
} from '../../../db/schema';
import { lockPromotionWorkflow, readPromotionContext } from '../../../db/promotion-pauses';
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
      const signature=JSON.stringify(Object.fromEntries(Object.entries(parsed.data).filter(([key])=>!['fingerprint','expectedUpdatedAt','confirmCascade','requestKey'].includes(key))));
      if(parsed.data.requestKey){
        const [repeat]=await transaction.select().from(operationsPromotionTimelineAudit).where(eq(operationsPromotionTimelineAudit.requestKey,parsed.data.requestKey));
        if(repeat){
          if(repeat.scheduleId!==campaign.scheduleId||repeat.changedById!==locals.user!.id||repeat.after.metricId!==existing.id||repeat.after.requestSignature!==signature)throw new WorkflowError('请求编号已被使用，请重新保存。',422);
          return {kind:'saved' as const,deleted:Number(repeat.after.archived??0)};
        }
      }
      const context=await readPromotionContext(transaction);
      const effectiveStatus=promotionMetricStatus(campaign,context,existing);
      const residual=existing.recordKind==='test_residual';
      if(parsed.data.actualStatusSnapshot&&existing.actualStatusSnapshot&&parsed.data.actualStatusSnapshot!==existing.actualStatusSnapshot)throw new WorkflowError('请通过修改当日状态更正实际状态。',422);
      if(parsed.data.recordKind==='test_residual'&&!residual)throw new WorkflowError('记录类型不能更改。',422);
      if(residual&&(parsed.data.stageTypeSnapshot!=='testing'||parsed.data.reviewDecision!=='test_discarded'||parsed.data.dailyStatus!=='waiting_action'))throw new WorkflowError('淘汰后残留不改变推广状态或后续安排。',422);
      if(!residual&&existing.actualStatusSnapshot){
        const expectedStatus=['testing','scaling'].includes(existing.actualStatusSnapshot)?'active':'waiting_action';
        if(parsed.data.dailyStatus!==expectedStatus||parsed.data.stageTypeSnapshot!==existing.stageTypeSnapshot)throw new WorkflowError('请通过修改当日状态更正该日阶段。',422);
        const options=promotionNextOptions(effectiveStatus);
        if(options.length?!options.some(o=>o.value===parsed.data.reviewDecision):parsed.data.reviewDecision!==effectiveStatus)throw new WorkflowError('下一步与该日实际状态不匹配。',422);
      }
      const lifecycleChanged = !residual&&(existing.reviewDecision !== parsed.data.reviewDecision
        || existing.dailyStatus !== parsed.data.dailyStatus
        || existing.stageTypeSnapshot !== parsed.data.stageTypeSnapshot);
      if (lifecycleChanged) {requireAdmin(locals.user);if(!parsed.data.fingerprint||timelineFingerprint(await promotionSnapshot(transaction,campaign.scheduleId))!==parsed.data.fingerprint)throw new StaleWriteError('历史安排已变化，请更新影响预览后再提交。输入已保留。');}
      const before=lifecycleChanged?await promotionSnapshot(transaction,campaign.scheduleId):null;
      const [savedMetric]=await transaction.update(operationsPromotionDailyMetric).set({
        dailyStatus: parsed.data.dailyStatus,
        stageTypeSnapshot: parsed.data.stageTypeSnapshot,
        spend: parsed.data.spend.toFixed(2),
        platformOpenCount: parsed.data.platformOpenCount,
        actualOpenCount: parsed.data.actualOpenCount,
        platformLeadCount: parsed.data.platformLeadCount,
        actualLeadCount: parsed.data.actualLeadCount,
        reviewDecision: parsed.data.reviewDecision,
        note: parsed.data.note ?? null,
        updatedAt: new Date(Math.max(Date.now(),existing.updatedAt.getTime()+1)),
      }).where(eq(operationsPromotionDailyMetric.id, existing.id)).returning();

      const auditKey=parsed.data.requestKey??randomUUID();
      if (!lifecycleChanged) {
        await transaction.insert(operationsPromotionTimelineAudit).values({scheduleId:campaign.scheduleId,requestKey:auditKey,businessDate:existing.metricDate,action:'metric_values',reason:parsed.data.note?.trim()||'更正日度指标',before:{metrics:[existing]},after:{metrics:[savedMetric],metricId:existing.id,requestSignature:signature},changedById:locals.user!.id,changedByLabel:locals.user!.username});
        return { kind: 'saved' as const, deleted: 0 };
      }
      const correction=await correctPromotionHistory(transaction,{before:before!,campaign,date:existing.metricDate,actor:locals.user!,reason:parsed.data.note??'',confirmed:parsed.data.confirmCascade,now:new Date()});
      const replayed=correction.state;
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
      await syncContinuousCheckpoints(transaction,campaign.scheduleId,locals.user!.username,new Date());
      if(before)await transaction.insert(operationsPromotionTimelineAudit).values({scheduleId:campaign.scheduleId,requestKey:auditKey,businessDate:existing.metricDate,action:'metric_correction',reason:parsed.data.note||'更正历史复盘决定',before,after:{...await promotionSnapshot(transaction,campaign.scheduleId),metricId:existing.id,requestSignature:signature,archived:correction.archived},changedById:locals.user!.id,changedByLabel:locals.user!.username});
      return { kind: 'saved' as const, deleted: correction.archived };
    });

    if (result.kind === 'missing') return Response.json({ message: '没有找到这条日度记录。' }, { status: 404 });
    return Response.json({ ok: true, deleted: result.deleted });
  } catch (error) {
    if(error instanceof PromotionHistoryPreview)return Response.json({correctionRequired:true,message:error.impact.message,impact:error.impact},{status:409});
    const denied = permissionErrorResponse(error); if (denied) return denied;
    if(error instanceof WorkflowError)return Response.json({message:error.message,...(error.code?{code:error.code}:{})},{status:error.status});
    console.error('promotion daily update failed', error);
    return Response.json({ message: '历史日度数据保存失败，请稍后重试。' }, { status: 503 });
  }
};
