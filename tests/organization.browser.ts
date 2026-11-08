import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { startPostgresFixture } from './postgres.fixture';
import { organizationAccounts, seedOrganization } from './organization.fixture';
import { respondToBusinessConfirm, settleBusinessUI } from './business-confirm.helper';
const dir = process.env.ORG_DIR ?? '.tools/test-artifacts/organization';
await mkdir(dir + '/screenshots', { recursive: true }); await mkdir(dir + '/video', { recursive: true });
const fixture = await startPostgresFixture({ accounts: organizationAccounts, entry: process.env.ORG_ENTRY });
await seedOrganization(fixture.db);
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE!);
const browser = await chromium.launch({ headless: true });
const checks: string[] = [], errors: string[] = [], videos: string[] = [];
const paintChecks: unknown[] = [];
let keep = process.env.ORG_KEEP_SERVER === '1';
const settle = async (page: any) => { await settleBusinessUI(page); await page.waitForTimeout(1150); };
async function shot(page: any, name: string) { await settle(page); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '无页面级横向溢出'); await page.screenshot({ path: dir + '/screenshots/' + name + '.png', fullPage: true }); }
async function inspectPaint(page: any, name: string) {
  await page.waitForFunction(() => (window as any).orgPaintFrames?.length > 3);
  const session = await page.context().newCDPSession(page); await session.send('DOM.enable'); await session.send('CSS.enable');
  const fonts = async () => { const document = await session.send('DOM.getDocument'), result = []; for (const selector of ['.business-toolbar__title strong', '[data-position-field="media:responsibilities"]']) { const { nodeId } = await session.send('DOM.querySelector', { nodeId: document.root.nodeId, selector }); result.push((await session.send('CSS.getPlatformFontsForNode', { nodeId })).fonts); } return result; };
  const first = await fonts(); await page.screenshot({ path: dir + '/screenshots/' + name + '-early.png' }); await settle(page);
  assert.deepEqual(await fonts(), first, '从首次绘制起保持实际字形'); assert(first.every(list => list.length > 0 && list.every((font: any) => font.isCustomFont && font.familyName === 'MiSans VF')));
  const frames = await page.evaluate(() => (window as any).orgPaintFrames);
  for (const frame of frames) { assert.equal(frame.nav, frames[0].nav); assert.equal(frame.mainX, frames[0].mainX); assert(Math.abs(frame.title - frames[0].title) < .1); }
  await page.screenshot({ path: dir + '/screenshots/' + name + '-stable.png' }); paintChecks.push({ name, fonts: first, frames }); await session.detach();
}
try {
  for (const index of [0, 2]) {
    const role = index ? 'employee' : 'admin';
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', recordVideo: { dir: dir + '/video', size: { width: 1440, height: 1000 } } });
    const page = await context.newPage(); page.on('pageerror', (error: Error) => errors.push(error.message));
    await context.addInitScript(`window.orgPaintFrames=[];let started=0;const sample=()=>{const root=document.querySelector('[data-organization]'),title=document.querySelector('.business-toolbar__title strong'),nav=document.querySelector('.business-sidebar__nav'),main=document.querySelector('main');if(root&&title&&nav&&main){started ||= performance.now();const range=document.createRange();range.selectNodeContents(title);window.orgPaintFrames.push({t:performance.now()-started,nav:nav.getBoundingClientRect().top,mainX:main.getBoundingClientRect().left,title:range.getBoundingClientRect().width});}if(!started||performance.now()-started<2500)requestAnimationFrame(sample);};requestAnimationFrame(sample);`);
    await context.request.post(fixture.baseURL + '/api/auth/sign-in/username', { headers: { Origin: fixture.baseURL }, data: organizationAccounts[index] });
    if (!index) await page.route('**/fonts/business.js', async (route: any) => { await new Promise(resolve => setTimeout(resolve, 800)); await route.continue(); });
    await page.goto(fixture.baseURL + '/organization', { waitUntil: 'domcontentloaded' });
    if (!index) { await inspectPaint(page, 'admin-slow-cold'); await page.unroute('**/fonts/business.js'); await page.reload({ waitUntil: 'domcontentloaded' }); await inspectPaint(page, 'admin-warm-reload'); }
    await settle(page);
    await page.evaluate(() => { (window as any).__orgToolbar = document.querySelector('.business-toolbar'); (window as any).__orgRoot = document.querySelector('[data-organization]'); });
    for (const width of [1920, 1440, 1024]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.getByRole('radio', { name: '岗位与协作', exact: true }).check();
      await shot(page, role + '-roles-' + width);
      await page.getByRole('radio', { name: '人员任职', exact: true }).check();
      await shot(page, role + '-people-' + width);
      assert.equal(await page.locator('[data-org-members]>tr').count(), 3);
      assert.equal(await page.locator('[data-org-members]>tr').filter({ hasText: '测试运营同事' }).locator('[data-member-positions]>span').count(), 3);
      assert(await page.evaluate(() => (window as any).__orgToolbar === document.querySelector('.business-toolbar') && (window as any).__orgRoot === document.querySelector('[data-organization]')));
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    if (index === 0) {
      const member = page.locator('[data-org-members]>tr').filter({ hasText: '测试运营同事' });
      await member.getByRole('button', { name: '编辑任职' }).click(); const sheet = page.locator('#organization-editor'); await sheet.waitFor({ state: 'visible' }); await shot(page, 'admin-member-editor-1440');
      assert.equal(await sheet.locator('[name=positions]:checked').count(), 3);
      await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'hidden' }); assert.equal(await page.locator('[data-business-confirm][open]').count(), 0);
      await member.getByRole('button', { name: '编辑任职' }).click(); await sheet.getByLabel('视觉设计', { exact: true }).uncheck();
      await page.keyboard.press('Escape'); await respondToBusinessConfirm(page, false); assert(await sheet.isVisible()); assert.equal(await sheet.getByLabel('视觉设计', { exact: true }).isChecked(), false);
      await sheet.getByLabel('视觉设计', { exact: true }).check(); await sheet.getByRole('button', { name: '取消', exact: true }).click(); await sheet.waitFor({ state: 'hidden' });
      assert.equal(await page.locator('[data-business-confirm][open]').count(), 0);
      await page.getByRole('radio', { name: '岗位与协作', exact: true }).check(); await page.locator('[data-edit-position=media]').click(); await sheet.waitFor({ state: 'visible' });
      const original = await sheet.locator('[name=responsibilities]').inputValue(); await sheet.locator('[name=responsibilities]').fill(original + ' 隔离保存检查。');
      await page.route('**/api/organization', async (route: any) => route.request().method() === 'PATCH' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '隔离断网：请重试。' }) }) : route.continue());
      await sheet.getByRole('button', { name: '保存', exact: true }).click(); await sheet.getByRole('alert').filter({ hasText: '隔离断网' }).waitFor(); await shot(page, 'admin-save-error-1440');
      assert.equal(await sheet.locator('[name=responsibilities]').inputValue(), original + ' 隔离保存检查。'); await page.unroute('**/api/organization');
      await sheet.getByRole('button', { name: '保存', exact: true }).click(); await sheet.waitFor({ state: 'hidden' });
      assert.equal(await page.locator('[data-position-field="media:responsibilities"]').textContent(), original + ' 隔离保存检查。');
      await page.locator('[data-edit-position=media]').click(); await sheet.locator('[name=responsibilities]').fill(original); await sheet.getByRole('button', { name: '添加资料' }).click();
      await sheet.getByLabel('资料名称', { exact: true }).fill('隔离项目资料'); await sheet.getByLabel('链接', { exact: true }).fill('https://example.com/project');
      await shot(page, 'admin-role-editor-1440'); await sheet.getByRole('button', { name: '保存', exact: true }).click(); await sheet.waitFor({ state: 'hidden' });
      await page.locator('.org-position-table tbody tr').filter({ has: page.locator('[data-edit-position="media"]') }).locator('summary').click(); assert.equal(await page.getByRole('link', { name: '隔离项目资料' }).getAttribute('href'), 'https://example.com/project');
      await page.reload(); await settle(page); await page.locator('[data-edit-position=media]').click(); await sheet.getByRole('button', { name: '移除', exact: true }).click(); await sheet.getByRole('button', { name: '保存', exact: true }).click(); await sheet.waitFor({ state: 'hidden' });
      // 角色更新成功后仅更改任职，账号权限保持。
      await page.getByRole('radio', { name: '人员任职', exact: true }).check(); await member.getByRole('button', { name: '编辑任职' }).click(); await sheet.getByLabel('用户触点运营', { exact: true }).uncheck();
      await sheet.getByRole('button', { name: '保存', exact: true }).click(); await sheet.waitFor({ state: 'hidden' }); assert.equal(await member.locator('[data-member-positions]>span').count(), 2);
      await member.getByRole('button', { name: '编辑任职' }).click(); await sheet.getByLabel('用户触点运营', { exact: true }).check(); await sheet.getByRole('button', { name: '保存', exact: true }).click(); await sheet.waitFor({ state: 'hidden' });
      await context.request.get(fixture.baseURL + '/api/organization').then(async (response: any) => assert.equal((await response.json()).members.find((row: any) => row.username === 'zongyunying001').role, 'employee'));
      await page.goBack(); await settle(page); assert.equal(await page.getByRole('radio', { name: '岗位与协作', exact: true }).isChecked(), true); await page.goForward(); await settle(page);
      await member.getByRole('button', { name: '编辑任职' }).click(); await sheet.getByLabel('视觉设计', { exact: true }).uncheck(); await page.goBack(); await respondToBusinessConfirm(page, false); assert(await sheet.isVisible()); assert.equal(await sheet.getByLabel('视觉设计', { exact: true }).isChecked(), false);
      await sheet.getByLabel('视觉设计', { exact: true }).check(); await sheet.getByRole('button', { name: '取消', exact: true }).click(); await sheet.waitFor({ state: 'hidden' });
      await page.emulateMedia({ reducedMotion: 'reduce' }); await page.getByRole('radio', { name: '岗位与协作', exact: true }).check(); await page.locator('[data-edit-position=design]').click(); await sheet.waitFor({ state: 'visible' }); await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'hidden' }); await page.emulateMedia({ reducedMotion: 'no-preference' });
      checks.push('管理员：刷新后编辑、未修改/改回原值关闭、Esc/后退取消保护、失败保留与重试、资料往返、任职保存、权限保持及减少动态');
    } else {
      assert.equal(await page.locator('[data-edit-position],[data-edit-member]').count(), 0);
      assert.equal((await context.request.patch(fixture.baseURL + '/api/organization', { headers: { Origin: fixture.baseURL }, data: { kind: 'member', userId: 'forged', positions: ['supervisor'] } })).status(), 403);
      checks.push('员工：两视图只读、三岗位单人、刷新读取和直调管理接口拒绝');
    }
    for (const width of [390, 320]) { await page.setViewportSize({ width, height: 844 }); await page.goto(fixture.baseURL + '/organization'); await shot(page, role + '-limited-touch-roles-' + width); await page.getByRole('radio', { name: '人员任职', exact: true }).check(); await shot(page, role + '-limited-touch-people-' + width); }
    if (!index) { await page.setViewportSize({ width: 390, height: 844 }); await page.locator('[data-edit-member]').first().click(); await shot(page, 'admin-limited-touch-editor-390'); await page.getByRole('button', { name: '关闭编辑', exact: true }).click(); await page.locator('#organization-editor').waitFor({ state: 'hidden' }); }
    videos.push(await page.video().path()); await context.close();
  }
  assert.deepEqual(errors, []); await writeFile(dir + '/result.json', JSON.stringify({ checks, paintChecks, errors, videos, baseURL: keep ? fixture.baseURL : undefined, dataSource: '隔离PostgreSQL，三名测试人员；职责来自正式初始化内容', desktop: [1920, 1440, 1024], limitedTouch: [390, 320] }, null, 2));
  console.log('PASS: ' + checks.join('；'));
  if (keep) { await writeFile(dir + '/preview.json', JSON.stringify({ baseURL: fixture.baseURL, accounts: organizationAccounts })); console.log('Isolated preview retained at ' + fixture.baseURL); await browser.close(); await new Promise<void>(resolve => { process.on('SIGTERM', () => resolve()); process.on('SIGINT', () => resolve()); }); }
} catch (error) { keep = false; console.error(fixture.logs(), errors); for (const context of browser.contexts()) for (const page of context.pages()) { await page.screenshot({ path: dir + '/failure.png', fullPage: true }).catch(() => {}); console.error('Failure page:', page.url(), (await page.locator('body').innerText()).slice(0, 1000)); } throw error; }
finally { await browser.close(); await fixture.stop(); }
