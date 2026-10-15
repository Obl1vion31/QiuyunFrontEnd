/** 排期、日度、历史共用的推广状态与整日暂停规则；日期均为上海时间。 */
import { nextDateKey, previousDateKey, shanghaiDateKey } from './promotion-rules.mjs';

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
  if (['testing','scaling'].includes(status) && context.targets.some(target => target.campaignId === campaignId
    && context.pauses.some(pause => pause.id === target.pauseId && pauseIsActive(pause, now)))) return 'promotion_paused';
  return status === 'waiting_action' ? (stage === 'testing' ? 'test_pending' : 'promotion_paused') : status;
}
export function campaignPauseWindows(campaign, context) {
  return context.pauses.filter(pause => context.targets.some(target => target.pauseId === pause.id && target.campaignId === campaign.id)
    || (campaign.currentStatus === 'waiting_action' && campaign.startedOn <= shanghaiDateKey(new Date(pause.startsAt))))
    .flatMap(pause => { const range = fullPauseRange(pause); return range ? [range] : []; });
}
export const dateInWindows = (date, windows) => windows.some(window => window.startedOn <= date && date <= window.endedOn);
export function nextReviewDate(latestDate, startedOn, windows = []) {
  let date = latestDate ? nextDateKey(latestDate) : startedOn;
  while (dateInWindows(date, windows)) date = nextDateKey(windows.filter(window => window.startedOn <= date && date <= window.endedOn).reduce((end, window) => window.endedOn > end ? window.endedOn : end, date));
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
  const windows = [...campaignPauseWindows(campaign, context), ...context.holds.filter(hold => hold.campaignId === campaign.id)];
  for (const window of windows) {
    const start = [window.startedOn, campaign.startedOn, from].sort().at(-1);
    const stop = window.endedOn < end ? window.endedOn : end;
    for (let date = start; date <= stop; date = nextDateKey(date)) dates.add(date);
  }
  return dates.size;
}
export function promotionReplayOptions(campaign, context) {
  return { initialStage: campaign.initialStage ?? 'testing', holds: [
    ...context.holds.filter(hold => hold.campaignId === campaign.id),
    ...context.pauses.filter(pause => context.targets.some(target => target.pauseId === pause.id && target.campaignId === campaign.id))
      .flatMap(pause => { const range = fullPauseRange(pause); return range ? [{ ...range, preserveWaiting: true }] : []; }),
  ] };
}
