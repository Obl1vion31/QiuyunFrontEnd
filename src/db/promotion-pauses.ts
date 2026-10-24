/** 推广共用上下文与事务锁；团队暂停仅保留历史兼容。新批次接口已停用。 */
import { asc, sql } from 'drizzle-orm';
import type { Database } from './client';
import { WorkflowError, type Transaction } from './schedule-workflow';
import { shanghaiDateKey } from './promotion-rules.mjs';
import { pauseIsActive } from './promotion-state.mjs';
import {readMeetingDecisions} from './meeting-decisions';
import { operationsPromotionPause as pauses, operationsPromotionPauseTarget as targets,
  operationsPromotionHold as holds, operationsPromotionCampaign as campaigns, operationsPromotionWaitRange as waitRanges, operationsPromotionDailyMetric as metrics, operationsPromotionDayDecision as decisions } from './schema';

export const lockPromotionWorkflow = (transaction: Transaction) => transaction.execute(sql`select pg_advisory_xact_lock(739214502)`);

export async function readPromotionContext(database: Database | Transaction) {
  const [pauseRows, targetRows, holdRows, rangeRows, campaignRows, metricRows, stateChanges] = await Promise.all([
    database.select().from(pauses).orderBy(asc(pauses.startsAt)), database.select().from(targets), database.select().from(holds).orderBy(asc(holds.startedOn)),
    database.select().from(waitRanges).orderBy(asc(waitRanges.startedOn)), database.select().from(campaigns),
    database.select({ campaignId: metrics.campaignId, metricDate: metrics.metricDate, dailyStatus: metrics.dailyStatus, actualStatusSnapshot:metrics.actualStatusSnapshot,recordKind:metrics.recordKind,sourceStageStartedOn:metrics.sourceStageStartedOn, stageTypeSnapshot: metrics.stageTypeSnapshot, reviewDecision: metrics.reviewDecision }).from(metrics).orderBy(asc(metrics.metricDate)),
    database.select().from(decisions).orderBy(asc(decisions.businessDate)),
  ]);
  const meetingDecisions=await readMeetingDecisions(database);
  // 人工当日更正排在会议安排之后；不能用补指标覆盖会议来源。
  const planned=meetingDecisions.map(d=>({id:d.id,campaignId:d.campaignId,businessDate:d.effectiveOn,stageType:d.stageType,actualStatus:d.targetStatus,reason:'例会决定',meetingDecision:true}));
  return { meetingDecisions,stateChanges:[...planned,...stateChanges] as Array<(typeof stateChanges)[number]&{meetingDecision?:boolean}>, pauses: pauseRows, targets: targetRows, holds: holdRows, waitRanges: rangeRows, campaigns: campaignRows, metrics: metricRows };
}

export async function guardPromotionStart(transaction: Transaction, date: string, now = new Date()) {
  const rows = await transaction.select().from(pauses);
  if (rows.some(pause => pauseIsActive(pause, now) && date >= shanghaiDateKey(pause.startsAt))) {
    throw new WorkflowError('团队正在节假日暂停，请在暂停结束后开始或恢复推广。');
  }
}

/** 补录假期前开始的活动时，仍需纳入当前暂停，避免历史补录绕过全局暂停。 */
export async function attachPromotionToActivePause(transaction: Transaction, campaignId: string, stage: string, now = new Date()) {
  const rows = await transaction.select().from(pauses);
  const active = rows.find(pause => pauseIsActive(pause, now));
  if (active) await transaction.insert(targets).values({ pauseId: active.id, campaignId, stageType: stage }).onConflictDoNothing();
}
