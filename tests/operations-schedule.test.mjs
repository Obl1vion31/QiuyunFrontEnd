import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pageUrl = new URL('../src/pages/business/operations-schedule.astro', import.meta.url);
const endpointUrl = new URL('../src/pages/api/operations-content/[id].ts', import.meta.url);
const periodNavUrl = new URL('../src/components/BusinessToolbarPeriodNav.astro', import.meta.url);

test('排期支持直接选择跨年月份并保留当前视角', async () => {
  const [page, periodNav] = await Promise.all([
    readFile(pageUrl, 'utf8'),
    readFile(periodNavUrl, 'utf8'),
  ]);

  assert.match(periodNav, /type="month"/);
  assert.match(periodNav, /onchange="this\.form\.requestSubmit\(\)"/);
  assert.match(periodNav, /monthPicker\.preservedParams/);
  assert.match(page, /filter\(\(\[name\]\) => name !== 'month'\)/);
  assert.match(page, /label: '选择要查看的排期年月'/);
  assert.match(page, /class="mobile-period-nav"/);
});

test('排期月份参数只接受有效年月', async () => {
  const page = await readFile(pageUrl, 'utf8');
  assert.match(page, /\^\(\\d\{4\}\)-\(\\d\{2\}\)\$/);
  assert.match(page, /requestedMonthNumber >= 1/);
  assert.match(page, /requestedMonthNumber <= 12/);
  assert.match(page, /min: '2000-01'/);
  assert.match(page, /max: '2099-12'/);
});

test('删除移入 Inspector，实发登记保持唯一主动作', async () => {
  const page = await readFile(pageUrl, 'utf8');
  assert.doesNotMatch(page, /<th>操作<\/th>/);
  assert.match(page, /data-inspector-delete data-admin-only>删除这条排期/);
  assert.match(page, /data-inspector-publication>发布登记/);
  assert.match(page, /class="business-action-primary"/);
  assert.doesNotMatch(page, /class="row-menu"/);
  assert.doesNotMatch(page, /data-edit-id=/);
  assert.doesNotMatch(page, /data-revise-id=/);
  assert.match(page, /data-inspector-edit/);
  assert.match(page, /data-inspector-revise/);
});

test('实发登记使用独立接口且项目文档只在登记时必填', async () => {
  const [page, validation, publication] = await Promise.all([
    readFile(pageUrl, 'utf8'),
    readFile(new URL('../src/db/validation.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/api/operations-content/[id]/publication.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(page, /项目文档链接（选填）/);
  assert.match(page, /id="publicationProjectDocUrl"[\s\S]*required/);
  assert.match(validation, /export const publicationSchema/);
  assert.match(publication, /export const PATCH: APIRoute/);
  assert.match(publication, /confirmPromotionReset/);
});

test('删除接口保护版本链、推广和复盘数据并清理独立 V0', async () => {
  const endpoint = await readFile(endpointUrl, 'utf8');
  assert.match(endpoint, /export const DELETE: APIRoute/);
  assert.match(endpoint, /\.for\('update'\)/);
  assert.match(endpoint, /blockers\.versions \|\| blockers\.campaigns \|\| blockers\.performanceMetrics \|\| blockers\.reviews \|\| blockers\.usageEvents/);
  assert.match(endpoint, /delete\(operationsContentSchedule\)/);
  assert.match(endpoint, /delete\(operationsContentVersion\)/);
  assert.match(endpoint, /delete\(operationsContent\)/);
  assert.match(endpoint, /status: 409/);
});
