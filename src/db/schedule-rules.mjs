/** 新排期满 2 小时开始逐日计时；历史记录读取保存的门槛。 */
export const delayThresholdMs = 2 * 60 * 60 * 1000;
export const delayDayMs = 24 * 60 * 60 * 1000;
export const isDelayed = (plannedAt, at, thresholdHours = 2) => at.getTime() - plannedAt.getTime() >= thresholdHours * 3600000;
export const delayStartsAt = (plannedAt, effectiveAt = null, thresholdHours = 2) => new Date(Math.max(
  plannedAt.getTime() + thresholdHours * 3600000, effectiveAt?.getTime() ?? Number.NEGATIVE_INFINITY,
));
export const delayDayCount = (plannedAt, through, effectiveAt = null, thresholdHours = 2) => Math.max(0,
  Math.floor((through.getTime() - delayStartsAt(plannedAt, effectiveAt, thresholdHours).getTime()) / delayDayMs) + 1,
);
export const delayDays = (plannedAt, through, effectiveAt = null, thresholdHours = 2) => {
  const start = delayStartsAt(plannedAt, effectiveAt, thresholdHours).getTime();
  return Array.from({ length: delayDayCount(plannedAt, through, effectiveAt, thresholdHours) }, (_, index) => ({
    dayNumber: index + 1, dueAt: new Date(start + index * delayDayMs),
  }));
};
export const completionStatus = (plannedAt, actualAt, thresholdHours = 2) => !actualAt ? 'pending'
  : isDelayed(plannedAt, actualAt, thresholdHours) ? 'delayed' : 'on_time';
export const needsRegistration = (schedule, now) => !schedule.actualPublishAt && isDelayed(schedule.plannedPublishAt, now, 2);
export const registrationState = (schedule, now) => schedule.actualPublishAt ? 'registered' : needsRegistration(schedule, now) ? 'missing' : 'pending';
export const requiresPlanApproval = (schedule, now) => needsRegistration(schedule, now);
