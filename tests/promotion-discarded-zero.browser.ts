/** 淘汰当日默认零：正式组件、真实接口及隔离 PostgreSQL。 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {and,eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {seedLinkPost} from './monthly-plan-links.fixture';
import {admin,employee} from './auth.fixture';
import {settleBusinessUI,respondToBusinessConfirm} from './business-confirm.helper';
import * as s from '../src/db/schema';

const dir=process.env.DISCARDED_ZERO_DIR??'.tools/test-artifacts/discarded-zero';await mkdir(dir,{recursive:true});
const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-12T12:00:00+08:00');
const f=await startPostgresFixture({clockFile,entry:process.env.DISCARDED_ZERO_ENTRY}),{db,baseURL}=f;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);const browser=await chromium.launch({headless:true});
const names=['spend','platformOpenCount','actualOpenCount','platformLeadCount','actualLeadCount'];const checks:string[]=[],errors:string[]=[];
async function seed(name:string,discarded=true,alreadyPlanned=false){
 const post=await seedLinkPost(db,name,'2026-11-10T10:00',{subjectId:'interview',categoryId:'promotional-handout'});
 await db.update(s.operationsContent).set({operationType:'promotion_only',platformNoteId:randomUUID().replaceAll('-','').slice(0,24)}).where(eq(s.operationsContent.id,post.content.id));
 const endedOn=discarded?(alreadyPlanned?'2026-11-10':'2026-11-11'):null;
 const [campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:post.schedule.id,startedOn:'2026-11-10',dailyReviewEnabledOn:'2026-11-10',initialStage:'testing',currentStatus:discarded?'test_discarded':'testing',currentStage:discarded?null:'testing',endedOn}).returning();
 await db.insert(s.operationsPromotionStage).values({campaignId:campaign.id,stageType:'testing',startedOn:'2026-11-10',endedOn});
 if(discarded)await db.insert(s.operationsPromotionDayDecision).values({campaignId:campaign.id,businessDate:'2026-11-11',stageType:'testing',actualStatus:'test_discarded',reason:'该日确认淘汰，核对真实指标'});
 await db.insert(s.operationsPromotionDailyMetric).values({campaignId:campaign.id,metricDate:'2026-11-10',dailyStatus:'active',actualStatusSnapshot:'testing',stageTypeSnapshot:'testing',sourceStageStartedOn:'2026-11-10',reviewDecision:alreadyPlanned?'test_discarded':'test_continue',recordKind:'regular',spend:'80',platformOpenCount:3,actualOpenCount:2,platformLeadCount:1,actualLeadCount:1});
 await db.update(s.operationsContentSchedule).set({isPromoted:true,promotionStatus:discarded?'test_discarded':'testing',actualPublishAt:new Date('2026-11-10T02:00Z'),publicationUrl:'https://www.xiaohongshu.com/explore/'+'a'.repeat(24),completionStatus:'on_time'}).where(eq(s.operationsContentSchedule.id,post.schedule.id));
 return {post,campaign};
}
try{
 for(const[role,actor,alreadyPlanned]of[['admin',admin,true],['employee',employee,true],['admin',admin,false],['employee',employee,false]] as const){
  const row=await seed((alreadyPlanned?'前日决定与当日确认 · ':'')+(role==='admin'?'面试课讲义 · 淘汰当天默认零':'面试课讲义 · 淘汰后真实数据'),true,alreadyPlanned);
  const context=await browser.newContext({viewport:{width:1920,height:1080},locale:'zh-CN'});assert.equal((await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:actor})).status(),200);
  const page=await context.newPage();page.on('pageerror',(e:any)=>errors.push(e.message));await page.goto(baseURL+'/business/daily-promotion-review');await settleBusinessUI(page);
  const form=page.locator(`[data-metric-form][data-schedule-id="${row.post.schedule.id}"]`);await form.waitFor();
  assert.equal(await form.getAttribute('data-actual-status'),'test_discarded');for(const name of names)assert.equal(await form.locator(`[name=${name}]`).inputValue(),'0');
  assert.equal(await form.locator('select[name=reviewDecision]').count(),0);assert.equal(await form.locator('[name=reviewDecision]').inputValue(),'test_discarded');
  if(role==='admin')await page.screenshot({path:dir+(alreadyPlanned?'/repeated-terminal-zero-1920.png':'/default-zero-1920.png')});
  if(role==='employee'){
   await form.locator('[name=spend]').fill('12.50');await form.locator('[name=actualOpenCount]').fill('1');
   await page.route('**/api/promotion-daily',(route:any)=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'临时保存失败，请重试。'})}));
   await form.locator('[type=submit]').click();await form.getByText('临时保存失败，请重试。').waitFor();assert.equal(await form.locator('[name=spend]').inputValue(),'12.50');await page.unroute('**/api/promotion-daily');
  }
  const response=page.waitForResponse((r:any)=>r.url().endsWith('/api/promotion-daily')&&r.request().method()==='POST');await form.locator('[type=submit]').click();const result=await response;if(result.status()!==201)await page.screenshot({path:dir+'/save-rejected-1920.png'});assert.equal(result.status(),201,await result.text());
  const [saved]=await db.select().from(s.operationsPromotionDailyMetric).where(and(eq(s.operationsPromotionDailyMetric.campaignId,row.campaign.id),eq(s.operationsPromotionDailyMetric.metricDate,'2026-11-11')));
  assert.equal(saved.spend,role==='admin'?'0.00':'12.50');assert.equal(saved.actualOpenCount,role==='admin'?0:1);assert.equal(saved.actualStatusSnapshot,'test_discarded');
  const [after]=await db.select().from(s.operationsPromotionCampaign).where(eq(s.operationsPromotionCampaign.id,row.campaign.id));assert.equal(after.endedOn,row.campaign.endedOn);assert.equal(after.currentStatus,'test_discarded');assert.equal(after.currentStage,null);
  const [stage]=await db.select().from(s.operationsPromotionStage).where(eq(s.operationsPromotionStage.campaignId,row.campaign.id));assert.equal(stage.endedOn,row.campaign.endedOn);
  const [prior]=await db.select().from(s.operationsPromotionDailyMetric).where(and(eq(s.operationsPromotionDailyMetric.campaignId,row.campaign.id),eq(s.operationsPromotionDailyMetric.metricDate,'2026-11-10')));assert.equal(prior.spend,'80.00');assert.equal(prior.actualStatusSnapshot,'testing');assert.equal(prior.reviewDecision,alreadyPlanned?'test_discarded':'test_continue');
  const locked=page.locator(`[data-saved-review][data-schedule-id="${row.post.schedule.id}"]`);await locked.waitFor();await page.reload();await settleBusinessUI(page);assert.equal(await locked.locator('[name=spend]').inputValue(),saved.spend);assert(await locked.locator('[name=spend]').isDisabled());
  if(role==='employee')await page.screenshot({path:dir+(alreadyPlanned?'/repeated-terminal-saved-1920.png':'/nonzero-saved-1920.png')});
  checks.push((alreadyPlanned?'前日已安排淘汰、当日重复确认；':'')+(role==='admin'?'管理员：默认零直接保存，刷新保留真实零及原结束日期':'员工：非零、失败保留、重试保存及刷新正确，原结束日期保持'));await context.close();
 }
 const batchRows=[await seed('批量确认 · 面试课讲义一',true,true),await seed('批量确认 · 面试课讲义二',true,true)];
 const batchContext=await browser.newContext({viewport:{width:1920,height:1080},locale:'zh-CN'});await batchContext.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:admin});const batchPage=await batchContext.newPage();await batchPage.goto(baseURL+'/business/daily-promotion-review');await settleBusinessUI(batchPage);
 const batchResponse=batchPage.waitForResponse((r:any)=>r.url().endsWith('/api/promotion-daily/batch')&&r.request().method()==='POST');await batchPage.locator('[data-save-all]').click();const batchResult=await batchResponse;assert.equal(batchResult.status(),201,await batchResult.text());
 for(const row of batchRows){await batchPage.locator(`[data-saved-review][data-schedule-id="${row.post.schedule.id}"]`).waitFor();const [campaign]=await db.select().from(s.operationsPromotionCampaign).where(eq(s.operationsPromotionCampaign.id,row.campaign.id));assert.equal(campaign.endedOn,'2026-11-10');const [fact]=await db.select().from(s.operationsPromotionDailyMetric).where(and(eq(s.operationsPromotionDailyMetric.campaignId,row.campaign.id),eq(s.operationsPromotionDailyMetric.metricDate,'2026-11-11')));assert.equal(fact.spend,'0.00');}
 await batchContext.close();checks.push('两条重复终态确认一键保存成功，均保留原最后投放日');
 const clean=await seed('面试课推广讲义 · 当日改成淘汰',false),dirty=await seed('面试课推广讲义 · 已填数值保持',false);
 const context=await browser.newContext({viewport:{width:1920,height:1080},locale:'zh-CN'});await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:admin});const page=await context.newPage();await page.goto(baseURL+'/business/daily-promotion-review');await settleBusinessUI(page);
 for(const[item,filled]of[[clean,false],[dirty,true]] as const){
  const form=page.locator(`[data-metric-form][data-schedule-id="${item.post.schedule.id}"]`);for(const name of names)assert.equal(await form.locator(`[name=${name}]`).inputValue(),'');
  if(filled)for(const[name,value]of Object.entries({spend:'48.60',platformOpenCount:'2',actualOpenCount:'1',platformLeadCount:'0',actualLeadCount:'0'}))await form.locator(`[name=${name}]`).fill(value);
  const original=await form.elementHandle();await form.locator('[data-toggle-day-state]').click();const bubble=page.locator('[data-day-state-form]:visible');await bubble.locator('[name=targetStatus]').selectOption('test_discarded');await bubble.locator('[name=reason]').fill('该日确认淘汰，保留当日实际数据');
  const changed=page.waitForResponse((r:any)=>r.url().endsWith('/api/promotion-timeline')&&r.request().method()==='POST');await bubble.locator('[type=submit]').click();const reply=await changed,result=await reply.json();
  if(result.contextRequired){assert.equal(reply.status(),409);const confirmed=page.waitForResponse((r:any)=>r.url().endsWith('/api/promotion-timeline')&&r.request().method()==='POST');await respondToBusinessConfirm(page,true);assert.equal((await confirmed).status(),200);}else assert.equal(reply.status(),200,JSON.stringify(result));
  await page.waitForFunction((id:string)=>document.querySelector(`[data-metric-form][data-schedule-id="${id}"]`)?.getAttribute('data-actual-status')==='test_discarded',item.post.schedule.id);await bubble.locator('[data-state-cancel]').click();
  assert(await original!.evaluate((n:HTMLElement)=>n.isConnected));assert.equal(await form.locator('[name=spend]').inputValue(),filled?'48.60':'0');assert.equal(await form.locator('[name=actualOpenCount]').inputValue(),filled?'1':'0');
 }
 await settleBusinessUI(page);await page.screenshot({path:dir+'/state-change-preserves-input-1920.png'});await context.close();checks.push('正常测试仍为空；未输入时改成淘汰原位补零，已有输入改成淘汰保持原值与节点');
 assert.deepEqual(errors,[]);await writeFile(dir+'/checks.json',JSON.stringify({passed:true,checks,errors,viewport:{width:1920,height:1080},roles:['admin','employee'],productionWrites:false},null,2));for(const check of checks)console.log('PASS '+check);
}finally{await browser.close();await f.stop();}
