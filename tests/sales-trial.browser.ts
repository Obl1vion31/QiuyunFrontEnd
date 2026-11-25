import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { provisionAccount } from '../src/auth/provision';
import { admin, employee, startFixture } from './auth.fixture';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE!);
const output = resolve(process.env.SALES_TRIAL_DIR ?? '.tools/test-artifacts/sales-trial');
const shots = resolve(output, 'screenshots');
await mkdir(shots, { recursive: true });
const fixture = await startFixture({ entry: '.tools/serve-vercel.mjs' });
const origin = fixture.baseURL;
const sales = origin + '/business/sales';
const other = { username: 'test_sales_other', password: 'fictional-second-admin-password', role: 'admin' as const };
const testName = '试用流程验证 A';
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', dateStyle: 'short' }).format(new Date());
const profile = resolve(output, 'profile-' + randomUUID());
const launch = () => chromium.launchPersistentContext(profile, {
  headless: true, executablePath: process.env.SALES_TRIAL_CHROMIUM,
  viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
});
let context: Awaited<ReturnType<typeof launch>> | undefined;
const errors: string[] = [];
const transmitted: string[] = [];
const track = (page: any) => {
  page.on('pageerror', (error: Error) => errors.push(error.message));
  page.on('request', (request: any) => {
    const bytes = decodeURIComponent(request.url()) + '\n' + (request.postData() ?? '');
    if (bytes.includes(testName) || request.url().includes('/business/sales') && request.method() !== 'GET') transmitted.push(request.url());
  });
};
const button = (scope: any, name: string) => scope.getByRole('button', { name, exact: true });
const link = (scope: any, name: string) => scope.getByRole('link', { name, exact: true });
const input = (scope: any, name: string) => scope.locator('[name="' + name + '"]');
const monthlyFacts = (snapshot: unknown) => JSON.stringify(snapshot, (key, value) =>
  key === 'generatedAt' || key === 'asOf' ? undefined : value);
const shot = async (page: any, name: string) => {
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: resolve(shots, name + '.png'), animations: 'disabled' });
};
const signIn = async (account: typeof admin | typeof employee | typeof other) => {
  assert.equal((await context!.request.post(origin + '/api/auth/sign-in/username', {
    headers: { Origin: origin }, data: account,
  })).status(), 200);
};
const signOut = async () => {
  assert.equal((await context!.request.post(origin + '/api/auth/sign-out', {
    headers: { Origin: origin }, data: {},
  })).status(), 200);
};
const registration = async (page: any, name: string) => {
  await button(page, '登记微信').click();
  const form = page.locator('#preview-create[open]');
  await input(form, 'name').fill(name);
  assert.equal(await input(form, 'addedDay').inputValue(), today);
  await input(form, 'addedTime').fill('10:30');
  await input(form, 'stage').selectOption('following');
  await input(form, 'need').selectOption('课程');
  await input(form, 'subject').fill('数学');
  await input(form, 'interest').fill('小班课');
  return form;
};

try {
  await provisionAccount(fixture.db, other);
  context = await launch();
  let page = context.pages()[0] ?? await context.newPage();
  track(page);
  const anonymous = await context.request.get(sales, { maxRedirects: 0 });
  assert.equal(anonymous.status(), 302);
  assert.match(anonymous.headers().location, /^\/login\?next=/);
  await signIn(employee);
  assert.equal((await context.request.get(sales, { maxRedirects: 0 })).status(), 403);
  const staff = await context.request.get(origin + '/business/workspaces', { maxRedirects: 0 });
  assert.equal(staff.headers().location, '/business/operations-schedule');
  await signOut();
  await signIn(admin);
  const monthUrl = origin + '/api/monthly-operations?month=' + today.slice(0, 7);
  const baseline = await context.request.get(monthUrl);
  assert.equal(baseline.status(), 200);
  const monthlyBefore = monthlyFacts(await baseline.json());
  await page.goto(origin + '/#systems-title');
  await link(page, '进入业务系统').click();
  await page.waitForURL('**/business/workspaces');
  const workspaces = page.getByRole('navigation', { name: '工作台' });
  await workspaces.getByRole('link', { name: /内容工作台/ }).waitFor();
  await shot(page, '01-workspace-choice-1440');
  await workspaces.getByRole('link', { name: /销售工作台/ }).click();
  await page.getByText('还没有客户', { exact: true }).waitFor();
  await shot(page, '02-empty-ledger-1440');
  const create = await registration(page, testName);
  await shot(page, '03-register-1440');
  await button(create, '保存登记').click();
  await button(page, testName).waitFor();
  await page.reload();
  const row = page.locator('[data-sales-rows] tr').filter({ has: button(page, testName) });
  await row.waitFor();
  await shot(page, '04-saved-ledger-1440');

  await input(page.locator('[data-sales-list-filter]'), 'q').fill(testName);
  await button(page.locator('[data-sales-list-filter]'), '查看').click();
  assert.equal(page.url(), sales);
  await row.waitFor();
  await button(row, '更新跟进').click();
  const follow = page.locator('#preview-follow[open]');
  await input(follow, 'stage').selectOption('closed');
  await button(follow, '保存跟进').click();
  await row.getByText('已结束', { exact: true }).waitFor();
  await button(row, '未成交，填写是否成交').click();
  const deal = page.locator('#preview-deal[open]');
  await deal.getByRole('radio', { name: '已成交', exact: true }).check();
  await input(deal, 'product').fill('小班课');
  await shot(page, '05-deal-1440');
  await button(deal, '保存').click();
  await button(row, '已成交，修改状态').waitFor();

  await link(page, '核对来源').click();
  const pending = page.locator('[data-sales-rows] tr').filter({ has: button(page, testName) });
  await button(pending, '查看').click();
  const inspector = page.locator('#sales-trial-inspector[open]');
  await button(inspector, '核对来源').click();
  const source = page.locator('#preview-source[open]');
  await input(source, 'postQuery').fill('b'.repeat(24));
  await button(source, '查找').click();
  await source.getByText('样例推广 · 讲义引流 · 放量中', { exact: true }).waitFor();
  await shot(page, '06-source-selection-1440');
  await button(source, '保存来源').click();
  await inspector.getByText('试用样例 · 讲义内容与用法', { exact: true }).waitFor();
  await button(inspector, '关闭详情').click();
  await link(page, '销售统计').click();
  await page.locator('.sales-stat-band strong').first().waitFor();
  assert.deepEqual(await page.locator('.sales-stat-band strong').allTextContents(), ['1', '1', '1']);
  await shot(page, '07-stats-1440');
  await page.getByRole('radio', { name: '按帖复盘', exact: true }).check();
  const promoted = page.getByRole('row').filter({ hasText: '试用样例 · 讲义内容与用法' });
  await promoted.waitFor();
  assert.deepEqual((await promoted.getByRole('cell').allTextContents()).slice(0, 3), ['1', '1', '1']);
  await shot(page, '08-post-results-1440');
  assert.equal(monthlyFacts(await (await context.request.get(monthUrl)).json()), monthlyBefore);

  await signOut();
  await signIn(other);
  await page.goto(sales);
  await page.getByText('还没有客户', { exact: true }).waitFor();
  assert.equal(await button(page, testName).count(), 0);
  await signOut();
  await signIn(admin);
  await context.close();
  context = await launch();
  page = context.pages()[0] ?? await context.newPage();
  track(page);
  await page.goto(sales);
  if (page.url().includes('/login')) { await signIn(admin); await page.goto(sales); }
  await button(page, testName).waitFor();
  await page.setViewportSize({ width: 1024, height: 820 });
  await shot(page, '09-reopened-ledger-1024');

  const alternate = await context.newPage();
  track(alternate);
  await alternate.goto(sales);
  const [draftA, draftB] = await Promise.all([
    registration(page, '并行验收 B'), registration(alternate, '并行验收 C'),
  ]);
  await Promise.all([button(draftA, '保存登记').click(), button(draftB, '保存登记').click()]);
  await button(page, '并行验收 B').waitFor();
  await button(alternate, '并行验收 C').waitFor();
  await page.reload();
  await button(page, '并行验收 B').waitFor();
  await button(page, '并行验收 C').waitFor();
  await alternate.close();

  await page.setViewportSize({ width: 390, height: 844 });
  await button(page, '登记微信').click();
  const phone = page.locator('#preview-create[open]');
  await shot(page, '10-registration-390');
  await button(phone, '关闭表单').click();
  await phone.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  assert.deepEqual(errors, []);
  assert.deepEqual(transmitted, []);
  console.log('正式运行包通过账号权限、流程、跨刷新和浏览器重开、同浏览器账号隔离、并行保存、月度运营隔离及三档截图检查。');
} finally {
  await context?.close();
  await fixture.stop();
}
