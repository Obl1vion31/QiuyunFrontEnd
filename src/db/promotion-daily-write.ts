import {testingCycleOn} from './promotion-cycles.mjs';
/** 单条与批量复盘共用同一事务写入，调用方持有推广工作流锁。 */
import { asc, eq, sql } from 'drizzle-orm';
import {meetingDecisionOn,meetingNextDecision} from './meeting-decision-rules.mjs';
import type { z } from 'zod';
import { promotionDailySchema } from './promotion-validation';
import { normalizePromotionActualStatus, promotionNextOptions } from './promotion-successors.mjs';
import { promotionSnapshot, timelineFingerprint } from './promotion-timeline';
import { operationsContent, operationsContentSchedule, operationsContentVersion, operationsPromotionCampaign, operationsPromotionDailyMetric, operationsPromotionStage, operationsPromotionTimelineAudit } from './schema';
import { readPromotionContext } from './promotion-pauses';
import { campaignPauseWindows, campaignWaitWindows, promotionStateOn, firstMissingPromotionDate, promotionReplayOptions } from './promotion-state.mjs';
import { nextDateKey, replayPromotionHistory, shanghaiDateKey } from './promotion-rules.mjs';
import { WorkflowError, type Transaction } from './schedule-workflow';
export type DailyInput = z.infer<typeof promotionDailySchema>;
export async function writePromotionDaily(transaction: Transaction, data: DailyInput, actor: {
    id: string;
    username: string;
}, fingerprintChecked = false) {
    const today = shanghaiDateKey(new Date());
    if (data.metricDate >= today)
        throw new WorkflowError('日度复盘按 T+1 填写，只能保存今天以前的数据。', 422);
    await transaction.execute(
    // Serialize reviews for the same campaign so two dates cannot be finalized out of order.
    sql `select id from operations_promotion_campaign where id = ${data.campaignId} for update`);
    const [campaign] = await transaction.select({
        id: operationsPromotionCampaign.id,
        scheduleId: operationsPromotionCampaign.scheduleId,
        startedOn: operationsPromotionCampaign.startedOn,
        initialStage: operationsPromotionCampaign.initialStage,
        dailyReviewEnabledOn: operationsPromotionCampaign.dailyReviewEnabledOn, endedOn: operationsPromotionCampaign.endedOn,
        currentStage: operationsPromotionCampaign.currentStage,
        currentStatus: operationsPromotionCampaign.currentStatus,
        contentId: operationsContent.id,
        platformNoteId: operationsContent.platformNoteId,
    }).from(operationsPromotionCampaign)
        .innerJoin(operationsContentSchedule, eq(operationsPromotionCampaign.scheduleId, operationsContentSchedule.id))
        .innerJoin(operationsContentVersion, eq(operationsContentSchedule.contentVersionId, operationsContentVersion.id))
        .innerJoin(operationsContent, eq(operationsContentVersion.contentId, operationsContent.id))
        .where(eq(operationsPromotionCampaign.id, data.campaignId))
        .limit(1);
    if (!campaign)
        return { kind: 'missing' as const };
    if (data.requestKey) {
        const [repeat] = await transaction.select().from(operationsPromotionTimelineAudit).where(eq(operationsPromotionTimelineAudit.requestKey, data.requestKey));
        if (repeat) {
            const prior = (repeat.after.metrics as Array<Record<string, unknown>> | undefined)?.find(m => m.id === repeat.after.metricId);
            if (repeat.scheduleId !== campaign.scheduleId || repeat.changedById !== actor.id || repeat.businessDate !== data.metricDate || !prior || prior.campaignId !== data.campaignId || ['spend', 'platformOpenCount', 'actualOpenCount', 'platformLeadCount', 'actualLeadCount'].some(key => Number(prior[key]) !== Number(data[key as 'spend'])) || prior.reviewDecision !== data.reviewDecision || prior.recordKind !== data.recordKind || prior.stageTypeSnapshot !== data.stageTypeSnapshot || prior.dailyStatus !== data.dailyStatus || (data.actualStatusSnapshot && prior.actualStatusSnapshot !== data.actualStatusSnapshot) || (data.platformNoteId && campaign.platformNoteId !== data.platformNoteId) || (prior.note ?? null) !== (data.note ?? null))
                throw new WorkflowError('请求编号已被使用，请重新保存。');
            return { kind: 'saved' as const, id: String(repeat.after.metricId), nextStatus: String(repeat.after.nextStatus) };
        }
    }
    const before = data.requestKey || data.fingerprint ? await promotionSnapshot(transaction, campaign.scheduleId) : null;
    if (!fingerprintChecked && data.fingerprint && timelineFingerprint(before) !== data.fingerprint)
        throw new WorkflowError('推广记录已变化，请刷新后核对。');
    if (campaign.platformNoteId && data.platformNoteId && campaign.platformNoteId !== data.platformNoteId)
        throw new WorkflowError('已有笔记 ID 不能在每日复盘中覆盖，请使用资料更正入口。', 422);
    if (!campaign.platformNoteId && !data.platformNoteId)
        return { kind: 'note-id-required' as const };
    const allMetrics = await transaction.select().from(operationsPromotionDailyMetric)
        .where(eq(operationsPromotionDailyMetric.campaignId, campaign.id))
        .orderBy(asc(operationsPromotionDailyMetric.metricDate));
    if (allMetrics.some(m => m.metricDate === data.metricDate))
        return { kind: 'duplicate' as const };
    const context = await readPromotionContext(transaction);
    const residual = data.recordKind === 'test_residual';
    const windows = [...campaignPauseWindows(campaign, context), ...campaignWaitWindows(campaign, context), ...context.holds.filter(hold => hold.campaignId === campaign.id)];
    const expectedDate = firstMissingPromotionDate(allMetrics.filter(m => m.recordKind !== 'test_residual'), campaign.startedOn, windows);
    const dailyState = promotionStateOn(campaign, context, data.metricDate);
    const actualStatus = dailyState ? normalizePromotionActualStatus(dailyState.currentStatus, dailyState.currentStage) : null;
    const meetingDecision=meetingDecisionOn(context.meetingDecisions,campaign.id,nextDateKey(data.metricDate));
    if(meetingDecision&&data.reviewDecision!==meetingNextDecision(actualStatus,meetingDecision.action==='restart_testing'?'restart_testing':meetingDecision.targetStatus))throw new WorkflowError('下一步由例会确定，修改必须填写理由。',422);
    if (residual) {
        if (campaign.currentStatus !== 'test_discarded' || !campaign.endedOn || data.metricDate <= campaign.endedOn || data.stageTypeSnapshot !== 'testing' || data.reviewDecision !== 'test_discarded')
            return { kind: 'invalid-residual' as const };
    }
    else {
        if (data.metricDate !== expectedDate)
            return { kind: 'out-of-order' as const, expectedDate };
        const terminalToday = context.stateChanges.find(c => !c.meetingDecision && c.campaignId === campaign.id && c.businessDate === data.metricDate && c.actualStatus === actualStatus && ['test_discarded', 'formal_discarded', 'ended'].includes(c.actualStatus ?? ''));
        if (!dailyState?.currentStage && !terminalToday)
            return { kind: 'closed' as const };
        const expectedDailyStatus = ['testing', 'scaling'].includes(actualStatus!) ? 'active' : 'waiting_action';
        if (data.dailyStatus !== expectedDailyStatus || data.stageTypeSnapshot !== (dailyState?.currentStage ?? terminalToday?.stageType) || (!terminalToday && !promotionNextOptions(actualStatus!).some(o => o.value === data.reviewDecision)) || (terminalToday && data.reviewDecision !== actualStatus))
            return { kind: 'invalid-decision' as const };
    }
    const sourceStages = await transaction.select().from(operationsPromotionStage).where(eq(operationsPromotionStage.campaignId, campaign.id)).orderBy(asc(operationsPromotionStage.startedOn));
    const sourceStageStartedOn = data.stageTypeSnapshot === 'testing' ? testingCycleOn(campaign,context,data.metricDate)!.startedOn : [...sourceStages.filter(s => s.stageType === 'scaling').map(s => s.startedOn), ...context.stateChanges.filter(c => c.campaignId === campaign.id && c.stageType === 'scaling').map(c => c.businessDate), ...allMetrics.filter(m => m.reviewDecision === 'start_scaling').map(m => nextDateKey(m.metricDate)), ...(campaign.initialStage === 'scaling' ? [campaign.startedOn] : [])].sort()[0] ?? data.metricDate;
    const newFact = { ...data, actualStatusSnapshot: residual ? 'test_discarded' : actualStatus, sourceStageStartedOn };
    const replayed = residual ? null : replayPromotionHistory(campaign.startedOn, [...allMetrics, newFact].sort((a, b) => a.metricDate.localeCompare(b.metricDate)), { ...promotionReplayOptions(campaign, context), asOf: today });
    if (!residual && !replayed)
        return { kind: 'invalid-decision' as const };
    if (!campaign.platformNoteId && data.platformNoteId) {
        await transaction.update(operationsContent).set({
            platformNoteId: data.platformNoteId,
            updatedAt: new Date(),
        }).where(eq(operationsContent.id, campaign.contentId));
    }
    const [metric] = await transaction.insert(operationsPromotionDailyMetric).values({
        campaignId: campaign.id,
        metricDate: data.metricDate,
        dailyStatus: residual ? 'waiting_action' : data.dailyStatus,
        actualStatusSnapshot: newFact.actualStatusSnapshot, recordKind: data.recordKind, sourceStageStartedOn,
        stageTypeSnapshot: data.stageTypeSnapshot,
        spend: data.spend.toFixed(2),
        clickRate: null,
        platformOpenCount: data.platformOpenCount,
        actualOpenCount: data.actualOpenCount,
        platformLeadCount: data.platformLeadCount,
        actualLeadCount: data.actualLeadCount,
        reviewDecision: data.reviewDecision,
        note: data.note ?? null,
    }).returning({ id: operationsPromotionDailyMetric.id });
    const audit = async (nextStatus: string) => { if (data.requestKey)
        await transaction.insert(operationsPromotionTimelineAudit).values({ scheduleId: campaign.scheduleId, requestKey: data.requestKey, businessDate: data.metricDate, action: residual ? 'test_residual' : 'daily_review', reason: data.note || '完成每日复盘', before: before ?? {}, after: { ...await promotionSnapshot(transaction, campaign.scheduleId), metricId: metric.id, nextStatus }, changedById: actor.id, changedByLabel: actor.username }); };
    if (residual) {
        await audit(campaign.currentStatus);
        return { kind: 'saved' as const, id: metric.id, nextStatus: campaign.currentStatus };
    }
    if (!replayed)
        throw new Error('Missing validated lifecycle');
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
}
export function requireDailySaved(saved: Awaited<ReturnType<typeof writePromotionDaily>>) {
    if (saved.kind === 'saved')
        return saved;
    const messages = { duplicate: '这一天已经完成复盘，请核对后更正原记录。', missing: '没有找到推广活动。', closed: '该推广活动已经结束。', 'note-id-required': '保存日度复盘前，请补填这篇帖子的小红书笔记 ID。', 'invalid-residual': '只允许为测试淘汰活动补录结束日之后的真实残留数据。', 'invalid-decision': '复盘选择与当前推广阶段不匹配。', 'out-of-order': saved.kind === 'out-of-order' ? `请先完成 ${saved.expectedDate} 的日度复盘。` : '' };
    throw new WorkflowError(messages[saved.kind], saved.kind === 'missing' ? 404 : ['note-id-required', 'invalid-residual'].includes(saved.kind) ? 422 : 409);
}
