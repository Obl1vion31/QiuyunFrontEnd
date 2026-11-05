import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {prepareMonthlyArrangement} from './monthly-arrangement.fixture';
import {seedLinkPost} from './monthly-plan-links.fixture';
import {admin,employee} from './auth.fixture';
import {respondToBusinessConfirm,settleBusinessUI} from './business-confirm.helper';
import * as s from '../src/db/schema';
const dir='.tools/test-artifacts/scheduling-review/browser';await mkdir(dir+'/screenshots',{recursive:true});
const clockFile=new URL('../'+dir+'/clock.txt',import.meta.url).pathname;await writeFile(clockFile,'2026-11-05T12:00:00+08:00');
const f=await startPostgresFixture({clockFile}),{db,baseURL}=f;let browser:any,staffContext:any,bossContext:any,page:any;const errors:string[]=[],checks:string[]=[],images:string[]=[];
async function shot(name:string,target=page){await settleBusinessUI(target);await target.mouse.move(0,0);await target.screenshot({path:dir+'/screenshots/'+name+'.png'});images.push(name+'.png');assert(await target.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' 页面溢出');}
async function login(context:any,actor:any){const r=await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:actor});assert.equal(r.status(),200);return (await context.cookies()).map((c:any)=>c.name+'='+c.value).join('; ');}
try{
 const pw=await import(process.env.PLAYWRIGHT_MODULE!);browser=await pw.chromium.launch({headless:true,args:['--no-sandbox']});
 staffContext=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:dir+'/video',size:{width:1440,height:1000}}});bossContext=await browser.newContext({viewport:{width:1440,height:1000}});
 await login(staffContext,employee);const bossCookie=await login(bossContext,admin);page=await staffContext.newPage();const boss=await bossContext.newPage();for(const p of [page,boss])p.on('pageerror',(e:any)=>errors.push(e.message));
 await page.goto(baseURL+'/business/operations-schedule?month=2026-12');await shot('closed-1440');assert(await page.locator('[data-open-new]').isDisabled());
 const setup=await prepareMonthlyArrangement(db,baseURL,bossCookie);
 await page.goto(baseURL+'/business/operations-schedule?month=2026-11');
 await page.locator('[data-calendar-new="2026-11-10"]').click();await page.locator('#schedule-form').waitFor({state:'visible'});
 await page.locator('#schedule-form [name=contentName]').fill('TMUA 讲义：函数与逻辑推理');
 await page.locator('#schedule-form [name=subjectId]').selectOption('tmua');await page.locator('#schedule-form [name=categoryId]').selectOption('promotional-handout');await page.locator('#schedule-form [name=operationType]').selectOption('non_promotion_standard');
 const newResponse=page.waitForResponse((r:any)=>r.url().endsWith('/api/operations-content')&&r.request().method()==='POST');await page.locator('#schedule-form button[type=submit]').click();const created=await newResponse;assert.equal(created.status(),201);const [first]=await db.select({id:s.operationsContentSchedule.id}).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentVersion.id,s.operationsContentSchedule.contentVersionId)).where(eq(s.operationsContentVersion.contentName,'TMUA 讲义：函数与逻辑推理'));await page.waitForLoadState('networkidle');
 const second=await seedLinkPost(db,'TMUA 讲义：数列与综合练习','2026-11-18T15:30');
 await page.reload();await page.locator('.calendar-item[data-inspect-id="'+first.id+'"]').dragTo(page.locator('[data-calendar-day="2026-11-12"]'));await page.locator('#schedule-form').waitFor({state:'visible'});
 assert.equal(await page.locator('#schedule-form [name=plannedPublishDate]').inputValue(),'2026-11-12');await page.locator('#schedule-form [name=planChangeReason]').fill('首次排期核对前调整到周四');
 const moved=page.waitForResponse((r:any)=>r.url().endsWith('/api/operations-content/'+first.id)&&r.request().method()==='PATCH');await page.locator('#schedule-form button[type=submit]').click();assert.equal((await moved).status(),200);await page.waitForLoadState('networkidle');
 checks.push('真实新建表单保存成功；原日历拖动打开原帖编辑，不复制帖子');
 for(const width of [1920,1440,1024,390,320]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));await shot('arranging-'+width);}
 await page.setViewportSize({width:1440,height:1000});await page.locator('[data-arrangement-form] [name=reason]').fill('两篇已排好，其中第一篇调整到周四，请管理员核对。');
 const path='**/api/monthly-plans/'+setup.planId+'/arrangement';
 await page.route(path,(route:any)=>route.request().method()==='POST'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'隔离网络失败，输入保留'})}):route.continue());
 await page.locator('[data-arrangement-form] button[value=submit]').click();await respondToBusinessConfirm(page,true);await page.getByText('隔离网络失败，输入保留',{exact:true}).waitFor();assert((await page.locator('[data-arrangement-form] [name=reason]').inputValue()).includes('第一篇'));await shot('submit-failure-1440');await page.unroute(path);
 await page.locator('[data-arrangement-form] button[value=submit]').click();await respondToBusinessConfirm(page,true);await page.locator('[data-arrangement-stage=review_pending]').waitFor();assert(await page.locator('[data-open-new]').isDisabled());
 await shot('review-employee-1440');await page.locator('.calendar-item[data-inspect-id="'+first.id+'"]').click();await page.locator('[data-inspector].is-open').waitFor();assert(await page.locator('[data-inspector-edit]').isDisabled());
 await page.locator('[data-inspector-publication]').click();await page.locator('#publication-form').waitFor({state:'visible'});await page.locator('#publication-form [name=actualPublishDate]').fill('2026-11-05');await page.locator('#publication-form [name=actualPublishTime]').fill('11:00');await page.locator('#publicationUrl').fill('https://www.xiaohongshu.com/explore/0123456789abcdef01234567');await page.locator('#publicationProjectDocUrl').fill('https://example.test/doc');
 const published=page.waitForResponse((r:any)=>r.url().endsWith('/publication')&&r.request().method()==='PATCH');await page.locator('#publication-form button[type=submit]').click();assert.equal((await published).status(),200);await page.waitForLoadState('networkidle');await shot('review-publication-saved-1440');
 checks.push('提交失败保留输入；成功提交后员工所有排期控件禁用，但真实实发仍可登记');
 await staffContext.request.patch(baseURL+'/api/monthly-private-data',{headers:{Origin:baseURL},data:{month:'2026-10',expectedRevision:-1,data:{total:{added:25,consulted:12,converted:2},rows:[],note:'隔离补录数据'}}});await boss.goto(baseURL+'/business/meeting-review?meeting='+setup.meetingId);await boss.locator('.monthly-private-results .monthly-private-value > span').first().waitFor();assert.equal((await boss.locator('.monthly-private-results .monthly-private-value > span').first().textContent())?.replace(/\s/g,''),'25人');await shot('monthly-live-before-seal-1440',boss);

 const [workingMeeting]=await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,setup.meetingId));
 const workingVersions=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId,setup.meetingId));
 const sourceVersion=workingVersions.filter(v=>v.lifecycleStatus==='finalized'&&!v.invalidatedAt).sort((a,b)=>b.versionNumber-a.versionNumber)[0];
 const {discussionFromDraft}=await import('../src/db/meeting-discussion-values');const discussion=discussionFromDraft(workingMeeting.draftSnapshot);discussion.coreConclusion='管理员核对时保留的最新文字草稿';
 const revision=await bossContext.request.patch(baseURL+'/api/meeting-reviews/'+setup.meetingId,{headers:{Origin:baseURL},data:{action:'save_version_draft',sourceVersionId:sourceVersion.id,discussion,expectedUpdatedAt:'old-stamp'}});assert.equal(revision.status(),200);
 await staffContext.request.patch(baseURL+'/api/monthly-private-data',{headers:{Origin:baseURL},data:{month:'2026-10',expectedRevision:-1,data:{total:{added:26,consulted:12,converted:2},rows:[],note:'活动草稿期间补录'}}});
 await boss.goto(baseURL+'/business/meeting-review?meeting='+setup.meetingId);assert.equal((await boss.locator('.monthly-private-results .monthly-private-value > span').first().textContent())?.replace(/\s/g,''),'26人');
 await boss.goto(baseURL+'/business/operations-schedule?month=2026-11');await boss.locator('[data-arrangement-form] [name=reason]').fill('已核对两篇安排及实发记录，可以封存。');for(const width of [1920,1440,1024]){await boss.setViewportSize({width,height:1000});await shot('review-admin-'+width,boss);}await boss.setViewportSize({width:1440,height:1000});
 await boss.locator('button[value=confirm]').click();await respondToBusinessConfirm(boss,false);assert((await boss.locator('[name=reason]').inputValue()).includes('封存'));
 const sealed=boss.waitForResponse((r:any)=>r.url().endsWith('/arrangement')&&r.request().method()==='POST');await boss.locator('button[value=confirm]').click();await respondToBusinessConfirm(boss,true);assert.equal((await sealed).status(),200);await boss.locator('[data-arrangement-stage=confirmed]').waitFor();await shot('sealed-calendar-1440',boss);
 await page.reload();assert(await page.locator('[data-open-new]').isEnabled());await page.locator('.calendar-item[data-inspect-id="'+first.id+'"]').click();await page.locator('[data-inspector].is-open').waitFor();assert(await page.locator('[data-inspector-edit]').isEnabled());
 await boss.goto(baseURL+'/business/meeting-review?meeting='+setup.meetingId);for(const width of [1920,1440,1024,390,320]){await boss.setViewportSize({width,height:1000});await shot('sealed-monthly-'+width,boss);}await boss.setViewportSize({width:1440,height:1000});assert.equal(await boss.locator('[data-meeting-mode] input[value=edit]:not(:disabled)').count(),0);

 const [sealedPlan]=await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.id,setup.planId));
 const [sealedVersion]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,sealedPlan.sealedVersionId!));
 await writeFile(dir+'/sealed-snapshot.json',JSON.stringify(sealedVersion.snapshot));
 const [attachment]=await db.select().from(s.operationsMeetingAttachment).where(eq(s.operationsMeetingAttachment.meetingVersionId,sealedVersion.id));
 assert(attachment,'封存后PDF自动生成');const pdf=await bossContext.request.get(baseURL+'/api/meeting-attachments/'+attachment.id);assert.equal(pdf.status(),200);await writeFile(dir+'/sealed-monthly.pdf',await pdf.body());
 await staffContext.request.patch(baseURL+'/api/monthly-private-data',{headers:{Origin:baseURL},data:{month:'2026-10',expectedRevision:-1,data:{total:{added:30,consulted:12,converted:2},rows:[],note:'封存后独立补录'}}});
 await boss.reload();assert.equal((await boss.locator('.monthly-private-results .monthly-private-value > span').first().textContent())?.replace(/\s/g,''),'26人');
 assert.equal((sealedVersion.snapshot as any).draft.coreConclusion,'管理员核对时保留的最新文字草稿');assert(await boss.getByText('管理员核对时保留的最新文字草稿',{exact:true}).isVisible());
 checks.push('管理员取消封存确认不丢意见；通过后月会永久只读，员工排期页恢复正常操作');
 const p=await seedLinkPost(db,'历史真实表单保存','2026-10-27T10:00');await db.update(s.operationsContentSchedule).set({isPromoted:true,promotionStatus:'testing',actualPublishAt:new Date('2026-10-27T02:00Z')}).where(eq(s.operationsContentSchedule.id,p.schedule.id));
 const [campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:p.schedule.id,startedOn:'2026-10-27',initialStage:'testing',currentStage:'testing',currentStatus:'testing'}).returning();
 const [metric]=await db.insert(s.operationsPromotionDailyMetric).values({campaignId:campaign.id,metricDate:'2026-10-27',dailyStatus:'active',stageTypeSnapshot:'testing',actualStatusSnapshot:'testing',recordKind:'regular',sourceStageStartedOn:'2026-10-27',reviewDecision:'test_continue',spend:'20',platformOpenCount:1,actualOpenCount:1,platformLeadCount:1,actualLeadCount:1}).returning();
 await page.goto(baseURL+'/business/daily-promotion-review?view=history&campaign='+metric.id);await page.locator('[data-inspector].is-open').waitFor();await page.locator('[data-edit-trigger="'+metric.id+'"]').click();const history=page.locator('form[data-history-edit-form]');await history.waitFor({state:'visible'});assert((await history.locator('[name=expectedUpdatedAt]').inputValue()).length>10);await history.locator('[name=spend]').fill('38');await shot('history-edit-1440');
 const saveHistory=page.waitForResponse((r:any)=>r.url().endsWith('/api/promotion-daily/'+metric.id)&&r.request().method()==='PATCH');await history.locator('button[type=submit]').click();assert.equal((await saveHistory).status(),200);await page.waitForLoadState('networkidle');assert.equal((await db.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.id,metric.id)))[0].spend,'38.00');
 checks.push('员工从真实历史页打开原表单，更新时间确实存在，修改指标实际保存成功');
 await db.insert(s.operationsPromotionDailyMetric).values(['2026-10-28','2026-10-29'].map(metricDate=>({campaignId:campaign.id,metricDate,dailyStatus:'active',stageTypeSnapshot:'testing',actualStatusSnapshot:'testing',recordKind:'regular',sourceStageStartedOn:'2026-10-27',reviewDecision:'test_continue',spend:'20',platformOpenCount:1,actualOpenCount:1,platformLeadCount:1,actualLeadCount:1})));
 await boss.goto(baseURL+'/business/daily-promotion-review?view=history&campaign='+metric.id);await boss.locator('[data-inspector].is-open').waitFor();
 await boss.locator('[data-history-status-edit] summary').click();const status=boss.locator('[data-history-status-edit] form');
 await status.locator('[name=targetStatus]').selectOption('test_discarded');await status.locator('[name=reason]').fill('管理员确认从当日淘汰，后续不再继续测试');
 await status.locator('button[type=submit]').click();await boss.locator('[data-business-confirm][open]').waitFor();await shot('history-impact-preview-1440',boss);await respondToBusinessConfirm(boss,false);
 assert.equal(await status.locator('[name=targetStatus]').inputValue(),'test_discarded');assert((await status.locator('[name=reason]').inputValue()).includes('管理员'));
 const corrected=boss.waitForResponse((r:any)=>r.url().endsWith('/api/promotion-timeline')&&r.request().method()==='POST'&&r.status()===200);await status.locator('button[type=submit]').click();await respondToBusinessConfirm(boss,true);await corrected;
 assert.equal((await db.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.campaignId,campaign.id))).length,1);
 checks.push('管理员真实历史更正展示后续影响；取消保留状态与原因，确认后实际归档不兼容指标');

 assert.deepEqual(errors,[]);await staffContext.close();staffContext=null;await writeFile(dir+'/browser.json',JSON.stringify({passed:true,checks,images,errors},null,2));console.log(checks.join('\n'));
}catch(error){console.error(f.logs().slice(-4000));if(page)await page.screenshot({path:dir+'/failure.png',fullPage:true}).catch(()=>{});throw error;}finally{await staffContext?.close();await bossContext?.close();await browser?.close();await f.stop();}
