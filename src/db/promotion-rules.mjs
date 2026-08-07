export const promotionReviewDecisions = {
  testing: ['test_continue', 'test_discarded', 'start_scaling'],
  scaling: ['scaling_continue', 'formal_discarded', 'ended'],
};

export const shanghaiDateKey = (date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(date);

export const nextDateKey = (dateKey) => {
  const date = new Date(`${dateKey}T00:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + 1);
  return shanghaiDateKey(date);
};

export const nextPendingPromotionDate = (latestMetricDate, currentStageStartedOn) =>
  latestMetricDate ? nextDateKey(latestMetricDate) : currentStageStartedOn;

export const inclusivePromotionDays = (startedOn, endedOn) => {
  const start = new Date(`${startedOn}T00:00:00+08:00`).getTime();
  const end = new Date(`${endedOn}T00:00:00+08:00`).getTime();
  return Math.max(0, Math.round((end - start) / 86400000) + 1);
};

export const promotionStageShares = (days) => {
  const total = days.reduce((sum, value) => sum + Math.max(0, value), 0);
  return days.map((value) => total > 0 ? (Math.max(0, value) / total) * 100 : 0);
};

export const isDecisionAllowed = (stage, decision) =>
  promotionReviewDecisions[stage]?.includes(decision) ?? false;

export const nextPromotionState = (stage, decision) => {
  if (!isDecisionAllowed(stage, decision)) return null;
  if (decision === 'test_continue') return { status: 'testing', stage: 'testing', outcome: 'continued' };
  if (decision === 'start_scaling') return { status: 'scaling', stage: 'scaling', outcome: 'start_scaling' };
  if (decision === 'test_discarded') return { status: 'test_discarded', stage: null, outcome: 'test_discarded' };
  if (decision === 'scaling_continue') return { status: 'scaling', stage: 'scaling', outcome: 'scaling_continued' };
  if (decision === 'formal_discarded') return { status: 'formal_discarded', stage: null, outcome: 'formal_discarded' };
  return { status: 'ended', stage: null, outcome: 'ended' };
};

export const replayPromotionHistory = (campaignStartedOn, metrics) => {
  if (metrics.length === 0) return null;
  let currentStage = metrics[0].stageTypeSnapshot;
  let currentStatus = currentStage;
  let stageStartedOn = campaignStartedOn <= metrics[0].metricDate ? campaignStartedOn : metrics[0].metricDate;
  let endedOn = null;
  const stages = [];
  for (const metric of metrics) {
    if (!currentStage || metric.stageTypeSnapshot !== currentStage) return null;
    const next = nextPromotionState(currentStage, metric.reviewDecision);
    if (!next) return null;
    currentStatus = next.status;
    if (next.stage !== currentStage) {
      stages.push({ stageType: currentStage, startedOn: stageStartedOn, endedOn: metric.metricDate, outcome: next.outcome });
      currentStage = next.stage;
      if (currentStage) stageStartedOn = nextDateKey(metric.metricDate);
      else endedOn = metric.metricDate;
    }
  }
  if (currentStage) stages.push({ stageType: currentStage, startedOn: stageStartedOn, endedOn: null, outcome: null });
  return { stages, currentStage, currentStatus, endedOn };
};

const cost = (spend, count) => count > 0 ? Math.round((spend / count) * 100) / 100 : null;

export const calculateActualPromotionCosts = ({
  spend,
  actualOpenCount,
  actualLeadCount,
}) => ({
  actualOpenCost: cost(spend, actualOpenCount),
  actualLeadCost: cost(spend, actualLeadCount),
});
