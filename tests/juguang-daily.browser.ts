import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {seedJuguangPilot,pilotReports} from './juguang-daily.fixture';
import {admin,employee} from './auth.fixture';
import {withDatabase} from '../src/db/client';
import {saveJuguangConnection} from '../src/integrations/xiaohongshu-juguang';
import * as s from '../src/db/schema';
process.env.NODE_ENV='test';process.env.XHS_JUGUANG_APP_ID='42';process.env.XHS_JUGUANG_APP_SECRET='fictional-app-secret';process.env.BETTER_AUTH_SECRET='fictional-browser-secret-at-least-32-characters';
const directory=await mkdtemp(join(tmpdir(),'juguang-daily-browser-')),scenario=join(directory,'scenario.json'),clock=join(directory,'clock');
process.env.JUGUANG_SCENARIO_FILE=scenario;await writeFile(scenario,JSON.stringify({reports:pilotReports,delay:700}));await writeFile(scenario+'.calls','');await writeFile(clock,'2026-11-16T04:00:00Z');
const evidence=process.env.JUGUANG_EVIDENCE_DIR??'.tools/test-artifacts/juguang-daily-pilot/browser';await mkdir(evidence,{recursive:true});
const f=await startPostgresFixture({entry:'tests/juguang-server.fixture.mjs',clockFile:clock}),{db,baseURL}=f;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright'),browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:evidence+'/video',size:{width:1440,height:1000}}}),page=await context.newPage(),checks:string[]=[];
async function mode(value:unknown){await writeFile(scenario,JSON.stringify(value));}
async function settle(){await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(650);}
async function login(actor:typeof admin|typeof employee){const r=await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:actor});assert.equal(r.status(),200);const identity=await(await context.request.get(baseURL+'/api/auth/get-session')).json();return identity.user.id;}
async function metric(id:string){return(await db.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.id,id)))[0];}
async function waitRead(form:any){await waitFor(async()=>!!await form.locator('[name=juguangReceipt]').inputValue()&&!(await form.locator('[data-retry-juguang]').isDisabled()));}
async function waitFor(predicate:()=>Promise<boolean>){for(let i=0;i<100;i++){if(await predicate())return;await page.waitForTimeout(100);}throw new Error('state not reached');}
try {
 const bossId=await login(admin),[one,two]=await seedJuguangPilot(db);
 await withDatabase(db,()=>saveJuguangConnection({access_token:'fictional-access',refresh_token:'fictional-refresh',access_token_expires_in:86400,refresh_token_expires_in:2592000,user_id:'fictional-upstream',platform_type:1,scope:'["report_service"]',approval_advertisers:[11,22,33].map(advertiser_id=>({advertiser_id,advertiser_name:'隔离验收账户 '+advertiser_id}))},'42',bossId));
 const originalStrategy=await db.select().from(s.operationsPromotionCampaign);
 await page.goto(baseURL+'/business/daily-promotion-review');
 let first=page.locator(`[data-saved-review="${one.metric.id}"]`),second=page.locator(`[data-saved-review="${two.metric.id}"]`);
 await first.locator('[data-continue-review]').click();await first.locator('[name=spend]').fill('240');await first.locator('[name=actualOpenCount]').fill('4');await first.locator('[name=reviewDecision]').selectOption('test_pause');
 await waitRead(first);
 assert.equal(Number(await first.locator('[name=spend]').inputValue()),240);assert.equal(await first.locator('[name=actualOpenCount]').inputValue(),'4');assert.equal(await first.locator('[name=reviewDecision]').inputValue(),'test_pause');
 assert.equal(await first.locator('[name=impressionCount]').inputValue(),'1320');assert.equal((await metric(one.metric.id)).impressionCount,null);
 checks.push('首次慢读保留已输入消耗、实际人数及人工策略，预览不落库');
 await first.locator('[data-cancel-saved]').click();await page.getByRole('button',{name:'放弃修改',exact:true}).click();
 await first.locator('[data-continue-review]').waitFor({state:'visible'});assert.equal(await first.locator('[name=actualOpenCount]').inputValue(),'0');
 await mode({reports:pilotReports});await settle();await page.screenshot({path:evidence+'/daily-preview-1440.png',fullPage:true});
 await first.locator('[data-continue-review]').click();await first.locator('[data-save-saved]').click();await waitFor(async()=>(await metric(one.metric.id)).impressionCount===1320);
 first=page.locator(`[data-saved-review="${one.metric.id}"]`);second=page.locator(`[data-saved-review="${two.metric.id}"]`);
 await second.locator('[data-continue-review]').click();await second.locator('[data-save-saved]').click();await waitFor(async()=>(await metric(two.metric.id)).clickCount===23);
 assert.equal((await metric(two.metric.id)).actualOpenCount,1);checks.push('继续编辑后保存官方曝光与点击，面试课原实际1人保持');
 await page.reload();first=page.locator(`[data-saved-review="${one.metric.id}"]`);await waitRead(first);
 await first.locator('[data-continue-review]').click();await first.locator('[name=spend]').fill('240');await first.locator('[name=actualOpenCount]').fill('2');
 assert.equal(await first.locator('[name=juguangOverrideReason]').isVisible(),true);assert.equal(await first.locator('[name=juguangOverrideReason]').getAttribute('required'),'');
 await first.locator('[name=juguangOverrideReason]').fill('人工账单核对');await settle();await page.screenshot({path:evidence+'/daily-override-1440.png',fullPage:true});
 await first.locator('[data-save-saved]').click();await waitFor(async()=>(await metric(one.metric.id)).juguangSource?.overriddenFields.includes('spend')??false);
 await page.reload();first=page.locator(`[data-saved-review="${one.metric.id}"]`);await waitRead(first);assert.equal(Number(await first.locator('[name=spend]').inputValue()),240);assert.equal(await first.locator('[name=actualOpenCount]').inputValue(),'2');
 await first.locator('[data-continue-review]').click();await first.locator('[data-restore-juguang=spend]').click();assert.equal(await first.locator('[name=spend]').inputValue(),'238.44');await first.locator('[data-save-saved]').click();await waitFor(async()=>(await metric(one.metric.id)).juguangSource?.overriddenFields.length===0);
 checks.push('覆盖原因必填、覆盖标记刷新保留、恢复单字段聚光值，不清空实际人数');
 await page.reload();first=page.locator(`[data-saved-review="${one.metric.id}"]`);await waitRead(first);await first.locator('[data-continue-review]').click();
 await first.locator('[name=clickCount]').fill('20');assert.equal(await first.locator('[data-juguang-ctr]').textContent(),'1.52%');await first.locator('[data-restore-juguang=clickCount]').click();assert.equal(await first.locator('[data-juguang-ctr]').textContent(),'3.03%');
 await first.locator('[name=actualOpenCount]').fill('3');await mode({network:true});if(!await first.locator('[data-retry-juguang]').isVisible())await first.getByRole('button',{name:'查看聚光数据来源'}).click();await first.locator('[data-retry-juguang]').click();await first.locator('[data-juguang-message][data-error=true]').waitFor();assert.equal(await first.locator('[name=actualOpenCount]').inputValue(),'3');assert.equal(await first.locator('[name=impressionCount]').inputValue(),'1320');
 await settle();await page.screenshot({path:evidence+'/daily-error-1440.png',fullPage:true});await mode({reports:pilotReports});if(!await first.locator('[data-retry-juguang]').isVisible())await first.getByRole('button',{name:'查看聚光数据来源'}).click();await first.locator('[data-retry-juguang]').click();await waitRead(first);assert.equal(await first.locator('[name=actualOpenCount]').inputValue(),'3');
 await first.locator('[data-cancel-saved]').click();await page.getByRole('button',{name:'放弃修改',exact:true}).click();
 checks.push('原始计数编辑自动重算、恢复值、断网保留、重试保留实际草稿、公共未保存保护与取消');
 for(const width of [1920,1440,1024]){await page.setViewportSize({width,height:1000});await page.locator('.review-entry-scroll[data-review-container=ready]').evaluate((node:HTMLElement)=>{node.scrollLeft=0;});await settle();await page.screenshot({path:`${evidence}/daily-ready-${width}.png`,fullPage:true});}
 const alignment=await first.evaluate((form:HTMLFormElement)=>[...form.querySelectorAll<HTMLElement>('input[name=spend],input[name=platformOpenCount],input[name=actualOpenCount],input[name=platformLeadCount],input[name=actualLeadCount],input[name=impressionCount],input[name=clickCount],[data-juguang-ctr]')].map(node=>{const r=node.getBoundingClientRect();return r.y+r.height/2;}));assert(Math.max(...alignment)-Math.min(...alignment)<1,'原五项与曝光、点击、CTR同一行同基线');
 const geometry:Array<{name:string;font:string;disabled:boolean}>=await first.evaluate((form:HTMLFormElement)=>{const inputs=[...form.querySelectorAll<HTMLInputElement>('input:not([type=hidden])')];return inputs.map(input=>({name:input.name,font:getComputedStyle(input).fontFamily,size:getComputedStyle(input).fontSize,disabled:input.disabled,bg:getComputedStyle(input).backgroundColor,rect:input.getBoundingClientRect().toJSON()}));});
 await writeFile(evidence+'/geometry.json',JSON.stringify(geometry,null,2));assert(geometry.every(g=>g.font.includes('MiSans')));assert(geometry.filter(g=>g.name!=='juguangOverrideReason').every(g=>g.disabled));
 await page.setViewportSize({width:1440,height:1000});await page.goto(baseURL+`/business/daily-promotion-review?view=history&from=2026-11-15&to=2026-11-15&campaign=${two.metric.id}`);await page.locator(`[data-edit-trigger="${two.metric.id}"]`).click();
 let history=page.locator('dialog[open] [data-history-edit-form]');await waitRead(history);assert.equal(await history.locator('[name=impressionCount]').inputValue(),'618');assert.equal(await history.locator('[name=actualOpenCount]').inputValue(),'1');
 await settle();await page.screenshot({path:evidence+'/history-editor-1440.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await settle();assert(await page.locator('dialog[open] [data-close-edit]').first().isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:evidence+'/history-editor-390.png',fullPage:true});
 await page.locator('dialog[open] [data-close-edit]').first().click();await page.waitForTimeout(300);assert.equal(await page.locator('dialog[data-edit-dialog][open]').count(),0);
 checks.push('1440／1920／1024桌面与历史编辑已截图、MiSans及禁用字段实测；390只检无页面溢出和关闭可达');
 await page.setViewportSize({width:1440,height:1000});await login(employee);await page.goto(baseURL+'/business/daily-promotion-review');second=page.locator(`[data-saved-review="${two.metric.id}"]`);await waitRead(second);assert.equal(await second.locator('[name=actualOpenCount]').inputValue(),'1');await second.locator('[data-continue-review]').click();await settle();await page.screenshot({path:evidence+'/employee-edit-1440.png',fullPage:true});
 assert.deepEqual(await db.select().from(s.operationsPromotionCampaign),originalStrategy);checks.push('员工同对象来源与输入一致，所有自动读取及数值保存后推广策略逐项不变');
 await writeFile(clock,'2026-11-15T04:00:00Z');await page.goto(baseURL+'/business/daily-promotion-review');assert.equal(await page.locator('form[data-juguang-pilot]').count(),0);assert.equal(await page.locator('.review-entry-head [data-juguang-column]:visible').count(),0);assert.equal(await page.locator('.review-entry-head').first().evaluate((node:HTMLElement)=>getComputedStyle(node).gridTemplateColumns.split(' ').length),11);checks.push('非试样日期保留原11列表头及录入，不显示聚光字段或读取');
 await writeFile(evidence+'/result.json',JSON.stringify({passed:true,checks},null,2));console.log(checks.join('\n'));
}catch(error){await page.screenshot({path:evidence+'/failure.png',fullPage:true}).catch(()=>{});console.error(f.logs().slice(-3000));throw error;}
finally{await context.close();await browser.close();await f.stop();}
