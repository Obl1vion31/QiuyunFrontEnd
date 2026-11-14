/** 实际运行包＋隔离PostgreSQL：收尾、结束后重复状态、旧页面写入及已有真实数据。 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {and,eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {admin,employee} from './auth.fixture';
import {seedStateOverlap,overlapStates,closingOverlapStates} from './promotion-state-overlap.fixture';
import {promotionSnapshot,timelineFingerprint} from '../src/db/promotion-timeline';
import {settleBusinessUI} from './business-confirm.helper';
import * as s from '../src/db/schema';
const dir=process.env.ENDING_DIR??'.tools/test-artifacts/promotion-ending';await mkdir(dir,{recursive:true});
const clockFile=process.cwd()+'/'+dir+'/clock.txt',before=process.env.ENDING_BEFORE==='1';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);const browser=await chromium.launch({headless:true});
const checks:string[]=[],errors:string[]=[],fields=['spend','platformOpenCount','actualOpenCount','platformLeadCount','actualLeadCount'];
try{
 for(const[role,actor]of (before?[['employee',employee]]:[['admin',admin],['employee',employee]]) as Array<['admin'|'employee',typeof admin]>){
  await writeFile(clockFile,'2026-11-12T12:00:00+08:00');
  const f=await startPostgresFixture({clockFile,entry:process.env.ENDING_ENTRY}),{db,baseURL}=f;
  const context=await browser.newContext({viewport:{width:1920,height:1080},locale:'zh-CN'});
  try{
   const stopped:Array<Awaited<ReturnType<typeof seedStateOverlap>>>=[],closing:Array<Awaited<ReturnType<typeof seedStateOverlap>>>=[],legacy:Array<Awaited<ReturnType<typeof seedStateOverlap>>>=[];
   for(const spec of overlapStates.filter(v=>v.terminal)){
    stopped.push(await seedStateOverlap(db,spec,'next_day_record','已结束 · '+spec.label));
    const ending=await seedStateOverlap(db,closingOverlapStates.find(v=>v.status===spec.status)!,'next_day_meeting','当天收尾 · '+spec.label);closing.push(ending);
    await db.insert(s.operationsPromotionDayDecision).values({campaignId:ending.campaign.id,businessDate:'2026-11-12',stageType:spec.stage,actualStatus:spec.status,reason:'重复结束状态不能多生成一天复盘'});
    const old=await seedStateOverlap(db,spec,'next_day_meeting','已有真实数据 · '+spec.label);legacy.push(old);
    await db.insert(s.operationsPromotionDailyMetric).values({campaignId:old.campaign.id,metricDate:'2026-11-11',dailyStatus:'waiting_action',actualStatusSnapshot:spec.status,stageTypeSnapshot:spec.stage,sourceStageStartedOn:'2026-11-10',recordKind:'regular',reviewDecision:spec.status,spend:'12.50',platformOpenCount:2,actualOpenCount:1,platformLeadCount:0,actualLeadCount:0});
   }
   const initial=new Map<string,Awaited<ReturnType<typeof promotionSnapshot>>>();for(const row of [...stopped,...closing,...legacy])initial.set(row.post.schedule.id,await promotionSnapshot(db,row.post.schedule.id));
   assert.equal((await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:actor})).status(),200);
   const page=await context.newPage();page.on('pageerror',(e:any)=>errors.push(e.message));await page.goto(baseURL+'/business/daily-promotion-review');await settleBusinessUI(page);
   assert.equal(await page.locator('[data-metric-form]').count(),before?6:3);
   assert.equal(await page.locator('[data-saved-review]').count(),3);
   for(const row of stopped)assert.equal(await page.locator(`[data-metric-form][data-schedule-id="${row.post.schedule.id}"]`).count(),before?1:0);
   await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:dir+'/'+role+'-'+(before?'before-extra-tasks':'closing-only')+'-1920.png',fullPage:true});
   if(before){console.log('旧包复现：3条结束后的多余待办，另3条真实收尾及3条已保存数据');continue;}
   async function input(row:typeof stopped[number]){return {campaignId:row.campaign.id,metricDate:'2026-11-11',dailyStatus:'waiting_action',actualStatusSnapshot:row.spec.status,stageTypeSnapshot:row.spec.stage,recordKind:'regular',reviewDecision:row.spec.next,platformNoteId:row.noteId,spend:0,platformOpenCount:0,actualOpenCount:0,platformLeadCount:0,actualLeadCount:0,requestKey:randomUUID(),fingerprint:timelineFingerprint(await promotionSnapshot(db,row.post.schedule.id))};}
   for(const row of stopped){
    const response=await context.request.post(baseURL+'/api/promotion-daily',{headers:{Origin:baseURL},multipart:await input(row)});
    assert.equal(response.status(),422,await response.text());assert.match((await response.json()).message,/无需补填零值/);
    assert.deepEqual(await promotionSnapshot(db,row.post.schedule.id),initial.get(row.post.schedule.id));
   }
   const batch=await context.request.post(baseURL+'/api/promotion-daily/batch',{headers:{Origin:baseURL},data:{rows:[await input(closing[0]),await input(stopped[0])]}});
   assert.equal(batch.status(),422,await batch.text());assert.deepEqual(await promotionSnapshot(db,closing[0].post.schedule.id),initial.get(closing[0].post.schedule.id));
   checks.push(role+'：三种已结束状态无待办，旧页面单条请求明确拒绝补零，混入旧待办的批量保存整批回滚');
   for(const row of closing){const form=page.locator(`[data-metric-form][data-schedule-id="${row.post.schedule.id}"]`);for(const name of fields)await form.locator(`[name=${name}]`).fill('0');assert.equal(await form.locator('[name=reviewDecision]').inputValue(),row.spec.status);}
   const formal=closing.find(row=>row.spec.status==='formal_discarded')!,formalForm=page.locator(`[data-metric-form][data-schedule-id="${formal.post.schedule.id}"]`);await formalForm.locator('[name=spend]').fill('18.75');
   if(role==='admin'){
    const pending=page.waitForResponse((r:any)=>r.url().endsWith('/api/promotion-daily/batch')&&r.request().method()==='POST');await page.locator('[data-save-all]').click();const response=await pending;assert.equal(response.status(),201,await response.text());
    const replay=await context.request.post(baseURL+'/api/promotion-daily/batch',{headers:{Origin:baseURL},data:response.request().postDataJSON()});assert.equal(replay.status(),201,await replay.text());
   }else{
    await page.route('**/api/promotion-daily',(route:any)=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'临时保存失败，输入已保留。'})}));await formalForm.locator('[type=submit]').click();await formalForm.getByText('临时保存失败，输入已保留。').waitFor();assert.equal(await formalForm.locator('[name=spend]').inputValue(),'18.75');await page.unroute('**/api/promotion-daily');
    for(const row of closing){const form=page.locator(`[data-metric-form][data-schedule-id="${row.post.schedule.id}"]`),pending=page.waitForResponse((r:any)=>r.url().endsWith('/api/promotion-daily')&&r.request().method()==='POST');await form.locator('[type=submit]').click();const response=await pending;assert.equal(response.status(),201,await response.text());await page.locator(`[data-saved-review][data-schedule-id="${row.post.schedule.id}"]`).waitFor();}
   }
   await page.reload();await settleBusinessUI(page);assert.equal(await page.locator('[data-metric-form]').count(),0);assert.equal(await page.locator('[data-saved-review]').count(),6);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:dir+'/'+role+'-saved-and-retained-1920.png',fullPage:true});
   for(const row of closing){const snap=await promotionSnapshot(db,row.post.schedule.id),old=initial.get(row.post.schedule.id)!;assert.equal(snap.campaigns[0].endedOn,'2026-11-11');assert.equal(snap.metrics.length,2);assert.deepEqual(snap.metrics.find(m=>m.id===row.prior.id),old.metrics.find(m=>m.id===row.prior.id));const[v]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,row.frozen!.id));assert.deepEqual(v.snapshot,row.frozen!.snapshot);}
   for(const row of legacy){
    const old=await promotionSnapshot(db,row.post.schedule.id);assert.deepEqual(old,initial.get(row.post.schedule.id));
    const form=page.locator(`[data-saved-review][data-schedule-id="${row.post.schedule.id}"]`);assert.equal(await form.locator('[name=spend]').inputValue(),'12.50');await form.locator('[data-continue-review]').click();await form.locator('[name=spend]').fill('30.75');const pending=page.waitForResponse((r:any)=>r.url().includes('/api/promotion-daily/')&&r.request().method()==='PATCH');await form.locator('[data-save-saved]').click();const response=await pending;assert.equal(response.status(),200,await response.text());await form.locator('[name=spend]:disabled').waitFor();
    const[campaign]=await db.select().from(s.operationsPromotionCampaign).where(eq(s.operationsPromotionCampaign.id,row.campaign.id));assert.deepEqual(campaign,old.campaigns[0]);const[fact]=await db.select().from(s.operationsPromotionDailyMetric).where(and(eq(s.operationsPromotionDailyMetric.campaignId,row.campaign.id),eq(s.operationsPromotionDailyMetric.metricDate,'2026-11-11')));assert.equal(fact.spend,'30.75');
   }
   checks.push(role+'：三种当天结束的收尾真实保存、刷新；单条／批量、重试、重复请求、已有真实数据再编辑均正常，原结束日与冻结会议保持');
   await writeFile(clockFile,'2026-11-13T12:00:00+08:00');await page.reload();await settleBusinessUI(page);assert.equal(await page.locator('[data-metric-form]').count(),0);assert.equal(await page.locator('[data-saved-review]').count(),0);await page.screenshot({path:dir+'/'+role+'-following-day-no-tasks-1920.png',fullPage:true});
   for(const row of stopped)assert.deepEqual(await promotionSnapshot(db,row.post.schedule.id),initial.get(row.post.schedule.id));checks.push(role+'：跨到后一天，重复结束状态没有新增待办或零指标');
   if(role==='employee'){
    await page.setViewportSize({width:1440,height:1000});await page.goto(baseURL+'/business/settings?view=guide#guide-reviews');await settleBusinessUI(page);
    const guide=page.locator('#guide-reviews');await guide.getByRole('heading',{name:'结束日期与收尾复盘'}).waitFor();assert.match(await guide.textContent(),/重复保存相同状态不会增加待办/);await guide.screenshot({path:dir+'/usage-guide-ending-1440.png'});checks.push('员工可见使用说明：真实收尾与次日起停止示例，1440桌面');
   }
  }finally{await context.close();await f.stop();}
 }
 assert.deepEqual(errors,[]);await writeFile(dir+'/checks.json',JSON.stringify({passed:!before,reproducedBefore:before,checks,errors,viewport:{width:1920,height:1080},productionWrites:false},null,2));for(const check of checks)console.log('PASS '+check);
}finally{await browser.close();}
