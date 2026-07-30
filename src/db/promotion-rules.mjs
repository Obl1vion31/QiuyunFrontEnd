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

const cost = (spend, count) => count > 0 ? Math.round((spend / count) * 100) / 100 : null;

export const calculateActualPromotionCosts = ({
  spend,
  actualOpenCount,
  actualLeadCount,
}) => ({
  actualOpenCost: cost(spend, actualOpenCount),
  actualLeadCost: cost(spend, actualLeadCount),
});
