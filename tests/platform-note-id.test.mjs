import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('笔记 ID 归属帖子主体并由数据库保证格式与唯一性', async () => {
  const [schema, migration] = await Promise.all([read('src/db/schema.ts'), read('drizzle/0025_platform_note_id.sql')]);
  assert.match(schema, /operationsContent[\s\S]*platformNoteId: text\('platform_note_id'\)/);
  assert.match(migration, /\^\[0-9a-f\]\{24\}\$/);
  assert.match(migration, /CREATE UNIQUE INDEX/);
});

test('非推广表格使用实验日期、文档链接及共享同类指标单元格', async () => {
  const page = await read('src/pages/business/non-promotion-review.astro');
  for (const label of ['实验日期','笔记 ID','帖子','分类','节点','点击率','3 秒阅读率']) assert.match(page, new RegExp(label));
  assert.match(page, /projectDocUrl/);
  const cell = await read('src/components/MetricCell.astro');
  assert.match(page, /<MetricCell/);
  assert.match(cell, /同类均值/);
  assert.match(cell, /font-variant-numeric:tabular-nums/);
  assert.match(page, /<BusinessInspector/);
  assert.match(page, /focus-visible/);
});

test('首次录入和统一更正都受服务端约束', async () => {
  const [nonPromotion, awaiting, daily, correction] = await Promise.all([
    read('src/pages/api/non-promotion-reviews.ts'), read('src/pages/api/promotion-awaiting.ts'),
    read('src/pages/api/promotion-daily.ts'), read('src/pages/api/operations-content/[contentId]/platform-note-id.ts'),
  ]);
  assert.match(nonPromotion, /note-id-required/);
  assert.doesNotMatch(awaiting, /note-id-required/);
  assert.match(daily, /note-id-required/);
  assert.match(correction, /confirmSharedUpdate/);
  assert.match(correction, /23505/);
});

test('推广待办与历史保留帖子身份和首次补填笔记 ID', async () => {
  const page = await read('src/pages/business/daily-promotion-review.astro') + await read('src/components/BusinessPromotionDailyPosts.astro') + await read('src/components/BusinessPromotionMetricForm.astro') + await read('src/components/BusinessPromotionReviewRecord.astro');
  for (const marker of ['lifecycle-list','data-promotion-pending-body','data-review-day','history-workspace','BusinessPostReferences','data-note-id-required']) assert.match(page, new RegExp(marker));
});
