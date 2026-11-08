import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {admin,employee} from './auth.fixture';
import {prepareMonthlyArrangement} from './monthly-arrangement.fixture';
import {seedLinkPost} from './monthly-plan-links.fixture';
import {respondToBusinessConfirm,settleBusinessUI} from './business-confirm.helper';
import * as s from '../src/db/schema';
const dir=process.env.PLACEMENT_DIR??'.tools/test-artifacts/placement/browser';
for(const sub of ['screenshots','video','guide'])await mkdir(dir+'/'+sub,{recursive:true});
const clock=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clock,'2026-11-08T12:00:00+08:00');
const f=await startPostgresFixture({clockFile:clock,entry:process.env.PLACEMENT_ENTRY}),{db,baseURL}=f;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);let browser:any,page:any;const errors:string[]=[],checks:string[]=[],videos:Record<string,string>={};
const schedule=(id:string)=>db.select().from(s.operationsContentSchedule).where(eq(s.operationsContentSchedule.id,id)).then(r=>r[0]);
async function shot(p:any,name:string){await settleBusinessUI(p);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:dir+'/screenshots/'+name+'.png'});}
async function alignGuide(p:any,target:any){
 await target.scrollIntoViewIfNeeded();const box=await target.boundingBox(),toolbar=await p.locator('.business-toolbar').boundingBox(),menu=p.locator('[data-guide-mobile]'),extra=await menu.isVisible()?(await menu.boundingBox()).height:0;
 await p.mouse.move(500,300);await p.mouse.click(245,80);await p.mouse.wheel(0,box.y-toolbar.height-extra-24);await p.waitForTimeout(300);
}
async function shots(p:any,name:string){for(const width of [1920,1440,1024]){await p.setViewportSize({width,height:1000});await shot(p,name+'-'+width);}await p.setViewportSize({width:1440,height:1000});}
async function detail(p:any,id:string){await p.locator('.calendar-item[data-inspect-id="'+id+'"]').click();await p.locator('#schedule-panel[open][data-view=detail]').waitFor();await settleBusinessUI(p);}
async function edit(p:any){await p.locator('[data-inspector-edit]').click();await p.locator('#schedule-panel[data-view=form]').waitFor();await p.waitForFunction(()=>document.querySelector('#schedule-form')?.getAttribute('data-operation-loaded')==='true');await settleBusinessUI(p);}
async function close(p:any){await p.locator('#schedule-panel [data-close-inspector]').click();await p.locator('#schedule-panel').waitFor({state:'hidden'});}
async function restore(context:any,id:string,day:string,time:string){const p=await(await context.request.get(baseURL+'/api/operations-content/'+id+'/placement?date='+day)).json(),r=await context.request.post(baseURL+'/api/operations-content/'+id+'/placement',{headers:{Origin:baseURL},data:{action:'move',day,time,expectedPlanRevision:p.source.planRevision,fingerprint:p.fingerprint,requestKey:randomUUID(),reason:'隔离场景恢复'}});assert.equal(r.status(),200,await r.text());}
async function placement(p:any,id:string,day:string){await detail(p,id);await p.locator('[data-inspector-placement]').click();await p.locator('#placement-form [name=destination]').fill(day);await p.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('#placement-form [type=submit]')!.disabled);await settleBusinessUI(p);}
try{
 browser=await chromium.launch({headless:true});
 const contexts:any[]=[];
 for(const actor of [admin,employee]){const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:dir+'/video',size:{width:1440,height:1000}}});assert.equal((await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:actor})).status(),200);contexts.push(context);}
 const cookie=(await contexts[0].cookies()).map((c:any)=>c.name+'='+c.value).join('; '),setup=await prepareMonthlyArrangement(db,baseURL,cookie);
 const a=await seedLinkPost(db,'TMUA 函数图像讲义：重点梳理与典型例题','2026-11-08T15:00'),b=await seedLinkPost(db,'TMUA 数列讲义：递推与归纳','2026-11-10T10:00'),c=await seedLinkPost(db,'STEP 成功案例：学习计划与复习节奏','2026-11-10T18:00',{subjectId:'step',categoryId:'success-story'}),published=await seedLinkPost(db,'已发布：面试课经验分享','2026-11-10T20:00');
 await db.update(s.operationsContentSchedule).set({actualPublishAt:new Date('2026-11-08T03:00:00Z')}).where(eq(s.operationsContentSchedule.id,published.schedule.id));
 const [plan]=await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.id,setup.planId));await db.insert(s.operationsMonthlyPlanAssignment).values({planId:plan.id,itemId:plan.content.items[0].id,scheduleId:a.schedule.id,history:[]});
 for(let i=0;i<contexts.length;i++){
  const role=i?'employee':'admin',context=contexts[i];page=await context.newPage();const p=page;await p.clock.setFixedTime(new Date('2026-11-08T12:00:00+08:00'));p.on('pageerror',(e:Error)=>errors.push(e.message));let navigations=0;p.on('request',(r:any)=>{if(r.isNavigationRequest()&&r.frame()===p.mainFrame())navigations++;});
  await p.goto(baseURL+'/business/operations-schedule?month=2026-11');await settleBusinessUI(p);await shots(p,role+'-calendar');
  if(!i){await p.locator('[data-arrangement-form]').screenshot({path:dir+'/guide/monthly-review-raw.png'});}
  await detail(p,a.schedule.id);await edit(p);await shots(p,role+'-edit-unchanged');
  assert.equal(await p.locator('#schedule-form').getAttribute('data-dirty'),'false');
  await p.locator('#schedule-form').getByRole('button',{name:'取消',exact:true}).click();await p.locator('#schedule-panel[data-view=detail]').waitFor();assert.equal(await p.locator('[data-business-confirm][open]').count(),0);
  await edit(p);const original=await p.locator('#contentName').inputValue();await p.locator('#contentName').fill(original+' 临时');await p.locator('#contentName').fill(original);await p.locator('#schedule-form').getByRole('button',{name:'取消',exact:true}).click();await p.locator('#schedule-panel[data-view=detail]').waitFor();assert.equal(await p.locator('[data-business-confirm][open]').count(),0);
  await edit(p);await p.keyboard.press('Escape');await p.locator('#schedule-panel').waitFor({state:'hidden'});assert.equal(await p.locator('[data-business-confirm][open]').count(),0);
  // 慢回填期间真实输入必须仍受保护，恢复原值后无需确认。
  let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);await p.route('**/api/non-promotion-checkpoints?scheduleId=*',async(route:any)=>{await held;await route.continue();});
  await detail(p,a.schedule.id);await p.locator('[data-inspector-edit]').click();await p.locator('#contentName').fill(original+' 加载中已填写');release();await p.waitForFunction(()=>document.querySelector('#schedule-form')?.getAttribute('data-operation-loaded')==='true');await p.unroute('**/api/non-promotion-checkpoints?scheduleId=*');
  await p.locator('#schedule-form').getByRole('button',{name:'取消',exact:true}).click();await respondToBusinessConfirm(p,false);assert.equal(await p.locator('#contentName').inputValue(),original+' 加载中已填写');await p.locator('#contentName').fill(original);await p.locator('#schedule-form').getByRole('button',{name:'取消',exact:true}).click();await p.locator('#schedule-panel[data-view=detail]').waitFor();await close(p);
  checks.push(role+'：打开编辑、改回原值、Esc无误报；慢回填保留真实输入，取消确认可继续编辑');
  await placement(p,a.schedule.id,'2026-11-10');assert.equal(await p.locator('#placement-form [name=placementChoice]').count(),4);assert.equal(await p.locator('#placement-form [value="'+c.schedule.id+'"]').count(),1);assert(await p.locator('#placement-form [name=placementChoice][value="'+published.schedule.id+'"]').isDisabled());
  await p.locator('#placement-form [value="'+b.schedule.id+'"]').check();await shots(p,role+'-placement-choice');
  if(!i){await p.locator('#schedule-panel').screenshot({path:dir+'/guide/placement-choice-raw.png'});}
  assert.equal(await p.locator('dialog[open]').count(),1);
  await p.locator('[data-placement-cancel]').click();await respondToBusinessConfirm(p,true);await p.locator('#schedule-panel[data-view=detail]').waitFor();await close(p);
  // 真实拖拽；目标日已有其他帖子，必须选择具体对换对象。
  const source=p.locator('.calendar-item[data-inspect-id="'+a.schedule.id+'"]'),day=p.locator('[data-calendar-day="2026-11-10"] .day-number');await source.dragTo(day);
  await p.locator('#schedule-panel[data-view=placement]').waitFor();await p.locator('#placement-form [value="'+b.schedule.id+'"]').check();const navigationCount=navigations;
  const saved=p.waitForResponse((r:any)=>r.url().endsWith('/placement')&&r.request().method()==='POST');await p.locator('#placement-form [type=submit]').click();assert.equal((await saved).status(),200);await p.locator('#schedule-panel').waitFor({state:'hidden'});
  assert.equal(navigations,navigationCount);assert.equal((await schedule(a.schedule.id)).plannedPublishAt.toISOString(),'2026-11-10T02:00:00.000Z');assert.equal((await schedule(b.schedule.id)).plannedPublishAt.toISOString(),'2026-11-08T07:00:00.000Z');
  await shot(p,role+'-swapped-1440');await restore(context,a.schedule.id,'2026-11-08','15:00');await restore(context,b.schedule.id,'2026-11-10','10:00');await p.reload();await settleBusinessUI(p);
  const move=p.waitForResponse((r:any)=>r.url().endsWith('/placement')&&r.request().method()==='POST');await p.locator('.calendar-item[data-inspect-id="'+a.schedule.id+'"]').dragTo(p.locator('[data-calendar-day="2026-11-12"] .day-number'));assert.equal((await move).status(),200);await p.waitForFunction((id:string)=>!!document.querySelector('[data-calendar-day="2026-11-12"] [data-inspect-id="'+id+'"]'),a.schedule.id);assert.equal(await p.locator('#schedule-panel[open]').count(),0);await shots(p,role+'-empty-day-moved');
  if(!i)await p.screenshot({path:dir+'/guide/placement-empty-raw.png'});
  await restore(context,a.schedule.id,'2026-11-08','15:00');await p.reload();await settleBusinessUI(p);
  await placement(p,a.schedule.id,'2026-11-10');await p.locator('#placement-form [value="'+b.schedule.id+'"]').check();
  await p.route('**/placement',async(route:any)=>{if(route.request().method()==='POST')await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'保存暂时不可用，输入已保留。'})});else await route.continue();});
  await p.locator('#placement-form [type=submit]').click();await p.locator('[data-placement-message]').filter({hasText:'保存暂时不可用'}).waitFor();assert(await p.locator('#placement-form [value="'+b.schedule.id+'"]').isChecked());assert.equal((await schedule(a.schedule.id)).plannedPublishAt.toISOString(),'2026-11-08T07:00:00.000Z');await p.unroute('**/placement');
  await shot(p,role+'-save-failed-1440');await p.locator('[data-placement-cancel]').click();await respondToBusinessConfirm(p,true);await p.locator('#schedule-panel[data-view=detail]').waitFor();await close(p);
  await placement(p,a.schedule.id,'2026-11-15');await p.locator('#placement-form [name=reason]').fill('会议核对后调整到第三周，保留这段原因');
  let posts=0;p.on('request',(r:any)=>{if(r.url().endsWith('/placement')&&r.method()==='POST')posts++;});
  let failRead=true;await p.route('**/business/operations-schedule?**',async(route:any)=>{if(failRead&&!route.request().isNavigationRequest()){failRead=false;await route.fulfill({status:503,body:'读取暂时失败'});}else await route.continue();});
  await p.locator('#placement-form [type=submit]').click();await p.locator('[data-placement-message]').filter({hasText:'已保存，展示更新失败'}).waitFor();assert.equal(posts,1);assert.equal((await schedule(a.schedule.id)).plannedPublishAt.toISOString(),'2026-11-15T07:00:00.000Z');
  await shot(p,role+'-saved-read-failed-1440');await p.locator('[data-placement-recheck]').click();await p.locator('#schedule-panel[data-view=detail]').waitFor();assert.equal(posts,1);await close(p);await p.unroute('**/business/operations-schedule?**');
  await restore(context,a.schedule.id,'2026-11-08','15:00');await p.reload();await settleBusinessUI(p);
  checks.push(role+'：写入成功后展示读取失败，原面板可重试读取且未重复POST');
  await p.goto(baseURL+'/business/meeting-review');await p.locator('[data-open-create]').click();assert.equal(await p.locator('[data-create] [name=periodStart]').inputValue(),'2026-11-01');assert.equal(await p.locator('[data-create] [name=periodEnd]').inputValue(),'2026-11-07');await shot(p,role+'-weekly-range-1440');
  checks.push(role+'：真实拖拽对换、空日直接移动、隐藏筛选候选和已发布禁选、失败保留选择、单层面板、无整页导航；8号周会默认1—7号');
  videos[role]=await p.video().path();await context.close();
 }
 const phaseContexts:any[]=[];for(const actor of [admin,employee]){const ctx=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});assert.equal((await ctx.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:actor})).status(),200);phaseContexts.push(ctx);}
 const phasePages=await Promise.all(phaseContexts.map(ctx=>ctx.newPage()));for(const p of phasePages)await p.clock.setFixedTime(new Date('2026-11-08T12:00:00+08:00'));
 const legacy=await seedLinkPost(db,'未确认预排期的12月内容','2026-12-10T10:00');
 for(let i=0;i<phasePages.length;i++){const p=phasePages[i],role=i?'employee':'admin';await p.goto(baseURL+'/business/operations-schedule?month=2026-12');await settleBusinessUI(p);assert.equal(await p.locator('.calendar-item[data-inspect-id="'+legacy.schedule.id+'"]').getAttribute('draggable'),'false');await shot(p,role+'-preplan-closed-1440');}
 const endpoint=baseURL+'/api/monthly-plans/'+setup.planId+'/arrangement',pending=await(await phaseContexts[1].request.get(endpoint)).json();assert.equal((await phaseContexts[1].request.post(endpoint,{headers:{Origin:baseURL},data:{action:'submit',fingerprint:pending.fingerprint,requestId:randomUUID(),reason:'首轮安排已核对，提交管理员确认'}})).status(),200);
 for(let i=0;i<phasePages.length;i++){const p=phasePages[i],role=i?'employee':'admin';await p.goto(baseURL+'/business/operations-schedule?month=2026-11');await settleBusinessUI(p);await p.locator('[data-arrangement-stage=review_pending]').waitFor();assert.equal(await p.locator('.calendar-item[data-inspect-id="'+a.schedule.id+'"]').getAttribute('draggable'),'true');await shot(p,role+'-review-pending-1440');}
 const sealPage=phasePages[0];await sealPage.locator('[data-arrangement-form] [name=reason]').fill('核对最新首轮安排后，定稿并封存本月基准');await sealPage.locator('button[value=confirm]').scrollIntoViewIfNeeded();await shot(sealPage,'admin-before-seal-1440');await sealPage.screenshot({path:dir+'/guide/monthly-review-raw.png'});
 const sealing=sealPage.waitForResponse((r:any)=>r.url().endsWith('/arrangement')&&r.request().method()==='POST');await sealPage.locator('button[value=confirm]').click();await respondToBusinessConfirm(sealPage,true);assert.equal((await sealing).status(),200);await sealPage.locator('[data-arrangement-stage=confirmed]').waitFor();
 const sealedPlan=(await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.id,setup.planId)))[0];
 for(let i=0;i<phasePages.length;i++){const p=phasePages[i],role=i?'employee':'admin';await p.goto(baseURL+'/business/operations-schedule?month=2026-11&status=pending');await settleBusinessUI(p);assert.equal(await p.locator('.calendar-item[data-inspect-id="'+published.schedule.id+'"]').count(),0);await placement(p,a.schedule.id,'2026-11-10');assert.equal(await p.locator('#placement-form [value="'+published.schedule.id+'"]').count(),1);assert(await p.locator('#placement-form [name=reason]').isVisible());assert(await p.locator('#placement-form [name=reason]').evaluate((e:HTMLTextAreaElement)=>e.required));await shots(p,role+'-sealed-placement-reason');await p.locator('[data-placement-reason-hint]').scrollIntoViewIfNeeded();await shot(p,role+'-sealed-placement-reason-bottom-1440');await p.locator('[data-placement-cancel]').click();await respondToBusinessConfirm(p,true);await p.locator('#schedule-panel[data-view=detail]').waitFor();await close(p);
   await p.emulateMedia({reducedMotion:'reduce'});await p.goto(baseURL+'/business/operations-schedule?month=2026-11');await settleBusinessUI(p);await p.locator('.calendar-item[data-inspect-id="'+a.schedule.id+'"]').press('Enter');await p.locator('#schedule-panel[open][data-view=detail]').waitFor();await p.locator('[data-inspector-placement]').press('Enter');await p.locator('#schedule-panel[data-view=placement]').waitFor();await p.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('#placement-form [type=submit]')!.disabled);assert.equal(await p.locator('dialog[open]').count(),1);await settleBusinessUI(p);assert.equal(await p.locator('#placement-form').getAttribute('data-dirty'),'false');await shot(p,role+'-keyboard-reduced-1440');await p.locator('[data-placement-cancel]').press('Enter');await p.locator('#schedule-panel[data-view=detail]').waitFor();await p.keyboard.press('Escape');await p.locator('#schedule-panel').waitFor({state:'hidden'});await p.emulateMedia({reducedMotion:'no-preference'});
   await p.goto(baseURL+'/business/settings?view=guide#guide-monthly');await settleBusinessUI(p);
   for(const image of await p.locator('#guide-monthly img').all()){await image.scrollIntoViewIfNeeded();await image.evaluate((e:HTMLImageElement)=>e.decode());assert(await image.evaluate((e:HTMLImageElement)=>e.naturalWidth>0));}
   for(const width of [1920,1440,1024]){await p.setViewportSize({width,height:1000});await alignGuide(p,p.locator('#guide-monthly h2'));await shot(p,role+'-guide-monthly-'+width);await alignGuide(p,p.locator('#guide-monthly h3').filter({hasText:'拖到空日期'}));await shot(p,role+'-guide-operation-'+width);}
   await p.setViewportSize({width:1440,height:1000});await p.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await settleBusinessUI(p);await p.screenshot({path:dir+'/screenshots/'+role+'-guide-full-1440.png',fullPage:true});
   await phaseContexts[i].close();}
 assert.deepEqual((await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.id,setup.planId)))[0],sealedPlan);
 checks.push('双角色：预排期未确认禁拖，待核对仍可拖，管理员真实封存；封存后调整原因必填，筛选隐藏的帖子仍列候选，V0保持');
 checks.push('双角色：键盘进入详情与移动／对换，减少动态效果时单层面板可返回、Esc关闭');
 assert.deepEqual(errors,[]);await writeFile(dir+'/checks.json',JSON.stringify({checks,errors,videos,isolatedPostgres:true},null,2));for(const check of checks)console.log('PASS '+check);
}catch(error){if(page&&!page.isClosed()){console.error(await page.evaluate(()=>({view:document.querySelector('#schedule-panel')?.getAttribute('data-view'),message:document.querySelector('[data-placement-message]')?.textContent,dirty:document.querySelector('#schedule-form')?.getAttribute('data-dirty'),confirm:document.querySelector('[data-business-confirm][open]')?.textContent})));await page.screenshot({path:dir+'/failure.png'});}console.error(f.logs().slice(-3000));throw error;}
finally{await browser?.close();await f.stop();}
