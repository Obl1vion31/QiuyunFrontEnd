import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateActualPromotionCosts,
  inclusivePromotionDays,
  isDecisionAllowed,
  nextDateKey,
  nextPromotionState,
  shanghaiDateKey,
} from '../src/db/promotion-rules.mjs';

test('formats campaign dates in Asia/Shanghai', () => {
  assert.equal(shanghaiDateKey(new Date('2026-07-30T16:30:00.000Z')), '2026-07-31');
  assert.equal(nextDateKey('2026-07-31'), '2026-08-01');
});

test('counts promotion stage days inclusively across months', () => {
  assert.equal(inclusivePromotionDays('2026-07-26', '2026-07-28'), 3);
  assert.equal(inclusivePromotionDays('2026-07-29', '2026-08-02'), 5);
});

test('only allows decisions for the current stage', () => {
  assert.equal(isDecisionAllowed('testing', 'start_scaling'), true);
  assert.equal(isDecisionAllowed('testing', 'ended'), false);
  assert.deepEqual(nextPromotionState('testing', 'start_scaling'), {
    status: 'scaling',
    stage: 'scaling',
    outcome: 'start_scaling',
  });
  assert.deepEqual(nextPromotionState('scaling', 'formal_discarded'), {
    status: 'formal_discarded',
    stage: null,
    outcome: 'formal_discarded',
  });
});

test('calculates actual costs and returns null for a zero denominator', () => {
  assert.deepEqual(calculateActualPromotionCosts({
    spend: 100,
    actualOpenCount: 10,
    actualLeadCount: 0,
  }), {
    actualOpenCost: 10,
    actualLeadCost: null,
  });
});
