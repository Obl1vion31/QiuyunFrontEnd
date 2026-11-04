/** 隔离 PostgreSQL 的实际收发字节及真实页面请求；不连接共享 Neon。 */
import assert from 'node:assert/strict';
import {createServer,connect,type Socket} from 'node:net';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {settleBusinessUI} from './business-confirm.helper';
import * as s from '../src/db/schema';

const baseline=process.env.NETWORK_BASELINE==='1',dir=process.env.NETWORK_EVIDENCE_DIR||'.tools/test-artifacts/network-transfer';
await mkdir(dir,{recursive:true});
const originalURL=process.env.TEST_POSTGRES_URL!;assert.ok(originalURL);const target=new URL(originalURL);
assert.ok(['localhost','127.0.0.1'].includes(target.hostname));
let received=0,sent=0;const sockets=new Set<Socket>();
const proxy=createServer(client=>{const upstream=connect(Number(target.port)||5432,target.hostname);client.setNoDelay(true);upstream.setNoDelay(true);sockets.add(client);sockets.add(upstream);client.on('data',b=>sent+=b.length);upstream.on('data',b=>received+=b.length);client.pipe(upstream);upstream.pipe(client);client.on('error',()=>upstream.destroy());upstream.on('error',()=>client.destroy());client.on('close',()=>{sockets.delete(client);upstream.destroy();});upstream.on('close',()=>{sockets.delete(upstream);client.destroy();});});
await new Promise<void>(r=>proxy.listen(0,'127.0.0.1',r));
const forwarded=new URL(originalURL);forwarded.hostname='127.0.0.1';forwarded.port=String((proxy.address() as {port:number}).port);process.env.TEST_POSTGRES_URL=forwarded.href;
const clockFile=new URL('../'+dir+'/clock.txt',import.meta.url).pathname,now=new Date('2026-11-05T12:00:00+08:00');await writeFile(clockFile,now.toISOString());
const fixture=await startPostgresFixture({clockFile}),{db,baseURL}=fixture;let browser:any;
const expectedOverdue:string[]=[],expectedMissing:string[]=[],expectedApproval:string[]=[],errors:string[]=[];
const hours=(n:number)=>new Date(now.getTime()+n*3600000);
try{
 const [owner]=await db.select().from(s.authUser).where(eq(s.authUser.username,'test_employee'));
 // 六种真实边界；较长的历史文本只用于确认提醒不会取回无关字段。
 for(let i=0;i<36;i++){
  const kind=i%6,planned=kind===0?hours(-2):kind===1?new Date(hours(-2).getTime()+1):kind===5?hours(24):hours(-50);
  const actual=kind===2||kind===3?hours(-3):kind===4?new Date(planned.getTime()+3600000):null;
  const id='10000000-0000-4000-8000-'+String(i+1).padStart(12,'0');
  const [content]=await db.insert(s.operationsContent).values({platformNoteId:(i+1).toString(16).padStart(24,'0')}).returning();
  const [version]=await db.insert(s.operationsContentVersion).values({contentId:content.id,versionNumber:0,workType:'new',contentName:'隔离样本：流量检查 '+i,subjectId:'tmua',categoryId:'temporary',projectDocUrl:'https://example.test/sample'}).returning();
  await db.insert(s.operationsContentSchedule).values({id,contentVersionId:version.id,plannedPublishAt:planned,actualPublishAt:actual,isPromoted:false,promotionStatus:'none',completionStatus:actual?kind===4?'on_time':'delayed':'pending',planRevision:1,delayReason:'隔离样本旧说明'.repeat(80)});
  await db.insert(s.operationsSchedulePlanHistory).values({scheduleId:id,revision:0,plannedPublishAt:hours(-100),effectiveAt:hours(-110),endedAt:hours(-60),newPlannedPublishAt:planned,reason:'隔离样本历史理由'.repeat(80),changedById:owner.id,changedByLabel:'fixture'});
  const reasonCount=kind===3?2:1;
  for(let day=1;day<=reasonCount;day++)await db.insert(s.operationsScheduleDelayReason).values({scheduleId:id,planRevision:kind===3?1:0,dayNumber:day,dueAt:hours(-48+day*24),responsibility:'self',reason:'隔离样本理由'.repeat(40),changedById:owner.id,changedByLabel:'fixture',history:[{note:'隔离样本更正依据'.repeat(120)}]});
  if(kind===0)expectedOverdue.push(id);if(kind===2)expectedMissing.push(id);
  if(i<3){await db.insert(s.operationsScheduleChangeRequest).values({scheduleId:id,planRevision:1,originalPlannedPublishAt:planned,requestedPublishAt:hours(24),reason:'隔离样本申请'.repeat(80),requestedById:owner.id,requestedByLabel:'fixture'});expectedApproval.push(id);}
 }
 const login=async(username:string,password:string)=>{const r=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify({username,password})});assert.equal(r.status,200);return r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');};
 const admin=await login('test_admin','fictional-admin-password'),employee=await login('test_employee','fictional-employee-password');
 const get=async(cookie=admin)=>{const r=await fetch(baseURL+'/api/business-notifications',{headers:{Cookie:cookie}});assert.equal(r.status,200);return r.json();};
 let result=await get();
 assert.deepEqual([...result.overdueIds].sort(),expectedOverdue.sort());assert.deepEqual([...result.missingReasonIds].sort(),expectedMissing.sort());assert.deepEqual([...result.approvalScheduleIds].sort(),expectedApproval.sort());assert.equal(result.pendingApprovals,3);
 const transfer=[];for(let i=0;i<3;i++){const before={received,sent};result=await get();transfer.push({databaseToAppBytes:received-before.received,appToDatabaseBytes:sent-before.sent});}
 const employeeResult=await get(employee);assert.equal(employeeResult.overdue,result.overdue);assert.equal(employeeResult.missingReasons,result.missingReasons);
 if(!baseline&&process.env.NETWORK_BASELINE_RESULT){const previous=JSON.parse(await readFile(process.env.NETWORK_BASELINE_RESULT,'utf8'));const normalize=(data:Record<string,unknown>)=>Object.fromEntries(Object.entries(data).filter(([key])=>key!=='serverTime').map(([key,value])=>[key,Array.isArray(value)?[...value].sort():value]));assert.deepEqual(normalize(result),normalize(previous.notifications),'与正式基线的全部提醒字段一致');assert.ok(transfer[1].databaseToAppBytes<previous.transfer[1].databaseToAppBytes/2,'提醒读取不重新传输历史正文');}
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:dir+'/videos',size:{width:1440,height:1000}}});
 await context.addInitScript('window.__name=(fn)=>fn');
 await context.addCookies(admin.split('; ').map(c=>{const at=c.indexOf('=');return {name:c.slice(0,at),value:c.slice(at+1),url:baseURL};}));
 const page=await context.newPage();if(!baseline)await page.clock.install({time:now});page.on('pageerror',(error:Error)=>errors.push(error.message));
 const requests:Array<{path:string;method:string}>=[];page.on('request',(r:any)=>{const u=new URL(r.url());if(u.origin===baseURL&&(u.pathname.startsWith('/business/')||u.pathname.startsWith('/api/')))requests.push({path:u.pathname,method:r.method()});});
 await page.goto(baseURL+'/business/operations-schedule?month=2026-11');await page.waitForLoadState('networkidle');
 assert.equal(await page.locator('[data-schedule-count=overdue]').innerText(),'6');assert.equal(await page.locator('[data-schedule-count=missingReasons]').innerText(),'6');
 const initialRequests=[...requests];const beforeHover=requests.length;
 for(const id of ['monthly-operations','meeting-review','settings']){await page.locator(`[data-module-id="${id}"]`).hover();await page.waitForTimeout(650);}
 await page.waitForLoadState('networkidle');const hoverRequests=requests.slice(beforeHover).filter(r=>r.path.startsWith('/business/'));
 if(!baseline){assert.equal(initialRequests.filter(r=>r.path==='/api/business-notifications').length,0,'排期SSR已有提醒，不重复请求');assert.equal(hoverRequests.length,0,'悬停不读取未访问页面');}
 const beforeNavigation=requests.length;await page.locator('[data-module-id=non-promotion-review]').click();await page.waitForURL('**/business/non-promotion-review');await page.waitForLoadState('networkidle');
 const navigationRequests=requests.slice(beforeNavigation).filter(r=>r.path.startsWith('/business/'));if(!baseline)assert.equal(navigationRequests.filter(r=>r.path==='/business/non-promotion-review').length,1,'实际导航正常读取一次');
 const uiRequests:Record<string,number>={};for(const r of requests)uiRequests[r.path]=(uiRequests[r.path]||0)+1;
 await page.locator('[data-module-id=schedule]').click();await page.waitForURL('**/business/operations-schedule**');await page.waitForLoadState('networkidle');
 if(!baseline){
  // 固定客户端时钟只测试真实计时器分支，HTTP和数据库仍为正式实现。
  let at=requests.length;await page.clock.runFor(61000);await page.waitForLoadState('networkidle');assert.equal(requests.slice(at).filter(r=>r.path==='/api/business-notifications').length,1,'每分钟提醒保留');
  at=requests.length;await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});await page.waitForLoadState('networkidle');assert.ok(requests.slice(at).filter(r=>r.path==='/api/business-notifications').length<=1,'恢复事件合并');
  // 保存完成事件发生在慢读取期间，仍须随后再取一次最新结果。
  let started!:()=>void;const firstStarted=new Promise<void>(r=>started=r);let release!:()=>void;const gate=new Promise<void>(r=>release=r);let hits=0;
  await page.route('**/api/business-notifications',async(route:any)=>{hits++;if(hits===1){started();await gate;}await route.continue();});
  await page.evaluate(()=>document.dispatchEvent(new Event('business:workflow-updated')));await firstStarted;
  await page.evaluate(()=>document.dispatchEvent(new Event('business:workflow-updated')));release();await page.waitForFunction(()=>document.querySelector('[data-schedule-notifications]')?.getAttribute('aria-busy')==='false');await page.waitForLoadState('networkidle');assert.equal(hits,2,'保存后的提醒不会被并发读取丢弃');await page.unroute('**/api/business-notifications');
  await page.clock.resume();
  await page.route('**/api/business-notifications',async(route:any)=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'隔离故障'})}));await page.evaluate(()=>document.dispatchEvent(new Event('business:workflow-updated')));await page.locator('[data-schedule-notification-error]:visible').waitFor();assert.equal(await page.locator('[data-schedule-count=overdue]').innerText(),'6');await settleBusinessUI(page);await page.screenshot({path:dir+'/notification-error-1440.png'});await page.unroute('**/api/business-notifications');
  await page.evaluate(()=>document.dispatchEvent(new Event('business:workflow-updated')));await page.waitForFunction(()=>document.querySelector<HTMLElement>('[data-schedule-notification-error]')?.hidden===true);
  // 已进入新排期页时，旧页面迟到的提醒响应不能覆盖新SSR数字。
  await page.locator('[data-module-id=non-promotion-review]').click();await page.waitForURL('**/business/non-promotion-review');await page.waitForLoadState('networkidle');
  let oldStarted!:()=>void;const oldReady=new Promise<void>(r=>oldStarted=r);let releaseOld!:()=>void;const oldGate=new Promise<void>(r=>releaseOld=r);
  await page.route('**/api/business-notifications',async(route:any)=>{oldStarted();await oldGate;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...result,overdue:999})});});
  await page.evaluate(()=>document.dispatchEvent(new Event('business:workflow-updated')));await oldReady;
  await page.locator('[data-module-id=schedule]').click();await page.waitForURL('**/business/operations-schedule**');await page.waitForFunction(()=>document.querySelector('[data-schedule-count=overdue]')?.textContent==='6');releaseOld();await page.waitForLoadState('networkidle');assert.equal(await page.locator('[data-schedule-count=overdue]').innerText(),'6');await page.unroute('**/api/business-notifications');
  await page.waitForFunction(()=>document.querySelector('.business-console-progress')?.getAttribute('aria-hidden')==='true');
  for(const width of [1920,1440,1024,390,320]){await page.setViewportSize({width,height:width<500?780:1000});await settleBusinessUI(page);await page.screenshot({path:`${dir}/schedule-${width}.png`});}
 }
 const videoPath=await page.video()?.path();
 await writeFile(dir+'/results.json',JSON.stringify({baseline,isolatedPostgres:true,seedSchedules:36,notifications:result,transfer,initialRequests,hoverRequests,navigationRequests,uiRequests,videoPath,pageErrors:errors},null,2));
 console.log(JSON.stringify({baseline,transfer,initialNotificationRequests:initialRequests.filter(r=>r.path==='/api/business-notifications').length,hoverPageRequests:hoverRequests.length,navigationRequests:navigationRequests.length,pageErrors:errors}));
 assert.equal(errors.length,0);await context.close();
}catch(error){await writeFile(dir+'/failure.log',String(error)+'\n'+fixture.logs().slice(-5000));throw error;}
finally{if(browser)await browser.close();await fixture.stop();for(const socket of sockets)socket.destroy();await new Promise<void>(r=>proxy.close(()=>r()));process.env.TEST_POSTGRES_URL=originalURL;}
