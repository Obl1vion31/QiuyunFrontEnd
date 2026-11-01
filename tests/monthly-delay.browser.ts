/** 延期卡片与归因分布：正式SSR/API、真实筛选和隔离数据库。 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startFixture,admin,employee} from './auth.fixture';
import {settleBusinessUI} from './business-confirm.helper';
import * as s from '../src/db/schema';

const folder=process.env.MONTHLY_DELAY_EVIDENCE_DIR||'.tools/test-artifacts/monthly-delay/evidence';
await mkdir(folder+'/screenshots',{recursive:true});await mkdir(folder+'/motion',{recursive:true});
const clockFile=new URL('../'+folder+'/clock.txt',import.meta.url).pathname;
await writeFile(clockFile,'2026-10-30T12:00:00+08:00');
const fixture=await startFixture({clockFile}),{db,baseURL}=fixture;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);
const browser=await chromium.launch({headless:true}),checks:any[]=[];
const url=baseURL+'/business/monthly-operations?month=2026-10&subject=tmua';
const stamp=(date:string)=>new Date(date+'T10:00:00+08:00');
async function post(name:string,subject:string,actual:string|null,reasons:Array<typeof s.operationsScheduleDelayReason.$inferInsert.responsibility>=[]){
 const [content]=await db.insert(s.operationsContent).values({}).returning();
 const [version]=await db.insert(s.operationsContentVersion).values({contentId:content.id,versionNumber:0,workType:'new',contentName:name,subjectId:subject,categoryId:'temporary'}).returning();
 const [row]=await db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:stamp(actual?'2026-10-01':'2026-10-30'),actualPublishAt:actual?stamp(actual):null,completionStatus:actual?(actual==='2026-10-01'?'on_time':'delayed'):'pending',planRevision:1}).returning();
 for(const [i,responsibility]of reasons.entries())await db.insert(s.operationsScheduleDelayReason).values({scheduleId:row.id,planRevision:1,dayNumber:i+1,dueAt:new Date('2026-10-01T12:00:00+08:00'),responsibility,reason:'隔离验收：'+responsibility,changedByLabel:'test_admin'});
 return row;
}
async function ready(page:any){await page.locator('astro-island:not([ssr])').first().waitFor();await settleBusinessUI(page);}
async function shot(page:any,name:string,target?:any){if(target)await target.evaluate((n:HTMLElement)=>window.scrollTo(0,Math.max(0,scrollY+n.getBoundingClientRect().top-90)));await settleBusinessUI(page);await (target||page).screenshot({path:`${folder}/screenshots/${name}.png`});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name);}
try{
 for(let i=0;i<18;i++)await post('按时样本'+i,'tmua','2026-10-01');
 await post('混合归因运营延期','tmua','2026-10-03',['self','external']);await post('纯运营延期','tmua','2026-10-03',['self']);
 for(let i=0;i<5;i++)await post('非运营延期'+i,'tmua','2026-10-03',[i===0?'requester':'external']);
 await post('尚未登记的运营原因','tmua',null,['self']);await post('尚未登记无原因','tmua',null);
 await post('零延期已发','step','2026-10-01');await post('零延期但尚未登记的运营原因','step',null,['self']);
 await post('历史未知归因','interview','2026-10-03',['unknown']);await post('历史缺失归因','interview','2026-10-03');await post('部分未知归因','interview','2026-10-03',['external','unknown']);
 const errors:string[]=[];
 for(const user of [admin,employee]){
  const context=await browser.newContext({locale:'zh-CN',reducedMotion:'reduce'});
  assert.equal((await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:user})).status(),200);
  const response=await context.request.get(baseURL+'/api/monthly-operations?month=2026-10&subject=tmua'),data=await response.json();assert.equal(response.status(),200);
  assert.equal(data.publication.planned,27);assert.equal(data.publication.registered,25);assert.equal(data.publication.delayed,7);assert.equal(data.publication.operationalDelayed,2);assert.equal(data.publication.nonOperationalDelayed,5);assert.equal(data.publication.unattributedDelayed,0);assert.equal(data.publication.operational,3);
  const page=await context.newPage();page.on('pageerror',(e:Error)=>errors.push(e.message));
  for(const width of [1920,1440,1240,1024,390,320]){
   await page.setViewportSize({width,height:1000});await page.goto(url);await ready(page);await page.evaluate(()=>scrollTo(0,0));
   const card=page.locator('[data-delay-card]'),scope=page.getByLabel('延期率统计范围');
   assert.equal(await scope.inputValue(),'all');assert.equal(await card.locator('[data-value=delay-rate]').innerText(),'28.0%');assert.equal(await card.locator('em').innerText(),'延期/已发 7/25');assert.equal(await card.locator('button select').count(),0);
   const headingGap=await card.evaluate((n:HTMLElement)=>{const title=n.querySelector('span')!,select=n.querySelector('select')!,range=document.createRange();range.selectNodeContents(title);return select.getBoundingClientRect().left-range.getBoundingClientRect().right;});assert(headingGap>=11,'卡片标题与选择框至少保留12px间距');
   const before=await card.boundingBox(),scroll=await page.evaluate(()=>scrollY),root=await page.locator('[data-monthly-operations]').elementHandle();
   await shot(page,`${user.role}-all-${width}`);
   await scope.selectOption('operational');assert.equal(await card.locator('[data-value=delay-rate]').innerText(),'8.0%');assert.equal(await card.locator('em').innerText(),'运营延期/已发 2/25');assert.deepEqual(await card.boundingBox(),before);assert.equal(await page.evaluate(()=>scrollY),scroll);assert(await root!.evaluate((n:HTMLElement)=>n.isConnected));
   await shot(page,`${user.role}-operational-card-${width}`,card);
   await page.getByRole('button',{name:/查看运营延期已发布明细/}).click();assert.equal(await page.getByLabel('发布明细范围').inputValue(),'operationalDelayed');assert.equal(await page.locator('tbody tr').count(),2);assert(!((await page.locator('tbody').innerText()).includes('尚未登记')));
   if((user.role==='admin'&&width===1440)||(user.role==='employee'&&width===390))await shot(page,`${user.role}-operational-details-${width}`);
   await scope.scrollIntoViewIfNeeded();await scope.selectOption('all');await page.getByRole('button',{name:/查看全部延期已发布明细/}).click();assert.equal(await page.locator('tbody tr').count(),7);
   const chart=page.locator('[data-monthly-chart=publication]');await chart.scrollIntoViewIfNeeded();
   assert.equal(await chart.locator('[data-publication-legend]').count(),4);
   assert.match(await chart.getByRole('img').getAttribute('aria-label'),/运营延期发布2篇，非运营延期发布5篇/);
   assert.deepEqual(await chart.locator('[data-publication-segment]').evaluateAll((nodes:HTMLElement[])=>nodes.map(n=>n.dataset.publicationSegment)),['onTime','operational','nonOperational','missing']);
   const legend=chart.locator('[data-publication-legend=delayed]');assert.equal(await legend.locator('b').innerText(),'2/5');
   const readable=await legend.evaluate((n:HTMLElement)=>{const rect=n.getBoundingClientRect();return [...n.querySelectorAll('span,b')].every(part=>{const r=part.getBoundingClientRect();return r.left>=rect.left-1&&r.right<=rect.right+1;});});assert(readable,'延期图例文字与数量不溢出');
   if(user.role==='admin'||width===390)await shot(page,`${user.role}-distribution-${width}`,chart);
   await legend.click();assert.equal(await page.getByLabel('发布明细范围').inputValue(),'delayed');assert.equal(await page.locator('tbody tr').count(),7);
   checks.push({role:user.role,width,rate:'7/25 -> 2/25',cardStable:true,headingGap,details:[7,2],segments:[18,2,5,2,0],legend:4});
  }
  await page.setViewportSize({width:1440,height:1000});await page.goto(url);await ready(page);
  const scope=page.getByLabel('延期率统计范围');await scope.focus();await scope.press('Home');await scope.press('ArrowDown');await scope.press('Enter');assert.equal(await scope.inputValue(),'operational');assert(await scope.evaluate((n:HTMLElement)=>n===document.activeElement));
  const reloaded=page.waitForResponse((r:any)=>r.url().includes('/api/monthly-operations?'));await page.getByRole('button',{name:'刷新',exact:true}).click();await reloaded;await page.getByRole('button',{name:'刷新',exact:true}).waitFor({state:'visible'});assert.equal(await scope.inputValue(),'operational');
  const refresh=page.waitForResponse((r:any)=>r.url().includes('/api/monthly-operations?')&&new URL(r.url()).searchParams.get('category')==='temporary');await page.locator('[name=category]').selectOption('temporary');await refresh;assert.equal(await scope.inputValue(),'operational');
  await page.locator('[name=subject]').selectOption('step');await page.locator('[data-value=delay-rate]').filter({hasText:'0.0%'}).waitFor();assert.equal(await scope.inputValue(),'operational');assert.match(await page.locator('[data-delay-card] em').innerText(),/0\/1/);
  if(user.role==='admin')await shot(page,'zero-operational-1440',page.locator('[data-delay-card]'));
  await page.locator('[name=month]').fill('2026-12');await page.locator('[data-report-month="2026-12"]').waitFor();assert.equal(await page.locator('[data-value=delay-rate]').innerText(),'—');assert.equal(await page.locator('[data-delay-card] em').innerText(),'暂无已发布记录');assert.equal(await scope.inputValue(),'operational');
  if(user.role==='admin')await shot(page,'empty-operational-1440',page.locator('[data-delay-card]'));
  await page.locator('[name=month]').fill('2026-10');await page.locator('[data-report-month="2026-10"]').waitFor();await page.locator('[name=subject]').selectOption('interview');await page.waitForFunction(()=>document.querySelector('[data-publication-segment=unknown]'));
  assert.equal(await page.locator('[data-value=delay-rate]').innerText(),'0.0%');const chart=page.locator('[data-monthly-chart=publication]');assert.equal(await chart.locator('[data-publication-legend=delayed] b').innerText(),'0/0');assert.match(await chart.locator('[data-publication-legend=delayed]').innerText(),/未归因 3/);assert.equal(await chart.locator('[data-publication-legend]').count(),4);
  if(user.role==='admin')for(const width of [1920,390,320]){await page.setViewportSize({width,height:1000});await chart.scrollIntoViewIfNeeded();await shot(page,`unknown-distribution-${width}`,chart);}
  await page.setViewportSize({width:1440,height:1000});await page.locator('[name=subject]').selectOption('tmua');await page.locator('[data-value=delay-rate]').filter({hasText:'8.0%'}).waitFor();
  await page.route('**/api/monthly-operations?*',(route:any)=>route.fulfill({status:503,contentType:'application/json',body:'{"message":"模拟读取失败"}'}));await page.getByRole('button',{name:'刷新',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await scope.inputValue(),'operational');assert.equal(await page.locator('[data-value=delay-rate]').innerText(),'8.0%');await page.unroute('**/api/monthly-operations?*');await page.getByRole('button',{name:'重试',exact:true}).click();await page.getByRole('alert').waitFor({state:'hidden'});assert.equal(await scope.inputValue(),'operational');
  checks.push({role:user.role,keyboard:true,refreshRetains:true,filtersRetain:true,zero:true,empty:true,unknown:3,retryRetains:true});await context.close();
 }
 for(const mobile of [false,true]){
  const width=mobile?390:1440,context=await browser.newContext({locale:'zh-CN',viewport:{width,height:1000},...(mobile?{isMobile:true,hasTouch:true}:{}),recordVideo:{dir:folder+'/motion',size:{width,height:1000}}});
  await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:mobile?employee:admin});const page=await context.newPage();await page.goto(url);await ready(page);await page.waitForTimeout(850);
  const scope=page.getByLabel('延期率统计范围');await scope.scrollIntoViewIfNeeded();await scope.selectOption('operational');await page.waitForTimeout(250);await page.getByRole('button',{name:/查看运营延期已发布明细/}).click();await settleBusinessUI(page);await page.waitForTimeout(250);await page.locator('[data-monthly-chart=publication]').scrollIntoViewIfNeeded();await settleBusinessUI(page);await page.waitForTimeout(400);await page.locator('[data-publication-legend=delayed]').click();await settleBusinessUI(page);await page.waitForTimeout(250);
  const video=page.video();await context.close();await video.saveAs(`${folder}/motion/${mobile?'mobile':'desktop'}.webm`);
 }
 assert.deepEqual(errors,[]);await writeFile(folder+'/checks.json',JSON.stringify({passed:true,checks,errors,database:'isolated PGlite',databaseMigrations:false},null,2));console.log(JSON.stringify({passed:true,checks:checks.length,folder}));
}finally{await browser.close();await fixture.stop();}
