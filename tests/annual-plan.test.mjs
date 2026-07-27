import assert from 'node:assert/strict';
import test from 'node:test';
import {
  coverageSpans,
  deriveAnnualSummary,
  formatBlockRule,
  overlappingBlockPairs,
} from '../src/db/annual-plan-rules.mjs';

test('允许同一规划行拥有多个不连续时间块', () => {
  const blocks = [
    { startMonth: 3, endMonth: 7 },
    { startMonth: 11, endMonth: 12 },
  ];
  assert.deepEqual(overlappingBlockPairs(blocks), []);
});

test('相邻但不相交的时间块不会被判为重叠', () => {
  const blocks = [
    { startMonth: 1, endMonth: 3 },
    { startMonth: 4, endMonth: 6 },
  ];
  assert.deepEqual(overlappingBlockPairs(blocks), []);
});

test('单月和跨月时间块发生相交时返回对应位置', () => {
  const blocks = [
    { startMonth: 3, endMonth: 7 },
    { startMonth: 5, endMonth: 5 },
    { startMonth: 11, endMonth: 12 },
  ];
  assert.deepEqual(overlappingBlockPairs(blocks), [[0, 1]]);
});

test('弹性频次按月频次和时间块长度展示', () => {
  assert.equal(formatBlockRule({
    startMonth: 3,
    endMonth: 7,
    ruleType: 'flexible',
    monthlyFrequency: 2,
    quantityParts: null,
  }), '2×5');
});

test('硬性组合保持各数量的顺序', () => {
  assert.equal(formatBlockRule({
    startMonth: 8,
    endMonth: 8,
    ruleType: 'fixed',
    monthlyFrequency: null,
    quantityParts: [3, 3, 4],
  }), '3+3+4');
});

test('月份覆盖会合并为连续区间并保留断点', () => {
  assert.deepEqual(coverageSpans(new Set([1, 2, 3, 6, 11, 12])), [
    { startMonth: 1, endMonth: 3 },
    { startMonth: 6, endMonth: 6 },
    { startMonth: 11, endMonth: 12 },
  ]);
});

test('年度汇总排除停用行并独立计算推广周期', () => {
  assert.deepEqual(deriveAnnualSummary([
    {
      isActive: true,
      countsTowardPromotion: false,
      blocks: [{ startMonth: 1, endMonth: 2 }],
    },
    {
      isActive: true,
      countsTowardPromotion: true,
      blocks: [{ startMonth: 3, endMonth: 5 }],
    },
    {
      isActive: false,
      countsTowardPromotion: true,
      blocks: [{ startMonth: 8, endMonth: 12 }],
    },
  ]), {
    postingSpans: [{ startMonth: 1, endMonth: 5 }],
    promotionSpans: [{ startMonth: 3, endMonth: 5 }],
  });
});

test('没有细致规划时年度汇总为空', () => {
  assert.deepEqual(deriveAnnualSummary([]), {
    postingSpans: [],
    promotionSpans: [],
  });
});
