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

export const replayPromotionHistory = (campaignStartedOn, metrics, options = {}) => {
  if (metrics.length === 0 && !options.asOf) return null;
  let currentStage = options.initialStage ?? 'testing';
  let currentStatus = currentStage;
  let stageStartedOn = campaignStartedOn;
  let endedOn = null;
  const stages = [];
  const closeOpenStage = (end, outcome) => {
    if (!stageStartedOn) return;
    if (end >= stageStartedOn) stages.push({ stageType: currentStage, startedOn: stageStartedOn, endedOn: end, outcome });
    stageStartedOn = null;
  };
  const events = [
    ...(options.stateChanges ?? []).map(change => ({ date: change.businessDate, kind: 'actual', priority: 1.5, change })),
    ...(options.waitRanges ?? []).flatMap(range => [
      { date: range.startedOn, kind: 'wait', priority: 2, range },
      ...(range.nextDecision && range.nextEffectiveOn ? [{ date: range.nextEffectiveOn, kind: 'next', priority: 1, range }] : []),
    ]),
    ...(options.holds ?? []).flatMap((hold, index) => [
      { date: hold.startedOn, kind: 'holdStart', priority: 3, hold, index },
      { date: nextDateKey(hold.endedOn), kind: 'holdEnd', priority: 0, hold, index },
    ]),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.priority - b.priority);
  let eventIndex = 0;
  let rangeWaiting = false;
  const supersededRanges = new Set();
  const openHolds = new Set();
  const applyEvents = through => {
    while (events[eventIndex]?.date <= through) {
      const event = events[eventIndex++];
      if (event.kind === 'actual') {
        if (!currentStage) return false;
        if (currentStage === 'scaling' && event.change.stageType === 'testing') return false;
        closeOpenStage(previousDateKey(event.date), event.change.stageType !== currentStage ? 'start_scaling' : 'continued');
        currentStage = event.change.stageType;
        currentStatus = currentStage;
        stageStartedOn = openHolds.size ? null : event.date;
        rangeWaiting = false;
        continue;
      }
      if (event.kind === 'holdStart') {
        if (!currentStage) continue;
        closeOpenStage(previousDateKey(event.date), 'paused');
        openHolds.add(event.index);
        continue;
      }
      if (event.kind === 'holdEnd') {
        if (!openHolds.delete(event.index) || !currentStage) continue;
        if (!event.hold.preserveWaiting && !rangeWaiting) {
          const resumedStage = event.hold.resumeStage ?? currentStage;
          if (resumedStage !== currentStage) {
            const lastStage = stages.at(-1);
            if (lastStage?.outcome === 'paused') lastStage.outcome = 'start_scaling';
          }
          currentStage = resumedStage;
          currentStatus = currentStage;
        }
        if (!openHolds.size && !rangeWaiting && currentStatus !== 'waiting_action') stageStartedOn = event.date;
        continue;
      }
      if (supersededRanges.has(event.range)) continue;
      // 之后真实的淘汰／结束决定优先于此前预排的未来待定，不允许复活活动。
      if (!currentStage && event.kind === 'wait') { supersededRanges.add(event.range); continue; }
      if (!currentStage || event.range.stageType !== currentStage) return false;
      if (event.kind === 'wait') {
        closeOpenStage(previousDateKey(event.date), 'paused');
        currentStatus = 'waiting_action';
        rangeWaiting = true;
      } else {
        if (!rangeWaiting || currentStatus !== 'waiting_action') return false;
        const next = nextPromotionState(currentStage, event.range.nextDecision);
        if (!next || next.status === 'waiting_action') return false;
        const lastStage = stages.at(-1);
        if (lastStage?.outcome === 'paused' && next.outcome !== 'continued' && next.outcome !== 'scaling_continued') lastStage.outcome = next.outcome;
        currentStatus = next.status;
        currentStage = next.stage;
        stageStartedOn = currentStage && !openHolds.size ? event.date : null;
        endedOn = currentStage ? null : previousDateKey(event.date);
        rangeWaiting = false;
      }
    }
    return true;
  };
  for (const metric of metrics) {
    if (!applyEvents(metric.metricDate) || rangeWaiting || openHolds.size) return null;
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
  if (!applyEvents(options.asOf ?? nextDateKey(metrics.at(-1).metricDate))) return null;
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
