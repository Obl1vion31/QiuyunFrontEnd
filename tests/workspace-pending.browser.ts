import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {admin,employee} from './auth.fixture';
import {seedLinkPost} from './monthly-plan-links.fixture';
import {settleBusinessUI} from './business-confirm.helper';
import * as s from '../src/db/schema';

const dir=process.env.WORKSPACE_PENDING_DIR??'.tools/test-artifacts/workspace-pending';
await mkdir(dir,{recursive:true});
const clock=process.cwd()+'/'+dir+'/clock.txt';
await writeFile(clock,'2026-11-18T12:00:00+08:00');
const f=await startPostgresFixture({clockFile:clock,entry:process.env.WORKSPACE_PENDING_ENTRY});
const {db,baseURL}=f;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);
const errors:string[]=[];
let browser:any;
try {
 const origin={Origin:baseURL},notice='/api/business-notifications',sidebar=notice+'?view=sidebar';
 const schedule='/business/operations-schedule?display=ledger&status=approvals';
 const non='/business/non-promotion-review';
 const counts=(key:string)=>`[data-schedule-count="${key}"]`;
 const [owner]=await db.select().from(s.authUser).where(eq(s.authUser.username,employee.username));
 const legacy=await seedLinkPost(db,'旧版改期申请样本','2026-11-17T10:00');
 const past=await seedLinkPost(db,'排期申请待审样本','2026-11-17T11:00');
 const [legacyRequest]=await db.insert(s.operationsScheduleChangeRequest).values({
  scheduleId:legacy.schedule.id,planRevision:0,originalPlannedPublishAt:legacy.schedule.plannedPublishAt,
  requestedPublishAt:new Date('2026-11-20T12:00:00+08:00'),reason:'旧版隔离验收原因',requestedById:owner.id,requestedByLabel:owner.username,
 }).returning();
 const [modern]=await db.insert(s.operationsChangeProposal).values({
  target:'schedule:'+past.schedule.id,module:'schedule',requestedById:owner.id,requestedByLabel:owner.username,
  operations:['schedule.overdueReschedule'],path:'/api/operations-content/'+past.schedule.id,method:'PATCH',
  contentType:'application/json',fingerprint:'workspace-pending-fixture',requestKey:randomUUID(),body:JSON.stringify({plannedPublishAt:'2026-11-20T12:00',planChangeReason:'隔离验收申请原因'}),before:{},after:{},
 }).returning();

 async function nonPost(name:string,mode:'standard'|'instant'|'continuous',dates:string[]) {
  const post=await seedLinkPost(db,name,'2026-11-08T10:00',{categoryId:'innovation'});
  await db.update(s.operationsContent).set({platformNoteId:post.content.id.replaceAll('-','').slice(0,24)}).where(eq(s.operationsContent.id,post.content.id));
  await db.update(s.operationsContentSchedule).set({actualPublishAt:post.schedule.plannedPublishAt,completionStatus:'on_time'}).where(eq(s.operationsContentSchedule.id,post.schedule.id));
  await db.insert(s.operationsNonPromotionReviewPlan).values({contentId:post.content.id,anchorScheduleId:post.schedule.id,mode,day7:mode==='standard',day15:mode==='standard'});
  const nodes=dates.length?await db.insert(s.operationsNonPromotionCustomCheckpoint).values(dates.map(dueOn=>({contentId:post.content.id,scheduleId:post.schedule.id,dueOn}))).returning():[];
  return {key:post.schedule.id+':'+(nodes[0]?'custom:'+nodes[0].id:'day_7'),id:post.schedule.id};
 }
 const standard=await nonPost('常规复盘样本','standard',[]);
 const instant=await nonPost('即时复盘样本','instant',['2026-11-14']);
 const continuous=await nonPost('持续复盘样本','continuous',['2026-11-12','2026-11-16','2026-11-22']);
 await nonPost('持续复盘待安排样本','continuous',[]);
 const promoted=await seedLinkPost(db,'有待补推广数据的样本','2026-11-16T10:00',{categoryId:'promotional-handout'});
 await db.update(s.operationsContent).set({operationType:'promotion_only',platformNoteId:'a'.repeat(24)}).where(eq(s.operationsContent.id,promoted.content.id));
 await db.update(s.operationsContentSchedule).set({actualPublishAt:promoted.schedule.plannedPublishAt,isPromoted:true,promotionStatus:'scaling',completionStatus:'on_time'}).where(eq(s.operationsContentSchedule.id,promoted.schedule.id));
 const [campaign]=await db.insert(s.operationsPromotionCampaign).values({
  scheduleId:promoted.schedule.id,startedOn:'2026-11-16',dailyReviewEnabledOn:'2026-11-16',initialStage:'scaling',currentStage:'scaling',currentStatus:'scaling',
 }).returning();
 await db.insert(s.operationsPromotionStage).values({campaignId:campaign.id,stageType:'scaling',startedOn:'2026-11-16'});
 await db.insert(s.operationsPromotionDailyMetric).values({
  campaignId:campaign.id,metricDate:'2026-11-16',dailyStatus:'active',actualStatusSnapshot:'scaling',stageTypeSnapshot:'scaling',
  sourceStageStartedOn:'2026-11-16',spend:'125.00',platformOpenCount:4,actualOpenCount:3,platformLeadCount:2,actualLeadCount:1,reviewDecision:'scaling_continue',
 });

 browser=await chromium.launch({headless:true});
 async function connect(actor:{username:string;password:string}) {
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});
  await context.addInitScript('window.__name = value => value;');
  assert.equal((await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:origin,data:actor})).status(),200);
  const p=await context.newPage();
  p.on('pageerror',(error:Error)=>errors.push(error.message));
  return {context,p};
 }
 async function capture(p:any,name:string) {
  await settleBusinessUI(p);
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await p.screenshot({path:dir+'/'+name+'.png'});
 }
 async function awaitCount(p:any,key:string,value:string) {
  await p.waitForFunction(({selector,value}:any)=>document.querySelector(selector)?.textContent?.trim()===value,{selector:counts(key),value});
 }
 const a=await connect(employee),b=await connect({username:'test_other',password:'fictional-other-password'}),leader=await connect(admin);
 const {p}=a,manager=leader.p;
 for(const [actor,count]of [[a,2],[b,0],[leader,2]] as const){
  await actor.p.goto(baseURL+schedule);
  assert.equal(await actor.p.locator('[data-approval-nav-count]').innerText(),String(count));
  assert.equal(await actor.p.locator('[data-approval-item]').count(),count);
  const workflow=await (await actor.context.request.get(baseURL+'/api/operations-content/'+legacy.schedule.id+'/workflow')).json();
  assert.equal(workflow.applications.length,count?1:0);
  const current=await (await actor.context.request.get(baseURL+'/api/operations-content/'+past.schedule.id+'/workflow')).json();
  assert.equal(current.changeProposals.length,count?1:0);
  const old=await (await actor.context.request.get(baseURL+notice)).json();
  assert.equal(old.pendingApprovals,count);
  assert.equal(old.approvalScheduleIds.length,count);
 }
 await b.p.goto(baseURL+schedule+'&request='+encodeURIComponent('legacy:'+legacyRequest.id));
 assert.equal(await b.p.locator('[data-approval-item]').count(),0);
 assert(!(await b.p.content()).includes('旧版隔离验收原因'));
 const notices=await (await a.context.request.get(baseURL+sidebar)).json();
 assert.deepEqual(notices,{promotionPending:1,overdue:2,nonPromotionDue:3});
 assert.deepEqual(await (await leader.context.request.get(baseURL+sidebar)).json(),{pendingApprovals:2});
 await awaitCount(manager,'pendingApprovals','2');
 assert.deepEqual(await manager.locator('[data-schedule-count]').count(),1);
 await capture(manager,'admin-approvals-1440');
 assert(await manager.locator('.schedule-approval-list').evaluate((node:HTMLElement)=>node.scrollWidth<=node.clientWidth+1));
 await b.p.goto(baseURL+schedule);
 await capture(b.p,'employee-own-empty-1440');
 await manager.locator(`[data-approval-item="proposal:${modern.id}"]`).click();
 const approval=manager.locator('[data-schedule-approval-inspector] [data-schedule-approval]');
 await approval.locator('textarea').fill('隔离验收：已核对');
 await approval.getByRole('button',{name:'驳回'}).click();
 await awaitCount(manager,'pendingApprovals','1');
 assert.equal(await manager.locator('[data-approval-nav-count]').innerText(),'1');
 await a.p.goto(baseURL+schedule);
 assert.equal(await a.p.locator('[data-approval-item]').count(),1);

 await p.goto(baseURL+non+'?view=pending&mode=instant&row='+encodeURIComponent(continuous.key));
 await p.locator('[data-inspector-title]:visible').waitFor();
 assert.equal(await p.locator('[data-inspector-title]:visible').innerText(),'持续复盘样本');
 await p.keyboard.press('Escape');
 await p.locator('[data-inspector-title]:visible').waitFor({state:'hidden'});
 assert.equal(await p.locator('select[name=mode]').count(),0);
 assert.deepEqual(await p.locator('[data-review-body] [data-due]').evaluateAll((rows:HTMLElement[])=>rows.map(row=>row.dataset.due)),['2026-11-12','2026-11-14','2026-11-15','2026-11-16']);
 assert.equal(await p.locator('.review-summary strong').first().innerText(),'3 篇 · 4 项');
 assert.equal(await p.locator('[data-upcoming-reviews]').count(),1);
 await awaitCount(p,'nonPromotionDue','3');
 await capture(p,'employee-pending-1440');
 await p.setViewportSize({width:1024,height:900});
 await capture(p,'employee-pending-1024');
 assert(await p.locator('[data-review-body] [data-due]').first().evaluate((node:HTMLElement)=>node.getBoundingClientRect().height<105));
 await p.setViewportSize({width:390,height:844});
 await p.locator(`[data-inspector-key="${instant.key}"] [data-collaboration-action]`).click();
 await p.locator('[data-inspector-title]:visible').waitFor();
 await capture(p,'employee-review-390');
 await p.keyboard.press('Escape');
 await p.locator('[data-inspector-title]:visible').waitFor({state:'hidden'});
 await p.setViewportSize({width:1440,height:1000});

 await p.locator(`[data-inspector-key="${instant.key}"] [data-collaboration-action]`).click();
 let form=p.locator('[data-review-form]:visible');
 for(const [name,value]of [['exposureCount','1000'],['readCount','180'],['threeSecondReadRate','65']])
  await form.locator(`[name="${name}"]`).fill(value);
 await form.getByRole('button',{name:/完成/}).click();
 await p.waitForURL('**view=history**');
 await p.getByRole('link',{name:'待复盘',exact:true}).click();
 await p.locator(`[data-inspector-key="${instant.key}"]`).waitFor({state:'detached'});
 await awaitCount(p,'nonPromotionDue','2');

 await p.locator(`[data-inspector-key="${standard.key}"] [data-collaboration-action]`).click();
 await p.getByText('这次不复盘',{exact:true}).click();
 form=p.locator('[data-checkpoint-form]:visible');
 await form.locator('select').selectOption('schedule');
 await form.locator('textarea').fill('隔离验收：现在无法取得数据');
 await form.getByRole('button',{name:'确认此节点不复盘'}).click();
 await p.waitForURL('**view=skipped**');
 await awaitCount(p,'nonPromotionDue','1');
 await p.locator(`[data-inspector-key="${standard.key}"] [data-collaboration-action]`).click();
 form=p.locator('[data-checkpoint-form]:visible');
 await form.locator('select').selectOption('schedule');
 await form.locator('textarea').fill('隔离验收：数据已恢复');
 await form.getByRole('button',{name:'恢复为待复盘'}).click();
 await awaitCount(p,'nonPromotionDue','2');

 await p.getByRole('link',{name:'已复盘',exact:true}).click();
 await p.locator('select[name=mode]').selectOption('instant');
 await p.waitForURL('**/business/non-promotion-review?**mode=instant**');
 await p.locator(`[data-inspector-key="${instant.key}"]`).waitFor({state:'visible'});
 await capture(p,'employee-history-1440');
 await p.locator('a:has('+counts('promotionPending')+')').click();
 await p.waitForURL('**#daily-table');
 await p.locator('[data-promotion-pending-count]').waitFor();
 assert.equal(await p.locator('[data-promotion-pending-count]').innerText(),'1 项待填写');
 await awaitCount(p,'promotionPending','1');
 await capture(p,'employee-promotion-link-1440');

 await p.goto(baseURL+'/business/monthly-operations?month=2026-11');
 const gap=p.getByRole('button',{name:'待补 1 条日度数据'});
 await gap.waitFor();
 assert.equal(await gap.count(),1);
 await capture(p,'monthly-gaps-1440');
 await gap.click();
 await p.getByRole('button',{name:'待补数据',exact:true}).waitFor();
 assert.equal(await p.getByRole('button',{name:'待补数据',exact:true}).getAttribute('aria-pressed'),'true');
 await Promise.all([p.waitForResponse((res:any)=>res.url().includes('/api/monthly-operations?')&&res.url().includes('subject=step')),p.locator('select[name=subject]').selectOption('step')]);
 await gap.waitFor({state:'hidden'});
 await p.getByRole('button',{name:'查看推广消耗明细 —'}).waitFor();

 await p.route('**/api/business-notifications?view=sidebar',async(route:any)=>route.fulfill({status:503,body:'测试读取失败'}));
 await p.reload({waitUntil:'domcontentloaded'});
 await p.locator('[data-schedule-notification-error]').waitFor();
 assert.equal(await p.locator(counts('promotionPending')).innerText(),'—');
 const y=await p.locator('.business-sidebar__nav').evaluate((node:HTMLElement)=>node.getBoundingClientRect().top);
 await capture(p,'employee-reminders-unavailable-1440');
 await p.unroute('**/api/business-notifications?view=sidebar');
 await p.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await awaitCount(p,'promotionPending','1');
 assert.equal(await p.locator('.business-sidebar__nav').evaluate((node:HTMLElement)=>node.getBoundingClientRect().top),y);
 await p.goto(baseURL+'/business/daily-promotion-review?view=daily#daily-table');
 const metric=p.locator('[data-metric-form]').first();
 for(const [name,value]of [['spend','75'],['platformOpenCount','2'],['actualOpenCount','1'],['platformLeadCount','1'],['actualLeadCount','1']])
  await metric.locator(`[name="${name}"]`).fill(value);
 await metric.locator('[name=reviewDecision]').selectOption('scaling_continue');
 assert(await metric.evaluate((form:HTMLFormElement)=>form.checkValidity()));
 const saved=p.waitForResponse((res:any)=>res.url().endsWith('/api/promotion-daily')&&res.request().method()==='POST');
 await metric.getByRole('button',{name:'完成复盘',exact:true}).click();
 const response=await saved;
 assert.equal(response.status(),201,await response.text());
 await awaitCount(p,'promotionPending','0');
 await p.goto(baseURL+'/business/monthly-operations?month=2026-11');
 assert.equal(await gap.count(),0);
 await capture(p,'monthly-complete-1440');
 assert.deepEqual(errors,[]);
 console.log('三账号新旧申请、合并待办与真实录入／跳过／恢复、角色提醒、缺项明细、失败恢复通过');
}finally{
 await browser?.close();
 await f.stop();
}
