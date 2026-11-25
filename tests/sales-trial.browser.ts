import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
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
const testWechat = 'wx_trial_a';
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', dateStyle: 'short' }).format(new Date());
const profile = resolve(output, 'profile-' + randomUUID());
const launch = () => chromium.launchPersistentContext(profile, {
  headless: true, executablePath: process.env.SALES_TRIAL_CHROMIUM,
  viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
  ...(process.env.SALES_TRIAL_RECORD === '1' ? { recordVideo: { dir: resolve(output, 'video'), size: { width: 1440, height: 1000 } } } : {}),
});
let context: Awaited<ReturnType<typeof launch>> | undefined;
const errors: string[] = [];
const transmitted: string[] = [];
const track = (page: any) => {
  page.on('pageerror', (error: Error) => errors.push(error.message));
  page.on('request', (request: any) => {
    const bytes = decodeURIComponent(request.url()) + '\n' + (request.postData() ?? '');
    if (bytes.includes(testName) || bytes.includes(testWechat) || request.url().includes('/business/sales') && request.method() !== 'GET') transmitted.push(request.url());
  });
};
const button = (scope: any, name: string) => scope.getByRole('button', { name, exact: true });
const link = (scope: any, name: string) => scope.getByRole('link', { name, exact: true });
const input = (scope: any, name: string) => scope.locator('[name="' + name + '"]');
const monthlyFacts = (snapshot: unknown) => JSON.stringify(snapshot, (key, value) =>
  key === 'generatedAt' || key === 'asOf' ? undefined : value);
const shot = async (page: any, name: string, directory = shots) => {
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: resolve(directory, name + '.png'), animations: 'disabled' });
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
const registration = async (page: any, name: string, wechatId = 'wx_' + randomUUID().slice(0, 8)) => {
  await button(page, '登记微信').click();
  const form = page.locator('#preview-create[open]');
  await input(form, 'name').fill(name);
  await input(form, 'wechatId').fill(wechatId);
  assert.equal(await input(form, 'addedDay').inputValue(), today);
  await input(form, 'addedTime').fill('10:30');
  assert.equal(await input(form, 'stage').count(), 0);
  await input(form, 'need').selectOption('课程');
  await input(form, 'subject').selectOption('TMUA');
  await input(form, 'interest').fill('小班 123');
  return form;
};

try {
  await provisionAccount(fixture.db, other);
  context = await launch();
  let page = context.pages()[0] ?? await context.newPage();
  const video = page.video();
  const timingOrigin = Date.now();
  let sourceStart = 0;
  let sourceEnd = 0;
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
  const create = await registration(page, testName, '');
  await button(create, '保存登记').click();
  assert.equal(await create.count(), 1);
  assert.equal(await button(page, testName).count(), 0);
  await input(create, 'wechatId').fill(testWechat);
  assert.deepEqual(await input(create, 'subject').locator('option').allTextContents(), ['待确认', 'TMUA', '面试课', 'ESAT', 'STEP']);
  await shot(page, '03-register-1440');
  await button(create, '保存登记').click();
  await button(page, testName).waitFor();
  await page.reload();
  const row = page.locator('[data-sales-rows] tr').filter({ has: button(page, testName) });
  await row.waitFor();
  assert.equal(await row.locator('.sales-time').innerText(), today + ' 10:30');
  assert.equal(await row.locator('.sales-consultation-line').innerText(), '课程 · TMUA · 小班 123');
  await row.getByText('待跟进', { exact: true }).waitFor();
  await shot(page, '04-saved-ledger-1440');

  await page.evaluate(() => { Reflect.set(window, 'salesRouterTest', true); });
  await page.route((url: URL) => url.searchParams.get('view') === 'monthly', async (route: any) => {
    await new Promise(resolve => setTimeout(resolve, 1200));
    await route.continue();
  }, { times: 1 });
  await link(page, '销售统计').click();
  await page.locator('[data-navigation-loading]:not([hidden])').waitFor({ state: 'visible' });
  await shot(page, '11-shared-navigation-loading-1440');
  await page.locator('.sales-stat-band strong').first().waitFor();
  assert.deepEqual(await page.locator('.sales-stat-band strong').allTextContents(), ['1', '0', '0']);
  assert.ok(await page.locator('.business-toolbar [data-preview-stat-switch]').count());
  assert.ok(await page.locator('.business-toolbar [data-sales-month]').count());
  assert.ok(await page.evaluate(() => Reflect.get(window, 'salesRouterTest')));
  await link(page, '销售台账').click();
  await row.waitFor();
  await input(page.locator('[data-sales-list-filter]'), 'q').fill(testWechat);
  await button(page.locator('[data-sales-list-filter]'), '查看').click();
  assert.equal(page.url(), sales);
  await row.waitFor();
  await button(row, '更新跟进').click();
  const follow = page.locator('#preview-follow[open]');
  await input(follow, 'stage').selectOption('closed');
  await button(follow, '新增咨询方向').click();
  const second = follow.locator('[data-direction]').nth(1);
  await input(second, 'need').selectOption('模考');
  await input(second, 'subject').selectOption('ESAT');
  await input(second, 'interest').fill('模考包');
  await shot(page, '12-multiple-directions-1440');
  await button(follow, '保存跟进').click();
  await row.getByText('已结束', { exact: true }).waitFor();
  assert.equal(await row.locator('.sales-consultation-line').innerText(), '课程 · TMUA · 小班 123 / 模考 · ESAT · 模考包');
  await button(row, '登记成交').click();
  const deal = page.locator('#preview-deal[open]');
  assert.equal(await deal.locator('input[type="radio"]').count(), 0);
  await input(deal, 'product').fill('小班课');
  await shot(page, '05-deal-1440');
  await button(deal, '保存').click();
  await button(row, '更正成交').waitFor();

  sourceStart = (Date.now() - timingOrigin) / 1000;
  await link(page, '核对来源').click();
  const pending = page.locator('[data-sales-rows] tr').filter({ hasText: testName });
  await button(pending, '核对来源').click();
  assert.equal(await page.locator('#sales-trial-inspector').count(), 0);
  const source = page.locator('#preview-source[open]');
  await input(source, 'sourceStatus').selectOption('other');
  await button(source, '保存来源').click();
  await source.getByText('请填写入口和具体来源。', { exact: true }).waitFor();
  assert.notEqual(await input(source, 'otherEntry').getAttribute('required'), null);
  assert.notEqual(await input(source, 'otherSource').getAttribute('required'), null);
  await input(source, 'otherEntry').fill('微信转介绍');
  await button(source, '保存来源').click();
  await source.getByText('请填写入口和具体来源。', { exact: true }).waitFor();
  await input(source, 'otherSource').fill('验收活动群');
  await shot(page, '13-source-other-1440');
  await button(source, '保存来源').click();
  await source.waitFor({ state: 'hidden' });
  const queueFilter = page.locator('[data-sales-list-filter]');
  await input(queueFilter, 'source').selectOption('all');
  await button(queueFilter, '查看').click();
  await button(pending, '更正来源').click();
  assert.equal(await input(source, 'otherSource').inputValue(), '验收活动群');
  await input(source, 'sourceStatus').selectOption('unknown');
  await shot(page, '14-source-unknown-1440');
  await button(source, '保存来源').click();
  await source.waitFor({ state: 'hidden' });
  await pending.getByText('无法确认来源帖', { exact: true }).waitFor();
  await button(pending, '更正来源').click();
  await input(source, 'sourceStatus').selectOption('confirmed');
  await input(source, 'postQuery').fill('b'.repeat(24));
  await button(source, '查找').click();
  await source.getByText('样例推广 · 讲义引流 · 放量中', { exact: true }).waitFor();
  await shot(page, '06-source-selection-1440');
  await button(source, '保存来源').click();
  await pending.getByText('试用样例 · 讲义内容与用法', { exact: true }).waitFor();
  sourceEnd = (Date.now() - timingOrigin) / 1000;
  await link(page, '销售统计').click();
  await page.locator('.sales-stat-band strong').first().waitFor();
  assert.deepEqual(await page.locator('.sales-stat-band strong').allTextContents(), ['1', '1', '1']);
  await shot(page, '07-stats-1440');
  await page.locator('[data-preview-stat-switch]').evaluate((node: HTMLElement) => { node.dataset.persistTest = 'yes'; });
  await page.getByRole('radio', { name: '按帖复盘', exact: true }).click();
  const promoted = page.getByRole('row').filter({ hasText: '试用样例 · 讲义内容与用法' });
  await promoted.waitFor();
  assert.equal(await page.locator('[data-preview-stat-switch]').getAttribute('data-persist-test'), 'yes');
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
  if (video) await writeFile(resolve(output, 'source-clip.json'), JSON.stringify({ video: await video.path(), start: sourceStart, end: sourceEnd }));
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

  // 在隔离账号下写入旧版结构，验证更新可以继续读取，没有微信号的档案可补填。
  const oldName = '旧版试填档案';
  await page.evaluate(async ({ name, date }: { name: string; date: string }) => {
    const key = JSON.parse(document.querySelector('#sales-trial-config')!.textContent!).account;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('qiuyun-sales-trial', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('accounts', 'readwrite');
        const table = transaction.objectStore('accounts');
        const read = table.get(key);
        read.onsuccess = () => {
          const workspace = read.result;
          workspace.rows.push({
            id: 'fixture-old-record', name, added: date + 'T08:30', need: '课程', subject: '旧版科目',
            interest: '旧版意向', stage: 'new', source: { status: 'pending' }, follows: [], payments: [], history: [],
          });
          table.put(workspace, key);
        };
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onabort = () => { db.close(); reject(transaction.error); };
      };
    });
  }, { name: oldName, date: today });
  await page.reload();
  const old = page.locator('[data-sales-rows] tr').filter({ has: button(page, oldName) });
  await old.getByText('课程 · 旧版科目 · 旧版意向', { exact: true }).waitFor();
  await button(old, '更新跟进').click();
  assert.equal(await input(page.locator('#preview-follow[open]'), 'subject').inputValue(), '旧版科目');
  await button(page.locator('#preview-follow[open]'), '关闭表单').click();
  await button(page, oldName).click();
  const detail = page.locator('#sales-trial-inspector[open]');
  await button(detail, '补填微信号').click();
  const contact = page.locator('#preview-contact[open]');
  await input(contact, 'wechatId').fill('wx_legacy_fixture');
  await button(contact, '保存').click();
  await detail.getByText('wx_legacy_fixture', { exact: true }).waitFor();
  await shot(page, '15-legacy-contact-1024');
  await button(detail, '关闭详情').click();

  if (process.env.SALES_TRIAL_DELETE_PROPOSAL === '1') {
    const proposal = resolve(output, 'proposal');
    await mkdir(proposal, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await button(page, oldName).click();
    await button(detail, '编辑微信信息').waitFor();
    await detail.evaluate((node: HTMLElement) => {
      // 效果图专用。只演示入口和现有确认框，确认事件没有数据写入。
      const footer = node.querySelector<HTMLElement>('.business-inspector-actions > div')!;
      footer.style.width = '100%';
      const action = document.createElement('button');
      action.type = 'button';
      action.textContent = '删除客户';
      action.className = 'business-action-secondary';
      action.style.cssText = 'margin-inline-end:auto;color:#963c40;border-color:#e0bdc0';
      footer.prepend(action);
      action.addEventListener('click', () => {
        void window.businessConfirm('删除后，该客户将从销售台账、来源核对和销售统计中移除。', {
          title: '删除「旧版试填档案」？', confirmLabel: '确认删除', cancelLabel: '保留客户',
        });
        document.querySelector<HTMLButtonElement>('[data-confirm-accept]')!.style.background = '#9b353c';
      });
    });
    await shot(page, 'delete-entry-1440', proposal);
    await button(detail, '删除客户').click();
    await shot(page, 'delete-confirmation-1440', proposal);
    await button(page.locator('[data-business-confirm][open]'), '保留客户').click();
    await button(detail, '关闭详情').click();
    await button(page, oldName).waitFor();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await button(page, '登记微信').click();
  const phone = page.locator('#preview-create[open]');
  assert.equal(await input(phone, 'subject').inputValue(), '');
  assert.equal(await input(phone, 'interest').inputValue(), '');
  await shot(page, '10-registration-390');
  await button(phone, '关闭表单').click();
  await phone.waitFor({ state: 'hidden' });
  const phoneWidths = await page.evaluate(() => ({
    viewport: innerWidth,
    visible: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  assert.equal(phoneWidths.viewport, 390);
  assert.ok(phoneWidths.content <= phoneWidths.visible, JSON.stringify(phoneWidths));
  await link(page, '销售统计').click();
  await page.locator('.sales-stat-band').waitFor();
  await page.locator('[data-sales-month]').waitFor({ state: 'visible' });
  await shot(page, '16-stats-390');
  await page.setViewportSize({ width: 1024, height: 820 });
  const switchBounds = await page.locator('[data-preview-stat-switch]').boundingBox();
  const filterBounds = await page.locator('[data-sales-stat-filter]').boundingBox();
  assert.ok(switchBounds && filterBounds && switchBounds.x + switchBounds.width + 8 <= filterBounds.x,
    'the statistics mode switch and filter leave a clear gap at 1024px');
  await shot(page, '17-stats-1024');
  await link(page, '切换至内容工作台').click();
  await page.waitForURL('**/business/operations-schedule');
  await link(page, '月度运营').click();
  await page.waitForURL('**/business/monthly-operations');
  await page.locator('a[data-module-id="monthly-operations"][aria-current="page"]').waitFor();
  await link(page, '销售工作台').click();
  await page.waitForURL('**/business/sales');
  await button(page, oldName).waitFor();
  assert.deepEqual(errors, []);
  assert.deepEqual(transmitted, []);
  console.log('正式运行包通过账号权限、流程、跨刷新和浏览器重开、同浏览器账号隔离、并行保存、月度运营隔离及三档截图检查。');
} finally {
  await context?.close();
  await fixture.stop();
}
