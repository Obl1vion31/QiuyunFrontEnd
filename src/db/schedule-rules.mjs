/** 延期按北京时间显示，以应发满 8 小时为第 1 天，此后每 24 小时增加一天。 */
export const delayThresholdMs = 8 * 60 * 60 * 1000;
export const delayDayMs = 24 * 60 * 60 * 1000;
export const isDelayed = (plannedAt, at) => at.getTime() - plannedAt.getTime() >= delayThresholdMs;
export const delayStartsAt = (plannedAt, effectiveAt = null) => new Date(Math.max(
  plannedAt.getTime() + delayThresholdMs, effectiveAt?.getTime() ?? Number.NEGATIVE_INFINITY,
));
export const delayDayCount = (plannedAt, through, effectiveAt = null) => Math.max(0,
  Math.floor((through.getTime() - delayStartsAt(plannedAt, effectiveAt).getTime()) / delayDayMs) + 1,
);
export const delayDays = (plannedAt, through, effectiveAt = null) => {
  const start = delayStartsAt(plannedAt, effectiveAt).getTime();
  return Array.from({ length: delayDayCount(plannedAt, through, effectiveAt) }, (_, index) => ({
    dayNumber: index + 1, dueAt: new Date(start + index * delayDayMs),
  }));
};
export const completionStatus = (plannedAt, actualAt) => !actualAt ? 'pending'
  : isDelayed(plannedAt, actualAt) ? 'delayed' : 'on_time';
