import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { admin } from './auth.fixture';
import { startPostgresFixture } from './postgres.fixture';

process.env.XHS_JUGUANG_APP_ID = '42';
process.env.XHS_JUGUANG_APP_SECRET = 'fictional-isolated-app-secret';
const fixture = await startPostgresFixture({ entry: process.env.JUGUANG_ENTRY });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || new URL('../.tools/tooling/node_modules/playwright/index.mjs', import.meta.url).href);
const browser = await chromium.launch({ headless: true });
const directory = process.env.JUGUANG_EVIDENCE_DIR || '.tools/test-artifacts/juguang-authorization';
await mkdir(directory, { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const login = await context.request.post(fixture.baseURL + '/api/auth/sign-in/username', { headers: { Origin: fixture.baseURL }, data: admin });
  assert.equal(login.status(), 200);
  const page = await context.newPage();
  const route = '/api/integrations/xiaohongshu/authorize';
  assert.equal((await page.goto(fixture.baseURL + route))!.status(), 200);
  await page.evaluate(() => document.fonts.ready);
  const button = page.getByRole('button', { name: '前往小红书授权', exact: true });
  const measurements = [];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: directory + '/juguang-authorization-' + width + '.png' });
    const measured = await page.evaluate(() => {
      const main = document.querySelector('main')!, form = document.querySelector('form')!, button = document.querySelector('form button')!;
      const mainStyle = getComputedStyle(main);
      return { overflow: document.documentElement.scrollWidth > innerWidth, contentLeft: main.getBoundingClientRect().left + parseFloat(mainStyle.paddingLeft), contentRight: main.getBoundingClientRect().right - parseFloat(mainStyle.paddingRight), formLeft: form.getBoundingClientRect().left, formRight: form.getBoundingClientRect().right, font: getComputedStyle(button).fontFamily, fontSize: getComputedStyle(button).fontSize };
    });
    assert.equal(measured.overflow, false); assert.equal(measured.contentLeft, measured.formLeft); assert.equal(measured.contentRight, measured.formRight);
    assert.match(measured.font, /MiSans/); measurements.push({ width, ...measured });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const cdp = await context.newCDPSession(page); await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'form button' });
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  assert.ok(fonts.some((font: { familyName: string }) => /MiSans/.test(font.familyName)));
  await page.route('https://ad-market.xiaohongshu.com/**', (request: { abort: () => Promise<void> }) => request.abort());
  const outgoing = page.waitForRequest((request: { url: () => string }) => request.url().startsWith('https://ad-market.xiaohongshu.com/auth?'), { timeout: 8000 }).catch(() => null);
  const post = page.waitForResponse((response: { url: () => string; request: () => { method: () => string } }) => response.url() === fixture.baseURL + route && response.request().method() === 'POST', { timeout: 8000 }).catch(() => null);
  await button.click();
  const posted = await post; assert.ok(posted, '授权按钮应提交原生表单');
  if (posted.status() !== 303) assert.fail((await posted.text()).slice(0, 500));
  const navigation = await outgoing;
  assert.ok(navigation, '表单成功后应整页前往小红书');
  assert.equal(navigation.isNavigationRequest(), true); assert.equal(navigation.resourceType(), 'document');
  assert.deepEqual(JSON.parse(new URL(navigation.url()).searchParams.get('scope')!), ['report_service']);
  await writeFile(directory + '/checks.json', JSON.stringify({ measurements, fonts, nativeNavigation: true, requestedScopes: ['report_service'] }, null, 2));
  console.log('通过：授权确认页1440桌面、390明显溢出、真实MiSans字形及原生POST完整只读授权跳转。');
  await context.close();
} finally { await browser.close(); await fixture.stop(); }
