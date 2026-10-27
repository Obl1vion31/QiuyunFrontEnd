import {respondToBusinessConfirm} from './business-confirm.helper';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { and, eq } from 'drizzle-orm';
import { startFixture, admin, employee } from './auth.fixture';
import { operationsAnnualPlan as plans, operationsAnnualPlanVersion as versions, operationsAnnualPlanBlock as blocks } from '../src/db/schema';
import type { AnnualPlanSnapshotV4, LegacyAnnualPlanSnapshot } from '../src/db/schema';
const fixture = await startFixture(); const { baseURL, db } = fixture;
let browser: any;
async function login(user: typeof admin | typeof employee) {
  const response = await fetch(baseURL + '/api/auth/sign-in/username', { method: 'POST', headers: { Origin: baseURL, 'Content-Type': 'application/json' }, body: JSON.stringify(user) });
  assert.equal(response.status, 200); return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
}
async function request(path: string, method: string, payload: unknown, cookie: string, expected: number) {
  const response = await fetch(baseURL + path, { method, headers: { Origin: baseURL, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const body = await response.json(); assert.equal(response.status, expected, JSON.stringify(body)); return body;
}
const block = (startSlot: number, endSlot: number, note: string, paid: Array<{ startSlot: number; endSlot: number }> = []) => ({ startSlot, endSlot, note, promotionRanges: paid, sortOrder: 0 });
const row = (name: string, items: ReturnType<typeof block>[], categoryId: string | null = null) => ({ year: 2026, sectionKey: 'subject:tmua', sectionLabel: 'TMUA 细致规划', subjectId: 'tmua', rowName: name, categoryId, note: null, isActive: true, sortOrder: 0, blocks: items, links: [{ label: '验收 SOP', url: 'https://fictional.example.test/sop', sortOrder: 0 }] });
try {
  const cookie = await login(admin); const employeeCookie = await login(employee);
  const classInput = row('验收小班课', [block(5, 17, '针对 10 月考试（每月至多两篇）', [{ startSlot: 5, endSlot: 17 }]), block(20, 23, '针对次年 1 月考试（每月至多两篇）', [{ startSlot: 20, endSlot: 23 }])], 'small-class-or-tutoring');
  const classes = await request('/api/operations-annual-plans', 'POST', classInput, cookie, 201);
  const handoutInput = row('验收推广讲义帖', [block(5, 17, '测试积累，仅测试 1000 预算', [{ startSlot: 5, endSlot: 6 }]), block(20, 23, '测试积累，仅测试 1000 预算')], 'promotional-handout');
  const handout = await request('/api/operations-annual-plans', 'POST', handoutInput, cookie, 201);
  await request('/api/operations-annual-plans', 'POST', { ...row('验收停用规划', [block(1, 24, '停用不计入汇总')]), isActive: false }, cookie, 201);
  await request('/api/operations-annual-plans', 'POST', row('验收空规划', []), cookie, 201);
  await request(`/api/operations-annual-plans/${handout.id}`, 'PATCH', { ...handoutInput, blocks: [block(5, 17, '自由备注：观察保留内容；<文字>；</script><b data-injected>文本</b>'), block(20, 23, '')], expectedVersionNumber: 0 }, cookie, 200);
  const same = await request(`/api/operations-annual-plans/${handout.id}`, 'PATCH', { ...handoutInput, blocks: [block(5, 17, '自由备注：观察保留内容；<文字>；</script><b data-injected>文本</b>'), block(20, 23, '')], expectedVersionNumber: 1 }, cookie, 200); assert.equal(same.unchanged, true);
  await request(`/api/operations-annual-plans/${handout.id}`, 'PATCH', { ...handoutInput, expectedVersionNumber: 0 }, cookie, 409);
  await request('/api/operations-annual-plans', 'POST', { ...row('无效区间', [block(5, 17, '', [{ startSlot: 4, endSlot: 6 }])]) }, cookie, 422);
  for (const path of ['/api/operations-annual-plans', `/api/operations-annual-plans/year/2026/copy`, `/api/operations-annual-plans/${handout.id}/restore`]) await request(path, 'POST', {}, employeeCookie, 403);

  const [modernVersion] = await db.select().from(versions).where(and(eq(versions.planId, classes.id), eq(versions.versionNumber, 0)));
  const modern = modernVersion.snapshot as AnnualPlanSnapshotV4;
  const old: LegacyAnnualPlanSnapshot = { schemaVersion: 3, row: modern.row, links: modern.links, blocks: [{ startMonth: 3, endMonth: 6, label: '旧数量', ruleType: 'fixed', monthlyFrequency: null, quantityParts: [3, 3, 3, 4], note: null, sortOrder: 0 }] };
  await db.insert(versions).values({ planId: classes.id, versionNumber: 1, snapshot: old, changeSummary: '虚构旧版本', diffSummary: [], changedByLabel: 'test' });
  await db.update(plans).set({ currentVersionNumber: 1 }).where(eq(plans.id, classes.id));
  await request(`/api/operations-annual-plans/${classes.id}/restore`, 'POST', { versionNumber: 1, expectedVersionNumber: 1 }, cookie, 200);
  const [unchanged] = await db.select().from(versions).where(and(eq(versions.planId, classes.id), eq(versions.versionNumber, 1))); assert.deepEqual(unchanged.snapshot, old);
  await request(`/api/operations-annual-plans/${classes.id}/restore`, 'POST', { versionNumber: 0, expectedVersionNumber: 2 }, cookie, 200);
  const copied = await request('/api/operations-annual-plans/year/2026/copy', 'POST', { targetYear: 2027 }, cookie, 201); assert.equal(copied.count, 4);
  const sourceRows = await db.select().from(plans).where(eq(plans.year, 2026)); const targetRows = await db.select().from(plans).where(eq(plans.year, 2027));
  assert.equal(targetRows.length, sourceRows.length); assert.ok(targetRows.every(target => !sourceRows.some(source => source.id === target.id) && target.currentVersionNumber === 0));
  assert.equal(targetRows.find(row => row.rowName === '验收停用规划')?.isActive, false);
  const targetHandout = targetRows.find(row => row.rowName === handoutInput.rowName)!;
  const targetBlocks = await db.select().from(blocks).where(eq(blocks.planId, targetHandout.id)); assert.ok(targetBlocks.some(block => block.note === '自由备注：观察保留内容；<文字>；</script><b data-injected>文本</b>'));
  await request('/api/operations-annual-plans/year/2026/copy', 'POST', { targetYear: 2027 }, cookie, 409);
  const concurrent = await Promise.all([0, 1].map(() => fetch(baseURL + '/api/operations-annual-plans/year/2026/copy', { method: 'POST', headers: { Origin: baseURL, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ targetYear: 2028 }) })));
  assert.deepEqual(concurrent.map(response => response.status).sort(), [201, 409]);
  await request('/api/operations-annual-plans/year/2029', 'PATCH', { instructions: '已有年度说明' }, cookie, 200);
  await request('/api/operations-annual-plans/year/2026/copy', 'POST', { targetYear: 2029 }, cookie, 409);
  assert.equal((await db.select().from(plans).where(eq(plans.year, 2029))).length, 0);
  console.log('通过：真实 HTTP 新建、自由备注、半月校验、旧历史恢复、冲突、角色保护、年度复制与并发防覆盖。');

  const playwright = await import(process.env.PLAYWRIGHT_MODULE || new URL('../.tools/tooling/node_modules/playwright/index.mjs', import.meta.url).href);
  browser = await playwright.chromium.launch({ headless: true }); await mkdir('.tools/test-artifacts', { recursive: true });
  const errors: string[] = []; const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(cookie.split('; ').map(pair => ({ name: pair.slice(0, pair.indexOf('=')), value: pair.slice(pair.indexOf('=') + 1), url: baseURL })));
  const page = await context.newPage(); page.on('pageerror', (error: Error) => errors.push(error.message));page.on('dialog',(dialog:any)=>{errors.push('出现原生弹框：'+dialog.type());void dialog.dismiss();});
  const checkHistory=async(page:any,width:number)=>{
    await page.locator('[data-load-history]').click();await page.locator('[data-history-list] time').first().waitFor();
    assert.match(await page.locator('[data-history-list] time').first().innerText(),/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    const timeStyle=await page.locator('[data-history-list] time').first().evaluate((node:HTMLElement)=>({size:getComputedStyle(node).fontSize,family:getComputedStyle(node).fontFamily}));assert.equal(timeStyle.size,'12px');assert.match(timeStyle.family,/system-ui/);
    const view=page.locator('[data-history-list] button').filter({hasText:'查看版本内容'}).first();
    assert.equal(await view.evaluate((node:HTMLElement)=>getComputedStyle(node).color),'rgb(32, 40, 51)');
    await view.click();await page.locator('.snapshot-view').first().waitFor();
    assert.equal(await page.locator('.snapshot-view strong').first().evaluate((node:HTMLElement)=>getComputedStyle(node).fontSize),'16px');
    if(width===1280){
      await view.click();await page.route('**/api/operations-annual-plans/*/versions/*',async(route:any)=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'虚构版本读取失败'})}));await view.click();await page.locator('[data-history-list] [role=alert]').getByText('虚构版本读取失败',{exact:true}).waitFor();await page.unroute('**/api/operations-annual-plans/*/versions/*');await view.click();await page.locator('.snapshot-view').first().waitFor();
      const restore=page.locator('[data-history-list] button').filter({hasText:'恢复此版本'}).first();{const answer=respondToBusinessConfirm(page);await restore.click();await answer;}
      await page.route('**/api/operations-annual-plans/*/restore',async(route:any)=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'虚构恢复失败，历史保留'})}));{const answer=respondToBusinessConfirm(page,true);await restore.click();await answer;}await page.locator('[data-history-list] [role=alert]').getByText('虚构恢复失败，历史保留',{exact:true}).waitFor();await page.unroute('**/api/operations-annual-plans/*/restore');
    }
    await page.screenshot({path:`.tools/test-artifacts/annual-history-consistency-${width}.png`});
  };
  await page.goto(baseURL+'/business/annual-plan?year=2031');
  assert.equal(await page.locator('.annual-section-empty').first().evaluate((node:HTMLElement)=>getComputedStyle(node).fontSize),'14px');
  assert.equal(await page.locator('.annual-section-empty button').first().evaluate((node:HTMLElement)=>getComputedStyle(node).fontSize),'14px');
  assert.equal(await page.getByText(/直接查看周期与备注/).count(),0);
  await page.goto(baseURL + '/business/annual-plan?year=2026');
  await page.locator('#annual-data[data-bound=true]').waitFor({ state: 'attached' }); assert.equal(await page.locator('[data-injected]').count(), 0); assert.equal(await page.locator('.time-block').first().innerText(), classInput.blocks[0].note);
  assert.equal(await page.locator('[data-row-name]').count(), 1); assert.equal(await page.locator('.time-block').first().evaluate((node: HTMLElement) => getComputedStyle(node).gridColumn), '5 / 18');
  assert.ok(await page.locator('.matrix-shell').evaluate((node: HTMLElement) => node.scrollWidth <= node.clientWidth), '1280px 能看完整年度');
  const timeline = await page.locator('.timeline').first().boundingBox(); const summary = await page.locator('.summary-timeline').first().boundingBox(); assert.equal(timeline!.x, summary!.x);
  await page.screenshot({ path: '.tools/test-artifacts/annual-1280.png', fullPage: true });
  await page.locator('.time-block').first().click(); await page.locator('[data-inspector].is-open').waitFor(); assert.match(await page.locator('[data-block-list]').innerText(), /9 月中旬/);
  await page.screenshot({path:'.tools/test-artifacts/annual-inspector-ui.png'});
  await checkHistory(page,1280);
  assert.ok(await page.locator('[data-inspector]').evaluate((node:HTMLElement)=>node.getBoundingClientRect().bottom<=innerHeight),'详情及底部操作限制在视口内');
  await page.locator('[data-edit-row]').click(); await page.locator('#row-dialog[open]').waitFor(); assert.equal(await page.locator('#row-form [data-note]').first().inputValue(), classInput.blocks[0].note);
  assert.equal(await page.locator('[data-rule]').count(), 0); await page.locator('[data-close-row]').last().click();
  await page.locator('[data-close-inspector]').click();
  await page.locator('[data-module-href="/business/operations-schedule"]').click(); await page.waitForURL('**/operations-schedule*');
  await page.locator('[data-module-href="/business/annual-plan"]').click(); await page.waitForURL('**/annual-plan*'); await page.locator('[data-open-new]').click(); await page.locator('#row-dialog[open]').waitFor();
  await page.locator('#row-form [name=sectionChoice]').selectOption('subject:interview');
  const handoutOptions=await page.locator('#row-form [name=categoryId] option').allTextContents();assert.equal(handoutOptions.filter((t:string)=>t==='非推广讲义帖').length,1);assert.equal(handoutOptions.includes('面试课非推广讲义帖'),false);
  await page.locator('#row-form [name=categoryId]').selectOption('non-promotional-handout');await page.screenshot({path:'.tools/test-artifacts/annual-handout-category-1280.png'});
  await page.locator('#row-form [name=sectionChoice]').selectOption('subject:tmua');
  await page.locator('[name=rowName]').fill('浏览器新建规划'); await page.locator('[data-start]').first().selectOption('20'); await page.locator('[data-end]').first().selectOption('23');
  await page.locator('#row-form [data-note]').first().fill('每月发一篇，自由备注'); await page.locator('#row-form button[type=submit]').click(); await page.waitForLoadState('networkidle');
  await page.locator('.item-cell').filter({ hasText: '浏览器新建规划' }).waitFor();
  await page.locator('[data-copy-year]').click(); await page.locator('[name=targetYear]').fill('2030'); await page.locator('#copy-form button[type=submit]').click(); await page.waitForURL('**/annual-plan?year=2030');
  await page.locator('.item-cell').filter({ hasText: '浏览器新建规划' }).waitFor(); await context.close();
  for (const width of [390, 320]) {
    const mobile = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    await mobile.addCookies(cookie.split('; ').map(pair => ({ name: pair.slice(0, pair.indexOf('=')), value: pair.slice(pair.indexOf('=') + 1), url: baseURL })));
    const phone = await mobile.newPage(); phone.on('dialog', (dialog: any) => dialog.accept()); phone.on('pageerror', (error: Error) => errors.push(error.message)); await phone.goto(baseURL + '/business/annual-plan?year=2026');
    assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px 页面不横向溢出`);
    await phone.locator('.item-cell').first().click();await phone.locator('[data-inspector].is-open').waitFor();await checkHistory(phone,width);await phone.locator('[data-close-inspector]').click();await phone.locator('[data-inspector]').waitFor({state:'hidden'});
    await phone.locator('[data-open-new]').click(); const editorBox = await phone.locator('#row-dialog').boundingBox(); assert.equal(editorBox!.x, 0); assert.equal(editorBox!.width, width); await phone.locator('[data-start]').first().selectOption('20'); await phone.locator('[data-end]').first().selectOption('23');
    await phone.screenshot({ path: `.tools/test-artifacts/annual-editor-${width}.png` }); {const answered=respondToBusinessConfirm(phone,true);await phone.locator('[data-close-row]').last().click();await answered;}
    await phone.locator('[data-copy-year]').click(); await phone.locator('#copy-dialog[open]').waitFor(); await mobile.close();
  }
  const reader = await browser.newContext(); await reader.addCookies(employeeCookie.split('; ').map(pair => ({ name: pair.slice(0, pair.indexOf('=')), value: pair.slice(pair.indexOf('=') + 1), url: baseURL })));
  const readPage = await reader.newPage(); await readPage.goto(baseURL + '/business/annual-plan?year=2026'); assert.equal(await readPage.locator('[data-copy-year]').isVisible(), false); assert.equal(await readPage.locator('[data-open-new]').isVisible(), false); await readPage.locator('.item-cell').first().click();await readPage.locator('[data-inspector].is-open').waitFor();assert.equal(await readPage.locator('[data-edit-row]').isVisible(),false,'员工详情沿用只读边界'); await reader.close();
  assert.deepEqual(errors, []); console.log('通过：1280px 全年对齐、备注、详情与编辑、跨页初始化、新建与复制，以及 390／320px 编辑和员工只读。');
} catch (error) { console.error(fixture.logs().slice(-3500)); throw error; }
finally { await browser?.close(); await fixture.stop(); }
