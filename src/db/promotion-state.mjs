/** 排期、日度、历史共用的推广状态与整日暂停规则；日期均为上海时间。 */
import { nextDateKey, previousDateKey, shanghaiDateKey, replayPromotionHistory } from './promotion-rules.mjs';

export const promotionLabels = {
  none: '非推广', pending: '待发布', awaiting_promotion: '推广待开始',
  testing: '推广测试中', test_pending: '测试待定', scaling: '推广中',
  promotion_paused: '推广暂停', test_discarded: '测试淘汰',
  formal_discarded: '放量淘汰', ended: '推广结束',
};
export const pauseEnd = pause => new Date(Math.min(new Date(pause.endsAt).getTime(), pause.resumedAt ? new Date(pause.resumedAt).getTime() : Infinity));
export const pauseIsActive = (pause, now = new Date()) => new Date(pause.startsAt) <= now && now < pauseEnd(pause);
export function fullPauseRange(pause) {
  const start = new Date(pause.startsAt);
  const startKey = shanghaiDateKey(start);
  const startedOn = start.getTime() === new Date(`${startKey}T00:00:00+08:00`).getTime() ? startKey : nextDateKey(startKey);
  const endedOn = previousDateKey(shanghaiDateKey(pauseEnd(pause)));
  return startedOn <= endedOn ? { startedOn, endedOn } : null;
}
export function effectivePromotionStatus(status, stage, campaignId, context, now = new Date()) {
  if (['none','pending','awaiting_promotion'].includes(status)) return status;
  const campaign = context.campaigns?.find(c => c.id === campaignId);
  if (campaign && context.waitRanges?.some(range => range.campaignId === campaignId)) {
    const state = promotionStateOn(campaign, context, shanghaiDateKey(now));
    if (state) { status = state.currentStatus; stage = state.currentStage; }
  }
  if (['testing','scaling'].includes(status) && context.pauses.some(pause => pauseIsActive(pause, now) && (
    context.targets.some(target => target.campaignId === campaignId && target.pauseId === pause.id)
    || (context.waitRanges ?? []).some(r => r.campaignId === campaignId && r.nextEffectiveOn && r.nextEffectiveOn >= shanghaiDateKey(new Date(pause.startsAt)) && r.nextEffectiveOn <= shanghaiDateKey(now) && ['test_continue','start_scaling','scaling_continue'].includes(r.nextDecision))
  ))) return 'promotion_paused';
  return status === 'waiting_action' ? (stage === 'testing' ? 'test_pending' : 'promotion_paused') : status;
}
export function campaignPauseWindows(campaign, context) {
  return context.pauses.filter(pause => context.targets.some(target => target.pauseId === pause.id && target.campaignId === campaign.id)
    || (campaign.currentStatus === 'waiting_action' && campaign.startedOn <= shanghaiDateKey(new Date(pause.startsAt)))
    || (context.waitRanges ?? []).some(r => r.campaignId === campaign.id && r.nextEffectiveOn && r.nextEffectiveOn >= shanghaiDateKey(new Date(pause.startsAt)) && new Date(`${r.nextEffectiveOn}T00:00:00+08:00`) < pauseEnd(pause)))
    .flatMap(pause => { const range = fullPauseRange(pause); return range ? [range] : []; });
}
export function campaignWaitWindows(campaign, context) {
  return (context.waitRanges ?? []).filter(r => r.campaignId === campaign.id && (!campaign.endedOn || r.startedOn <= campaign.endedOn)).map(r => ({ startedOn: r.startedOn, endedOn: r.nextEffectiveOn ? previousDateKey(r.nextEffectiveOn) : '9999-12-31' }));
}
export function promotionStateOn(campaign, context, date = shanghaiDateKey(new Date())) {
  const metrics = (context.metrics ?? []).filter(m => m.campaignId === campaign.id && m.metricDate < date);
  const state = replayPromotionHistory(campaign.startedOn, metrics, { ...promotionReplayOptions(campaign, context), asOf: date });
  // 改帖或改用途也可能受控结束活动；这些明确关闭事实不要求伪造一条日度决定。
  if (state && campaign.endedOn && campaign.endedOn < date && ['ended','test_discarded','formal_discarded'].includes(campaign.currentStatus)) {
    const stages = state.stages.filter(s => s.startedOn <= campaign.endedOn).map(s => ({ ...s, endedOn: !s.endedOn || s.endedOn > campaign.endedOn ? campaign.endedOn : s.endedOn }));
    if (stages.length) stages.at(-1).outcome = campaign.currentStatus;
    return { ...state, stages, currentStatus: campaign.currentStatus, currentStage: null, endedOn: campaign.endedOn };
  }
  return state;
}
export const dateInWindows = (date, windows) => windows.some(window => window.startedOn <= date && date <= window.endedOn);
export function nextReviewDate(latestDate, startedOn, windows = []) {
  let date = latestDate ? nextDateKey(latestDate) : startedOn;
  while (dateInWindows(date, windows)) {
    const end = windows.filter(window => window.startedOn <= date && date <= window.endedOn).reduce((end, window) => window.endedOn > end ? window.endedOn : end, date);
    if (end === '9999-12-31') return end;
    date = nextDateKey(end);
  }
  return date;
}
export function countPromotionDays(startedOn, endedOn, windows = []) {
  let count = 0;
  for (let date = startedOn; date <= endedOn; date = nextDateKey(date)) if (!dateInWindows(date, windows)) count++;
  return count;
}
export function waitingPromotionDays(campaign, context, waitingDates, from, to) {
  const end = campaign.endedOn && campaign.endedOn < to ? campaign.endedOn : to;
  const dates = new Set(waitingDates.filter(date => date >= from && date <= end));
  const windows = [...campaignPauseWindows(campaign, context), ...campaignWaitWindows(campaign, context), ...context.holds.filter(hold => hold.campaignId === campaign.id)];
  for (const window of windows) {
    const start = [window.startedOn, campaign.startedOn, from].sort().at(-1);
    const stop = window.endedOn < end ? window.endedOn : end;
    for (let date = start; date <= stop; date = nextDateKey(date)) dates.add(date);
  }
  return dates.size;
}
export function promotionReplayOptions(campaign, context) {
  return { initialStage: campaign.initialStage ?? 'testing', waitRanges: (context.waitRanges ?? []).filter(r => r.campaignId === campaign.id), holds: [
    ...context.holds.filter(hold => hold.campaignId === campaign.id),
    ...context.pauses.filter(pause => context.targets.some(target => target.pauseId === pause.id && target.campaignId === campaign.id)
      || (context.waitRanges ?? []).some(r => r.campaignId === campaign.id && r.nextEffectiveOn && r.nextEffectiveOn >= shanghaiDateKey(new Date(pause.startsAt)) && new Date(`${r.nextEffectiveOn}T00:00:00+08:00`) < pauseEnd(pause)))
      .flatMap(pause => { const range = fullPauseRange(pause); return range ? [{ ...range, preserveWaiting: true }] : []; }),
  ] };
}
