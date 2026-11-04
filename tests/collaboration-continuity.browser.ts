import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {settleBusinessUI} from './business-confirm.helper';
import * as s from '../src/db/schema';
const dir=resolve(process.env.COLLABORATION_CONTINUITY_DIR||'.tools/test-artifacts/collaboration-continuity');
await mkdir(dir,{recursive:true});const clockFile=dir+'/clock.txt';let now=Date.now();await writeFile(clockFile,new Date(now).toISOString());
const fixture=await startPostgresFixture({clockFile}),{db,baseURL}=fixture,checks:string[]=[],errors:string[]=[];let browser:any;
const mark=(value:string)=>{checks.push(value);console.log('PASS',value);};
try{
 const [content]=await db.insert(s.operationsContent).values({platformNoteId:randomUUID().replaceAll('-','').slice(0,24)}).returning();
 const [version]=await db.insert(s.operationsContentVersion).values({contentId:content.id,contentName:'编辑连续性：正常续期与返回页面',versionNumber:0,workType:'new',subjectId:'tmua',categoryId:'temporary'}).returning();
 const date=new Date(now-3*86400000).toISOString().slice(0,10),published=new Date(date+'T01:00:00Z');
 const [schedule]=await db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,isPromoted:true,promotionStatus:'scaling',plannedPublishAt:published,actualPublishAt:published,completionStatus:'on_time',publicationUrl:'https://www.xiaohongshu.com/explore/'+content.platformNoteId}).returning();
 const [campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:schedule.id,startedOn:date,dailyReviewEnabledOn:date,initialStage:'scaling',currentStage:'scaling',currentStatus:'scaling'}).returning();
 await db.insert(s.operationsPromotionStage).values({campaignId:campaign.id,stageType:'scaling',startedOn:date});
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||resolve('.tools/tooling/node_modules/playwright/index.mjs'));browser=await chromium.launch({headless:process.env.COLLABORATION_HEADED!=='1',args:['--no-sandbox']});
 const actors:any[]=[];
 for(const [role,username,password]of [['admin','test_admin','fictional-admin-password'],['employee','test_employee','fictional-employee-password']]){
  const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:dir+'/video',size:{width:1440,height:1000}}}),page=await context.newPage();
  page.on('pageerror',(e:Error)=>errors.push(role+': '+e.message));await page.clock.install({time:new Date(now)});await page.clock.setFixedTime(new Date(now));
  await page.goto(baseURL+'/login');await page.getByLabel('账号或用户名',{exact:true}).fill(username);await page.getByLabel('密码',{exact:true}).fill(password);await page.getByRole('button',{name:'登录工作台',exact:true}).click();await page.waitForURL('**/business/operations-schedule');
  actors.push({context,page,role});
 }
 const [admin,employee]=actors;const focusCdp=await admin.context.newCDPSession(admin.page);
 const backgroundApp=async()=>{await background.bringToFront();await focusCdp.send('Emulation.setFocusEmulationEnabled',{enabled:false});await admin.page.waitForFunction(()=>!document.hasFocus());};
 const foregroundApp=async()=>{await admin.page.bringToFront();await focusCdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});await admin.page.waitForFunction(()=>document.hasFocus());};
 const advance=async()=>{now+=61000;await writeFile(clockFile,new Date(now).toISOString());for(const actor of actors)await actor.page.clock.setFixedTime(new Date(now));};
 const form=(page:any)=>page.locator(`[data-metric-form][data-schedule-id="${schedule.id}"]`).first();
 const enter=async(actor:any)=>{await actor.page.goto(baseURL+'/business/daily-promotion-review');await settleBusinessUI(actor.page);return form(actor.page);};
 await admin.page.bringToFront();const metric=await enter(admin),input=metric.locator('[name=spend]');await input.fill('123.45');await metric.locator(':scope[data-edit-lock=owned]').waitFor();
 const background=await admin.context.newPage();await background.goto('about:blank');await backgroundApp();await advance();await foregroundApp();await admin.page.waitForTimeout(1000);
 await admin.page.waitForFunction(()=>document.querySelector('[data-metric-form]')?.getAttribute('data-edit-lock')==='owned'&&!document.querySelector('[data-metric-form] input[name=spend]')?.hasAttribute('disabled'),{},{timeout:8000});
 assert.equal(await input.inputValue(),'123.45');assert.equal(await metric.locator('[data-editor-badge]').count(),0);assert.equal(await admin.page.locator('[data-business-confirm][open]').count(),0);await input.press('End');await input.press('6');assert.equal(await input.inputValue(),'123.456');mark('后台超过租约后返回，空闲对象自动衔接并保留输入，无确认或灰闪');
 await input.fill('123.45');
 // A successful business save can arrive after the foreground page has obtained a new lease.
 for(const name of ['platformOpenCount','actualOpenCount','platformLeadCount','actualLeadCount'])await metric.locator('[name='+name+']').fill('2');
 await metric.locator('[name=reviewDecision]').selectOption('scaling_continue');
 let savedResolve!:()=>void,deliverResolve!:()=>void;const saved=new Promise<void>(r=>savedResolve=r),deliver=new Promise<void>(r=>deliverResolve=r);
 await admin.page.route('**/api/promotion-daily',async(route:any)=>{const response=await route.fetch();console.log('SAVE STATUS',response.status());savedResolve();await deliver;await route.fulfill({response});});
 const saving=admin.page.evaluate(async()=>{const result=await fetch('/api/promotion-daily',{method:'POST',body:new FormData(document.querySelector<HTMLFormElement>('[data-metric-form]')!)});return result.status;});void saving.catch(()=>{});
 await saved;await backgroundApp();await advance();await foregroundApp();await admin.page.waitForTimeout(800);await metric.locator(':scope[data-edit-lock=owned]').waitFor();
 deliverResolve();assert.ok((await saving)<300);await admin.page.unroute('**/api/promotion-daily');await admin.page.waitForTimeout(300);assert.equal(await metric.getAttribute('data-edit-lock'),'owned','迟到的保存回执不能释放恢复后的新编辑权');mark('真实后台返回后，迟到的业务保存回执不释放新编辑权');
 // Hold an actual expired PATCH result across Astro navigation; it must not invalidate the new page's lease.
 let heldResolve!:()=>void,continueResolve!:()=>void;const held=new Promise<void>(r=>heldResolve=r),continueResponse=new Promise<void>(r=>continueResolve=r);let intercepted=false;
 await admin.page.route('**/api/collaboration/locks',async(route:any)=>{if(route.request().method()==='PATCH'&&!intercepted){intercepted=true;const response=await route.fetch();heldResolve();await continueResponse;await route.fulfill({response});}else await route.continue();});
 await advance();await admin.page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await held;
 await admin.page.locator('[data-module-id=annual-plan]').click();const confirmation=admin.page.locator('[data-business-confirm][open]');if(await confirmation.isVisible())await admin.page.locator('[data-confirm-accept]').click();await admin.page.waitForURL('**/business/annual-plan');
 await admin.page.locator('[data-module-id=daily-promotion]').click();await admin.page.waitForURL('**/business/daily-promotion-review');await form(admin.page).locator('[name=spend]').fill('87.65');await form(admin.page).locator(':scope[data-edit-lock=owned]').waitFor();continueResolve();await admin.page.waitForTimeout(1000);await admin.page.unroute('**/api/collaboration/locks');
 assert.equal(await form(admin.page).getAttribute('data-edit-lock'),'owned');assert.ok(await form(admin.page).locator('[name=spend]').isEnabled());assert.equal(await form(admin.page).locator('[name=spend]').inputValue(),'87.65');mark('换页前的迟到失锁响应不影响返回后新取得的编辑权');
 // Browser pagehide/pageshow is also emitted on back/forward cache restores. Exercise those handlers with the same live document.
 await admin.page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));await admin.page.waitForTimeout(300);await admin.page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
 await form(admin.page).locator('[name=spend]').focus();await form(admin.page).locator('[name=spend]').press('End');await form(admin.page).locator('[name=spend]').press('4');await form(admin.page).locator(':scope[data-edit-lock=owned]').waitFor();assert.equal(await form(admin.page).locator('[name=spend]').inputValue(),'87.654');mark('浏览器返回缓存生命周期重新核实编辑权，输入和焦点保留');
 for(const width of [1920,1440,1024,390,320]){await admin.page.setViewportSize({width,height:width<500?780:1000});await form(admin.page).locator('[name=spend]').evaluate((el:HTMLElement)=>el.scrollIntoView({block:'center',inline:'center'}));await settleBusinessUI(admin.page);await admin.page.screenshot({path:dir+`/admin-resumed-${width}.png`});}
 await admin.page.setViewportSize({width:1440,height:1000});
 const occupied=await enter(employee);await occupied.locator(':scope[data-edit-lock=blocked]').waitFor();await occupied.locator('[data-editor-badge]').click();await employee.page.locator('[data-confirm-message]').getByText('Admin 正在编辑中，请确认情况。',{exact:false}).waitFor();await settleBusinessUI(employee.page);await employee.page.screenshot({path:dir+'/real-takeover-confirm-1440.png'});await employee.page.locator('[data-confirm-accept]').click();await occupied.locator(':scope[data-edit-lock=owned]').waitFor();await occupied.locator('[name=spend]').fill('43.21');await form(admin.page).locator(':scope[data-edit-lock=blocked]').waitFor();assert.equal(await form(admin.page).locator('[name=spend]').inputValue(),'87.654');
 await advance();await Promise.all(actors.map(a=>a.page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')))));await occupied.locator(':scope[data-edit-lock=owned]').waitFor();await admin.page.waitForTimeout(3500);assert.equal(await form(admin.page).getAttribute('data-edit-lock'),'blocked');assert.ok(await form(admin.page).locator('[name=spend]').isDisabled());assert.equal(await occupied.locator('[name=spend]').inputValue(),'43.21');mark('真实接管后旧编辑者不自动夺回，员工租约过期可衔接且双方草稿保留');
 await employee.page.setViewportSize({width:390,height:780});await occupied.locator('[name=spend]').evaluate((el:HTMLElement)=>el.scrollIntoView({block:'center',inline:'center'}));await settleBusinessUI(employee.page);await employee.page.screenshot({path:dir+'/employee-resumed-390.png'});
 const [calendarContent]=await db.insert(s.operationsContent).values({}).returning();const [calendarVersion]=await db.insert(s.operationsContentVersion).values({contentId:calendarContent.id,contentName:'月历后台恢复原稿',versionNumber:0,workType:'new',subjectId:'tmua',categoryId:'temporary'}).returning();const [calendarSchedule]=await db.insert(s.operationsContentSchedule).values({contentVersionId:calendarVersion.id,isPromoted:false,promotionStatus:'none',plannedPublishAt:new Date(Math.floor((now+86400000)/60000)*60000),completionStatus:'pending'}).returning();
 await admin.page.goto(baseURL+'/business/operations-schedule?month='+new Date(now).toISOString().slice(0,7)+'&row='+calendarSchedule.id);await admin.page.bringToFront();await admin.page.getByRole('button',{name:'编辑排期',exact:true}).click();const calendarForm=admin.page.locator('#schedule-dialog[open] form');await calendarForm.locator('[name=contentName]').fill('月历返回后保留的草稿');await calendarForm.locator(':scope[data-edit-lock=owned]').waitFor();
 let renewalResolve!:()=>void,finishRenewal!:()=>void;const renewalHeld=new Promise<void>(r=>renewalResolve=r),finishPending=new Promise<void>(r=>finishRenewal=r);let once=false;
 await admin.page.route('**/api/collaboration/locks',async(route:any)=>{if(route.request().method()==='PATCH'&&!once){once=true;renewalResolve();await finishPending;try{await route.continue();}catch{}}else await route.continue();});
 await admin.page.evaluate(()=>window.dispatchEvent(new Event('focus')));await renewalHeld;await backgroundApp();await advance();await foregroundApp();
 await admin.page.waitForFunction(()=>document.querySelector('#schedule-dialog form')?.getAttribute('data-edit-lock')==='owned',{},{timeout:2000});
 const calendarResponse=admin.page.waitForResponse((r:any)=>r.url().endsWith('/api/operations-content/'+calendarSchedule.id)&&r.request().method()==='PATCH');const request=admin.page.waitForRequest((r:any)=>r.url().endsWith('/api/operations-content/'+calendarSchedule.id)&&r.method()==='PATCH',{timeout:2500});await calendarForm.locator('button[type=submit]').click();await request;finishRenewal();await admin.page.unroute('**/api/collaboration/locks');const calendarResult=await calendarResponse;assert.equal(calendarResult.ok(),true,'月历保存HTTP '+calendarResult.status());await admin.page.locator('#schedule-dialog').waitFor({state:'hidden'});assert.equal((await db.select().from(s.operationsContentVersion).where(eq(s.operationsContentVersion.id,calendarVersion.id)))[0].contentName,'月历返回后保留的草稿');mark('真实月历编辑：后台挂起的续期不阻塞返回后的填写与保存');
 await admin.page.screenshot({path:dir+'/calendar-return-saved-1440.png'});await background.close();
 assert.deepEqual(errors,[]);await writeFile(dir+'/result.json',JSON.stringify({checks,errors,clock:'repository fixture moves client/server 61 seconds together; production lease remains 60 seconds',lifecycle:'pagehide/pageshow handlers exercised on live document'},null,2));
}finally{await browser?.close();await fixture.stop();}
