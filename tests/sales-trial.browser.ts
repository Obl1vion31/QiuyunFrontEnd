import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { provisionAccount } from '../src/auth/provision';
import { businessDate, businessDateTime } from '../src/scripts/business-date';
import * as schema from '../src/db/schema';
import { admin, employee, startFixture } from './auth.fixture';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE!);
const output = resolve(process.env.SALES_TRIAL_DIR ?? '.tools/test-artifacts/sales-trial');
const shots = resolve(output, 'screenshots');
await mkdir(shots, { recursive: true });
const fixture = await startFixture({ entry: '.tools/serve-vercel.mjs' });
const origin = fixture.baseURL;
const sales = origin + '/business/sales';
const sources = origin + '/api/sales-source-posts';
const promotedTitle = '来源联调 · 讲义推广';
const organicTitle = '来源联调 · TMUA 常规答疑';
const sourcePublishedAt = new Date(Date.now() - 3 * 86_400_000);
const sourcePublishDay = businessDate(sourcePublishedAt);
const oldNote = 'a'.repeat(24);
const currentNote = 'b'.repeat(24);
const organicNote = 'c'.repeat(24);
const postUrl = (note: string) => 'https://www.xiaohongshu.com/explore/' + note;

async function sourceFixture(title: string, promoted: boolean, publicationUrl: string, published = true) {
  const [content] = await fixture.db.insert(schema.operationsContent).values({
    operationType: promoted ? 'promotion_only' : 'non_promotion_standard',
  }).returning();
  const [version] = await fixture.db.insert(schema.operationsContentVersion).values({
    contentId: content.id, contentName: title, versionNumber: 0, workType: 'new', subjectId: 'tmua',
    categoryId: 'non-promotional-handout',
  }).returning();
  const [schedule] = await fixture.db.insert(schema.operationsContentSchedule).values({
    contentVersionId: version.id, plannedPublishAt: sourcePublishedAt, actualPublishAt: published ? sourcePublishedAt : null,
    isPromoted: promoted, promotionStatus: promoted ? 'scaling' : 'none', completionStatus: published ? 'on_time' : 'pending',
    publicationUrl: published ? publicationUrl : null,
  }).returning();
  return { content, version, schedule };
}

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
const checkLedgerGeometry = async (page: any) => {
  const layout = await page.locator('.sales-ledger-table').evaluate((table: HTMLTableElement) => {
    const headers = [...table.tHead!.rows[0].cells].map(cell => cell.getBoundingClientRect());
    const surface = table.parentElement!.getBoundingClientRect();
    const rows = [...table.tBodies[0].rows].map(row => {
      const state = row.querySelector('.sales-follow-state')!.getBoundingClientRect();
      const follow = row.querySelector('[data-sales-sheet="follow"]')!.getBoundingClientRect();
      const progress = getComputedStyle(row.querySelector('.sales-progress')!);
      const sale = row.querySelector('[data-sales-deal-group]')!.getBoundingClientRect();
      const deletion = row.querySelector('[data-sales-delete]')!.getBoundingClientRect();
      const date = row.querySelector('time')!.getBoundingClientRect();
      return {
        gap: follow.left - state.right,
        stateCenter: Math.abs(state.y - follow.y + (state.height - follow.height) / 2),
        progressBorder: progress.borderLeftWidth,
        saleCenter: Math.abs(headers[4].x - sale.x + (headers[4].width - sale.width) / 2),
        deletionCenter: Math.abs(headers[5].x - deletion.x + (headers[5].width - deletion.width) / 2),
        fits: date.right <= headers[1].right && follow.right <= headers[3].right &&
          sale.right <= headers[4].right && deletion.right <= surface.right,
      };
    });
    return { width: table.getBoundingClientRect().width, columns: headers.map(rect => rect.width), rows };
  });
  assert.equal(layout.columns.length, 6);
  if (layout.width >= 960) {
    for (const [index, proportion] of [0.17, 0.15, 0.30, 0.19, 0.11, 0.08].entries()) {
      assert.ok(Math.abs(layout.columns[index] - layout.width * proportion) <= 2, JSON.stringify(layout.columns));
    }
  }
  assert.ok(layout.rows.length);
  for (const row of layout.rows) {
    assert.ok(row.gap >= 10 && row.stateCenter <= 1 && row.progressBorder === '0px', JSON.stringify(row));
    assert.ok(row.saleCenter <= 1 && row.deletionCenter <= 1 && row.fits, JSON.stringify(row));
  }
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
  const promo = await sourceFixture(promotedTitle, true, postUrl(currentNote));
  const organic = await sourceFixture(organicTitle, false, postUrl(organicNote));
  const short = await sourceFixture('已登记短链的普通帖', false, 'https://xhslink.com/a/saleFixture?ref=stored');
  await sourceFixture('来源联调 · 待实发排期', false, 'https://xhslink.com/a/unpublished', false);
  await fixture.db.insert(schema.operationsPromotionCampaign).values({
    scheduleId: promo.schedule.id, startedOn: sourcePublishDay, currentStage: 'scaling', currentStatus: 'scaling',
  });
  await fixture.db.insert(schema.operationsNoteIdOwner).values(
    [oldNote, currentNote].map(platformNoteId => ({ platformNoteId, contentId: promo.content.id })),
  );
  await fixture.db.insert(schema.operationsVersionNoteId).values([
    { contentId: promo.content.id, versionId: promo.version.id, platformNoteId: oldNote, publicationUrl: postUrl(oldNote), mode: 'initial' },
    { contentId: promo.content.id, versionId: promo.version.id, platformNoteId: currentNote, publicationUrl: postUrl(currentNote),
      effectiveOn: businessDate(new Date(Date.now() - 86_400_000)), mode: 'correction' },
  ]);
  context = await launch();
  let page = context.pages()[0] ?? await context.newPage();
  const video = page.video();
  const timingOrigin = Date.now();
  let sourceStart = 0;
  let sourceEnd = 0;
  track(page);
  const anonymous = await context.request.get(sales, { maxRedirects: 0 });
  assert.equal(anonymous.status(), 302);
  assert.equal((await context.request.get(sources + '?q=' + oldNote)).status(), 401);
  assert.match(anonymous.headers().location, /^\/login\?next=/);
  await signIn(employee);
  assert.equal((await context.request.get(sales, { maxRedirects: 0 })).status(), 403);
  assert.equal((await context.request.get(sources + '?q=' + oldNote)).status(), 403);
  const assistant = await context.request.get(origin + '/api/content-search?q=' + oldNote);
  assert.equal((await assistant.json()).rows[0].id, promo.schedule.id);
  const staff = await context.request.get(origin + '/business/workspaces', { maxRedirects: 0 });
  assert.equal(staff.headers().location, '/business/operations-schedule');
  await signOut();
  await signIn(admin);
  const lookup = async (query: string) => {
    const response = await context!.request.get(sources + '?' + new URLSearchParams({ q: query }));
    assert.equal(response.status(), 200, await response.text());
    assert.match(response.headers()['cache-control'], /private, no-store/);
    return (await response.json()).rows;
  };
  const matches = await lookup('来源联调');
  assert.deepEqual(new Set(matches.map((post: { id: string }) => post.id)), new Set([promo.schedule.id, organic.schedule.id]));
  const historical = (await lookup(oldNote.toUpperCase()))[0];
  assert.equal(historical.id, promo.schedule.id);
  assert.equal(historical.note, oldNote);
  assert.equal(historical.publication, postUrl(oldNote));
  assert.equal(historical.published, businessDateTime(sourcePublishedAt));
  assert.equal(historical.type, '推广');
  const plain = (await lookup('复制分享文案 ' + postUrl(organicNote) + '?from=fixture'))[0];
  assert.equal(plain.id, organic.schedule.id);
  assert.equal(plain.type, '非推广');
  assert.equal(plain.note, organicNote);
  assert.equal((await lookup('https://www.xhslink.com/a/saleFixture/?ref=new'))[0].id, short.schedule.id);
  assert.deepEqual(await lookup('未匹配的来源标题'), []);
  const monthUrl = origin + '/api/monthly-operations?month=' + today.slice(0, 7);
  const baseline = await context.request.get(monthUrl);
  assert.equal(baseline.status(), 200);
  const monthlyBefore = monthlyFacts(await baseline.json());
  await page.goto(origin + '/#systems-title');
  await link(page, '进入业务系统').click();
  await page.waitForURL('**/business/workspaces');
  const workspaces = page.getByRole('navigation', { name: '工作台' });
  await workspaces.getByRole('link', { name: /内容工作台/ }).waitFor();
  assert.equal(await workspaces.getByText('试用', { exact: true }).count(), 0);
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
  assert.equal(await row.locator('.sales-consultation-line').innerText(), '课程 · TMUA ｜ 小班 123');
  await row.getByText('待跟进', { exact: true }).click();
  assert.equal(await page.locator('#sales-trial-inspector[open], #preview-follow[open]').count(), 0);
  await checkLedgerGeometry(page);
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
  assert.equal(await row.locator('.sales-consultation-line').innerText(), '课程 · TMUA ｜ 小班 123');
  const more = button(row, '查看另 1 项咨询方向');
  assert.equal(await more.innerText(), '另 1 项');
  await more.press('Enter');
  const directionDetail = page.locator('#sales-trial-inspector[open]');
  await directionDetail.getByRole('heading', { name: '咨询方向与意向产品', exact: true }).waitFor();
  await directionDetail.getByText('模考 · ESAT ｜ 模考包', { exact: true }).first().waitFor();
  await shot(page, '18-detail-directions-1440');
  await button(directionDetail, '关闭详情').click();
  await directionDetail.waitFor({ state: 'hidden' });
  assert.ok(await more.evaluate((node: HTMLElement) => document.activeElement === node));
  await button(row, '登记成交').click();
  const deal = page.locator('#preview-deal[open]');
  assert.equal(await deal.locator('input[type="radio"]').count(), 0);
  await input(deal, 'product').fill('小班 123');
  await shot(page, '05-deal-1440');
  await button(deal, '保存').click();
  await button(row, '更正成交').click();
  await input(deal, 'product').fill('小班课');
  await shot(page, '19-correct-deal-1440');
  await button(deal, '保存').click();
  await deal.waitFor({ state: 'hidden' });

  sourceStart = (Date.now() - timingOrigin) / 1000;
  await link(page, '核对来源').click();
  const pending = page.locator('[data-sales-rows] tr').filter({ hasText: testName });
  await button(pending, '核对来源').waitFor();
  await shot(page, '20-source-queue-1440');
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
  await page.route('**/api/sales-source-posts?*', async (route: any) => {
    await route.fulfill({ status: 503, json: { message: '查找来源帖暂时不可用，请重试。' } });
  }, { times: 1 });
  await input(source, 'postQuery').fill('来源联调');
  await button(source, '查找').click();
  await source.getByText('查找来源帖暂时不可用，请重试。', { exact: true }).waitFor();
  assert.equal(await input(source, 'postQuery').inputValue(), '来源联调');
  await shot(page, '29-source-search-failed-1440');

  await page.route('**/api/sales-source-posts?*', async (route: any) => {
    await new Promise(resolve => setTimeout(resolve, 1100));
    await route.continue();
  }, { times: 1 });
  await button(source, '查找').click();
  const loading = source.getByText('正在查找来源帖…', { exact: true });
  await loading.waitFor();
  const progress = await loading.boundingBox();
  const searchButton = await button(source, '查找').boundingBox();
  assert.ok(progress && searchButton && progress.y >= searchButton.y + searchButton.height,
    'loading feedback stays below the search controls');
  await shot(page, '30-source-search-loading-1440');
  await source.getByRole('radio', { name: new RegExp(organicTitle) }).waitFor();
  assert.equal(await source.getByRole('radio').count(), 2);
  await shot(page, '31-source-both-results-1440');
  await source.getByRole('radio', { name: new RegExp(organicTitle) }).click();
  const selectedSource = source.locator('[data-selected-post]');
  await selectedSource.getByText('非推广', { exact: true }).waitFor();
  assert.equal(await link(selectedSource, '查看原帖').getAttribute('href'), postUrl(organicNote));
  await shot(page, '32-source-organic-1440');
  await button(source, '保存来源').click();
  await pending.getByText(organicTitle, { exact: true }).waitFor();

  await button(pending, '更正来源').click();
  await input(source, 'postQuery').fill(oldNote);
  await button(source, '查找').click();
  await selectedSource.getByText('推广帖', { exact: true }).waitFor();
  assert.equal(await input(source, 'postId').inputValue(), promo.schedule.id);
  assert.match(await selectedSource.locator('[data-post-promotion]').innerText(), /放量/);
  assert.equal(await link(selectedSource, '查看原帖').getAttribute('href'), postUrl(oldNote));
  await shot(page, '06-source-selection-1440');
  await page.setViewportSize({ width: 1024, height: 820 });
  const bounds = await selectedSource.boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 1024);
  await shot(page, '35-source-promotion-1024');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await button(source, '保存来源').click();
  await pending.getByText(promotedTitle, { exact: true }).waitFor();
  await button(pending, '更正来源').click();
  await selectedSource.getByText(promotedTitle, { exact: true }).waitFor();
  await selectedSource.getByText(oldNote, { exact: true }).waitFor();
  await button(source, '关闭表单').click();
  await source.waitFor({ state: 'hidden' });
  sourceEnd = (Date.now() - timingOrigin) / 1000;
  await link(page, '销售统计').click();
  await page.locator('.sales-stat-band strong').first().waitFor();
  assert.deepEqual(await page.locator('.sales-stat-band strong').allTextContents(), ['1', '1', '1']);
  await shot(page, '07-stats-1440');
  await page.locator('[data-preview-stat-switch]').evaluate((node: HTMLElement) => { node.dataset.persistTest = 'yes'; });
  await page.getByRole('radio', { name: '同批新增', exact: true }).click();
  await page.getByRole('heading', { name: '新增客户后续结果', exact: true }).waitFor();
  assert.deepEqual(await page.locator('.sales-stat-band strong').allTextContents(), ['100%', '100%', '100%']);
  await shot(page, '21-stats-cohort-1440');
  await page.getByRole('radio', { name: '按帖复盘', exact: true }).click();
  const promoted = page.getByRole('row').filter({ hasText: promotedTitle });
  await promoted.waitFor();
  assert.equal(await page.locator('[data-preview-stat-switch]').getAttribute('data-persist-test'), 'yes');
  assert.deepEqual((await promoted.getByRole('cell').allTextContents()).slice(0, 3), ['1', '1', '1']);
  await shot(page, '08-post-results-1440');
  await link(promoted, promotedTitle).click();
  await page.locator('.sales-post-overview').waitFor();
  await shot(page, '22-stats-post-details-1440');
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
  const deleteVideo = page.video();
  const deletionOrigin = Date.now();
  track(page);
  await page.goto(sales);
  if (page.url().includes('/login')) { await signIn(admin); await page.goto(sales); }
  await button(page, testName).waitFor();
  await page.setViewportSize({ width: 1024, height: 820 });
  await shot(page, '09-reopened-ledger-1024');

  const alternate = await context.newPage();
  track(alternate);
  await alternate.goto(sales);
  const longName = '并行验收 B · 微信名较长的测试客户';
  const [draftA, draftB] = await Promise.all([
    registration(page, longName, 'wx_trial_long_contact_for_browser_verification'),
    registration(alternate, '并行验收 C'),
  ]);
  const longInterest = '英语强化与入学考试备考小班，先试听再确定正式上课安排';
  await input(draftA, 'interest').fill(longInterest);
  await Promise.all([button(draftA, '保存登记').click(), button(draftB, '保存登记').click()]);
  await button(page, longName).waitFor();
  await button(alternate, '并行验收 C').waitFor();
  await page.reload();
  await button(page, longName).waitFor();
  await button(page, '并行验收 C').waitFor();
  await alternate.close();

  await page.setViewportSize({ width: 1440, height: 1000 });
  const duplicateName = '同一微信的原登记';
  const duplicate = await registration(page, duplicateName, testWechat);
  await button(duplicate, '保存登记').click();
  await button(page, duplicateName).waitFor();
  await button(page, testName).click();
  const mainDetail = page.locator('#sales-trial-inspector[open]');
  await button(mainDetail, '核对合并').click();
  const merge = page.locator('#preview-merge[open]');
  await input(merge, 'duplicateId').selectOption({ index: 1 });
  await shot(page, '23-check-duplicate-1440');
  await button(merge, '确认合并').click();
  const confirm = page.locator('[data-business-confirm][open]');
  await button(confirm, '合并').click();
  await merge.waitFor({ state: 'hidden' });
  await button(page, duplicateName).waitFor({ state: 'detached' });
  await button(mainDetail, '关闭详情').click();
  await mainDetail.waitFor({ state: 'hidden' });

  // 在隔离账号下写入旧版结构，验证更新可以继续读取，没有微信号的档案可补填。
  const oldName = '旧版试填档案';
  await page.evaluate(async ({ name, date, duplicateName }: { name: string; date: string; duplicateName: string }) => {
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
          const absorbed = workspace.rows.find((row: { name: string }) => row.name === duplicateName);
          workspace.rows.push({ ...absorbed, id: 'fixture-absorbed-grandchild', mergedTo: absorbed.id });
          workspace.rows.push({
            id: 'fixture-old-record', name, added: date + 'T08:30', need: '课程', subject: '旧版科目',
            interest: '旧版意向', stage: 'new', source: { status: 'confirmed', postId: 'handout-post' }, follows: [], payments: [], history: [],
          });
          table.put(workspace, key);
        };
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onabort = () => { db.close(); reject(transaction.error); };
      };
    });
  }, { name: oldName, date: today, duplicateName });
  await page.reload();
  const old = page.locator('[data-sales-rows] tr').filter({ has: button(page, oldName) });
  await old.getByText('课程 · 旧版科目 ｜ 旧版意向', { exact: true }).waitFor();
  await old.getByText('微信号待补', { exact: true }).waitFor();
  for (const [width, height] of [[1920, 1050], [1440, 1000], [1024, 820]]) {
    await page.setViewportSize({ width, height });
    await checkLedgerGeometry(page);
    await shot(page, '24-ledger-populated-' + width);
  }
  await button(page, longName).click();
  const longDetail = page.locator('#sales-trial-inspector[open]');
  await longDetail.getByText('课程 · TMUA ｜ ' + longInterest, { exact: true }).waitFor();
  await button(longDetail, '关闭详情').click();
  await longDetail.waitFor({ state: 'hidden' });
  await button(old, '更新跟进').click();
  assert.equal(await input(page.locator('#preview-follow[open]'), 'subject').inputValue(), '旧版科目');
  await button(page.locator('#preview-follow[open]'), '关闭表单').click();
  await button(page, oldName).click();
  const detail = page.locator('#sales-trial-inspector[open]');
  await button(detail, '补填微信号').click();
  const contact = page.locator('#preview-contact[open]');
  await input(contact, 'wechatId').fill('wx_legacy_fixture');
  await shot(page, '25-edit-wechat-1024');
  await button(contact, '保存').click();
  await detail.getByText('wx_legacy_fixture', { exact: true }).waitFor();
  await shot(page, '15-legacy-contact-1024');
  await button(detail, '关闭详情').click();

  await detail.waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const deletedRow = page.locator('.sales-ledger-table tbody tr').filter({ has: button(page, testName) });
  const remove = button(deletedRow, '删除「' + testName + '」');
  const deleteStart = (Date.now() - deletionOrigin) / 1000;
  await remove.click();
  assert.ok(await button(confirm, '取消').evaluate((node: HTMLElement) => node === document.activeElement));
  await confirm.getByText('删除「' + testName + '」？', { exact: true }).waitFor();
  assert.match(await confirm.locator('[data-confirm-message]').innerText(), /删除不可恢复/);
  assert.equal(await button(confirm, '确认删除').evaluate((node: HTMLElement) => getComputedStyle(node).backgroundColor), 'rgb(150, 56, 62)');
  await shot(page, '26-delete-confirmation-1440');
  if (deleteVideo) await page.waitForTimeout(850);
  await page.keyboard.press('Escape');
  await confirm.waitFor({ state: 'hidden' });
  await deletedRow.waitFor();
  assert.ok(await remove.evaluate((node: HTMLElement) => document.activeElement === node));

  // 中止一次真正的 IndexedDB 写入，模拟浏览器拒绝提交。
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      const request = original.call(this, value, key);
      if (this.name === 'accounts') {
        IDBObjectStore.prototype.put = original;
        this.transaction.abort();
      }
      return request;
    };
  });
  await remove.click();
  await button(confirm, '确认删除').click();
  await page.getByRole('alert').filter({ hasText: '删除未保存，客户记录已保留。请重试。' }).waitFor();
  assert.equal(await remove.isEnabled(), true);
  assert.ok(await remove.evaluate((node: HTMLElement) => document.activeElement === node));
  await shot(page, '27-delete-failed-1440');
  if (deleteVideo) await page.waitForTimeout(850);
  const deleteRetry = (Date.now() - deletionOrigin) / 1000;
  await remove.click();
  await button(confirm, '确认删除').click();
  await deletedRow.waitFor({ state: 'detached' });
  await page.getByRole('status').filter({ hasText: '已删除客户。' }).waitFor();
  await button(page, longName).waitFor();
  await button(page, oldName).waitFor();
  await shot(page, '28-delete-completed-1440');
  if (deleteVideo) await page.waitForTimeout(850);
  const deleteEnd = (Date.now() - deletionOrigin) / 1000;
  await page.reload();
  await button(page, oldName).waitFor();
  assert.equal(await deletedRow.count(), 0);
  const removedRows = await page.evaluate(async ({ wechat, duplicateName }: { wechat: string; duplicateName: string }) => {
    const account = JSON.parse(document.querySelector('#sales-trial-config')!.textContent!).account;
    return new Promise<number>((resolve, reject) => {
      const open = indexedDB.open('qiuyun-sales-trial', 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const transaction = db.transaction('accounts', 'readonly');
        const request = transaction.objectStore('accounts').get(account);
        transaction.oncomplete = () => {
          const remaining = request.result.rows.filter((row: { id: string; name: string; wechatId?: string }) =>
            row.wechatId === wechat || row.name === duplicateName || row.id === 'fixture-absorbed-grandchild');
          db.close();
          resolve(remaining.length);
        };
        transaction.onabort = () => { db.close(); reject(transaction.error); };
      };
    });
  }, { wechat: testWechat, duplicateName });
  assert.equal(removedRows, 0);
  await link(page, '核对来源').click();
  await button(page.locator('[data-sales-list-filter]'), '查看').waitFor();
  await input(page.locator('[data-sales-list-filter]'), 'source').selectOption('all');
  await button(page.locator('[data-sales-list-filter]'), '查看').click();
  const queueRows = page.locator('.sales-queue-table tbody tr[data-inspector-key]');
  const historicalSource = queueRows.filter({ hasText: oldName });
  await historicalSource.getByText('待重新核对', { exact: true }).waitFor();
  assert.equal(await queueRows.filter({ hasText: testName }).count(), 0);
  await shot(page, '33-legacy-source-pending-1440');
  await page.setViewportSize({ width: 390, height: 844 });
  await button(historicalSource, '核对来源').click();
  const mobileSource = page.locator('#preview-source[open]');
  await input(mobileSource, 'postQuery').fill(organicNote);
  await button(mobileSource, '查找').click();
  await mobileSource.locator('[data-selected-post]').getByText(organicTitle, { exact: true }).waitFor();
  await shot(page, '34-source-390');
  await button(mobileSource, '取消').click();
  await button(page.locator('[data-business-confirm][open]'), '放弃修改').click();
  await mobileSource.waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await link(page, '销售统计').click();
  await page.locator('.sales-stat-band strong').first().waitFor();
  assert.deepEqual(await page.locator('.sales-stat-band strong').allTextContents(), ['3', '0', '0']);
  await page.getByRole('radio', { name: '按帖复盘', exact: true }).click();
  await page.getByText('该月份暂无已核对的来源帖。', { exact: true }).waitFor();
  assert.equal(await page.getByRole('row').filter({ hasText: promotedTitle }).count(), 0);
  assert.equal(monthlyFacts(await (await context.request.get(monthUrl)).json()), monthlyBefore);
  await link(page, '销售台账').click();
  await button(page, oldName).waitFor();

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
  if (deleteVideo) {
    await context.close();
    context = undefined;
    await writeFile(resolve(output, 'delete-clip.json'), JSON.stringify({
      video: await deleteVideo.path(), start: deleteStart, retry: deleteRetry, end: deleteEnd,
    }));
  }
  console.log('正式运行包通过推广与非推广查找、历史笔记、分享链接、保存回显、旧记录复核、账号权限及月度运营隔离。');
} finally {
  await context?.close();
  await fixture.stop();
}
