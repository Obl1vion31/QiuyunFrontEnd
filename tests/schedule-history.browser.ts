import assert from 'node:assert/strict';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {prepareMonthlyArrangement} from './monthly-arrangement.fixture';
import {seedLinkPost} from './monthly-plan-links.fixture';
import {admin,employee} from './auth.fixture';
import {settleBusinessUI,respondToBusinessConfirm} from './business-confirm.helper';
import {readScheduleBaselines,readScheduleComparison} from '../src/db/schedule-baseline';
import type {PlanContent} from '../src/db/monthly-plan-types';
import * as s from '../src/db/schema';
const dir=process.env.SCHEDULE_HISTORY_DIR??'.tools/test-artifacts/schedule-history';
for(const child of ['screenshots','video','pdf'])await mkdir(dir+'/'+child,{recursive:true});
const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-06T12:00:00+08:00');
const f=await startPostgresFixture({clockFile,entry:process.env.SCHEDULE_HISTORY_ENTRY}),{db,baseURL}=f;
let browser:any,context:any,staff:any;const checks:string[]=[],images:string[]=[],errors:string[]=[];
const mark=(message:string)=>{checks.push(message);console.log('PASS '+message);};
try{
 const pw=await import(process.env.PLAYWRIGHT_MODULE!);browser=await pw.chromium.launch({headless:true,args:['--no-sandbox']});
 context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:dir+'/video',size:{width:1440,height:1000}}});
 staff=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});
 async function login(c:any,who:any){assert.equal((await c.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:who})).status(),200);return (await c.cookies()).map((v:any)=>v.name+'='+v.value).join('; ');}
 const boss=await login(context,admin),worker=await login(staff,employee);
 async function api(path:string,body?:any,method='GET',cookie=boss,expected=200,form=false){
  const fd=new FormData();if(form)for(const [k,v]of Object.entries(body))fd.set(k,String(v));
  const response=await fetch(baseURL+path,{method,headers:{Origin:baseURL,Cookie:cookie,Accept:'application/json',...(body&&!form?{'Content-Type':'application/json'}:{})},...(body?{body:form?fd:JSON.stringify(body)}:{})});
  const value=await response.json();assert.equal(response.status,expected,JSON.stringify({path,value}));return value;
 }
 const carry=await seedLinkPost(db,'面试课成功案例 3','2026-10-31T15:00',{subjectId:'interview',categoryId:'success-story'}),first=await seedLinkPost(db,'面试课成功案例1','2026-11-03T16:00',{version:1,subjectId:'interview',categoryId:'success-story'});
 const group=randomUUID(),slot=randomUUID(),content:PlanContent={groups:[{id:group,annualPlanId:null,annualVersion:null,name:'面试课案例来源',subjectId:'interview',categoryId:'success-story',quantity:22,note:'隔离复现22篇定稿与明确遗留',reason:'隔离验收'}],items:[{id:slot,groupId:group,week:1,kind:'carry',scheduleId:carry.schedule.id},...Array.from({length:21},(_,i)=>({id:randomUUID(),groupId:group,week:Math.min(5,Math.floor(i/5)+1),kind:'new' as const,scheduleId:null}))]};
 for(let i=0;i<20;i++)await seedLinkPost(db,`完整计划样本 ${i+1} · 长名称保留真实读取入口`, `2026-11-${String(8+i).padStart(2,'0')}T18:00`,{subjectId:'interview',categoryId:'success-story'});
 const prepared=await prepareMonthlyArrangement(db,baseURL,boss,{content}),endpoint='/api/monthly-plans/'+prepared.planId+'/arrangement';
 const fields=(name:string,planned:string,revision:number,reason='')=>({contentName:name,subjectId:'interview',categoryId:'success-story',plannedPublishAt:planned,promotionStatus:'none',projectDocUrl:'',operationType:'non_promotion_standard',expectedPlanRevision:revision,planChangeReason:reason,monthlyPlanReason:reason});
 await api('/api/operations-content/'+carry.schedule.id,fields('面试课成功案例 3','2026-11-25T15:00',0,'需求未到'),'PATCH',worker,200,true);
 let workflow=await api('/api/operations-content/'+carry.schedule.id+'/workflow');
 assert.equal(workflow.schedule.executionHistory[0].planContext.after[0].week,1);
 let event=workflow.historyGroups.find((g:any)=>g.key==='execution').items.filter((i:any)=>i.reason==='需求未到');assert.equal(event.length,1);assert.match(event[0].label,/上月遗留接入 11 月.*原授权 W1 → 安排 W4/);
 assert.equal(workflow.historyGroups.find((g:any)=>g.key==='schedule').items.length,1);
 await api('/api/operations-content/'+carry.schedule.id,fields('面试课成功案例 3 · 更新说明','2026-11-25T18:00',1,'同周时间微调'),'PATCH',worker,200,true);
 workflow=await api('/api/operations-content/'+carry.schedule.id+'/workflow');assert.equal(workflow.historyGroups.find((g:any)=>g.key==='execution').items.filter((i:any)=>i.reason==='同周时间微调').length,0);assert.equal(workflow.historyGroups.find((g:any)=>g.key==='schedule').items.length,2);assert.equal(workflow.historyGroups.find((g:any)=>g.key==='content').items.length,1);
 const lookup=await api('/api/content-search?id='+carry.schedule.id);assert.deepEqual(lookup.historyGroups,workflow.historyGroups);
 mark('真实写入：遗留接入与W1→W4合一条；同Week微调仅日期；混合标题修改独立；查帖与详情一致');
 const state=await api(endpoint);await api(endpoint,{action:'confirm',fingerprint:state.fingerprint,requestId:randomUUID(),reason:'隔离22篇最终核对'},'POST');
 const [plan]=await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.id,prepared.planId));
 assert.equal(plan.content.items.length,22);assert.equal(new Set(plan.content.items.map(i=>i.id)).size,22);assert.equal(plan.content.items.find(i=>i.scheduleId===carry.schedule.id)!.id,slot);assert.notEqual(plan.content.items.find(i=>i.scheduleId===first.schedule.id)!.id,slot);
 let baselines=await readScheduleBaselines(db,['2026-11']);assert.equal(baselines[0].items.length,22);assert.equal(baselines[0].items.find(i=>i.id===first.schedule.id)!.versionNumber,1);
 mark('两遍分配保留明确来源，未关联早期帖子不抢名额；管理员一步定稿22篇ID唯一');
 const [sealed]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,plan.sealedVersionId!));
 const legacy:any=structuredClone(sealed.snapshot),oldContent=structuredClone(plan.content),firstItem=oldContent.items.find(i=>i.scheduleId===first.schedule.id)!;firstItem.id=slot;
 legacy.draft.monthlyPlan.content=oldContent;delete legacy.generated.scheduleBaseline;
 const carryView=legacy.generated.monthly.executionPlan.items.find((i:any)=>i.scheduleId===carry.schedule.id)!;
 const frozenViews=legacy.generated.monthly.executionPlan.items;
 legacy.generated.monthly.executionPlan.items=oldContent.items.map(i=>({...frozenViews.find((v:any)=>v.scheduleId===i.scheduleId),...i,group:oldContent.groups[0],schedule:i.scheduleId===first.schedule.id?carryView.schedule:legacy.generated.monthly.candidates.find((c:any)=>c.id===i.scheduleId)}));
 await db.update(s.operationsMonthlyPlan).set({content:oldContent}).where(eq(s.operationsMonthlyPlan.id,plan.id));
 await db.update(s.operationsReviewMeetingVersion).set({snapshot:legacy}).where(eq(s.operationsReviewMeetingVersion.id,sealed.id));
 baselines=await readScheduleBaselines(db,['2026-11']);assert.equal(baselines[0].items.length,22);assert.equal(new Set(baselines[0].items.map(i=>i.id)).size,22);assert.equal(baselines[0].items.find(i=>i.id===first.schedule.id)!.plannedAt,first.schedule.plannedPublishAt.toISOString());
 const actual=await api('/api/monthly-plans?month=2026-11');
 const view=actual.plan??actual;assert.equal(view.items.find((i:any)=>i.scheduleId===first.schedule.id).schedule.id,first.schedule.id);assert.equal(view.items.find((i:any)=>i.scheduleId===carry.schedule.id).schedule.id,carry.schedule.id);
 const compare=await readScheduleComparison(db,'2026-11-01','2026-11-30',new Date('2026-11-06T04:00Z'),'current');assert.equal(compare.original,22);
 const [unchanged]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,sealed.id));assert.deepEqual(unchanged.snapshot,legacy);
 mark('旧冻结重复名额只读修正：两帖分别归属，V0仍22篇，原冻结JSON逐值不变');
 const page=await context.newPage(),other=await staff.newPage();for(const p of [page,other])p.on('pageerror',(e:any)=>errors.push(e.message));
 const shot=async(name:string,p=page)=>{await settleBusinessUI(p);if(name.startsWith('first-paint'))assert.equal(await p.locator('[data-inspector-name]').textContent(),'面试课成功案例 3 · 保存回显');await p.screenshot({path:dir+'/screenshots/'+name+'.png',fullPage:false});images.push(name+'.png');};
 async function open(p:any,width:number){await p.setViewportSize({width,height:1000});await p.goto(baseURL+'/business/operations-schedule?month=2026-11&row='+carry.schedule.id);await settleBusinessUI(p);await p.locator('[data-schedule-workflow-history] [data-schedule-history-group]').first().waitFor();assert.equal(await p.locator('.monthly-card-membership').count(),0);assert.equal(await p.locator('[data-schedule-history-group][open]').count(),0);}
 for(const [role,p]of [['admin',page],['employee',other]] as const)for(const width of [1920,1440,1024]){
  await open(p,width);await shot(`${role}-detail-folded-${width}`,p);
  for(const key of ['execution','schedule','content']){const fold=p.locator(`[data-schedule-history-group=${key}]`);await fold.locator('summary').click();await fold.scrollIntoViewIfNeeded();assert.equal(await fold.locator('.workflow-plan-history p').first().evaluate((n:HTMLElement)=>getComputedStyle(n).fontSize),'14px');await shot(`${role}-history-${key}-${width}`,p);await fold.locator('summary').click();}
  await p.locator('[data-close-inspector]').click();await p.locator('#schedule-panel').waitFor({state:'hidden'});
  await p.locator('[data-arrangement-details]>summary').click();
  const table=p.locator('[data-schedule-comparison-row="'+first.schedule.id+'"]');await table.first().scrollIntoViewIfNeeded();await shot(`${role}-v0-${width}`,p);
  await p.locator('[data-schedule-comparison-row="'+carry.schedule.id+'"]').scrollIntoViewIfNeeded();await shot(`${role}-v0-carry-${width}`,p);
 }
 mark('双角色三档桌面：折叠详情、三组历史及22篇V0明细实际渲染');
 await page.setViewportSize({width:1440,height:1000});await page.goto(baseURL+'/business/operations-schedule?month=2026-11');await settleBusinessUI(page);
 await page.locator('[data-post-lookup-open]').first().click();await page.locator('[data-post-lookup] input[name=q]').fill('面试课成功案例 3');await page.locator('[data-post-lookup] form').evaluate((f:HTMLFormElement)=>f.requestSubmit());
 await page.locator('[data-post-id="'+carry.schedule.id+'"]').click();await page.locator('[data-lookup-detail] [data-schedule-history-group]').first().waitFor();
 for(const width of [1920,1440,1024]){await page.setViewportSize({width,height:1000});for(const key of ['execution','schedule','content'])await page.locator(`[data-lookup-detail] [data-schedule-history-group=${key}]`).evaluate((d:HTMLDetailsElement)=>d.open=true);await page.locator('[data-lookup-detail] [data-schedule-history-group=execution]>summary').evaluate((node:HTMLElement)=>node.scrollIntoView({block:'start'}));await shot(`lookup-history-${width}`);}
 await page.locator('[data-lookup-close]').click();
 await open(page,1440);const summary=page.locator('[data-schedule-history-group=execution]>summary');await summary.focus();await page.keyboard.press('Enter');assert(await summary.evaluate((s:any)=>s.parentElement.open));await page.keyboard.press('Enter');assert.equal(await summary.evaluate((s:any)=>s.parentElement.open),false);
 await page.locator('[data-inspector-edit]').click();await page.locator('#contentName').fill('面试课成功案例 3 · 保存回显');await page.locator('#scheduleChangeReason').fill('定稿后补充清晰标题');
 const saving=page.waitForResponse((r:any)=>r.url().endsWith('/api/operations-content/'+carry.schedule.id)&&r.request().method()==='PATCH');await page.locator('#schedule-form [type=submit]').click();await respondToBusinessConfirm(page,true).catch(()=>{});assert.equal((await saving).status(),200);
 await page.locator('#schedule-panel[data-view=detail]').waitFor();await page.getByRole('heading',{name:'面试课成功案例 3 · 保存回显',exact:true}).waitFor();await page.locator('[data-schedule-history-group=content]>summary').click();await page.locator('[data-schedule-history-group=content]').scrollIntoViewIfNeeded();await shot('saved-content-1440');
 await page.locator('[data-inspector-edit]').click();await page.locator('#contentName').fill('不丢失的未保存标题');await page.locator('#schedule-form [data-close]').filter({hasText:'取消'}).click();await respondToBusinessConfirm(page,false);assert.equal(await page.locator('#contentName').inputValue(),'不丢失的未保存标题');await page.locator('#schedule-form [data-close]').filter({hasText:'取消'}).click();await respondToBusinessConfirm(page,true);
 mark('查帖三档、键盘折叠、定稿后带理由真实保存及未保存保护');
 await page.setViewportSize({width:390,height:844});await page.goto(baseURL+'/business/operations-schedule?month=2026-11&row='+carry.schedule.id);await settleBusinessUI(page);assert(await page.locator('[data-close-inspector]').isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await shot('detail-mobile-390');await page.locator('[data-close-inspector]').click();
 await page.setViewportSize({width:1440,height:1000});await page.goto(baseURL+'/business/meeting-review?meeting='+prepared.meetingId+'&version='+sealed.versionNumber,{waitUntil:'domcontentloaded',timeout:60000});await settleBusinessUI(page);await shot('sealed-meeting-1440');
 // 新生成PDF使用冻结事实；归档过的PDF不会被此隔离样本改写。
 const pdf=await api('/api/meeting-versions/'+sealed.id+'/pdf',{},'POST');const response=await fetch(baseURL+'/api/meeting-attachments/'+pdf.id,{headers:{Cookie:boss}});assert.equal(response.status,200);await writeFile(dir+'/pdf/monthly-sealed.pdf',Buffer.from(await response.arrayBuffer()));
 mark('有限390无页面溢出、关闭可达；冻结月会真实PDF生成');
 const paint=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:dir+'/video',size:{width:1440,height:1000}}});
 await login(paint,admin);await paint.route('**/fonts/**',async(r:any)=>{await new Promise(resolve=>setTimeout(resolve,1200));await r.continue();});
 await paint.route('**/api/operations-content/*/workflow',async(r:any)=>{await new Promise(resolve=>setTimeout(resolve,900));await r.continue();});
 const firstPaint=await paint.newPage();firstPaint.on('pageerror',(e:any)=>errors.push(e.message));
 await firstPaint.goto(baseURL+'/business/operations-schedule?month=2026-11&row='+carry.schedule.id,{waitUntil:'domcontentloaded'});await firstPaint.locator('[data-schedule-history-group]').first().waitFor();await shot('first-paint-slow-1440',firstPaint);
 await paint.unrouteAll({behavior:'wait'});const devtools=await paint.newCDPSession(firstPaint);
 const hard=firstPaint.waitForEvent('load');await devtools.send('Page.reload',{ignoreCache:true});await hard;await firstPaint.locator('[data-schedule-history-group]').first().waitFor();await shot('first-paint-hard-refresh-1440',firstPaint);
 await firstPaint.reload();await firstPaint.locator('[data-schedule-history-group]').first().waitFor();await shot('first-paint-warm-refresh-1440',firstPaint);
 await firstPaint.locator('[data-close-inspector]').click();await firstPaint.getByRole('link',{name:'月度运营',exact:true}).click();await settleBusinessUI(firstPaint);await firstPaint.getByRole('link',{name:'排期管理',exact:true}).click();await settleBusinessUI(firstPaint);await firstPaint.locator('[data-inspect-id="'+carry.schedule.id+'"]').first().click();await firstPaint.locator('[data-schedule-history-group]').first().waitFor();await shot('first-paint-internal-navigation-1440',firstPaint);
 await paint.close();await copyFile(await firstPaint.video().path(),dir+'/video/first-paint-1440.webm');mark('1440首屏：慢字体与慢历史、硬刷新、暖刷新和实际站内导航，从首次绘制录制');
 assert.deepEqual(errors,[]);await context.close();context=null;await copyFile(await page.video().path(),dir+'/video/workflow-1440.webm');
 await writeFile(dir+'/result.json',JSON.stringify({checks,images,errors,data:'本机独立临时PostgreSQL，22篇排期；两帖重复旧名额仅注入该隔离库',status:'passed'},null,2));
}catch(error){console.error(f.logs().slice(-5000));throw error;}finally{await context?.close();await staff?.close();await browser?.close();await f.stop();}
