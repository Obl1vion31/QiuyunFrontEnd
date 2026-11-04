import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {spawn,type ChildProcess} from 'node:child_process';
import {resolve} from 'node:path';
import {eq,sql} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {provisionAccount} from '../src/auth/provision';
import * as s from '../src/db/schema';

const dir=resolve(process.env.OPTIMISTIC_EVIDENCE_DIR||'.tools/test-artifacts/optimistic-editing');
await mkdir(dir,{recursive:true});
const fixture=await startPostgresFixture(),{db,baseURL}=fixture;
const checks:string[]=[],images:string[]=[],errors:string[]=[];
let browser:any,nativeBrowser:any,nativeProcess:ChildProcess|undefined;
const mark=(name:string)=>{checks.push(name);console.log('PASS '+name);};
type Actor={cookie:string;username:string;password:string};
const actors:Record<string,Actor>={};
async function request(actor:Actor,path:string,method='GET',body?:any,extra:Record<string,string>={}){
 const response=await fetch(baseURL+path,{method,headers:{Origin:baseURL,Cookie:actor.cookie,...(body instanceof FormData?{}:body===undefined?{}:{'Content-Type':'application/json'}),...extra},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})});
 const text=await response.text();let value:any;try{value=JSON.parse(text);}catch{value=text;}
 return {status:response.status,value,text};
}
async function login(username:string,password:string){
 const response=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify({username,password})});
 assert.equal(response.status,200);
 return {username,password,cookie:response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')};
}
const form=(values:Record<string,unknown>)=>{const result=new FormData();for(const [key,value] of Object.entries(values))if(value!==undefined&&value!==null)result.set(key,String(value));return result;};
async function seed(name:string,options:{published?:boolean;promoted?:boolean;date?:string}={}){
 const [content]=await db.insert(s.operationsContent).values({platformNoteId:randomUUID().replaceAll('-','').slice(0,24)}).returning();
 const [version]=await db.insert(s.operationsContentVersion).values({contentId:content.id,contentName:name,versionNumber:0,workType:'new',subjectId:'tmua',categoryId:'temporary',projectDocUrl:'https://example.test/doc'}).returning();
 const date=options.date??(options.published?'2026-10-28':'2026-11-08');
 const [schedule]=await db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,isPromoted:!!options.promoted,promotionStatus:options.promoted?'testing':'none',plannedPublishAt:new Date(date+'T10:00:00+08:00'),actualPublishAt:options.published?new Date(date+'T10:00:00+08:00'):null,completionStatus:options.published?'on_time':'pending',publicationUrl:options.published?'https://www.xiaohongshu.com/explore/'+content.platformNoteId:null}).returning();
 let campaign:any;
 if(options.promoted){[campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:schedule.id,startedOn:date,dailyReviewEnabledOn:date,initialStage:'testing',currentStage:'testing',currentStatus:'testing'}).returning();await db.insert(s.operationsPromotionStage).values({campaignId:campaign.id,stageType:'testing',startedOn:date});}
 return {content,version,schedule,campaign};
}
async function scheduleRow(id:string){
 const page=await request(actors.admin,'/business/operations-schedule?month=2026-11');
 assert.equal(page.status,200);
 const match=page.text.match(/<script[^>]*data-schedule-records[^>]*>([\s\S]*?)<\/script>/);
 assert.ok(match,'真实排期页面提供读取凭据');
 const row=JSON.parse(match[1]).find((r:any)=>r.id===id);
 assert.ok(row?.writeVersion,'同一次读取包含排期版本');
 return row;
}
const editBody=(row:any,name:string)=>form({contentName:name,subjectId:row.subjectId,categoryId:row.categoryId,projectDocUrl:row.projectDocUrl,plannedPublishAt:row.plannedPublishAt,syncToMoments:row.syncToMoments?'on':undefined,isPromoted:row.isPromoted?'on':undefined,promotionStatus:row.promotionStatus,expectedPlanRevision:row.planRevision,expectedWriteVersion:row.writeVersion});
async function timeline(post:any){const result=await request(actors.admin,'/api/promotion-timeline?schedule='+post.schedule.id);assert.equal(result.status,200);const row=result.value.find((r:any)=>r.scheduleId===post.schedule.id);assert.ok(row?.fingerprint);return row;}
const daily=(post:any,fingerprint:string,requestKey=randomUUID())=>({campaignId:post.campaign.id,metricDate:'2026-11-01',dailyStatus:'active',actualStatusSnapshot:'testing',stageTypeSnapshot:'testing',recordKind:'regular',spend:'100.00',platformOpenCount:20,actualOpenCount:10,platformLeadCount:5,actualLeadCount:3,reviewDecision:'test_continue',platformNoteId:post.content.platformNoteId,requestKey,fingerprint});
const stale=(result:{status:number;value:any})=>{assert.equal(result.status,409,JSON.stringify(result.value));assert.equal(result.value.code,'STALE_WRITE',JSON.stringify(result.value));};
async function screenshot(page:any,name:string){
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.allSettled(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished));});
 await page.screenshot({path:dir+'/'+name+'.png',fullPage:false});images.push(name+'.png');
}
async function browserActor(actor:Actor,video=false){
 const context=await browser.newContext({viewport:{width:1440,height:1000},...(video?{recordVideo:{dir:dir+'/videos',size:{width:1440,height:1000}}}:{})});
 await context.addInitScript('window.__name=(fn)=>fn');
 await context.addCookies(actor.cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:baseURL};}));
 const page=await context.newPage();page.on('pageerror',(e:Error)=>errors.push(e.message));
 return {context,page};
}
async function openReview(page:any,id:string){
 await page.goto(baseURL+'/business/non-promotion-review');
 await page.locator('[data-inspector-key="'+id+':day_7"] [data-inspector-trigger]').first().click();
 const review=page.locator('[data-inspector] [data-review-form]').first();
 await review.waitFor({state:'visible'});
 return review;
}
async function fillReview(review:any,reads:string){
 await review.locator('[name=exposureCount]').fill('1000');
 await review.locator('[name=readCount]').fill(reads);
 await review.locator('[name=threeSecondReadRate]').fill('42.5');
 await review.locator('[name=recordedThrough]').fill('2026-11-04');
 await review.locator('[name=conclusion]').fill('隔离验收：保存时核对版本');
}

try{
 await provisionAccount(db,{username:'test_peer_admin',password:'fictional-peer-password',role:'admin'});
 actors.admin=await login('test_admin','fictional-admin-password');
 actors.employee=await login('test_employee','fictional-employee-password');
 actors.other=await login('test_other','fictional-other-password');
 actors.peer=await login('test_peer_admin','fictional-peer-password');

 const post=await seed('隔离样本：同一排期先保存者生效'),independent=await seed('隔离样本：不同排期独立保存');
 const original=await scheduleRow(post.schedule.id),separate=await scheduleRow(independent.schedule.id);
 let result=await request(actors.admin,'/api/operations-content/'+post.schedule.id,'PATCH',editBody(original,'管理员先保存的名称'));
 assert.equal(result.status,200,JSON.stringify(result.value));
 stale(await request(actors.peer,'/api/operations-content/'+post.schedule.id,'PATCH',editBody(original,'不应覆盖的新名称')));
 assert.equal((await db.select().from(s.operationsContentVersion).where(eq(s.operationsContentVersion.id,post.version.id)))[0].contentName,'管理员先保存的名称');
 result=await request(actors.peer,'/api/operations-content/'+independent.schedule.id,'PATCH',editBody(separate,'另一排期独立保存'));
 assert.equal(result.status,200,JSON.stringify(result.value));
 mark('排期文字修改拒绝旧版本，不同对象独立保存');

 const simultaneous=await seed('隔离样本：真实同时保存'),base=await scheduleRow(simultaneous.schedule.id);
 const races=await Promise.all([request(actors.admin,'/api/operations-content/'+simultaneous.schedule.id,'PATCH',editBody(base,'并发A')),request(actors.peer,'/api/operations-content/'+simultaneous.schedule.id,'PATCH',editBody(base,'并发B'))]);
 assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);stale(races.find(r=>r.status===409)!);
 mark('真实 PostgreSQL 同时提交：只有一个保存成功');

 const parentRead=await scheduleRow(post.schedule.id);
 await db.insert(s.operationsContentVersion).values({contentId:post.content.id,versionNumber:1,workType:'revision',sourceVersionId:post.version.id,revisionSummary:'隔离验收：新建子版本',contentName:'隔离样本：后建子版本',subjectId:'tmua',categoryId:'temporary'});
 stale(await request(actors.admin,'/api/operations-content/'+post.schedule.id,'PATCH',editBody(parentRead,'旧父记录不能越过新版本')));

 const year={year:2026,instructions:'首个有效年度说明',expectedUpdatedAt:null};
 assert.equal((await request(actors.admin,'/api/operations-annual-plans/year/2026','PATCH',year)).status,200);
 stale(await request(actors.peer,'/api/operations-annual-plans/year/2026','PATCH',{...year,instructions:'旧页面覆盖'}));
 const legacy=await request(actors.admin,'/api/operations-content/'+post.schedule.id,'PATCH',editBody(original,'旧租约页面'),{'X-Edit-Tab':randomUUID(),'X-Edit-Leases':'{}'});stale(legacy);
 for(const method of ['GET','POST','PUT','PATCH','DELETE'])assert.equal((await request(actors.admin,'/api/collaboration/'+(method==='PUT'?'presence':'locks'),method,method==='GET'?undefined:{})).status,410);
 mark('年度说明防覆盖，旧租约写入拒绝，所有协作接口410');

 const promotion=await seed('隔离样本：日度复盘幂等及冲突',{published:true,promoted:true,date:'2026-11-01'});
 const promotionParentRead=await scheduleRow(promotion.schedule.id),fp=(await timeline(promotion)).fingerprint,input=daily(promotion,fp);
 result=await request(actors.employee,'/api/promotion-daily','POST',form(input));assert.equal(result.status,201,JSON.stringify(result.value));
 stale(await request(actors.admin,'/api/operations-content/'+promotion.schedule.id,'PATCH',editBody(promotionParentRead,'旧整帖不能越过新日度')));
 mark('新建子版本和日度保存都会使旧整帖凭据失效');
 result=await request(actors.employee,'/api/promotion-daily','POST',form(input));assert.equal(result.status,201,JSON.stringify(result.value));
 stale(await request(actors.other,'/api/promotion-daily','POST',form(daily(promotion,fp))));
 const metrics=await db.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.campaignId,promotion.campaign.id));assert.equal(metrics.length,1);
 const oldMetric=metrics[0],historyFp=(await timeline(promotion)).fingerprint;
 const historyValues={...input,fingerprint:historyFp,expectedUpdatedAt:oldMetric.updatedAt.toISOString(),spend:'125.00'};
 result=await request(actors.admin,'/api/promotion-daily/'+oldMetric.id,'PATCH',form(historyValues));assert.equal(result.status,200,JSON.stringify(result.value));
 stale(await request(actors.peer,'/api/promotion-daily/'+oldMetric.id,'PATCH',form({...historyValues,spend:'155.00'})));
 assert.equal(Number((await db.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.id,oldMetric.id)))[0].spend),125);
 mark('日度新增幂等、同日抢先保存及历史更正均防覆盖');

 const batchA=await seed('隔离样本：批量A',{published:true,promoted:true,date:'2026-11-01'}),batchB=await seed('隔离样本：批量B',{published:true,promoted:true,date:'2026-11-01'});
 const aInput=daily(batchA,(await timeline(batchA)).fingerprint),bInput=daily(batchB,(await timeline(batchB)).fingerprint);
 assert.equal((await request(actors.other,'/api/promotion-daily','POST',form({...bInput,requestKey:randomUUID()}))).status,201);
 stale(await request(actors.employee,'/api/promotion-daily/batch','POST',{rows:[aInput,bInput]}));
 assert.equal((await db.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.campaignId,batchA.campaign.id))).length,0);
 mark('批量中一个对象冲突，其他对象全部回滚');

 const createMeeting=async(name:string)=>{const r=await request(actors.admin,'/api/meeting-reviews','POST',form({name,meetingType:'weekly',meetingAt:'2026-11-05T10:00',periodStart:'2026-10-26',periodEnd:'2026-11-01'}));assert.equal(r.status,201,JSON.stringify(r.value));return (await request(actors.admin,'/api/meeting-reviews/'+r.value.id)).value.meeting;};
 const meetingA=await createMeeting('隔离样本：草稿A'),meetingB=await createMeeting('隔离样本：草稿B');
 const [initialVersion]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId,meetingA.id));
 const newer=await request(actors.admin,'/api/meeting-reviews/'+meetingA.id,'PATCH',{action:'save_version_draft',draftVersionId:initialVersion.id,expectedUpdatedAt:meetingA.updatedAt,draft:{...meetingA.draftSnapshot,coreConclusion:'新的保存内容'}});assert.equal(newer.status,200,JSON.stringify(newer.value));
 stale(await request(actors.peer,'/api/meeting-reviews','DELETE',{ids:[meetingB.id,meetingA.id],expectedUpdatedAt:{[meetingA.id]:meetingA.updatedAt,[meetingB.id]:meetingB.updatedAt}}));
 assert.equal((await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,meetingB.id))).length,1);
 mark('例会旧草稿删除被拦截，批量删除保持原子性');

 const emptyCounts={added:null,consulted:null,converted:null};
 const privateInput={month:'2026-10',expectedRevision:-1,data:{total:{added:12,consulted:8,converted:2},rows:[],note:''}};
 result=await request(actors.employee,'/api/monthly-private-data','PATCH',privateInput);assert.equal(result.status,200,JSON.stringify(result.value));
 stale(await request(actors.admin,'/api/monthly-private-data','PATCH',{...privateInput,data:{total:emptyCounts,rows:[],note:''}}));
 const savedUser=(await db.select().from(s.authUser).where(eq(s.authUser.username,'test_other')))[0];
 result=await request(actors.admin,'/api/admin/accounts/'+savedUser.id,'PATCH',{action:'rename',name:'隔离验收员工',expectedUpdatedAt:savedUser.updatedAt.toISOString()});assert.equal(result.status,200,JSON.stringify(result.value));
 stale(await request(actors.peer,'/api/admin/accounts/'+savedUser.id,'PATCH',{action:'rename',name:'旧名称覆盖',expectedUpdatedAt:savedUser.updatedAt.toISOString()}));
 const unauth=await fetch(baseURL+'/api/monthly-private-data',{method:'PATCH',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(privateInput)});assert.equal(unauth.status,401);
 const cross=await fetch(baseURL+'/api/monthly-private-data',{method:'PATCH',headers:{Origin:'https://example.test',Cookie:actors.admin.cookie,'Content-Type':'application/json'},body:JSON.stringify(privateInput)});assert.equal(cross.status,403);
 mark('月度人数、账号修改保留版本检查，登录与跨站保护正常');

 const playwright=await import(process.env.PLAYWRIGHT_MODULE||'../.tools/tooling/node_modules/playwright/index.mjs');
 browser=await playwright.chromium.launch({headless:process.env.OPTIMISTIC_HEADED!=='1',args:['--no-sandbox','--disable-dev-shm-usage']});
 const ui=await seed('隔离样本：两人同时填写非推广复盘',{published:true});
 const admin=await browserActor(actors.admin,true),employee=await browserActor(actors.employee,true);
 const aForm=await openReview(admin.page,ui.schedule.id),bForm=await openReview(employee.page,ui.schedule.id);
 await fillReview(aForm,'180');await fillReview(bForm,'120');
 await admin.context.setOffline(true);await aForm.locator('button[type=submit]').click();await aForm.locator('output').filter({hasText:'连接失败'}).waitFor();
 assert.equal(await aForm.locator('[name=readCount]').inputValue(),'180');await admin.context.setOffline(false);
 await admin.page.route('**/api/non-promotion-reviews',async(route:any)=>route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({message:'隔离业务校验：当前不能提交'})}));
 await aForm.locator('button[type=submit]').click();await aForm.locator('output').filter({hasText:'隔离业务校验'}).waitFor();
 assert.equal(await admin.page.locator('[data-business-confirm][open]').count(),0,'普通业务409不触发刷新');assert.equal(await aForm.locator('[name=readCount]').inputValue(),'180');
 await screenshot(admin.page,'ordinary-validation-keeps-input-1440');await admin.page.unroute('**/api/non-promotion-reviews');
 mark('断网保留输入并可重试，普通业务409不弹刷新');
 const collabRequests:string[]=[];for(const page of [admin.page,employee.page])page.on('request',(r:any)=>{if(r.url().includes('/api/collaboration/'))collabRequests.push(r.url());});
 assert.equal(await admin.page.locator('[data-editor-badge],[data-presence-badge],[data-meeting-presence]').count(),0);
 await screenshot(employee.page,'employee-editing-1440');
 await bForm.locator('button[type=submit]').click();await employee.page.waitForURL('**view=history**');
 await aForm.locator('button[type=submit]').click();
 const dialog=admin.page.locator('[data-business-confirm][open]');await dialog.waitFor();
 let repeatRequests=0;admin.page.on('request',(r:any)=>{if(r.url().includes('/api/non-promotion-reviews'))repeatRequests++;});
 const retry=await admin.page.evaluate(async()=>{const f=document.querySelector<HTMLFormElement>('[data-inspector] [data-review-form]')!;const r=await fetch('/api/non-promotion-reviews',{method:'POST',body:new FormData(f)});return {status:r.status,code:(await r.json()).code};});
 assert.deepEqual(retry,{status:409,code:'STALE_WRITE'});assert.equal(repeatRequests,0,'过期对象的自动重试在客户端停止');
 assert.match(await dialog.textContent(),/有协作者刚刚保存了这条记录，必须刷新界面/);
 for(const width of [1920,1440,1024,390,320]){
  await admin.page.setViewportSize({width,height:width<500?780:1000});await screenshot(admin.page,'conflict-'+width);
  assert.ok(await dialog.locator('[data-confirm-accept]').isVisible());assert.equal(await dialog.locator('[data-confirm-cancel]').isVisible(),false);
  const box=await dialog.boundingBox();assert.ok(box.x>=-1&&box.x+box.width<=width+1);
 }
 await admin.page.setViewportSize({width:1440,height:1000});
 await admin.page.keyboard.press('Escape');assert.ok(await dialog.isVisible(),'过期输入必须刷新，Esc 不会关闭提示');
 assert.equal(await aForm.locator('[name=readCount]').inputValue(),'180');
 await screenshot(admin.page,'conflict-required-refresh-1440');
 const confirmedMetric=(await db.select().from(s.operationsContentPerformanceMetric).where(eq(s.operationsContentPerformanceMetric.scheduleId,ui.schedule.id)))[0];assert.equal(confirmedMetric.readCount,120);
 mark('管理员与员工同时填写；五档只有刷新按钮，Esc 不会关闭提示，旧输入未覆盖');
 await admin.context.close();await employee.context.close();

 const ui2=await seed('隔离样本：确认刷新载入最新内容',{published:true});
 const a2=await browserActor(actors.admin,true),b2=await browserActor(actors.employee);
 const a2Form=await openReview(a2.page,ui2.schedule.id),b2Form=await openReview(b2.page,ui2.schedule.id);
 await fillReview(a2Form,'190');await fillReview(b2Form,'130');
 await b2Form.locator('button[type=submit]').click();await b2.page.waitForURL('**view=history**');
 await a2Form.locator('button[type=submit]').click();await a2.page.locator('[data-business-confirm][open]').waitFor();
 let nativeConfirmations=0;a2.page.on('dialog',async(d:any)=>{nativeConfirmations++;await d.accept();});
 const navigation=a2.page.waitForEvent('domcontentloaded');
 await a2.page.locator('[data-confirm-accept]').click();await navigation;
 assert.equal(nativeConfirmations,0,'确认刷新后不重复出现 beforeunload');
 assert.equal(await a2.page.locator('[data-inspector].is-open').count(),0,'刷新退出已经离开当前队列的过期详情');
 await screenshot(a2.page,'confirmed-refresh-1440');
 assert.equal(collabRequests.length,0);mark('确认后直接刷新，不重复弹出原生未保存确认；协作请求为零');
 await a2.context.close();await b2.context.close();

 // 使用 Chrome 原生默认上下文，避免自动化的焦点模拟令后台标签仍报告 visible。
 const profile=await mkdtemp(dir+'/native-profile-');
 nativeProcess=spawn(playwright.chromium.executablePath(),['--no-sandbox','--no-first-run','--no-default-browser-check','--disable-dev-shm-usage','--remote-debugging-port=0','--user-data-dir='+profile,...(process.env.OPTIMISTIC_HEADED==='1'?[]:['--headless=new']),'about:blank'],{stdio:'ignore'});
 let port='';for(let i=0;i<100&&!port;i++){try{port=(await readFile(profile+'/DevToolsActivePort','utf8')).split('\n')[0];}catch{await new Promise(r=>setTimeout(r,100));}}
 assert.ok(port,'原生浏览器启动成功');
 nativeBrowser=await playwright.chromium.connectOverCDP('http://127.0.0.1:'+port,{noDefaults:true});
 const nativeContext=nativeBrowser.contexts()[0];
 await nativeContext.addInitScript('window.__name=(fn)=>fn');
 await nativeContext.addCookies(actors.admin.cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:baseURL};}));
 const front=nativeContext.pages()[0],cdp=await nativeBrowser.newBrowserCDPSession();
 const newTab=nativeContext.waitForEvent('page');await cdp.send('Target.createTarget',{url:'about:blank',newWindow:false,background:true});
 const background=await newTab,idleEmployee=await browserActor(actors.employee);
 const tabs=[front,background,idleEmployee.page];
 const observations=tabs.map(()=>({collaboration:0,notifications:0,other:0}));
 for(const [i,page]of tabs.entries())page.on('request',(r:any)=>{const p=new URL(r.url()).pathname;if(p.startsWith('/api/collaboration/'))observations[i].collaboration++;else if(p==='/api/business-notifications')observations[i].notifications++;else if(p.startsWith('/api/'))observations[i].other++;});
 await tabs[0].goto(baseURL+'/business/operations-schedule?month=2026-11');
 await tabs[1].goto(baseURL+'/business/non-promotion-review');
 await tabs[2].goto(baseURL+'/business/daily-promotion-review');
 await tabs[0].setViewportSize({width:1440,height:1000});
 await tabs[0].bringToFront();
 const visibility=await Promise.all(tabs.map(page=>page.evaluate(()=>document.visibilityState)));
 const backgroundMode='native-background-tab';
 assert.equal(visibility[0],'visible');assert.equal(visibility[1],'hidden','后台标签由 Chrome 原生可见性控制');
 const stats=async()=>{await db.execute(sql`select pg_stat_clear_snapshot()`);return await db.execute(sql`select relname,seq_scan::text,coalesce(idx_scan,0)::text as idx_scan,n_tup_ins::text,n_tup_upd::text,n_tup_del::text from pg_stat_user_tables where relname in ('business_presence','business_edit_lease') order by relname`);};
 const before=await stats(),duration=Number(process.env.OPTIMISTIC_IDLE_MS??300000),started=performance.now();
 while(performance.now()-started<duration){await new Promise(r=>setTimeout(r,Math.min(30000,duration-(performance.now()-started))));console.log('IDLE '+Math.round(performance.now()-started)+'/'+duration);}
 await new Promise(r=>setTimeout(r,1500));const after=await stats();
 assert.deepEqual(after,before,'协作表没有扫描、索引读取或写入增长');
 assert.ok(observations.every(row=>row.collaboration===0));
 await writeFile(dir+'/idle.json',JSON.stringify({durationMs:Math.round(performance.now()-started),completeFiveMinutes:duration>=300000&&performance.now()-started>=300000,visibility,backgroundMode,observations,before,after},null,2));
 await screenshot(tabs[0],'schedule-no-status-1440');
 for(const width of [1920,1024]){await tabs[0].setViewportSize({width,height:1000});await screenshot(tabs[0],'schedule-no-status-'+width);}
 mark('前台、多标签与真实后台无协作API或协作表访问，业务提醒单独计数');
 assert.equal(errors.length,0,errors.join('\n'));
 await nativeBrowser.close();nativeBrowser=undefined;await idleEmployee.context.close();
 await writeFile(dir+'/checks.json',JSON.stringify({checks,images,pageErrors:errors,fixture:'isolated PostgreSQL; fictional accounts; no shared Neon writes'},null,2));
 console.log('OPTIMISTIC_EDITING_OK '+checks.length);
}catch(error){await writeFile(dir+'/failure.log',String(error)+'\n'+fixture.logs().slice(-12000));throw error;}
finally{if(nativeBrowser)await nativeBrowser.close();nativeProcess?.kill();if(browser)await browser.close();await fixture.stop();}

