/** 半月格：奇数为上半月，偶数为下半月；所有区间均包含两端。 */
export function overlappingBlockPairs(blocks) {
  const pairs = [];
  for (let left = 0; left < blocks.length; left++) {
    for (let right = left + 1; right < blocks.length; right++) {
      if (blocks[left].startSlot <= blocks[right].endSlot && blocks[right].startSlot <= blocks[left].endSlot) pairs.push([left, right]);
    }
  }
  return pairs;
}

export function coverageSpans(slots) {
  const spans = [];
  let start = null;
  for (let slot = 1; slot <= 25; slot++) {
    const covered = slot <= 24 && slots.has(slot);
    if (covered && start == null) start = slot;
    if (!covered && start != null) { spans.push({ startSlot: start, endSlot: slot - 1 }); start = null; }
  }
  return spans;
}

export function formatSlotRange(range) {
  const start = `${Math.ceil(range.startSlot / 2)} 月${range.startSlot % 2 ? '初' : '中旬'}`;
  const end = `${Math.ceil(range.endSlot / 2)} 月${range.endSlot % 2 ? '中旬' : '末'}`;
  return `${start}—${end}`;
}

/** 只用于读取旧记录/快照，原始历史内容不改写。 */
export function legacyBlockNote(block) {
  const meaningful = block.note?.trim();
  if (meaningful && !/^原表(?:跨全年分段标注|标注)/.test(meaningful)) return meaningful;
  if (block.ruleType === 'flexible') return `每月 ${block.monthlyFrequency} 篇`;
  if (block.ruleType === 'fixed') return `本周期共 ${(block.quantityParts ?? []).reduce((sum, value) => sum + value, 0)} 篇`;
  return '待定';
}

export function normalizeBlock(block, promoted = false) {
  const startSlot = block.startSlot ?? block.startMonth * 2 - 1;
  const endSlot = block.endSlot ?? block.endMonth * 2;
  const modern = block.startSlot != null && block.endSlot != null && block.promotionRanges != null;
  return {
    startSlot, endSlot, label: block.label ?? '',
    note: modern ? (block.note ?? '') : legacyBlockNote(block),
    promotionRanges: modern ? block.promotionRanges.map(range => ({ ...range })) : promoted ? [{ startSlot, endSlot }] : [],
    sortOrder: block.sortOrder ?? 0,
  };
}

export function normalizeSnapshot(snapshot) {
  return { ...snapshot, schemaVersion: 4, blocks: snapshot.blocks.map(block => normalizeBlock(block, snapshot.row.countsTowardPromotion ?? false)) };
}

export function splitBlockSegments(block) {
  const segments = [];
  for (let slot = block.startSlot; slot <= block.endSlot; slot++) {
    const paid = block.promotionRanges.some(range => range.startSlot <= slot && slot <= range.endSlot);
    const last = segments.at(-1);
    if (last?.paid === paid) last.endSlot = slot;
    else segments.push({ startSlot: slot, endSlot: slot, paid });
  }
  return segments;
}

export function blockBackground(block) {
  const length = block.endSlot - block.startSlot + 1;
  return `linear-gradient(to right, ${splitBlockSegments(block).map(segment => {
    const color = segment.paid ? 'var(--plan-paid)' : 'var(--plan-organic)';
    return `${color} ${(segment.startSlot - block.startSlot) / length * 100}% ${(segment.endSlot - block.startSlot + 1) / length * 100}%`;
  }).join(', ')})`;
}

export function blockPromotionLabel(block) {
  const segments = splitBlockSegments(block);
  if (!segments.some(segment => segment.paid)) return '自然流／观察';
  return segments.every(segment => segment.paid) ? '全程付费推广' : '部分付费推广';
}

export function deriveAnnualSummary(rows) {
  const flow = new Set(); const paid = new Set();
  for (const row of rows) {
    if (!row.isActive) continue;
    for (const block of row.blocks) {
      for (let slot = block.startSlot; slot <= block.endSlot; slot++) flow.add(slot);
      for (const range of block.promotionRanges) for (let slot = range.startSlot; slot <= range.endSlot; slot++) paid.add(slot);
    }
  }
  const promotionSpans = coverageSpans(paid);
  return {
    postingSpans: coverageSpans(flow).map(span => ({ ...span, promotionRanges: promotionSpans.map(range => ({ startSlot: Math.max(range.startSlot, span.startSlot), endSlot: Math.min(range.endSlot, span.endSlot) })).filter(range => range.startSlot <= range.endSlot) })),
    promotionSpans,
  };
}
