import { isDelayed } from './schedule-rules.mjs';
export const shanghaiKey = (value) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(value);

export const addDays = (key, days) => {
  const date = new Date(`${key}T00:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return shanghaiKey(date);
};

export const automaticMeetingName = (start, end) => {
  const [year, month, day] = start.split('-');
  const [, endMonth, endDay] = end.split('-');
  return `${year}.${month}.${day}—${endMonth}.${endDay} 周度业务复盘`;
};

export const sumPromotionMetrics = (metrics) => {
  const sum = (key) => metrics.reduce((total, row) => total + Number(row[key] ?? 0), 0);
  const spend = sum('spend');
  const actualOpenCount = sum('actualOpenCount');
  const actualLeadCount = sum('actualLeadCount');
  return {
    days: metrics.length,
    spend: Math.round(spend * 100) / 100,
    platformOpenCount: sum('platformOpenCount'),
    actualOpenCount,
    platformLeadCount: sum('platformLeadCount'),
    actualLeadCount,
    openCost: actualOpenCount ? Math.round((spend / actualOpenCount) * 100) / 100 : null,
    leadCost: actualLeadCount ? Math.round((spend / actualLeadCount) * 100) / 100 : null,
  };
};

export const classifySchedule = (plannedAt, actualAt, thresholdHours = 2) => {
  if (!actualAt) return 'unpublished';
  return isDelayed(plannedAt, actualAt, thresholdHours) ? 'delayed' : 'published';
};
