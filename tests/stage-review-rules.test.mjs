import assert from 'node:assert/strict';
import test from 'node:test';
import { checkpointsForPublishDate, nextReviewCheckpoint, percentage, summarizeRates } from '../src/db/stage-review-rules.mjs';

test('creates 7 and 15 day checkpoints from the Shanghai publish date', () => {
  assert.deepEqual(checkpointsForPublishDate(new Date('2026-07-31T16:30:00.000Z')).map(({ type, dueOn }) => ({ type, dueOn })), [
    { type: 'day_7', dueOn: '2026-08-08' },
    { type: 'day_15', dueOn: '2026-08-16' },
  ]);
});

test('calculates percentages and cohort summaries without hiding outliers', () => {
  assert.equal(percentage(25, 200), 12.5);
  assert.equal(percentage(1, 0), null);
  assert.deepEqual(summarizeRates([10, 20, 90]), { count: 3, mean: 40, min: 10, max: 90, median: 20 });
});

test('returns an explicit empty cohort', () => {
  assert.deepEqual(summarizeRates([]), { count: 0, mean: null, min: null, max: null, median: null });
});

test('excludes posts before July and unlocks checkpoints in order', () => {
  assert.equal(nextReviewCheckpoint(new Date('2026-06-30T03:00:00.000Z'), [], '2026-08-30'), null);
  assert.equal(nextReviewCheckpoint(new Date('2026-07-01T03:00:00.000Z'), [], '2026-08-30')?.type, 'day_7');
  assert.equal(nextReviewCheckpoint(new Date('2026-07-01T03:00:00.000Z'), ['day_7'], '2026-08-30')?.type, 'day_15');
  assert.equal(nextReviewCheckpoint(new Date('2026-07-01T03:00:00.000Z'), ['day_7', 'day_15'], '2026-08-30'), null);
});
