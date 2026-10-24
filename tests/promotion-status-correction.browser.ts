/** 正式单行表单：误选终态后的原位更正、刷新、Inspector 与真实草稿保留。 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startFixture,admin} from './auth.fixture';
import * as s from '../src/db/schema';
import {previousDateKey,shanghaiDateKey} from '../src/db/promotion-rules.mjs';
const folder='.tools/test-artifacts/status-correction';await mkdir(folder,{recursive:true});
const fixture=await startFixture(),date=previousDateKey(shanghaiDateKey(new Date()));
let browser:any;
try{
 const items:Array<{post:typeof s.operationsContentSchedule.$inferSelect;campaign:typeof s.operationsPromotionCampaign.$inferSelect;stage:'testing'|'scaling'}>=[];
 for(const [index,stage] of (['testing','scaling'] as const).entries()){
  const [content]=await fixture.db.insert(s.operationsContent).values({platformNoteId:String(index+1).repeat(24)}).returning();
  const [version]=await fixture.db.insert(s.operationsContentVersion).values({contentId:content.id,versionNumber:1,workType:'new',contentName:stage==='testing'?'面试课第二轮·更正验收':'TMUA 放量·更正验收',subjectId:'tmua',categoryId:'temporary'}).returning();
  const [post]=await fixture.db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:new Date(date+'T10:00:00+08:00'),actualPublishAt:new Date(date+'T10:00:00+08:00'),completionStatus:'on_time',isPromoted:true,promotionStatus:stage}).returning();
  const [campaign]=await fixture.db.insert(s.operationsPromotionCampaign).values({scheduleId:post.id,startedOn:date,initialStage:stage,currentStage:stage,currentStatus:stage,dailyReviewEnabledOn:date}).returning();
  await fixture.db.insert(s.operationsPromotionStage).values({campaignId:campaign.id,stageType:stage,startedOn:date});items.push({post,campaign,stage});
 }
 const login=await fetch(fixture.baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:fixture.baseURL,'Content-Type':'application/json'},body:JSON.stringify(admin)});assert.equal(login.status,200);
 const cookies=login.headers.getSetCookie().map(value=>{const pair=value.split(';')[0],index=pair.indexOf('=');return {name:pair.slice(0,index),value:pair.slice(index+1),url:fixture.baseURL};});
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);browser=await chromium.launch({headless:true});
 const checks=[];
 for(const width of [1440,1024,390,320]){
  const context=await browser.newContext({viewport:{width,height:900},...(width===1440?{recordVideo:{dir:folder+'/video',size:{width:1440,height:900}}}:{reducedMotion:'reduce'})});await context.addCookies(cookies);
  const page=await context.newPage(),errors:string[]=[];page.on('pageerror',(e:Error)=>errors.push(e.message));
  await page.goto(fixture.baseURL+'/business/daily-promotion-review');await page.waitForLoadState('networkidle');
  const metric=(item:typeof items[number])=>page.locator(`#daily-table [data-metric-form][data-schedule-id="${item.post.id}"]`);
  const save=async(form:any,target:string,reason:string)=>{
   const bubble=page.locator('[data-day-state-form]:visible');await bubble.locator('[name=targetStatus]').selectOption(target);await bubble.locator('[name=reason]').fill(reason);
   const response=page.waitForResponse((r:any)=>r.url().endsWith('/api/promotion-timeline')&&r.request().method()==='POST');await bubble.locator('[type=submit]').click();const result=await response;assert.equal(result.status(),200,await result.text());
   await page.waitForFunction(({scheduleId,target}:{scheduleId:string;target:string})=>document.querySelector(`#daily-table [data-metric-form][data-schedule-id="${scheduleId}"]`)?.getAttribute('data-actual-status')===target,{scheduleId:await form.getAttribute('data-schedule-id'),target});
   await bubble.locator('[data-state-message]').filter({hasText:'变更已保存'}).waitFor();await page.waitForLoadState('networkidle');
  };
  for(const item of items){
   const form=metric(item),other=metric(items.find(other=>other!==item)!);await form.locator('[name=spend]').fill('200');for(const name of ['platformOpenCount','actualOpenCount','platformLeadCount','actualLeadCount'])await form.locator(`[name=${name}]`).fill('10');
   await other.locator('[name=spend]').fill('99');const otherNode=await other.elementHandle(),originalNext=item.stage==='testing'?'test_continue':'scaling_continue';await form.locator('[name=reviewDecision]').selectOption(originalNext);
   await form.locator('[data-toggle-day-state]').click();const terminal=item.stage==='testing'?'test_discarded':'formal_discarded';await save(form,terminal,'虚构验收：模拟误选淘汰');
   assert.ok(await form.locator('[data-toggle-day-state]').isEnabled());assert.equal(await form.locator('[data-state-caption]').innerText(),'修改');assert.equal(await form.locator('select[name=reviewDecision]').count(),0);
   await page.locator('[data-day-state-form]:visible [data-state-again]').click();let bubble=page.locator('[data-day-state-form]:visible');
   assert.ok(await bubble.locator('[name=targetStatus]').isEnabled());assert.equal(await bubble.locator(`[name=targetStatus] option[value="${terminal}"]`).count(),0);assert.match(await bubble.locator(`[name=targetStatus] option[value="${item.stage}"]`).innerText(),/恢复原状态/);
   await bubble.locator('[name=targetStatus]').selectOption(item.stage);await bubble.locator('[name=reason]').fill('误选淘汰，更正为原状态');
   await page.screenshot({path:`${folder}/${item.stage}-reopen-${width}.png`});await save(form,item.stage,'虚构验收：撤回误选，恢复原状态');await page.keyboard.press('Escape');
   assert.equal(await form.locator('[name=spend]').inputValue(),'200');assert.equal(await form.locator('select[name=reviewDecision]').inputValue(),originalNext,'恢复原本合法的次日安排');assert.equal(await other.locator('[name=spend]').inputValue(),'99');assert.ok(await otherNode!.evaluate((node:HTMLElement)=>node.isConnected));
   await form.locator('[data-toggle-day-state]').evaluate((node:HTMLElement)=>node.scrollIntoView({block:'center'}));await page.screenshot({path:`${folder}/${item.stage}-restored-${width}.png`});
   if(item.stage==='testing'){
    // 再误选一次，完整刷新后仍能更正；刷新前丢弃的是未提交指标草稿。
    await form.locator('[data-toggle-day-state]').click();await save(form,terminal,'虚构验收：刷新后更正');await page.keyboard.press('Escape');
    page.once('dialog',(dialog:any)=>dialog.accept());await page.reload();await page.waitForLoadState('networkidle');
    const reloaded=metric(item);await reloaded.locator('[data-toggle-day-state]').click();await page.screenshot({path:`${folder}/testing-after-reload-${width}.png`});await save(reloaded,'testing','虚构验收：刷新后恢复测试');await page.keyboard.press('Escape');
    assert.equal(await reloaded.locator('select[name=reviewDecision]').inputValue(),'','不将终态固定值当作次日淘汰');
   }
   checks.push({width,stage:item.stage,reopenAfterTerminal:true,restoreOriginal:true,numbersAndOtherNodePreserved:true});
  }
  if(width===1440){
   const form=metric(items[0]);await form.locator('[name=spend]').fill('240');await form.locator('[name=reviewDecision]').selectOption('test_continue');
   await form.locator('[data-pending-inspector]').click();const inspector=page.locator('[data-promotion-inspector]'),mirror=inspector.locator('[data-metric-form]');await mirror.waitFor();
   await mirror.locator('[data-toggle-day-state]').click();await save(mirror,'test_discarded','虚构验收：详情入口误选');await page.keyboard.press('Escape');
   assert.equal(await mirror.locator('[data-state-caption]').innerText(),'修改');assert.ok(await mirror.locator('[data-toggle-day-state]').isEnabled());
   await mirror.locator('[data-toggle-day-state]').click();await save(mirror,'testing','虚构验收：详情入口恢复');await page.keyboard.press('Escape');assert.ok(await mirror.locator('[data-toggle-day-state]').evaluate((node:HTMLElement)=>document.activeElement===node),'详情入口更正后焦点仍在详情');
   assert.equal(await form.locator('[name=spend]').inputValue(),'240');assert.equal(await mirror.locator('[name=spend]').inputValue(),'240');assert.equal(await mirror.locator('select[name=reviewDecision]').inputValue(),'test_continue');
   await page.screenshot({path:folder+'/inspector-restored-1440.png'});checks.push({width,stage:'testing',inspectorMirrorCorrection:true});
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  await context.close();
 }
 const snapshot=[];
 for(const item of items){const [campaign]=await fixture.db.select().from(s.operationsPromotionCampaign).where(eq(s.operationsPromotionCampaign.id,item.campaign.id));assert.equal(campaign.currentStatus,item.stage);assert.equal(campaign.endedOn,null);snapshot.push({stage:item.stage,endedOn:campaign.endedOn});}
 await writeFile(folder+'/results.json',JSON.stringify({checks,snapshot,isolatedData:true},null,2));console.log(JSON.stringify({passed:true,checks:checks.length,widths:[1440,1024,390,320],isolatedData:true}));
}catch(error){console.error(fixture.logs());throw error;}finally{if(browser)await browser.close();await fixture.stop();}
