export const reviewCheckpoints = [
  { type: 'day_7', days: 7, label: '7 天' },
  { type: 'day_15', days: 15, label: '15 天' },
];
export const nonPromotionReviewStart = '2026-07-01';

export const shanghaiDateKey = (value) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(value);

export const addDays = (dateKey, days) => {
  const value = new Date(`${dateKey}T00:00:00+08:00`);
  value.setUTCDate(value.getUTCDate() + days);
  return shanghaiDateKey(value);
};

export const checkpointsForPublishDate = (actualPublishAt) => {
  const publishedOn = shanghaiDateKey(actualPublishAt);
  return reviewCheckpoints.map((checkpoint) => ({
    ...checkpoint,
    publishedOn,
    dueOn: addDays(publishedOn, checkpoint.days),
  }));
};

export const nextReviewCheckpoint = (actualPublishAt, completedTypes, todayKey) => {
  const checkpoints = checkpointsForPublishDate(actualPublishAt);
  if (checkpoints[0].publishedOn < nonPromotionReviewStart) return null;
  return checkpoints.find((checkpoint) => !completedTypes.includes(checkpoint.type) && checkpoint.dueOn <= todayKey) ?? null;
};

export const percentage = (numerator, denominator) => denominator > 0
  ? Math.round((numerator / denominator) * 10000) / 100
  : null;

export const summarizeRates = (values) => {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return { count: 0, mean: null, min: null, max: null, median: null };
  const sorted = [...valid].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return {
    count: sorted.length,
    mean: Math.round((sorted.reduce((sum, value) => sum + value, 0) / sorted.length) * 100) / 100,
    min: sorted[0],
    max: sorted.at(-1),
    median: Math.round(median * 100) / 100,
  };
};
