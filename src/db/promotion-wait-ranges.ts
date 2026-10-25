import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './client';
import { requireAdmin, type OperationsUser } from '../auth/permissions';
import { WorkflowError } from './schedule-workflow';
import { lockPromotionWorkflow, readPromotionContext, guardPromotionStart } from './promotion-pauses';
import { nextDateKey, replayPromotionHistory, shanghaiDateKey } from './promotion-rules.mjs';
import {testingCycleOn} from './promotion-cycles.mjs';
import { promotionReplayOptions, promotionStateOn } from './promotion-state.mjs';
import { operationsPromotionWaitRange as ranges, operationsPromotionCampaign as campaigns, operationsPromotionDailyMetric as metrics, operationsPromotionStage as stages, operationsContentSchedule as schedules } from './schema';

export const businessDate = z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).refine(v => {
  const date = new Date(`${v}T00:00:00+08:00`);
  return Number.isFinite(date.getTime()) && shanghaiDateKey(date) === v;
}, '日期无效');
export const waitRangeSchema = z.object({
  campaignId: z.uuid(), requestKey: z.uuid(), startedOn: businessDate, endedOn: businessDate,
  stageType: z.enum(['testing','scaling']), reason: z.string().trim().min(1, '请填写原因').max(2000),
  nextDecision: z.enum(['test_continue','restart_testing','start_scaling','test_discarded','scaling_continue','formal_discarded','ended']).nullable().default(null),
  nextEffectiveOn: businessDate.nullable().default(null), expectedRevision: z.number().int().min(0).optional(), confirmCascade: z.boolean().default(false),
}).superRefine((v, ctx) => {
  if (v.endedOn < v.startedOn) ctx.addIssue({ code: 'custom', path: ['endedOn'], message: '结束日不能早于开始日' });
  if (v.nextDecision && !(v.stageType === 'testing' ? ['test_continue','restart_testing','start_scaling','test_discarded'] : ['scaling_continue','formal_discarded','ended']).includes(v.nextDecision)) ctx.addIssue({ code: 'custom', path: ['nextDecision'], message: '下一步与阶段不匹配' });
  if (Boolean(v.nextDecision) !== Boolean(v.nextEffectiveOn) || (v.nextEffectiveOn && v.nextEffectiveOn <= v.endedOn)) ctx.addIssue({ code: 'custom', path: ['nextEffectiveOn'], message: '下一步须在区间结束后的日期生效' });
});

export async function saveWaitRange(db: Database, input: z.infer<typeof waitRangeSchema>, actor: OperationsUser, id?: string, now = new Date()) {
  const today = shanghaiDateKey(now);
  return db.transaction(async tx => {
    await lockPromotionWorkflow(tx);
    const [campaign] = await tx.select().from(campaigns).where(eq(campaigns.id, input.campaignId)).for('update');
    if (!campaign) throw new WorkflowError('没有找到推广活动。', 404);
    const [existing] = await tx.select().from(ranges).where(id ? eq(ranges.id, id) : eq(ranges.requestKey, input.requestKey));
    if (!id && existing) {
      if (existing.campaignId !== input.campaignId) throw new WorkflowError('请求编号已用于另一篇帖子。');
      return { id: existing.id, repeated: true };
    }
    if (id && (!existing || existing.campaignId !== input.campaignId)) throw new WorkflowError('没有找到该区间。', 404);
    if (existing && existing.revision !== input.expectedRevision) throw new WorkflowError('区间已被更新，请刷新后重试。');
    const context = await readPromotionContext(tx);
    context.waitRanges = context.waitRanges.filter(r => r.id !== existing?.id);
    const actual = await tx.select().from(metrics).where(eq(metrics.campaignId, campaign.id)).orderBy(asc(metrics.metricDate));
    const boundsChanged = !existing || input.startedOn !== existing.startedOn || input.stageType !== existing.stageType;
    const historical = (boundsChanged && input.startedOn < today) || (existing?.nextEffectiveOn && existing.nextEffectiveOn <= today && (existing.nextDecision !== input.nextDecision || existing.nextEffectiveOn !== input.nextEffectiveOn)) || (input.nextEffectiveOn && input.nextEffectiveOn < today);
    if (historical) requireAdmin(actor);
    if (input.startedOn < campaign.startedOn) throw new WorkflowError('区间不能早于推广开始日。', 422);
    if (input.nextDecision && input.endedOn > today) throw new WorkflowError('请在区间最后一天安排下一步，或先延长待定区间。', 422);
    if (input.nextDecision && ['test_continue','restart_testing','start_scaling','scaling_continue'].includes(input.nextDecision)) await guardPromotionStart(tx, input.nextEffectiveOn!, now);
    const stop = input.nextEffectiveOn ?? '9999-12-31';
    if (context.waitRanges.some(r => r.campaignId === campaign.id && r.startedOn < stop && input.startedOn < (r.nextEffectiveOn ?? '9999-12-31'))) throw new WorkflowError('该日期与已有待定区间重叠，请编辑原区间。');
    if (context.holds.some(r => r.campaignId === campaign.id && r.startedOn < stop && r.endedOn >= input.startedOn)) throw new WorkflowError('该日期已有历史待定安排，请选择其他日期。');
    if((input.nextDecision==='restart_testing'||existing?.nextDecision==='restart_testing')&&(existing?.nextDecision!==input.nextDecision||existing?.nextEffectiveOn!==input.nextEffectiveOn)&&actual.some(m=>m.metricDate>=[input.nextEffectiveOn,existing?.nextEffectiveOn].filter(Boolean).sort()[0]!))throw new WorkflowError('复测生效日已有指标，请通过历史更正入口处理。',422);
    const value = { campaignId: campaign.id, requestKey: existing?.requestKey ?? input.requestKey, startedOn: input.startedOn, endedOn: input.endedOn, stageType: input.stageType, reason: input.reason, nextDecision: input.nextDecision, nextEffectiveOn: input.nextEffectiveOn };
    const rangeContext = { ...context, waitRanges: [...context.waitRanges, { ...value, id: existing?.id ?? input.requestKey, revision: 0, history: [], updatedByLabel: actor.username, updatedAt: now }] };
    // 区间改变状态归属，但不能删除其中真实发生的消耗与人数。
    const targetStatus=input.stageType==='testing'?'test_pending':'scaling_paused';
    // 启用日前的旧区间没有精确状态事实，不将其补写为已结束的测试待定。
    const statusFor=(metric:typeof actual[number])=>metric.actualStatusSnapshot||metric.metricDate>=campaign.dailyReviewEnabledOn?targetStatus:null;
    const sourceOrigin=input.stageType==='testing'?testingCycleOn(campaign,context,input.startedOn)!.startedOn:campaign.initialStage==='scaling'?campaign.startedOn:actual.find(m=>m.stageTypeSnapshot==='scaling')?.sourceStageStartedOn??actual.find(m=>m.stageTypeSnapshot==='scaling')?.metricDate??input.startedOn;
    const changedFacts=actual.filter(m=>m.recordKind!=='test_residual'&&m.metricDate>=input.startedOn&&m.metricDate<stop&&(m.dailyStatus!=='waiting_action'||m.actualStatusSnapshot!==statusFor(m)||m.stageTypeSnapshot!==input.stageType||m.reviewDecision!=='wait_continue'||!m.sourceStageStartedOn));
    const retained=actual.map(m=>changedFacts.some(c=>c.id===m.id)?{...m,dailyStatus:'waiting_action',actualStatusSnapshot:statusFor(m),sourceStageStartedOn:sourceOrigin,stageTypeSnapshot:input.stageType,reviewDecision:'wait_continue'}:m);
    const through = [today, nextDateKey(input.endedOn), input.nextEffectiveOn ?? today, ...retained.filter(m=>m.recordKind!=='test_residual').map(m => nextDateKey(m.metricDate))].sort().at(-1)!;
    const state = replayPromotionHistory(campaign.startedOn, retained, { ...promotionReplayOptions(campaign, rangeContext), asOf: through });
    const deleted:typeof actual=[];
    if (!state) throw new WorkflowError('区间与已有生命周期或后续安排冲突；真实指标已保留，请先核对后续状态。');
    if(changedFacts.length){requireAdmin(actor);if(!input.confirmCascade)return {confirmationRequired:true,impact:{dailyMetrics:changedFacts.length,from:changedFacts[0].metricDate,through:changedFacts.at(-1)!.metricDate}};}
    if (boundsChanged) {
      const before = promotionStateOn(campaign, { ...context, metrics: retained }, input.startedOn);
      if (!before?.currentStage || before.currentStage !== input.stageType) throw new WorkflowError('区间与已有生命周期不一致：开始日阶段已变更、结束或淘汰。');
    }
    const changes = { ...value, revision: (existing?.revision ?? -1) + 1, updatedByLabel: actor.username, updatedAt: now,
      history: [...(existing?.history ?? []), { at: now.toISOString(), actor: actor.username, previous: existing ? { startedOn: existing.startedOn, endedOn: existing.endedOn, nextDecision: existing.nextDecision, nextEffectiveOn: existing.nextEffectiveOn } : null, ...value, deletedMetricIds: [],reclassifiedMetricIds:changedFacts.map(m=>m.id) }] };
    const [saved] = existing ? await tx.update(ranges).set(changes).where(eq(ranges.id, existing.id)).returning() : await tx.insert(ranges).values(changes).returning();
    for(const metric of retained.filter(m=>changedFacts.some(c=>c.id===m.id)))await tx.update(metrics).set({dailyStatus:metric.dailyStatus,actualStatusSnapshot:metric.actualStatusSnapshot,sourceStageStartedOn:metric.sourceStageStartedOn,stageTypeSnapshot:metric.stageTypeSnapshot,reviewDecision:metric.reviewDecision,updatedAt:now}).where(eq(metrics.id,metric.id));
    const current = replayPromotionHistory(campaign.startedOn, retained, { ...promotionReplayOptions(campaign, rangeContext), asOf: today })!;
    await tx.delete(stages).where(eq(stages.campaignId, campaign.id));
    for (const stage of current.stages) await tx.insert(stages).values({ campaignId: campaign.id, ...stage });
    await tx.update(campaigns).set({ currentStage: current.currentStage, currentStatus: current.currentStatus, endedOn: current.endedOn, updatedAt: now }).where(eq(campaigns.id, campaign.id));
    await tx.update(schedules).set({ promotionStatus: current.currentStatus, updatedAt: now }).where(eq(schedules.id, campaign.scheduleId));
    return { id: saved.id, revision: saved.revision, deleted: deleted.length };
  });
}
