export function overlappingBlockPairs(blocks) {
  const pairs = [];
  for (let left = 0; left < blocks.length; left += 1) {
    for (let right = left + 1; right < blocks.length; right += 1) {
      const overlaps = blocks[left].startMonth <= blocks[right].endMonth
        && blocks[right].startMonth <= blocks[left].endMonth;
      if (overlaps) pairs.push([left, right]);
    }
  }
  return pairs;
}

export function formatBlockRule(block) {
  if (block.ruleType === 'flexible') {
    return `${block.monthlyFrequency}×${block.endMonth - block.startMonth + 1}`;
  }
  if (block.ruleType === 'fixed') return block.quantityParts.join('+');
  return '';
}

export function coverageSpans(months) {
  const spans = [];
  let start = null;
  for (let month = 1; month <= 13; month += 1) {
    const covered = month <= 12 && months.has(month);
    if (covered && start == null) start = month;
    if (!covered && start != null) {
      spans.push({ startMonth: start, endMonth: month - 1 });
      start = null;
    }
  }
  return spans;
}

export function deriveAnnualSummary(rows) {
  const postingMonths = new Set();
  const promotionMonths = new Set();
  for (const row of rows) {
    if (!row.isActive) continue;
    for (const block of row.blocks) {
      for (let month = block.startMonth; month <= block.endMonth; month += 1) {
        postingMonths.add(month);
        if (row.countsTowardPromotion) promotionMonths.add(month);
      }
    }
  }
  return {
    postingSpans: coverageSpans(postingMonths),
    promotionSpans: coverageSpans(promotionMonths),
  };
}
