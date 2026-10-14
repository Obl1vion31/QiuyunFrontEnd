export const promotionReviewDecisions = {
  testing: ['test_continue', 'wait_continue', 'test_discarded', 'start_scaling'],
  scaling: ['scaling_continue', 'wait_continue', 'formal_discarded', 'ended'],
};

export const waitingReviewDecisions = {
  testing: ['wait_continue', 'test_continue', 'test_discarded', 'start_scaling'],
  scaling: ['wait_continue', 'scaling_continue', 'formal_discarded', 'ended'],
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

export const previousDateKey = (dateKey) => {
  const date = new Date(`${dateKey}T00:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() - 1);
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
  if (decision === 'wait_continue') return { status: 'waiting_action', stage, outcome: 'paused' };
  if (decision === 'test_continue') return { status: 'testing', stage: 'testing', outcome: 'continued' };
  if (decision === 'start_scaling') return { status: 'scaling', stage: 'scaling', outcome: 'start_scaling' };
  if (decision === 'test_discarded') return { status: 'test_discarded', stage: null, outcome: 'test_discarded' };
  if (decision === 'scaling_continue') return { status: 'scaling', stage: 'scaling', outcome: 'scaling_continued' };
  if (decision === 'formal_discarded') return { status: 'formal_discarded', stage: null, outcome: 'formal_discarded' };
  return { status: 'ended', stage: null, outcome: 'ended' };
};

export const replayPromotionHistory = (campaignStartedOn, metrics) => {
  if (metrics.length === 0) return null;
  let currentStage = 'testing';
  let currentStatus = 'testing';
  let stageStartedOn = campaignStartedOn;
  let endedOn = null;
  const stages = [];
  const closeOpenStage = (end, outcome) => {
    if (!stageStartedOn) return;
    if (end >= stageStartedOn) stages.push({ stageType: currentStage, startedOn: stageStartedOn, endedOn: end, outcome });
    stageStartedOn = null;
  };
  for (const metric of metrics) {
    if (!currentStage) return null;
    const dailyStatus = metric.dailyStatus ?? 'active';
    if (currentStatus !== 'waiting_action' && dailyStatus === 'waiting_action') {
      // Compatibility for waiting facts written before the next-day transition model.
      if (metric.stageTypeSnapshot !== currentStage || !['wait_continue', 'test_discarded', 'formal_discarded', 'ended'].includes(metric.reviewDecision)) return null;
      closeOpenStage(previousDateKey(metric.metricDate), 'paused');
      if (metric.reviewDecision === 'wait_continue') {
        currentStatus = 'waiting_action';
        continue;
      }
      const lastStage = stages.at(-1);
      if (lastStage?.stageType === currentStage && lastStage.outcome === 'paused') lastStage.outcome = metric.reviewDecision;
      currentStatus = metric.reviewDecision;
      currentStage = null;
      endedOn = metric.metricDate;
      continue;
    }
    if (currentStatus === 'waiting_action') {
      if (dailyStatus === 'active') {
        // Compatibility for an old waiting record that resumed on the current day.
        const canResume = metric.stageTypeSnapshot === currentStage
          || (currentStage === 'testing' && metric.stageTypeSnapshot === 'scaling');
        if (!canResume) return null;
        if (metric.stageTypeSnapshot === 'scaling' && currentStage === 'testing') {
          const lastStage = stages.at(-1);
          if (lastStage?.stageType === 'testing') lastStage.outcome = 'start_scaling';
          currentStage = 'scaling';
        }
        stageStartedOn = metric.metricDate;
      } else {
        if (dailyStatus !== 'waiting_action' || metric.stageTypeSnapshot !== currentStage || !waitingReviewDecisions[currentStage]?.includes(metric.reviewDecision)) return null;
        if (metric.reviewDecision === 'wait_continue') continue;
        if (metric.reviewDecision === 'test_discarded' || metric.reviewDecision === 'formal_discarded' || metric.reviewDecision === 'ended') {
          const lastStage = stages.at(-1);
          if (lastStage?.stageType === currentStage && lastStage.outcome === 'paused') lastStage.outcome = metric.reviewDecision;
          currentStatus = metric.reviewDecision;
          currentStage = null;
          endedOn = metric.metricDate;
          continue;
        }
        if (metric.reviewDecision === 'start_scaling') {
          const lastStage = stages.at(-1);
          if (lastStage?.stageType === 'testing') lastStage.outcome = 'start_scaling';
          currentStage = 'scaling';
        }
        currentStatus = currentStage;
        stageStartedOn = nextDateKey(metric.metricDate);
        continue;
      }
    }
    if (dailyStatus !== 'active') return null;
    if (metric.stageTypeSnapshot !== currentStage) return null;
    const next = nextPromotionState(currentStage, metric.reviewDecision);
    if (!next) return null;
    if (next.status === 'waiting_action') {
      closeOpenStage(metric.metricDate, 'paused');
      currentStatus = 'waiting_action';
      continue;
    }
    currentStatus = next.status;
    if (next.stage !== currentStage) {
      closeOpenStage(metric.metricDate, next.outcome);
      currentStage = next.stage;
      if (currentStage) stageStartedOn = nextDateKey(metric.metricDate);
      else endedOn = metric.metricDate;
    }
  }
  if (currentStage && stageStartedOn) stages.push({ stageType: currentStage, startedOn: stageStartedOn, endedOn: null, outcome: null });
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
