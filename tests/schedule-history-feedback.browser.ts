/** 历史反馈及紧凑记录：正式组件、真实接口、本机隔离PostgreSQL。 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {prepareMonthlyArrangement} from './monthly-arrangement.fixture';
import {seedLinkPost} from './monthly-plan-links.fixture';
import {admin,employee} from './auth.fixture';
import {settleBusinessUI,openPostLookup,respondToBusinessConfirm} from './business-confirm.helper';
import * as s from '../src/db/schema';
const baseline=process.env.HISTORY_FEEDBACK_BASELINE==='1',dir=process.env.HISTORY_FEEDBACK_DIR??'.tools/test-artifacts/history-feedback';
for(const child of ['screenshots','video'])await mkdir(dir+'/'+child,{recursive:true});
const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-07T12:00:00+08:00');
const f=await startPostgresFixture({clockFile,entry:process.env.HISTORY_FEEDBACK_ENTRY}),{db,baseURL}=f;
let browser:any;const contexts:any[]=[],checks:any[]=[],errors:string[]=[],releases:Array<()=>void>=[];
try{
 const pw=await import(process.env.PLAYWRIGHT_MODULE!);browser=await pw.chromium.launch({headless:true,args:['--no-sandbox']});
 const boss=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:dir+'/video',size:{width:1440,height:1000}}}),staff=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});contexts.push(boss,staff);
 async function login(c:any,user:any){assert.equal((await c.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:user})).status(),200);return (await c.cookies()).map((v:any)=>v.name+'='+v.value).join('; ');}
 const cookie=await login(boss,admin);await login(staff,employee);
 const group=randomUUID(),item=randomUUID();
 const prepared=await prepareMonthlyArrangement(db,baseURL,cookie,{content:{groups:[{id:group,annualPlanId:null,annualVersion:null,name:'面试课非推广讲义',subjectId:'interview',categoryId:'non-promotional-handout',quantity:1,note:'隔离验收',reason:'月会确认'}],items:[{id:item,groupId:group,kind:'new',week:2,scheduleId:null}]}});
 async function api(path:string,data?:any,method='GET'){
  const form=new FormData();for(const[k,v]of Object.entries(data??{}))form.set(k,String(v));
  const response=await fetch(baseURL+path,{method,headers:{Origin:baseURL,Cookie:cookie,Accept:'application/json'},...(data?{body:form}:{})});const value=await response.json();assert(response.ok,JSON.stringify(value));return value;
 }
 const [plan]=await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.id,prepared.planId));
 const category=(await db.select().from(s.operationsCategory)).find(v=>v.id.includes('non')&&v.id.includes('handout'));assert(category);
 const first=await api('/api/operations-content',{contentName:'面试课非推广讲义2',subjectId:'interview',categoryId:category.id,projectDocUrl:'https://example.test/document',plannedPublishAt:'2026-11-10T17:00',promotionStatus:'none',operationType:'non_promotion_standard',monthlyPlanId:plan.id,monthlyPlanItemId:item,monthlyRequestId:randomUUID(),monthlyExpectedRevision:plan.revision},'POST');
 const empty=await seedLinkPost(db,'尚无业务历史的旧记录','2026-11-12T18:00',{subjectId:'interview',categoryId:category.id});
 let workflow=await api(`/api/operations-content/${first.id}/workflow`);assert.deepEqual(workflow.historyGroups.map((g:any)=>g.key),['execution','content']);
 const pages=[{page:await boss.newPage(),role:'admin'},{page:await staff.newPage(),role:'employee'}];
 for(const {page}of pages){page.on('pageerror',(e:Error)=>errors.push(e.message));page.setDefaultTimeout(15000);}
 async function open(page:any,id=first.id){await page.locator(`[data-inspect-id="${id}"]`).first().evaluate((n:HTMLElement)=>n.click());await page.locator(`[data-schedule-workflow][data-schedule-id="${id}"][data-ready=true]`).waitFor({state:'attached'});await settleBusinessUI(page);}
 async function close(page:any){await page.locator('[data-close-inspector]').click();await page.locator('#schedule-panel').waitFor({state:'hidden'});}
 async function shot(page:any,name:string){await settleBusinessUI(page);await page.screenshot({path:`${dir}/screenshots/${name}.png`});}
 async function unfold(page:any,key='execution'){const summary=page.locator(`#schedule-panel [data-schedule-history-group="${key}"]>summary`);await summary.focus();await page.keyboard.press('Enter');}
 for(const {page,role}of pages){
  for(const width of baseline?[1440]:[1920,1440,1024]){
   await page.setViewportSize({width,height:1000});await page.goto(baseURL+'/business/operations-schedule?month=2026-11');await open(page);await unfold(page);await unfold(page,'content');
   const host=page.locator('[data-schedule-workflow-history]');await host.scrollIntoViewIfNeeded();
   const row=host.locator('[data-schedule-history-group="execution"] .workflow-plan-history').filter({hasText:'建立排期'});
   const metrics=await row.evaluate((n:HTMLElement)=>{const p=n.querySelector('p')!,r=n.getBoundingClientRect();return {height:r.height,font:getComputedStyle(p).fontSize,family:getComputedStyle(p).fontFamily,text:n.innerText,overflow:n.scrollWidth>n.clientWidth};});
   assert.equal(metrics.font,'14px');assert.match(metrics.family,/MiSans/);assert.equal(metrics.overflow,false);
   if(!baseline){assert.doesNotMatch(metrics.text,/首轮排期填写/);assert.ok(metrics.height<=48,JSON.stringify(metrics));assert.match(metrics.text,/test_employee|test_admin/);}
   checks.push({role,width,create:metrics});await shot(page,`${role}-create-content-${width}`);await close(page);
  }
 }
 if(!baseline){
  const page=pages[0].page;await page.setViewportSize({width:1440,height:1000});
  const path=`**/api/operations-content/${first.id}/workflow`;
  let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);releases.push(release);
  await page.route(path,async(route:any)=>{await held;try{await route.continue();}catch{}});
  await page.locator(`[data-inspect-id="${first.id}"]`).first().evaluate((n:HTMLElement)=>n.click());
  const host=page.locator('[data-schedule-workflow-history]');await host.waitFor({state:'visible'});assert.equal(await host.getAttribute('aria-busy'),'true');
  await page.waitForTimeout(180);assert.equal(await host.locator('[data-business-read-loading]').count(),0);assert.equal(await host.getByText('暂无历史记录',{exact:true}).count(),0);
  await host.getByRole('status').filter({hasText:'正在读取历史记录'}).waitFor();assert.equal(await page.locator('[data-business-read-loading]').count(),1);await shot(page,'loading-history-1440');
  release();await page.locator('[data-schedule-workflow][data-ready=true]').waitFor({state:'attached'});assert.equal(await host.getAttribute('aria-busy'),null);assert.equal(await host.locator('[data-business-read-loading]').count(),0);await page.unroute(path);await close(page);
  await open(page,empty.schedule.id);assert.equal(await host.getByText('暂无历史记录',{exact:true}).count(),1);await shot(page,'empty-history-1440');await close(page);
  await page.route(path,(r:any)=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'连接暂不可用，请重试。'})}));
  await page.locator(`[data-inspect-id="${first.id}"]`).first().evaluate((n:HTMLElement)=>n.click());await host.getByRole('button',{name:'重新读取',exact:true}).waitFor();assert.equal(await host.getByRole('alert').count(),1);assert.equal(await host.getByText('暂无历史记录',{exact:true}).count(),0);await shot(page,'history-failure-1440');
  await page.unroute(path);await host.getByRole('button',{name:'重新读取',exact:true}).click();await page.locator('[data-schedule-workflow][data-ready=true]').waitFor({state:'attached'});await close(page);
  let late!:()=>void;const lateHeld=new Promise<void>(resolve=>late=resolve);releases.push(late);
  await page.route(path,async(route:any)=>{await lateHeld;try{await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(workflow)});}catch{}});
  await page.locator(`[data-inspect-id="${first.id}"]`).first().evaluate((n:HTMLElement)=>n.click());await host.getByRole('status').waitFor();await close(page);await open(page,empty.schedule.id);late();await page.waitForTimeout(300);assert.equal(await host.locator('[data-schedule-history-group]').count(),0);assert.equal(await host.getByText('暂无历史记录',{exact:true}).count(),1);await close(page);await page.unroute(path);
  checks.push({slowRead:true,empty:true,failureRetry:true,closeSwitchStale:true});
  // 真正跨Week保存，同时改标题；共享分组保留原因与前后时间。
  await api('/api/operations-content/'+first.id,{contentName:'面试课非推广讲义2 · 已完善',subjectId:'interview',categoryId:category.id,projectDocUrl:'https://example.test/document',plannedPublishAt:'2026-11-25T18:00',promotionStatus:'none',operationType:'non_promotion_standard',expectedPlanRevision:0,planChangeReason:'需求未到，补齐讲义后安排在 Week 4。',monthlyPlanReason:'需求未到，补齐讲义后安排在 Week 4。'},'PATCH');
  workflow=await api(`/api/operations-content/${first.id}/workflow`);assert.deepEqual(workflow.historyGroups.map((g:any)=>g.key),['execution','schedule','content']);assert.deepEqual((await api('/api/content-search?id='+first.id)).historyGroups,workflow.historyGroups);
  for(const {page,role}of pages)for(const width of [1920,1440,1024]){await page.setViewportSize({width,height:1000});await page.reload();await open(page);for(const key of ['execution','schedule','content'])await unfold(page,key);await page.locator('[data-schedule-workflow-history]').scrollIntoViewIfNeeded();assert.match(await page.locator('[data-schedule-history-group="execution"]').innerText(),/需求未到/);await shot(page,`${role}-week-date-content-${width}`);await close(page);}
  await page.setViewportSize({width:1440,height:1000});await page.reload();await open(page);
  await page.locator('[data-inspector-edit]').click();const title=page.locator('#schedule-form [name=contentName]');await title.fill('未保存的输入仍然保留');await page.locator('#schedule-form [data-close]').filter({hasText:'取消'}).click();await respondToBusinessConfirm(page,false);assert.equal(await title.inputValue(),'未保存的输入仍然保留');await page.locator('#schedule-form [data-close]').filter({hasText:'取消'}).click();await respondToBusinessConfirm(page,true);await page.locator('#schedule-panel[data-view=detail]').waitFor();await close(page);
  await openPostLookup(page);const query=page.locator('[data-post-lookup] [name=q]');await query.fill('面试课非推广讲义2');await page.locator('[data-post-lookup] button[type=submit]').click();await page.locator('[data-post-id]').first().click();await page.locator('[data-post-lookup] [data-schedule-history-group="execution"]').waitFor();await page.locator('[data-post-lookup] [data-schedule-history-group="execution"]>summary').click();await page.locator('[data-post-lookup] [data-schedule-history-group="execution"]').scrollIntoViewIfNeeded();await shot(page,'lookup-execution-1440');
  await page.locator('[data-post-lookup] [data-lookup-close]').click();await page.locator('[data-post-lookup]').waitFor({state:'hidden'});
  await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:844});await open(page);await unfold(page);await shot(page,'mobile-obvious-check-390');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.locator('[data-close-inspector]').isVisible(),true);await close(page);
  checks.push({sharedLookup:true,meaningfulReasons:true,unsavedProtection:true,reducedMotion:true,mobileObviousCheck:true});
  const paint=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:dir+'/first-paint-video',size:{width:1440,height:1000}}});contexts.push(paint);await paint.addCookies(await boss.cookies());
  await paint.route('**/fonts/**',async(r:any)=>{await new Promise(resolve=>setTimeout(resolve,1200));await r.continue();});await paint.route('**/api/operations-content/*/workflow',async(r:any)=>{await new Promise(resolve=>setTimeout(resolve,900));await r.continue();});
  const firstPaint=await paint.newPage();firstPaint.on('pageerror',(e:Error)=>errors.push(e.message));
  const ready=()=>firstPaint.locator('[data-schedule-workflow][data-ready=true]').waitFor({state:'attached'});
  await firstPaint.goto(baseURL+'/business/operations-schedule?month=2026-11&row='+first.id,{waitUntil:'domcontentloaded'});await ready();await shot(firstPaint,'first-paint-slow-1440');await paint.unrouteAll({behavior:'wait'});
  const devtools=await paint.newCDPSession(firstPaint),hard=firstPaint.waitForEvent('load');await devtools.send('Page.reload',{ignoreCache:true});await hard;await ready();await shot(firstPaint,'first-paint-hard-refresh-1440');
  await firstPaint.reload();await ready();await shot(firstPaint,'first-paint-warm-refresh-1440');await close(firstPaint);await firstPaint.getByRole('link',{name:'月度运营',exact:true}).click();await settleBusinessUI(firstPaint);await firstPaint.getByRole('link',{name:'排期管理',exact:true}).click();await open(firstPaint);await shot(firstPaint,'first-paint-internal-navigation-1440');
  checks.push({firstPaint:'direct cold slow font/data, hard refresh, warm refresh, internal navigation; actual recording'});
 }
 assert.deepEqual(errors,[]);await writeFile(dir+'/checks.json',JSON.stringify({baseline,checks,errors},null,2));console.log(JSON.stringify({baseline,checks:checks.length,dir}));
}catch(error){console.error(f.logs().slice(-1800));throw error;}finally{for(const release of releases)release();for(const c of contexts)await c.close();await browser?.close();await f.stop();}
