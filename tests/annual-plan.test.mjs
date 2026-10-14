import assert from 'node:assert/strict';
import test from 'node:test';
import { coverageSpans, deriveAnnualSummary, formatSlotRange, normalizeBlock, splitBlockSegments, overlappingBlockPairs } from '../src/db/annual-plan-rules.mjs';
const block = (startSlot, endSlot, promotionRanges = []) => ({ startSlot, endSlot, promotionRanges, label: '', note: '', sortOrder: 0 });

test('同月的前后半月可以相邻，实际重叠仍会被识别', () => {
  assert.deepEqual(overlappingBlockPairs([block(5, 17), block(18, 24)]), []);
  assert.deepEqual(overlappingBlockPairs([block(5, 17), block(17, 24)]), [[0, 1]]);
});
test('半月边界显示月初、月中和月末', () => {
  assert.equal(formatSlotRange(block(5, 17)), '3 月初—9 月中旬');
  assert.equal(formatSlotRange(block(20, 23)), '10 月中旬—12 月中旬');
  assert.equal(formatSlotRange(block(1, 24)), '1 月初—12 月末');
});
test('讲义周期保持连续，仅首月付费，其余观察', () => {
  assert.deepEqual(splitBlockSegments(block(5, 17, [{ startSlot: 5, endSlot: 6 }])), [
    { startSlot: 5, endSlot: 6, paid: true }, { startSlot: 7, endSlot: 17, paid: false },
  ]);
  assert.deepEqual(splitBlockSegments(block(20, 23)), [{ startSlot: 20, endSlot: 23, paid: false }]);
});
test('自定义付费区间允许多个独立阶段', () => {
  assert.deepEqual(splitBlockSegments(block(1, 8, [{ startSlot: 2, endSlot: 3 }, { startSlot: 7, endSlot: 8 }])), [
    { startSlot: 1, endSlot: 1, paid: false }, { startSlot: 2, endSlot: 3, paid: true }, { startSlot: 4, endSlot: 6, paid: false }, { startSlot: 7, endSlot: 8, paid: true },
  ]);
});
test('年度汇总仅计算付费子区间，并排除停用行', () => {
  assert.deepEqual(deriveAnnualSummary([
    { isActive: true, blocks: [block(5, 17, [{ startSlot: 5, endSlot: 6 }]), block(20, 23)] },
    { isActive: false, blocks: [block(1, 24, [{ startSlot: 1, endSlot: 24 }])] },
  ]), { postingSpans: [{ startSlot: 5, endSlot: 17, promotionRanges: [{ startSlot: 5, endSlot: 6 }] }, { startSlot: 20, endSlot: 23, promotionRanges: [] }], promotionSpans: [{ startSlot: 5, endSlot: 6 }] });
});
test('半月覆盖合并相邻格，保留真正空档', () => {
  assert.deepEqual(coverageSpans(new Set([1, 2, 3, 6, 23, 24])), [{ startSlot: 1, endSlot: 3 }, { startSlot: 6, endSlot: 6 }, { startSlot: 23, endSlot: 24 }]);
});
test('旧数量规则只在兼容读取时转换成文字，不改原对象', () => {
  const old = { startMonth: 3, endMonth: 6, label: '旧规划', note: null, ruleType: 'fixed', quantityParts: [3, 3, 3, 4], monthlyFrequency: null, sortOrder: 0 };
  assert.deepEqual(normalizeBlock(old), { startSlot: 5, endSlot: 12, label: '旧规划', note: '本周期共 13 篇', promotionRanges: [], sortOrder: 0 });
  assert.equal(old.note, null); assert.deepEqual(old.quantityParts, [3, 3, 3, 4]);
  assert.equal(normalizeBlock({ ...old, ruleType: null }).note, '待定');
  assert.equal(normalizeBlock({ ...old, note: '已有业务说明' }).note, '已有业务说明');
});
test('新备注包括空文本直接保留，不恢复问号或自动计算数量', () => {
  assert.equal(normalizeBlock({ ...block(5, 17), note: '每月至多两篇' }).note, '每月至多两篇');
  assert.equal(normalizeBlock(block(5, 17)).note, '');
  assert.deepEqual(deriveAnnualSummary([]), { postingSpans: [], promotionSpans: [] });
});
