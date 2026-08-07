import assert from 'node:assert/strict';
import test from 'node:test';
import { automaticMeetingName, classifySchedule, sumPromotionMetrics } from '../src/db/meeting-review-rules.mjs';
import { readFile } from 'node:fs/promises';

test('周度复盘标题使用自选区间并支持跨月', () => {
  assert.equal(automaticMeetingName('2026-07-31', '2026-08-06'), '2026.07.31—08.06 周度业务复盘');
});

test('计划对齐沿用 12 小时延期阈值', () => {
  const planned = new Date('2026-08-01T10:00:00+08:00');
  assert.equal(classifySchedule(planned, null), 'unpublished');
  assert.equal(classifySchedule(planned, new Date('2026-08-01T22:00:00+08:00')), 'published');
  assert.equal(classifySchedule(planned, new Date('2026-08-01T22:00:01+08:00')), 'delayed');
});

test('推广区间从日度事实聚合实际成本', () => {
  assert.deepEqual(sumPromotionMetrics([
    { spend: '100', platformOpenCount: 4, actualOpenCount: 2, platformLeadCount: 2, actualLeadCount: 1 },
    { spend: '50', platformOpenCount: 3, actualOpenCount: 1, platformLeadCount: 1, actualLeadCount: 0 },
  ]), { days: 2, spend: 150, platformOpenCount: 7, actualOpenCount: 3, platformLeadCount: 3, actualLeadCount: 1, openCost: 50, leadCost: 150 });
});

test('会议草稿支持单条和批量删除，并在服务端保护已定稿会议', async () => {
  const collection = await readFile(new URL('../src/pages/api/meeting-reviews.ts', import.meta.url), 'utf8');
  const item = await readFile(new URL('../src/pages/api/meeting-reviews/[id].ts', import.meta.url), 'utf8');
  const page = await readFile(new URL('../src/pages/business/meeting-review.astro', import.meta.url), 'utf8');
  assert.match(collection, /export const DELETE/);
  assert.match(collection, /meetings\.some\(\(meeting\) => meeting\.status !== 'draft'\)/);
  assert.match(item, /eq\(operationsReviewMeeting\.status, 'draft'\)/);
  assert.match(page, /data-delete-selected/);
  assert.match(page, /data-delete-one/);
});
