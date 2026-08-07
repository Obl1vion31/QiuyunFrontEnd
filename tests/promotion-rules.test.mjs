import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateActualPromotionCosts,
  inclusivePromotionDays,
  isDecisionAllowed,
  nextDateKey,
  nextPendingPromotionDate,
  nextPromotionState,
  promotionStageShares,
  replayPromotionHistory,
  shanghaiDateKey,
} from '../src/db/promotion-rules.mjs';

test('formats campaign dates in Asia/Shanghai', () => {
  assert.equal(shanghaiDateKey(new Date('2026-07-30T16:30:00.000Z')), '2026-07-31');
  assert.equal(nextDateKey('2026-07-31'), '2026-08-01');
});

test('starts pending review from the current stage when it has no daily metric', () => {
  assert.equal(nextPendingPromotionDate(undefined, '2026-07-05'), '2026-07-05');
  assert.equal(nextPendingPromotionDate('2026-07-06', '2026-07-05'), '2026-07-07');
});

test('counts promotion stage days inclusively across months', () => {
  assert.equal(inclusivePromotionDays('2026-07-26', '2026-07-28'), 3);
  assert.equal(inclusivePromotionDays('2026-07-29', '2026-08-02'), 5);
});

test('converts stage days into a full relative lifecycle', () => {
  assert.deepEqual(promotionStageShares([3, 2]), [60, 40]);
  assert.deepEqual(promotionStageShares([2]), [100]);
  assert.deepEqual(promotionStageShares([0, 0]), [0, 0]);
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

test('replays a corrected testing-to-scaling lifecycle', () => {
  assert.deepEqual(replayPromotionHistory('2026-07-23', [
    { metricDate: '2026-07-23', stageTypeSnapshot: 'testing', reviewDecision: 'test_continue' },
    { metricDate: '2026-07-26', stageTypeSnapshot: 'testing', reviewDecision: 'start_scaling' },
    { metricDate: '2026-07-27', stageTypeSnapshot: 'scaling', reviewDecision: 'scaling_continue' },
  ]), {
    stages: [
      { stageType: 'testing', startedOn: '2026-07-23', endedOn: '2026-07-26', outcome: 'start_scaling' },
      { stageType: 'scaling', startedOn: '2026-07-27', endedOn: null, outcome: null },
    ],
    currentStage: 'scaling',
    currentStatus: 'scaling',
    endedOn: null,
  });
});

test('replays a terminal correction and rejects a broken snapshot sequence', () => {
  const discarded = replayPromotionHistory('2026-07-14', [
    { metricDate: '2026-07-14', stageTypeSnapshot: 'testing', reviewDecision: 'test_continue' },
    { metricDate: '2026-07-17', stageTypeSnapshot: 'testing', reviewDecision: 'test_discarded' },
  ]);
  assert.equal(discarded.currentStatus, 'test_discarded');
  assert.equal(discarded.endedOn, '2026-07-17');
  assert.equal(replayPromotionHistory('2026-07-14', [
    { metricDate: '2026-07-14', stageTypeSnapshot: 'testing', reviewDecision: 'test_continue' },
    { metricDate: '2026-07-15', stageTypeSnapshot: 'scaling', reviewDecision: 'scaling_continue' },
  ]), null);
});
