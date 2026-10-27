/** 延期原因按运营岗位归属展示；self/external 保留存储兼容，编辑账号另行记录。 */
export const delayResponsibilityLabels = {self:'运营原因',external:'非运营原因',requester:'需求端原因',unknown:'未知'};

/** 新旧排期统一满 2 小时计为延期；保留旧调用参数兼容已归档入口。 */
export const delayThresholdMs = 2 * 60 * 60 * 1000;
export const delayDayMs = 24 * 60 * 60 * 1000;
export const isDelayed = (plannedAt, at, thresholdHours = 2) => at.getTime() - plannedAt.getTime() >= delayThresholdMs;
export const delayStartsAt = (plannedAt, effectiveAt = null, thresholdHours = 2) => new Date(Math.max(
  plannedAt.getTime() + delayThresholdMs, effectiveAt?.getTime() ?? Number.NEGATIVE_INFINITY,
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
/** 当前应发与实发的真实间隔，与“原因条数”分别表达。 */
export const publicationDelayLabel = (plannedAt, actualAt) => {
  if (!actualAt || !isDelayed(plannedAt, actualAt)) return '';
  const total = Math.floor((actualAt.getTime() - plannedAt.getTime()) / 60000);
  const days = Math.floor(total / 1440), hours = Math.floor(total % 1440 / 60), minutes = total % 60;
  return `较最新排期晚发布 ${days ? `${days} 天` : ''}${hours ? `${days ? ' ' : ''}${hours} 小时` : ''}${minutes ? `${days || hours ? ' ' : ''}${minutes} 分钟` : ''}`;
};
export const completionStatus = (plannedAt, actualAt, thresholdHours = 2) => !actualAt ? 'pending'
  : isDelayed(plannedAt, actualAt, thresholdHours) ? 'delayed' : 'on_time';
export const needsRegistration = (schedule, now) => !schedule.actualPublishAt && isDelayed(schedule.plannedPublishAt, now, 2);
export const registrationState = (schedule, now) => schedule.actualPublishAt ? 'registered' : needsRegistration(schedule, now) ? 'missing' : 'pending';
export const requiresPlanApproval = (schedule, now) => needsRegistration(schedule, now);
