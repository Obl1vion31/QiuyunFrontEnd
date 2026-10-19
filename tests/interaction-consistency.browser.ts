import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {eq} from 'drizzle-orm';
import {startFixture,admin,employee} from './auth.fixture';
import * as s from '../src/db/schema';
import {businessDateTime} from '../src/scripts/business-date';
import {completionStatus} from '../src/db/schedule-rules.mjs';
import {respondToBusinessConfirm} from './business-confirm.helper';
const fixture=await startFixture(),{db,baseURL}=fixture;let browser:any;
async function login(user:typeof admin|typeof employee){const response=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(user)});assert.equal(response.status,200);return response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');}
async function seed(name:string,actualHours:number|null){
 const planned=new Date();planned.setMinutes(0,0,0);
 const [content]=await db.insert(s.operationsContent).values({}).returning();
 const [version]=await db.insert(s.operationsContentVersion).values({contentId:content.id,versionNumber:0,workType:'new',contentName:name,subjectId:'tmua',categoryId:'temporary',projectDocUrl:'https://fixture.test/doc'}).returning();
 const actual=actualHours===null?null:new Date(planned.getTime()+actualHours*3600000);
 return (await db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:planned,actualPublishAt:actual,completionStatus:completionStatus(planned,actual)}).returning())[0];
}
try{
 const staffCookie=await login(employee),adminCookie=await login(admin);
 const one=await seed('虚构交互按时帖',1),two=await seed('虚构交互未登记帖',null);
 const reasonDraft=await seed('虚构审核原因草稿帖',null);await db.update(s.operationsContentSchedule).set({plannedPublishAt:new Date(Date.now()-50*3600000)}).where(eq(s.operationsContentSchedule.id,reasonDraft.id));
 const [staff]=await db.select().from(s.authUser).where(eq(s.authUser.username,employee.username));
 const pw=await import(process.env.PLAYWRIGHT_MODULE||new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);browser=await pw.chromium.launch({headless:true});await mkdir('.tools/test-artifacts',{recursive:true});
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
 await context.addCookies(staffCookie.split('; ').map(pair=>({name:pair.slice(0,pair.indexOf('=')),value:pair.slice(pair.indexOf('=')+1),url:baseURL})));
 const page=await context.newPage(),errors:string[]=[];page.on('pageerror',(error:Error)=>errors.push(error.message));page.on('dialog',(dialog:any)=>{errors.push('出现原生确认框：'+dialog.type());dialog.dismiss();});
 const workflowPath=`/api/operations-content/${one.id}/workflow`;
 const workflow=await (await fetch(baseURL+workflowPath,{headers:{Cookie:staffCookie}})).json();
 for(const duration of [100,450]){
  await page.goto(baseURL+'/business/operations-schedule');
  await page.route('**'+workflowPath,async(route:any)=>{await new Promise(resolve=>setTimeout(resolve,duration));await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(workflow)});});
  const card=page.locator(`[data-inspect-id="${one.id}"]`).first();const markup=await card.innerHTML(),color=await card.evaluate((node:HTMLElement)=>getComputedStyle(node).backgroundColor);
  await page.evaluate(()=>{(window as any).__loaders=0;const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node instanceof HTMLElement&&(node.hasAttribute('data-inspector-loading')||node.querySelector('[data-inspector-loading]')))(window as any).__loaders++;});observer.observe(document.body,{childList:true,subtree:true});});
  await card.click();await page.locator('[data-schedule-workflow][data-ready=true]').waitFor({state:'attached'});
  assert.equal(await page.evaluate(()=>(window as any).__loaders),0,`${duration}ms 不闪烁加载`);assert.equal(await card.innerHTML(),markup);assert.equal(await card.evaluate((node:HTMLElement)=>getComputedStyle(node).backgroundColor),color);assert.equal(await card.isEnabled(),true);
  assert.equal(await page.locator('[data-inspector-actual]').innerText(),businessDateTime(one.actualPublishAt!));assert.equal(await page.locator('[data-inspector-planned]').innerText(),businessDateTime(one.plannedPublishAt));
  await page.unroute('**'+workflowPath);
 }
 await page.goto(baseURL+'/business/operations-schedule');
 await page.route('**'+workflowPath,async(route:any)=>{await new Promise(resolve=>setTimeout(resolve,1000));await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(workflow)});});
 await page.locator(`[data-inspect-id="${one.id}"]`).first().click();await page.locator('[data-inspector-loading]').waitFor();assert.equal(await page.locator('[data-inspector-loading]').count(),1);assert.equal(await page.locator('[data-operation-feedback]').getAttribute('aria-hidden'),'true');
 await page.locator(`[data-inspect-id="${two.id}"]`).first().click();await page.locator('[data-schedule-workflow][data-ready=true]').waitFor({state:'attached'});await page.waitForTimeout(1100);assert.match(await page.locator('[data-inspector]>header').innerText(),/虚构交互未登记帖/);assert.equal(await page.locator('[data-inspector-loading]').count(),0);await page.unroute('**'+workflowPath);
 // 编辑、发布与改帖共用反向关闭生命周期，关闭动画期间仍在 top layer。
 for(const [button,dialog] of [['[data-inspector-edit]','#schedule-dialog'],['[data-inspector-publication]','#publication-dialog'],['[data-inspector-revise]','#schedule-dialog']]){
  await page.locator(button).click();await page.waitForTimeout(240);
  const close=page.locator(`${dialog} .dialog-head button`).first();await close.click();
  assert.equal(await page.locator(dialog).evaluate((node:HTMLDialogElement)=>node.open),true);assert.equal(await page.locator(dialog).getAttribute('data-closing'),'true');await page.locator(dialog).waitFor({state:'hidden'});
 }
 await page.locator('[data-inspector-edit]').click();await page.locator('#contentName').fill('尚未保存的输入');
 {const answer=respondToBusinessConfirm(page);await page.goBack();await answer;}
 assert.equal(await page.locator('#contentName').inputValue(),'尚未保存的输入','取消后退保留原编辑内容');
 {const answer=respondToBusinessConfirm(page);await page.keyboard.press('Escape');await answer;}
 assert.equal(await page.locator('#contentName').inputValue(),'尚未保存的输入');
 {const answer=respondToBusinessConfirm(page,true);await page.keyboard.press('Escape');await answer;}await page.locator('#schedule-dialog').waitFor({state:'hidden'});
 // 管理员实际配置逐账号审核权限，员工提交新规划后不提前出现业务行。
 const manager=await browser.newContext({reducedMotion:'no-preference'});await manager.addCookies(adminCookie.split('; ').map(pair=>({name:pair.slice(0,pair.indexOf('=')),value:pair.slice(pair.indexOf('=')+1),url:baseURL})));const settings=await manager.newPage();settings.on('pageerror',(error:Error)=>errors.push(error.message));
 await settings.goto(baseURL+'/business/annual-plan');await settings.locator('[data-copy-year]').click();await settings.waitForTimeout(240);await settings.keyboard.press('Escape');assert.equal(await settings.locator('#copy-dialog').evaluate((node:HTMLDialogElement)=>node.open),true,'原生 Esc 也等待退出动画');await settings.locator('#copy-dialog').waitFor({state:'hidden'});
 await settings.goto(baseURL+'/business/settings?view=permissions');await settings.locator('[data-permission-account]').selectOption(staff.id);
 const grants=settings.locator(`[data-account-permissions="${staff.id}"]`);await grants.locator('[name="annual.create"]').selectOption('review');await grants.locator('[name="schedule.reason"]').selectOption('review');const savedGrant=settings.waitForResponse((response:any)=>response.url().endsWith('/api/business-settings/account-permissions')&&response.request().method()==='PATCH');await grants.locator('button[type=submit]').click();const grantResponse=await savedGrant;assert.equal(grantResponse.status(),200,await grantResponse.text());await grants.locator('output').getByText('已保存',{exact:true}).waitFor();
 for(const width of [390,320]){await settings.setViewportSize({width,height:900});assert.equal(await settings.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}px 权限配置不溢出`);}
 await settings.screenshot({path:'.tools/test-artifacts/account-permissions-320.png',fullPage:true});await settings.setViewportSize({width:1440,height:900});
 await page.goto(baseURL+'/business/annual-plan?year=2027');await page.locator('[data-open-new]').click();await page.locator('[name=rowName]').fill('虚构待审核年度规划');await page.locator('#row-form button[type=submit]').click();await page.waitForLoadState('networkidle');await page.locator('.business-pending-changes>summary').getByText('待审核',{exact:true}).waitFor();
 assert.equal(await page.locator('.item-cell').filter({hasText:'虚构待审核年度规划'}).count(),0);
 assert.equal(await settings.locator('.settings-tabs').getByRole('link',{name:'待审核',exact:true}).count(),0);await settings.goto(baseURL+'/business/settings?view=approvals');const proposal=settings.locator('[data-proposal-id]').first();await proposal.locator('summary').click();const approved=settings.waitForResponse((response:any)=>response.url().includes('/api/business-change-proposals/')&&response.request().method()==='PATCH');await proposal.getByRole('button',{name:'同意修改'}).click();const approvedResponse=await approved;assert.equal(approvedResponse.status(),200,approvedResponse.status()===200?'':await approvedResponse.text());await settings.waitForLoadState('networkidle');await settings.locator('[data-proposal-id]>summary').getByText('已通过',{exact:true}).waitFor();
 await page.reload();await page.locator('.item-cell').filter({hasText:'虚构待审核年度规划'}).waitFor();assert.deepEqual(errors,[]);
 await page.goto(baseURL+`/business/operations-schedule?row=${reasonDraft.id}`);await page.locator('[data-schedule-workflow][data-ready=true]').waitFor();
 const days=page.locator('.workflow-pending-reasons>.workflow-reason'),first=days.first(),last=days.last();
 await first.locator('input[value=self]').check();await first.locator('textarea').fill('提交审核的一天');await last.locator('summary').click();await last.locator('input[value=external]').check();await last.locator('textarea').fill('另一条尚未保存的输入');
 await first.locator('button[type=submit]').click();await first.locator('output').getByText('已提交管理员审核。',{exact:true}).waitFor();assert.equal(await last.locator('textarea').inputValue(),'另一条尚未保存的输入');assert.equal(await page.locator('[data-inspector]').getAttribute('data-dirty'),'true');
 {const answer=respondToBusinessConfirm(page,true);await page.locator('[data-close-inspector]').click();await answer;}
 assert.deepEqual(errors,[]);
 await manager.close();await context.close();console.log('通过：100/450ms无闪烁、慢请求局部加载与旧响应隔离、日期回显、三类抽屉退出、站内草稿保护及真实逐账号审核。');
}catch(error){console.error(fixture.logs().slice(-5000));throw error;}finally{await browser?.close();await fixture.stop();}
