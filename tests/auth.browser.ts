import {businessFetch as fetch} from './business-request.helper';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { startFixture, admin, employee } from './auth.fixture';
import { operationsContentSchedule, operationsContentVersion, operationsPromotionCampaign, operationsPromotionDailyMetric } from '../src/db/schema';

const evidenceDir=process.env.AUTH_EVIDENCE_DIR||'.tools/test-artifacts';
const fixture = await startFixture();
const { baseURL, db } = fixture;
let browser: { close: () => Promise<void> } | undefined;
const form = (fields: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.set(key, value); return data; };
async function request(path: string, method = 'GET', body?: BodyInit, cookie?: string, origin = baseURL) {
  return fetch(baseURL + path, { method, body, redirect: 'manual', headers: { Origin: origin, Accept: 'application/json', ...(cookie ? { Cookie: cookie } : {}) } });
}
async function login(input: { username: string; password: string }) {
  const response = await fetch(baseURL + '/api/auth/sign-in/username', { method: 'POST', headers: { Origin: baseURL, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  assert.equal(response.status, 200, (await response.clone().text()).slice(0, 500));
  return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
}
async function status(response: Response, expected: number) { assert.equal(response.status, expected, (await response.clone().text()).slice(0, 700)); }
try {
  const guest = await request('/business/annual-plan?year=2027'); await status(guest, 302); assert.match(guest.headers.get('location')!, /next=/);
  await status(await request('/api/promotion-daily'), 401);
  const basic = await fetch(baseURL + '/api/promotion-daily', { headers: { Authorization: 'Basic Zm9yZ2VkOmZvcmdlZA==' } }); await status(basic, 401);
  await status(await request('/api/auth/sign-up/email', 'POST', form({})), 404);
  await status(await request('/api/auth/update-user', 'POST', form({ role: 'admin' })), 404);
  const adminCookie = await login(admin); const employeeCookie = await login(employee);
  for (const path of ['/api/business-settings/category-policies', '/api/stage-reviews/category-policies', '/api/operations-annual-plans', '/api/operations-annual-plans/', '/api/operations-content/fictional/platform-note-id']) await status(await request(path, 'POST', form({ role: 'admin' }), employeeCookie), 403);
  for (const path of ['/api/meeting-reviews/fictional', '/api/stage-reviews/fictional']) await status(await request(path, 'DELETE', undefined, employeeCookie), 403);
  await status(await request('/business/settings', 'GET', undefined, employeeCookie), 403);
  await status(await request('/business/settings', 'GET', undefined, adminCookie), 200);

  const fields = { contentName: '虚构权限验收帖', subjectId: 'tmua', categoryId: 'innovation', plannedPublishAt: '2026-10-01T10:00', projectDocUrl: '', isPromoted: 'on', promotionStatus: 'pending' };
  const created = await request('/api/operations-content', 'POST', form(fields), employeeCookie); await status(created, 201); const id = (await created.json()).id as string;
  await status(await request(`/api/operations-content/${id}/publication`, 'PATCH', form({ plannedPublishAt: fields.plannedPublishAt, actualPublishAt: '2026-10-01T10:00',expectedPlanRevision:'0',expectedPublicationRevision:'0',publicationUrl:'https://www.xiaohongshu.com/explore/'+'a'.repeat(24), projectDocUrl: 'https://fictional.example.test/document' }), employeeCookie), 200);
  await status(await request('/api/promotion-awaiting', 'POST', form({ scheduleId: id, reviewDate: '2026-10-01', action: 'start_testing' }), employeeCookie), 201);
  const [campaign] = await db.select().from(operationsPromotionCampaign).where(eq(operationsPromotionCampaign.scheduleId, id));
  const metrics = await db.insert(operationsPromotionDailyMetric).values(['2026-10-01', '2026-10-02'].map(metricDate => ({ campaignId: campaign.id, metricDate, dailyStatus: 'active', stageTypeSnapshot: 'testing', spend: '10.00', platformOpenCount: 2, actualOpenCount: 1, platformLeadCount: 1, actualLeadCount: 1, reviewDecision: 'test_continue' }))).returning();
  const metricFields = { dailyStatus: 'active', stageTypeSnapshot: 'testing', spend: '12', platformOpenCount: '2', actualOpenCount: '1', platformLeadCount: '1', actualLeadCount: '1', reviewDecision: 'test_continue' };
  await status(await request(`/api/promotion-daily/${metrics[0].id}`, 'PATCH', form(metricFields), employeeCookie), 200);
  await status(await request(`/api/promotion-daily/${metrics[0].id}`, 'PATCH', form({ ...metricFields, reviewDecision: 'test_discarded', confirmCascade: 'true' }), employeeCookie), 403);
  await status(await request(`/api/operations-content/${id}/publication`, 'PATCH', form({ plannedPublishAt: fields.plannedPublishAt, actualPublishAt: '2026-10-01T11:00',expectedPlanRevision:'0',expectedPublicationRevision:'1',publicationUrl:'https://www.xiaohongshu.com/explore/'+'a'.repeat(24),correctionReason:'虚构更正', projectDocUrl: 'https://fictional.example.test/document', confirmPromotionReset: '1' }), employeeCookie), 403);
  await status(await request(`/api/operations-content/${id}`, 'PATCH', form({ ...fields, isPromoted: '', promotionStatus: 'none', usageChangeReason: '虚构用途调整', confirmPromotionReset: '1' }), employeeCookie), 403);
  assert.equal((await db.select().from(operationsPromotionDailyMetric)).length, 2, '越权确认不能删除事实');
  await status(await request(`/api/promotion-daily/${metrics[0].id}`, 'PATCH', form({ ...metricFields, reviewDecision: 'test_discarded', confirmCascade: 'true' }), adminCookie), 200);
  assert.equal((await db.select().from(operationsPromotionDailyMetric)).length, 1);
  await status(await request('/api/operations-content', 'POST', form(fields), employeeCookie, 'https://untrusted.example'), 403);
  console.log('通过：真实 HTTP 登录、员工业务写入、管理权限、旧接口和破坏性确认防绕过。');

  const playwright = await import(process.env.PLAYWRIGHT_MODULE || new URL('../.tools/tooling/node_modules/playwright/index.mjs', import.meta.url).href);
  const launched = await playwright.chromium.launch({ headless: true }); browser = launched;
  await mkdir(evidenceDir, { recursive: true });
  const errors: string[] = [];
  const context = await launched.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage(); page.on('pageerror', (error: Error) => errors.push(error.message));
  await page.goto(baseURL + '/business/annual-plan?year=2027'); assert.equal(new URL(page.url()).pathname, '/login');
  // 真实422必须显示输入原因，不能误报服务故障；输入与重试继续保留。
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:900});await page.locator('#username').fill('OB');await page.locator('#password').fill('fictional-password');
    const response=page.waitForResponse((r:{url:()=>string})=>r.url().endsWith('/api/auth/sign-in/username'));
    await page.locator('button[type=submit]').click();assert.equal((await response).status(),422);
    await page.getByText('账号名至少需要 3 个字符，请使用管理员提供的登录账号。',{exact:true}).waitFor();
    assert.equal(await page.locator('#username').inputValue(),'OB');assert.equal(await page.locator('#password').inputValue(),'fictional-password');assert.equal(await page.locator('button[type=submit]').isEnabled(),true);
    await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:`${evidenceDir}/login-validation-${width}.png`});
  }
  await page.setViewportSize({width:1440,height:900});
  for(const [status,body,message] of [[422,'not-json','账号或密码的填写格式不正确，请检查后重试。'],[403,JSON.stringify({message:'private detail'}),'登录请求被拒绝，请刷新页面或联系管理员确认账号状态。'],[503,'not-json','登录服务暂时不可用，请稍后重试。']] as const){
    await page.route('**/api/auth/sign-in/username',(route:{fulfill:(options:{status:number;contentType:string;body:string})=>Promise<void>})=>route.fulfill({status,contentType:'text/plain',body}));await page.locator('button[type=submit]').click();await page.getByText(message,{exact:true}).waitFor();assert.equal(await page.locator('#password').inputValue(),'fictional-password');assert.equal(await page.locator('#password').evaluate((n:HTMLInputElement)=>document.activeElement===n),true);await page.screenshot({path:`${evidenceDir}/login-status-${status}-1440.png`});await page.unroute('**/api/auth/sign-in/username');
  }
  await page.locator('#username').fill(admin.username); await page.locator('#password').fill('fictional-wrong-password'); await page.locator('button[type=submit]').click();
  await page.locator('[data-login-message]:not([hidden])').waitFor(); assert.equal(await page.locator('#username').inputValue(), admin.username);
  await page.locator('#password').fill(admin.password);
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; }); let submissions = 0;
  await page.route('**/api/auth/sign-in/username', async (route: { continue: () => Promise<void> }) => { submissions++; await held; await route.continue(); });
  await page.locator('button[type=submit]').click(); await page.locator('form[aria-busy=true]').waitFor();
  await page.locator('form').evaluate((node: HTMLFormElement) => node.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await page.locator('[data-login-pending]:not([hidden])').waitFor(); assert.equal(submissions, 1); release();
  await page.waitForURL('**/business/annual-plan?year=2027'); await page.unroute('**/api/auth/sign-in/username');
  await page.reload(); assert.equal(new URL(page.url()).pathname, '/business/annual-plan');
  const sidebar = page.locator('[data-business-console-sidebar]'); const box = await sidebar.boundingBox();
  for (const path of ['operations-schedule', 'daily-promotion-review', 'non-promotion-review', 'meeting-review', 'annual-plan']) {
    const link = page.locator(`[data-module-href="/business/${path}"]`); await link.click(); await page.waitForURL(`**/business/${path}*`);
    const current = await sidebar.boundingBox(); assert.equal(current?.x, box?.x); assert.equal(current?.width, box?.width);
  }
  // 自己改名为两字符的OB仍保留原登录账号；页面明确区分姓名与凭据。
  await page.goto(baseURL+'/business/settings');const self=page.locator(`[data-account-username="${admin.username}"]`);await self.locator('[data-account-action=rename]').click();const editor=page.locator('[data-account-editor]');await editor.locator('input[name=value]').fill('OB');
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});await editor.getByText(`此处只修改显示姓名，登录时仍使用 ${admin.username}。`,{exact:true}).waitFor();await page.screenshot({path:`${evidenceDir}/account-rename-${width}.png`});}
  await page.setViewportSize({width:1440,height:900});await editor.locator('[type=submit]').click();await editor.waitFor({state:'hidden'});await self.getByText(`显示姓名已保存，登录账号仍为 ${admin.username}。`,{exact:true}).waitFor();const identity=await db.query.authUser.findFirst({where:(row,{eq})=>eq(row.username,admin.username)});assert.equal(identity?.name,'OB');assert.equal(identity?.username,admin.username);await login(admin);
  await page.locator('.business-account--sidebar [data-account-trigger]').click(); await page.locator('#business-account-sidebar [data-sign-out]').click();
  await page.waitForURL('**/login'); await page.goto(baseURL + '/business/operations-schedule'); assert.equal(new URL(page.url()).pathname, '/login');
  await context.close();
  for (const width of [390, 320]) {
    const mobile = await launched.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const phone = await mobile.newPage(); phone.on('pageerror', (error: Error) => errors.push(error.message));
    await phone.goto(baseURL + '/login'); await phone.locator('#username').fill(employee.username); await phone.locator('#password').fill(employee.password);
    await phone.screenshot({ path: `${evidenceDir}/login-${width}.png` });
    assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await phone.locator('button[type=submit]').click(); await phone.waitForURL('**/business/operations-schedule');
    assert.equal(await phone.locator('[data-module-id=settings]').count(), 0);
    await phone.locator('.business-account--toolbar [data-account-trigger]').click(); await phone.locator('#business-account-toolbar:popover-open').waitFor();
    await phone.screenshot({ path: `${evidenceDir}/account-${width}.png` });
    await phone.locator('#business-account-toolbar [data-sign-out]').click(); await phone.waitForURL('**/login');
    await mobile.close();
  }
  assert.deepEqual(errors, []);
  const version = await db.select().from(operationsContentVersion); assert.ok(version.some(row => row.contentName === fields.contentName));
  const [schedule] = await db.select().from(operationsContentSchedule).where(eq(operationsContentSchedule.id, id)); assert.equal(schedule.actualPublishAt?.toISOString(), '2026-10-01T02:00:00.000Z');
  console.log('通过：桌面与 390／320px 登录、等待、防重复、输入保留、会话、账号切换及持久导航；无客户端异常。');
} catch (error) { console.error(fixture.logs().slice(-4000)); throw error; }
finally { await browser?.close(); await fixture.stop(); }
