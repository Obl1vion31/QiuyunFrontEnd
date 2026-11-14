import assert from 'node:assert/strict';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {and,eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {admin,employee} from './auth.fixture';
import {seedStateOverlap,overlapStates} from './promotion-state-overlap.fixture';
import {settleBusinessUI} from './business-confirm.helper';
import * as s from '../src/db/schema';
const dir=process.env.OVERLAP_UI_DIR??'.tools/test-artifacts/promotion-overlap-ui';await mkdir(dir+'/video',{recursive:true});const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-12T12:00:00+08:00');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);const browser=await chromium.launch({headless:true}),checks:string[]=[],errors:string[]=[];const metrics=['spend','platformOpenCount','actualOpenCount','platformLeadCount','actualLeadCount'];
async function login(context:any,baseURL:string,actor:any){assert.equal((await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:actor})).status(),200);}
try{
 for(const[role,actor]of[['admin',admin],['employee',employee]] as const){
  const f=await startPostgresFixture({clockFile,entry:process.env.OVERLAP_ENTRY}),{db,baseURL}=f;const context=await browser.newContext({viewport:{width:1920,height:1080},locale:'zh-CN'});
  try{
   const rows=[];for(const spec of overlapStates)rows.push(await seedStateOverlap(db,spec,'next_day_meeting','隔离核对 · '+spec.label));
   await login(context,baseURL,actor);const page=await context.newPage();page.on('pageerror',(e:any)=>errors.push(e.message));await page.goto(baseURL+'/business/daily-promotion-review');await settleBusinessUI(page);
   for(const row of rows){const form=page.locator(`[data-metric-form][data-schedule-id="${row.post.schedule.id}"]`);for(const name of metrics)await form.locator(`[name=${name}]`).fill('0');assert.equal(await form.locator('[name=reviewDecision]').inputValue(),row.spec.next);if(row.spec.terminal){assert.equal(await form.locator('[data-meeting-change]').count(),0);assert(await form.getByText('无需后续动作',{exact:true}).isVisible());}else assert.equal(await form.locator('[data-meeting-change]').count(),1);}
   await settleBusinessUI(page);await page.evaluate(()=>scrollTo(0,0));await settleBusinessUI(page);await page.screenshot({path:dir+'/'+role+'-all-states-before-1920.png',fullPage:true});
   if(role==='admin'){
    const response=page.waitForResponse((r:any)=>r.url().endsWith('/api/promotion-daily/batch')&&r.request().method()==='POST');await page.locator('[data-save-all]').click();const result=await response;assert.equal(result.status(),201,await result.text());
   }else{
    const formal=rows.find(r=>r.spec.status==='formal_discarded')!,form=page.locator(`[data-metric-form][data-schedule-id="${formal.post.schedule.id}"]`);await form.locator('[name=spend]').fill('12.50');
    let failed=false;await page.route('**/api/promotion-daily',async(route:any)=>{if(!failed){failed=true;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'临时保存失败，输入已保留。'})});}await route.continue();});await form.locator('[type=submit]').click();await form.getByText('临时保存失败，输入已保留。').waitFor();assert.equal(await form.locator('[name=spend]').inputValue(),'12.50');await page.unroute('**/api/promotion-daily');
    for(const row of rows){const form=page.locator(`[data-metric-form][data-schedule-id="${row.post.schedule.id}"]`);const response=page.waitForResponse((r:any)=>r.url().endsWith('/api/promotion-daily')&&r.request().method()==='POST');await form.locator('[type=submit]').click();const result=await response;assert.equal(result.status(),201,await result.text());await page.locator(`[data-saved-review][data-schedule-id="${row.post.schedule.id}"]`).waitFor();}
   }
   for(const row of rows)await page.locator(`[data-saved-review][data-schedule-id="${row.post.schedule.id}"]`).waitFor();await page.reload();await settleBusinessUI(page);await page.evaluate(()=>scrollTo(0,0));await settleBusinessUI(page);await page.screenshot({path:dir+'/'+role+'-all-states-saved-1920.png',fullPage:true});
   for(const row of rows){
    const form=page.locator(`[data-saved-review][data-schedule-id="${row.post.schedule.id}"]`);await form.getByRole('button',{name:'继续编辑',exact:true}).click();await form.locator('[name=spend]').fill('16.25');const response=page.waitForResponse((r:any)=>r.url().includes('/api/promotion-daily/')&&r.request().method()==='PATCH');await form.locator('[data-save-saved]').click();const result=await response;assert.equal(result.status(),200,await result.text());await form.locator('[name=spend]:disabled').waitFor();
    const[metric]=await db.select().from(s.operationsPromotionDailyMetric).where(and(eq(s.operationsPromotionDailyMetric.campaignId,row.campaign.id),eq(s.operationsPromotionDailyMetric.metricDate,'2026-11-11')));assert.equal(metric.spend,'16.25');const[campaign]=await db.select().from(s.operationsPromotionCampaign).where(eq(s.operationsPromotionCampaign.id,row.campaign.id));assert.equal(campaign.currentStatus,row.spec.status);assert.equal(campaign.endedOn,row.campaign.endedOn);const[v]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,row.frozen!.id));assert.deepEqual(v.snapshot,row.frozen!.snapshot);
   }
   checks.push(role+'：八种状态与次日同状态例会重叠，真实保存、刷新、再编辑保存；已淘汰／结束无空后续入口，原日期与会议保持');
  }finally{await context.close();await f.stop();}
 }
 const f=await startPostgresFixture({clockFile,entry:process.env.OVERLAP_ENTRY}),{db,baseURL}=f;const context=await browser.newContext({viewport:{width:1920,height:1080},locale:'zh-CN',recordVideo:{dir:dir+'/video',size:{width:1920,height:1080}}});
 try{
  const row=await seedStateOverlap(db,overlapStates[6],'next_day_meeting','隔离核对 · 放量淘汰');await login(context,baseURL,employee);const page=await context.newPage();await page.goto(baseURL+'/business/daily-promotion-review');const form=page.locator(`[data-metric-form][data-schedule-id="${row.post.schedule.id}"]`);for(const name of metrics)await form.locator(`[name=${name}]`).fill('0');await form.locator('[name=spend]').fill('12.50');await settleBusinessUI(page);await page.waitForTimeout(1000);const response=page.waitForResponse((r:any)=>r.url().endsWith('/api/promotion-daily')&&r.request().method()==='POST');await form.locator('[type=submit]').click();assert.equal((await response).status(),201);await page.locator('[data-saved-review]').waitFor();await settleBusinessUI(page);await page.waitForTimeout(1000);const video=page.video();await context.close();await copyFile(await video.path(),dir+'/formal-discarded-save.webm');
 }finally{await context.close();await f.stop();}
 const negative=await startPostgresFixture({clockFile,entry:process.env.OVERLAP_ENTRY}),nc=await browser.newContext({viewport:{width:1920,height:1080},locale:'zh-CN'});
 try{
  const row=await seedStateOverlap(negative.db,overlapStates[5],'next_day_meeting','隔离核对 · 已淘汰却安排继续测试');const snapshot={...row.frozen!.snapshot,generated:{meetingDecisions:[{...(row.frozen!.snapshot as any).generated.meetingDecisions[0],targetStatus:'testing',stageType:'testing'}]}};await negative.db.update(s.operationsReviewMeetingVersion).set({snapshot}).where(eq(s.operationsReviewMeetingVersion.id,row.frozen!.id));await login(nc,negative.baseURL,employee);const page=await nc.newPage();await page.goto(negative.baseURL+'/business/daily-promotion-review');const form=page.locator('[data-metric-form]');for(const name of metrics)await form.locator(`[name=${name}]`).fill('0');await form.locator('[name=spend]').fill('23.50');const response=page.waitForResponse((r:any)=>r.url().endsWith('/api/promotion-daily')&&r.request().method()==='POST');await form.locator('[type=submit]').click();assert.equal((await response).status(),422);await form.getByText(/2026-11-11.*2026-11-12/).waitFor();assert.equal(await form.locator('[name=spend]').inputValue(),'23.50');await settleBusinessUI(page);await page.evaluate(()=>scrollTo(0,0));await settleBusinessUI(page);await page.screenshot({path:dir+'/real-conflict-input-kept-1920.png',fullPage:true});checks.push('真正矛盾：已淘汰却安排次日继续测试，明确两天与状态，保留已填23.50');
 }finally{await nc.close();await negative.stop();}
 assert.deepEqual(errors,[]);await writeFile(dir+'/checks.json',JSON.stringify({passed:true,checks,errors,roles:['admin','employee'],viewport:{width:1920,height:1080},productionWrites:false},null,2));for(const check of checks)console.log('PASS '+check);
}finally{await browser.close();}
