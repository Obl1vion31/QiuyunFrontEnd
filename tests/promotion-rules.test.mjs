import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculatePromotionCosts,
  isDecisionAllowed,
  nextDateKey,
  nextPromotionState,
  shanghaiDateKey,
} from '../src/db/promotion-rules.mjs';

test('formats campaign dates in Asia/Shanghai', () => {
  assert.equal(shanghaiDateKey(new Date('2026-07-30T16:30:00.000Z')), '2026-07-31');
  assert.equal(nextDateKey('2026-07-31'), '2026-08-01');
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

test('calculates platform and actual costs independently', () => {
  assert.deepEqual(calculatePromotionCosts({
    spend: 100,
    platformOpenCount: 20,
    actualOpenCount: 10,
    platformLeadCount: 5,
    actualLeadCount: 0,
  }), {
    platformOpenCost: 5,
    actualOpenCost: 10,
    platformLeadCost: 20,
    actualLeadCost: null,
  });
});
