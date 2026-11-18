/** 正式Vercel运行包 + 隔离PostgreSQL：共享业务历史、推广日详情及原编辑入口。 */
import assert from 'node:assert/strict';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {prepareMonthlyArrangement} from './monthly-arrangement.fixture';
import {seedLinkPost} from './monthly-plan-links.fixture';
import {admin,employee} from './auth.fixture';
import {settleBusinessUI,openPostLookup,respondToBusinessConfirm} from './business-confirm.helper';
import {fillBusinessDateTime} from './business-datetime.helper';
import * as s from '../src/db/schema';

const dir=process.env.BUSINESS_HISTORY_DIR??'.tools/test-artifacts/business-history-inspector';
for(const name of ['screenshots','video'])await mkdir(dir+'/'+name,{recursive:true});
const clock=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clock,'2026-11-16T12:00:00+08:00');
const f=await startPostgresFixture({clockFile:clock,entry:'.tools/serve-vercel.mjs',accounts:[{...admin,name:'Obl1vion Shi'},{...employee,name:'jennifer qiao'}]}),{db,baseURL}=f;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);const browser=await chromium.launch({headless:true});
const contexts:any[]=[],errors:string[]=[],checks:string[]=[],shots:string[]=[],releases:Array<()=>void>=[];
let page:any;
async function shot(name:string,p=page){await settleBusinessUI(p);await p.mouse.move(0,0);await p.screenshot({path:`${dir}/screenshots/${name}.png`});shots.push(name);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
async function login(actor:any,video=false){const c=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',...(video?{recordVideo:{dir:dir+'/video',size:{width:1440,height:1000}}}:{})});contexts.push(c);await c.addInitScript({content:'window.__name = value => value;'});assert.equal((await c.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:actor})).status(),200);return c;}
try{
 const boss=await login(admin,true),staff=await login(employee),cookie=(await boss.cookies()).map((v:any)=>v.name+'='+v.value).join('; ');
 async function api(path:string,data?:Record<string,unknown>,method='GET'){
  const form=new FormData();for(const[k,v]of Object.entries(data??{}))form.set(k,String(v));const r=await fetch(baseURL+path,{method,headers:{Origin:baseURL,Cookie:cookie,Accept:'application/json'},...(data?{body:form}:{})});const json=await r.json();assert(r.ok,JSON.stringify(json));return json;
 }
 const group=randomUUID(),item=randomUUID();
 const prepared=await prepareMonthlyArrangement(db,baseURL,cookie,{content:{groups:[{id:group,annualPlanId:null,annualVersion:null,name:'面试课讲义',subjectId:'interview',categoryId:'non-promotional-handout',quantity:1,note:'隔离验收',reason:'月会确认'}],items:[{id:item,groupId:group,kind:'new',week:2,scheduleId:null}]}});
 const [plan]=await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.id,prepared.planId));
 const fields=(name:string,planned='2026-11-10T17:00',revision=0,reason='')=>({contentName:name,subjectId:'interview',categoryId:'non-promotional-handout',projectDocUrl:'https://example.test/document',plannedPublishAt:planned,promotionStatus:'none',operationType:'non_promotion_standard',expectedPlanRevision:revision,planChangeReason:reason,monthlyPlanReason:reason});
 const first=await api('/api/operations-content',{...fields('面试课非推广讲义2'),monthlyPlanId:plan.id,monthlyPlanItemId:item,monthlyRequestId:randomUUID(),monthlyExpectedRevision:plan.revision},'POST');
 await api('/api/operations-content/'+first.id,fields('面试课非推广讲义2 · 已完善','2026-11-25T18:00',0,'需求未到，完善后改至第四周。'),'PATCH');
 for(let i=1;i<=10;i++)await api('/api/operations-content/'+first.id,fields('面试课非推广讲义2 · 资料'+i,'2026-11-25T18:00',1,'补充第'+i+'版资料说明'),'PATCH');
 const empty=await seedLinkPost(db,'暂无历史的旧记录','2026-11-12T18:00');
 let workflow=await api(`/api/operations-content/${first.id}/workflow`);
 assert.equal(workflow.historyEvents.filter((e:any)=>e.reason.includes('需求未到')).length,1);assert.equal(workflow.historyEvents.length,12);
 assert.deepEqual((await api('/api/content-search?id='+first.id)).historyEvents,workflow.historyEvents);
 let originalRaw=structuredClone(workflow.schedule.executionHistory);
 checks.push('真实新建、跨周改期及10次内容保存；一次改期只显示一个事件，详情与查帖JSON逐值一致');
 page=await boss.newPage();const videoStarted=Date.now();let clipStart=0,clipEnd=0;page.on('pageerror',(e:Error)=>errors.push(e.message));
 const worker=await staff.newPage();worker.on('pageerror',(e:Error)=>errors.push(e.message));
 const root=(p=page)=>p.locator('#schedule-panel [data-business-history-timeline]');
 async function open(p=page,id=first.id){await p.goto(baseURL+'/business/operations-schedule?month=2026-11&row='+id);await p.locator(`[data-schedule-workflow][data-schedule-id="${id}"][data-ready=true]`).waitFor({state:'attached'});await settleBusinessUI(p);}
 async function close(p=page){await p.locator('[data-close-inspector]').click();await p.locator('#schedule-panel').waitFor({state:'hidden'});}
 for(const[role,p]of[['admin',page],['employee',worker]] as const)for(const width of role==='admin'?[1920,1440,1024]:[1440]){
  await p.setViewportSize({width,height:1000});await open(p);assert.equal(await root(p).getAttribute('open'),null);assert.equal(await p.getByText('排期执行记录',{exact:true}).count(),0);
  await shot(`${role}-schedule-open-${width}`,p);if(role==='admin'&&width===1440)clipStart=(Date.now()-videoStarted)/1000;await root(p).locator(':scope>summary').focus();await p.keyboard.press('Enter');await p.keyboard.press('Enter');await p.keyboard.press('Enter');await root(p).scrollIntoViewIfNeeded();
  assert.equal(await root(p).locator('[data-history-event]:visible').count(),10);await root(p).getByRole('button',{name:'查看更多',exact:true}).click();assert.equal(await root(p).locator('[data-history-event]:visible').count(),12);
  const node=await root(p).locator('[data-history-event]').first().elementHandle();await root(p).locator('input[value=schedule]').check();assert.equal(await root(p).locator('[data-history-event]:visible').count(),2);assert(await node!.evaluate((n:HTMLElement)=>n.isConnected));
  const mixed=root(p).locator('[data-history-event]').filter({hasText:'需求未到'});assert.match(await mixed.innerText(),/2026-11-10 17:00.*→.*2026-11-25 18:00/s);
  await mixed.locator('[data-history-evidence]>summary').click();if(role==='admin'&&width===1440)await p.waitForTimeout(1000);await shot(`${role}-schedule-timeline-${width}`,p);
  assert.match(await mixed.locator('strong').first().evaluate((n:HTMLElement)=>getComputedStyle(n).fontFamily),/MiSans/);
  if(role==='admin'&&width===1440)clipEnd=(Date.now()-videoStarted)/1000;await root(p).locator('input[value=all]').check();await close(p);
 }
 checks.push('1920/1440/1024桌面与员工1440：默认收起、键盘展开／折叠／重开、10条分页、筛选不重建节点、前后值与依据、MiSans');
 await page.setViewportSize({width:1440,height:1000});await open();await page.locator('[data-inspector-edit]').click();const title=page.locator('#schedule-form [name=contentName]');await title.fill('尚未保存的标题');await page.locator('#schedule-form [data-close]').filter({hasText:'取消'}).click();await respondToBusinessConfirm(page,false);assert.equal(await title.inputValue(),'尚未保存的标题');await page.locator('#schedule-form [data-close]').filter({hasText:'取消'}).click();await respondToBusinessConfirm(page,true);await page.locator('#schedule-panel[data-view=detail]').waitFor();
 await page.locator('[data-inspector-publication]').click();await fillBusinessDateTime(page.locator('#publication-form'),'actualPublishAt','2026-11-15T10:00');await page.locator('#publicationUrl').fill('https://www.xiaohongshu.com/explore/123456789012345678901234');await page.locator('[data-publication-delay-days][data-ready=true]').waitFor({state:'attached'});
 const published=page.waitForResponse((r:any)=>r.url().endsWith('/publication')&&r.request().method()==='PATCH');await page.locator('#publication-form button[type=submit]').click();assert.equal((await published).status(),200);await page.locator('#schedule-panel[data-view=detail]').waitFor();await page.locator('[data-schedule-workflow][data-ready=true]').waitFor({state:'attached'});
 if(await root().getAttribute('open')===null)await root().locator(':scope>summary').click();await root().locator('input[value=publication]').check();await root().scrollIntoViewIfNeeded();assert.match(await root().innerText(),/已登记发布/);await shot('publication-timeline-1440');
 const reviewBefore=await api('/api/non-promotion-checkpoints?scheduleId='+first.id);
 await api('/api/operations-content/'+first.id,{...fields('面试课非推广讲义2 · 资料10','2026-11-25T18:00',1,'切换一次即时复盘'),operationType:'non_promotion_instant',reviewDueOn:'2026-11-20',expectedReviewRevision:reviewBefore.plan?.revision??-1},'PATCH');
 await open();await page.locator('[data-review-plan-panel] .non-plan-node details>summary').first().click();const reviewForm=page.locator('[data-review-node-form]').first();await reviewForm.locator('[name=dueOn]').fill('2026-11-22');await reviewForm.locator('[name=reason]').fill('准备完成后延两天复盘');if(await root().getAttribute('open')===null)await root().locator(':scope>summary').click();await root().locator('input[value=settings]').check();
 const reviewSaved=page.waitForResponse((r:any)=>r.url().endsWith('/api/non-promotion-checkpoints')&&r.request().method()==='POST');await reviewForm.locator('button[type=submit]').click();assert.equal((await reviewSaved).status(),200);await root().locator('[data-history-event]:visible').filter({hasText:'2026-11-20'}).filter({hasText:'2026-11-22'}).first().waitFor();assert.equal(await root().getAttribute('data-category'),'settings');await root().scrollIntoViewIfNeeded();await shot('review-settings-timeline-1440');
 workflow=await api(`/api/operations-content/${first.id}/workflow`);const corrected=workflow.historyEvents.filter((e:any)=>e.changes.some((c:any)=>c.label==='复盘截止日'&&c.before==='2026-11-20'&&c.after==='2026-11-22'));assert.equal(corrected.length,1);originalRaw=structuredClone(workflow.schedule.executionHistory);checks.push('原复盘节点表单真实保存后自动刷新同一时间线，保留筛选；即时截止日前后值以节点为准');
 await close();await openPostLookup(page);await page.locator('[data-post-lookup] [name=q]').fill('面试课非推广讲义2');await page.locator('[data-post-lookup] button[type=submit]').click();await page.locator(`[data-post-id="${first.id}"]`).click();const lookup=page.locator('[data-lookup-detail] [data-business-history-timeline]');await lookup.waitFor();if(await lookup.getAttribute('open')===null)await lookup.locator(':scope>summary').click();await lookup.locator('input[value=publication]').check();await lookup.scrollIntoViewIfNeeded();await shot('lookup-timeline-1440');await page.locator('[data-lookup-close]').click();await page.locator('[data-post-lookup]').waitFor({state:'hidden'});
 checks.push('原编辑草稿取消保留；原发布登记真实保存；新增发布事件及查帖同源显示');
 const path=`**/api/operations-content/${first.id}/workflow`;
 let release!:()=>void;const held=new Promise<void>(r=>release=r);releases.push(release);await page.route(path,async(route:any)=>{await held;try{await route.continue();}catch{}});
 await page.locator(`[data-inspect-id="${first.id}"]`).first().click();const host=page.locator('[data-schedule-workflow-history]');await host.getByRole('status').waitFor();assert.equal(await page.locator('[data-business-read-loading]').count(),1);await shot('history-loading-1440');release();await page.locator('[data-schedule-workflow][data-ready=true]').waitFor({state:'attached'});await page.unroute(path);await close();
 await page.route(path,(route:any)=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'隔离测试暂不可用'})}));await page.locator(`[data-inspect-id="${first.id}"]`).first().click();await host.getByRole('button',{name:'重新读取',exact:true}).waitFor();await shot('history-failure-1440');await page.unroute(path);await host.getByRole('button',{name:'重新读取',exact:true}).click();await page.locator('[data-schedule-workflow][data-ready=true]').waitFor({state:'attached'});await close();
 await open(page,empty.schedule.id);assert.equal(await host.getByText('暂无业务历史',{exact:true}).count(),1);await host.scrollIntoViewIfNeeded();await shot('history-empty-1440');await close();
 let releaseLate!:()=>void;const late=new Promise<void>(r=>releaseLate=r);releases.push(releaseLate);await page.route(path,async(route:any)=>{await late;try{await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(workflow)});}catch{}});await page.locator(`[data-inspect-id="${first.id}"]`).first().click();await host.getByRole('status').waitFor();await close();await open(page,empty.schedule.id);releaseLate();await page.waitForTimeout(250);assert.equal(await host.getByText('暂无业务历史',{exact:true}).count(),1);await page.unroute(path);await close();

 const delayed=await seedLinkPost(db,'延期说明独立区验收','2026-11-15T18:00');
 const delay=()=>page.locator('[data-schedule-delay]');
 await open(page,delayed.schedule.id);
 assert.equal(await delay().locator('[data-schedule-delay-fold]').getAttribute('open'),null);
 assert.equal(await root().getAttribute('open'),null);
 assert.equal(await delay().locator('[data-schedule-delay-fold]>summary').evaluate((el:HTMLElement)=>getComputedStyle(el).fontSize),'14px');
 assert.equal(await root().locator(':scope>summary').evaluate((el:HTMLElement)=>getComputedStyle(el).fontSize),'14px');
 assert(await delay().evaluate((node:HTMLElement)=>node.nextElementSibling?.hasAttribute('data-schedule-workflow-history')));
 assert(Math.abs((await root().locator(':scope>summary').boundingBox()).y-((await delay().locator('[data-schedule-delay-fold]>summary').boundingBox()).y+(await delay().locator('[data-schedule-delay-fold]>summary').boundingBox()).height))<=1,'两条折叠标题连续排列');
 await delay().locator('[data-schedule-delay-fold]>summary').click();
 const pendingReason=delay().locator('.delay-day form').first();
 await pendingReason.locator('[name=responsibility][value=self]').check();await pendingReason.locator('textarea').fill('讲义仍在核对');
 const savedReason=page.waitForResponse((r:any)=>r.url().endsWith('/delay-reasons')&&r.request().method()==='POST');await pendingReason.locator('button[type=submit]').click();assert.equal((await savedReason).status(),200);
 await delay().getByRole('button',{name:'更正',exact:true}).waitFor();assert.equal(await root().getByText('填写延期说明',{exact:true}).count(),0);
 assert.match(await delay().innerText(),/原因归属.*运营原因.*延期说明.*讲义仍在核对.*Obl1vion Shi/s);
 assert(!await delay().innerText().then((t:string)=>t.includes('test_admin')));
 for(const width of [1920,1440,1024]){
  await page.setViewportSize({width,height:1000});await delay().scrollIntoViewIfNeeded();await delay().locator('[data-schedule-delay-fold]>summary').click();await shot('records-collapsed-'+width);await delay().locator('[data-schedule-delay-fold]>summary').click();await shot('delay-read-'+width);
 }
 await page.setViewportSize({width:1440,height:1000});clipStart=(Date.now()-videoStarted)/1000;
 await delay().getByRole('button',{name:'更正',exact:true}).click();
 const correction=delay().locator('form:visible');await correction.locator('textarea').fill('讲义已进入二次校对');
 await page.locator('[data-close-inspector]').click();await respondToBusinessConfirm(page,false);assert.equal(await correction.locator('textarea').inputValue(),'讲义已进入二次校对');
 await correction.getByRole('button',{name:'取消',exact:true}).click();await respondToBusinessConfirm(page,false);assert.equal(await correction.locator('textarea').inputValue(),'讲义已进入二次校对');
 for(const width of [1440,1024]){
  await page.setViewportSize({width,height:1000});await delay().scrollIntoViewIfNeeded();await shot('delay-edit-'+width);if(width===1440)clipEnd=(Date.now()-videoStarted)/1000;
  const fields=correction.locator('fieldset'),text=correction.locator('textarea');assert((await fields.boundingBox()).y<(await text.boundingBox()).y);
  assert((await correction.getByRole('button',{name:'保存更正'}).boundingBox()).width<180);
 }
 await correction.getByRole('button',{name:'取消',exact:true}).click();await respondToBusinessConfirm(page,true);
 await delay().getByRole('button',{name:'更正',exact:true}).click();
 assert.equal(await correction.locator('textarea').inputValue(),'讲义仍在核对');assert(await correction.locator('[name=responsibility][value=self]').isChecked());await correction.locator('textarea').fill('讲义已进入二次校对');
 await page.route('**/delay-reasons',(route:any)=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'隔离保存失败'})}));
 await correction.locator('button[type=submit]').click();await correction.locator('output').getByText('隔离保存失败',{exact:true}).waitFor();assert.equal(await correction.locator('textarea').inputValue(),'讲义已进入二次校对');await shot('delay-save-failed-1024');await page.unroute('**/delay-reasons');
 const correctedReason=page.waitForResponse((r:any)=>r.url().endsWith('/delay-reasons')&&r.request().method()==='POST');await correction.locator('button[type=submit]').click();assert.equal((await correctedReason).status(),200);
 await delay().getByRole('button',{name:'更正',exact:true}).waitFor();assert.equal(await delay().locator('.delay-records').count(),0);assert.equal(await delay().getByText('讲义仍在核对',{exact:true}).count(),0);assert.match(await delay().innerText(),/讲义已进入二次校对/);await shot('delay-latest-1024');
 const data=await api('/api/operations-content/'+delayed.schedule.id+'/workflow');assert.equal(data.historyEvents.filter((e:any)=>e.id.startsWith('reason:')).length,0);assert.equal(data.days[0].saved.changedByLabel,'test_admin');assert.equal(data.days[0].saved.changedByName,'Obl1vion Shi');
 const lookupData=await api('/api/content-search?id='+delayed.schedule.id);assert.deepEqual(lookupData.delayDays,data.days);
 await close();await page.setViewportSize({width:1440,height:1000});await openPostLookup(page);await page.locator('[data-post-lookup] [name=q]').fill('延期说明独立区验收');await page.locator('[data-post-lookup] button[type=submit]').click();await page.locator('[data-post-id="'+delayed.schedule.id+'"]').click();await page.locator('[data-lookup-detail] .schedule-delay').waitFor();assert.equal(await page.locator('[data-lookup-detail] .delay-edit').count(),0);assert.equal(await page.locator('[data-lookup-detail] [data-schedule-delay-fold]').getAttribute('open'),null);await shot('lookup-records-collapsed-1440');await page.locator('[data-lookup-detail] [data-schedule-delay-fold]>summary').click();assert.equal(await page.locator('[data-lookup-detail] .delay-records').count(),0);await shot('lookup-delay-1440');await page.locator('[data-lookup-close]').click();
 await open(worker,delayed.schedule.id);const staffDelay=worker.locator('[data-schedule-delay]');await staffDelay.locator('[data-schedule-delay-fold]>summary').click();await staffDelay.getByRole('button',{name:'更正',exact:true}).click();await staffDelay.locator('form:visible textarea').fill('员工更正说明');
 const staffSave=worker.waitForResponse((r:any)=>r.url().endsWith('/delay-reasons')&&r.request().method()==='POST');await staffDelay.locator('form:visible button[type=submit]').click();assert.equal((await staffSave).status(),200);await staffDelay.getByText('jennifer qiao',{exact:false}).first().waitFor();await shot('employee-delay-saved-1440',worker);

 await close(worker);await page.setViewportSize({width:390,height:844});await open(page,delayed.schedule.id);await delay().scrollIntoViewIfNeeded();await shot('delay-obvious-mobile-390');assert(await page.locator('[data-close-inspector]').isVisible());await close();await page.setViewportSize({width:1440,height:1000});
 const multi=await seedLinkPost(db,'多日延期草稿验收','2026-11-13T18:00');await open(page,multi.schedule.id);await delay().locator('[data-schedule-delay-fold]>summary').click();
 assert.equal(await delay().locator('.delay-day').count(),3);
 const second=delay().locator('.delay-day').nth(1);await second.locator('summary').click();await second.locator('[name=responsibility][value=external]').check();await second.locator('textarea').fill('第二日草稿必须保留');
 const firstPending=delay().locator('.delay-day').first();await firstPending.locator('[name=responsibility][value=self]').check();await firstPending.locator('textarea').fill('首日已完成说明');
 const oneSaved=page.waitForResponse((r:any)=>r.url().endsWith('/delay-reasons')&&r.request().method()==='POST');await firstPending.locator('button[type=submit]').click();assert.equal((await oneSaved).status(),200);
 await delay().getByRole('button',{name:'更正',exact:true}).waitFor();assert.equal(await delay().locator('[data-delay-key="0:2"] textarea').inputValue(),'第二日草稿必须保留');
 await delay().locator('[data-delay-key="0:2"]').getByRole('button',{name:'取消',exact:true}).click();await respondToBusinessConfirm(page,true);
 await close();await open();checks.push('延期与业务历史相邻且默认收起，延期仅最新说明：三档只读、两档编辑、取消保护、503输入保留、双角色真实更正和姓名、助手同源只读，业务历史不重复延期；原审计账号保留');
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:844});await open();assert(await page.locator('[data-close-inspector]').isVisible());if(await root().getAttribute('open')===null)await root().locator(':scope>summary').click();await shot('schedule-obvious-mobile-390');await close();
 assert.deepEqual((await api(`/api/operations-content/${first.id}/workflow`)).schedule.executionHistory,originalRaw);checks.push('慢读、失败重试、空历史与减少动态效果；390仅检查遮挡/关闭/页面溢出；读取前后原始排期历史不变');
 assert.deepEqual(errors,[]);await writeFile(dir+'/video-timing.json',JSON.stringify({start:Math.max(0,clipStart-0.3),duration:clipEnd-clipStart+0.3}));await writeFile(dir+'/result.json',JSON.stringify({passed:true,checks,shots,errors,productionWrites:false},null,2));console.log(checks.join('\n'));
}catch(error){await page?.screenshot({path:dir+'/failure.png'}).catch(()=>{});console.error(f.logs().slice(-2000));throw error;}
finally{for(const release of releases)release();const video=page?.video();for(const c of contexts)await c.close();if(video)await copyFile(await video.path(),dir+'/timeline-operation.webm');await browser.close();await f.stop();}
