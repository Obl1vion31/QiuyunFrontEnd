import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {admin,employee} from './auth.fixture';
import {seedLinkPost} from './monthly-plan-links.fixture';
import {syncContinuousCheckpoints} from '../src/db/continuous-schedule';
import {lockPromotionWorkflow} from '../src/db/promotion-pauses';
import {settleBusinessUI} from './business-confirm.helper';
import * as s from '../src/db/schema';
const dir=process.env.CONTINUATION_DIR??'.tools/test-artifacts/promotion-continuation';await mkdir(dir+'/video',{recursive:true});const clockFile=process.cwd()+'/'+dir+'/clock.txt';
const before=process.env.CONTINUATION_BEFORE==='1',checks:string[]=[],errors:string[]=[];
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!),browser=await chromium.launch({headless:true});
try{
 for(const[role,actor]of (before?[['employee',employee]]:[['admin',admin],['employee',employee]]) as Array<[string,typeof admin]>){
  await writeFile(clockFile,'2026-11-20T12:00:00+08:00');const f=await startPostgresFixture({clockFile,entry:process.env.CONTINUATION_ENTRY}),{db,baseURL}=f;
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:!before&&role==='employee'?{dir:dir+'/video',size:{width:1440,height:1000}}:undefined});
  try{
   async function seed(name:string,type:'promotion_only'|'promotion_then_continuous'='promotion_then_continuous',status='ended',final:string|null='2026-11-30'){
    const post=await seedLinkPost(db,name,'2026-10-31T10:00',{subjectId:'tmua',categoryId:'promotional-handout'}),noteId=randomUUID().replaceAll('-','').slice(0,24);
    await db.update(s.operationsContent).set({operationType:type,platformNoteId:noteId}).where(eq(s.operationsContent.id,post.content.id));await db.update(s.operationsContentSchedule).set({actualPublishAt:new Date('2026-10-31T02:00Z'),isPromoted:true,promotionStatus:status,finalReviewOn:final,publicationUrl:'https://www.xiaohongshu.com/explore/'+noteId,completionStatus:'on_time'}).where(eq(s.operationsContentSchedule.id,post.schedule.id));
    const[campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:post.schedule.id,startedOn:'2026-11-01',dailyReviewEnabledOn:'2026-11-01',initialStage:'testing',currentStage:null,currentStatus:status,endedOn:'2026-11-10'}).returning();
    const scaling=status!=='test_discarded';await db.insert(s.operationsPromotionStage).values(scaling?[{campaignId:campaign.id,stageType:'testing',startedOn:'2026-11-01',endedOn:'2026-11-03',outcome:'start_scaling'},{campaignId:campaign.id,stageType:'scaling',startedOn:'2026-11-04',endedOn:'2026-11-10',outcome:status}]:[{campaignId:campaign.id,stageType:'testing',startedOn:'2026-11-01',endedOn:'2026-11-10',outcome:status}]);
    for(let day=1;day<=10;day++){const stage=scaling&&day>=4?'scaling':'testing';await db.insert(s.operationsPromotionDailyMetric).values({campaignId:campaign.id,metricDate:'2026-11-'+String(day).padStart(2,'0'),dailyStatus:'active',actualStatusSnapshot:stage,stageTypeSnapshot:stage,sourceStageStartedOn:stage==='testing'?'2026-11-01':'2026-11-04',recordKind:'regular',reviewDecision:day===10?status:scaling&&day===3?'start_scaling':stage==='testing'?'test_continue':'scaling_continue',spend:'10',platformOpenCount:2,actualOpenCount:1,platformLeadCount:1,actualLeadCount:1});}
    await db.transaction(async tx=>{await lockPromotionWorkflow(tx);await syncContinuousCheckpoints(tx,post.schedule.id,'fixture',new Date('2026-11-20T12:00:00+08:00'));});return {post,campaign,noteId};
   }
   const target=await seed('TMUA 推广讲义 · 正常结束后持续复盘'),unplanned=await seed('面试课推广讲义 · 待安排日期','promotion_then_continuous','ended',null);
   const excluded=[await seed('纯推广结束','promotion_only'),await seed('测试淘汰','promotion_then_continuous','test_discarded'),await seed('放量淘汰','promotion_then_continuous','formal_discarded')];
   const afterSeed=JSON.stringify(await db.select().from(s.operationsNonPromotionCustomCheckpoint)),paid=JSON.stringify(await db.select().from(s.operationsPromotionDailyMetric));
   assert.equal((await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:actor})).status(),200);
   const page=await context.newPage();page.on('pageerror',(e:any)=>errors.push(e.message));await page.goto(baseURL+'/business/daily-promotion-review');await settleBusinessUI(page);
   const card=()=>page.locator(`[data-lifecycle-schedule="${target.post.schedule.id}"]`);
   if(before){assert.equal(await card().count(),0);await page.screenshot({path:dir+'/before-ended-post-absent-1440.png',fullPage:true});console.log('旧包复现：持续复盘已启用，推广生命周期却没有该帖');continue;}
   assert.equal(await page.locator('[data-lifecycle-schedule]').count(),2);assert.equal(await page.locator('[data-metric-form]').count(),0);assert.equal(await page.locator('[data-saved-review]').count(),0);
   for(const row of excluded)assert.equal(await page.locator(`[data-lifecycle-schedule="${row.post.schedule.id}"]`).count(),0);
   await card().waitFor();assert.deepEqual(await card().locator('.promotion-stage-node>span').allTextContents(),['开始测试','开始放量','推广结束','持续复盘']);assert.equal(await card().locator('.lifecycle-overview-totals strong').first().textContent(),'¥100.00');
   await page.locator(`[data-lifecycle-schedule="${unplanned.post.schedule.id}"] .promotion-current-state`).getByText('待安排复盘日期',{exact:true}).waitFor();
   for(const width of role==='employee'?[1920,1440,1024]:[1440]){
    await page.setViewportSize({width,height:1000});await settleBusinessUI(page);await page.screenshot({path:dir+'/'+role+'-lifecycle-'+width+'.png',fullPage:true});await card().locator('details>summary').click();await settleBusinessUI(page);assert.equal(await card().locator('[data-continuation-details] input').count(),0);assert.deepEqual(await card().locator('[data-continuation-state]').allTextContents(),['待复盘','未到期','未到期']);await page.screenshot({path:dir+'/'+role+'-expanded-'+width+'.png',fullPage:true});await card().locator('details>summary').click();await settleBusinessUI(page);
   }
   assert.equal(JSON.stringify(await db.select().from(s.operationsNonPromotionCustomCheckpoint)),afterSeed);assert.equal(JSON.stringify(await db.select().from(s.operationsPromotionDailyMetric)),paid);
   await page.setViewportSize({width:1440,height:1000});await card().locator('details>summary').click();await settleBusinessUI(page);assert.equal(await card().locator('.promotion-expanded-data>[data-continuation-details]').count(),1,'持续节点使用同一展开动画正文');
   await card().getByRole('link',{name:'前往复盘 ↗',exact:true}).click();await page.locator('[data-review-form]').waitFor();const form=page.locator('[data-review-form]');assert.equal(await form.locator('[name=expectedStatisticsFrom]').inputValue(),'2026-11-11');await form.locator('[name=exposureCount]').fill('1000');await form.locator('[name=readCount]').fill('100');await form.locator('[name=threeSecondReadRate]').fill('60');const response=page.waitForResponse((r:any)=>r.url().endsWith('/api/non-promotion-reviews')&&r.request().method()==='POST');await form.locator('[type=submit]').click();const result=await response;assert.equal(result.status(),201,await result.text());await page.waitForURL((url:URL)=>url.searchParams.get('view')==='history');
   await page.goto(baseURL+'/business/daily-promotion-review');await card().locator('details>summary').click();await settleBusinessUI(page);assert.deepEqual(await card().locator('[data-continuation-state]').allTextContents(),['已复盘','未到期','未到期']);assert.equal(await page.locator('[data-metric-form]').count(),0);await page.screenshot({path:dir+'/'+role+'-recorded-node-1440.png',fullPage:true});
   await card().getByRole('link',{name:'查看结果 ↗',exact:true}).click();await page.locator('[data-review-form]').waitFor();assert.equal(await page.locator('[name=readCount]').inputValue(),'100');checks.push(role+'：生命线接续正常结束与持续复盘，原成本保持；只读节点跳转原录入页真实保存，返回显示已复盘，下方无新增推广日度行');
   assert.equal(JSON.stringify(await db.select().from(s.operationsPromotionDailyMetric)),paid);
   await page.goto(baseURL+'/business/daily-promotion-review?view=history');assert(await page.locator(`[data-history-schedule="${target.post.schedule.id}"] .promotion-stage-node.continuous`).count());
   if(role==='employee'){
    for(const width of [390,320]){await page.setViewportSize({width,height:900});await page.goto(baseURL+'/business/daily-promotion-review');await card().locator('details>summary').click();await settleBusinessUI(page);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert(await card().getByRole('link',{name:'查看结果 ↗',exact:true}).isVisible());}
    await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:1440,height:1000});await page.goto(baseURL+'/business/daily-promotion-review');await card().locator('details>summary').click();await settleBusinessUI(page);assert(await card().locator('[data-continuation-details]').isVisible());await page.emulateMedia({reducedMotion:'no-preference'});
   }
   await writeFile(clockFile,'2026-12-01T12:00:00+08:00');
   assert.equal((await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:actor})).status(),200);
   const apiModel=await context.request.get(baseURL+'/api/non-promotion-reviews?mode=continuous');assert.equal(apiModel.status(),200);const remaining=(await apiModel.json()).tableRows.filter((row:any)=>row.row.id===target.post.schedule.id);
   for(const item of remaining){const response=await context.request.post(baseURL+'/api/non-promotion-reviews',{headers:{Origin:baseURL},multipart:{scheduleId:target.post.schedule.id,checkpointType:item.checkpoint.type,recordedThrough:item.dueOn,expectedStatisticsFrom:item.row.statisticsFrom,fingerprint:item.fingerprint,exposureCount:'1000',readCount:'120',threeSecondReadRate:'60',conclusion:'隔离后续节点'}});assert.equal(response.status(),201,await response.text());}
   await page.goto(baseURL+'/business/daily-promotion-review');await settleBusinessUI(page);assert.equal(await card().locator('.promotion-current-state strong').textContent(),'持续复盘已完成');assert.equal(await page.locator('[data-metric-form]').count(),0);
   const [revised]=await db.insert(s.operationsContentVersion).values({contentId:target.post.content.id,versionNumber:1,workType:'revision',contentName:'隔离新版',subjectId:'tmua',categoryId:'promotional-handout'}).returning();await db.insert(s.operationsContentSchedule).values({contentVersionId:revised.id,plannedPublishAt:new Date('2026-12-05T02:00Z'),actualPublishAt:new Date('2026-12-05T02:00Z'),isPromoted:true,promotionStatus:'awaiting_promotion',completionStatus:'on_time'});
   await page.reload();await settleBusinessUI(page);assert.equal(await card().count(),1,'未来实发未生效，旧版继续展示');await writeFile(clockFile,'2026-12-06T12:00:00+08:00');assert.equal((await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:actor})).status(),200);await page.reload();await settleBusinessUI(page);assert.equal(await card().count(),0,'新版实际生效，旧版退出当前持续阶段');assert.equal(JSON.stringify(await db.select().from(s.operationsPromotionDailyMetric)),paid);checks.push(role+'：完成后显示已完成，未来新版不提前切换，真实生效后旧版退出；付费指标原值保持');
  }finally{const pages=context.pages(),video=pages[0]?.video();await context.close();if(video)await copyFile(await video.path(),dir+'/continuous-lifecycle-flow.webm');await f.stop();}
 }
 assert.deepEqual(errors,[]);await writeFile(dir+'/checks.json',JSON.stringify({passed:!before,reproducedBefore:before,checks,errors,productionWrites:false},null,2));for(const check of checks)console.log('PASS '+check);
}finally{await browser.close();}
