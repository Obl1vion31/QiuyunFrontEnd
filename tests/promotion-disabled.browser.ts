/** 已保存每日复盘的真实禁用、继续编辑及共享表单外观；仅隔离PostgreSQL。 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {seedLinkPost} from './monthly-plan-links.fixture';
import {admin,employee} from './auth.fixture';
import {settleBusinessUI,respondToBusinessConfirm} from './business-confirm.helper';
import * as s from '../src/db/schema';
const dir=process.env.PROMOTION_DISABLED_DIR??'.tools/test-artifacts/promotion-disabled',baseline=process.env.PROMOTION_DISABLED_BASELINE==='1';
for(const folder of ['screenshots','video'])await mkdir(dir+'/'+folder,{recursive:true});
const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-07T12:00:00+08:00');
const fixture=await startPostgresFixture({clockFile,entry:process.env.PROMOTION_DISABLED_ENTRY}),{db,baseURL}=fixture;
let browser:any;const contexts:any[]=[],errors:string[]=[],checks:string[]=[];
try{
 const pw=await import(process.env.PLAYWRIGHT_MODULE!);browser=await pw.chromium.launch({headless:true});
 async function seed(name:string,stage='testing',zero=false,initial=false){
  const post=await seedLinkPost(db,name,'2026-11-05T10:00',{subjectId:'interview',categoryId:'promotional-handout'});
  await db.update(s.operationsContent).set({platformNoteId:randomUUID().replaceAll('-','').slice(0,24)}).where(eq(s.operationsContent.id,post.content.id));
  const next=stage==='scaling'?'scaling_continue':zero?'test_continue':'test_pending';
  await db.update(s.operationsContentSchedule).set({isPromoted:true,promotionStatus:initial?'awaiting_promotion':next==='test_pending'?'test_pending':stage,actualPublishAt:new Date('2026-11-05T02:00Z'),completionStatus:'on_time'}).where(eq(s.operationsContentSchedule.id,post.schedule.id));
  if(!initial){const [campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:post.schedule.id,startedOn:'2026-11-05',dailyReviewEnabledOn:'2026-11-05',initialStage:stage,currentStage:stage,currentStatus:next==='test_pending'?'test_pending':stage}).returning();
   await db.insert(s.operationsPromotionStage).values({campaignId:campaign.id,stageType:stage,startedOn:'2026-11-05'});
   await db.insert(s.operationsPromotionDailyMetric).values(['2026-11-05','2026-11-06'].map(metricDate=>({campaignId:campaign.id,metricDate,dailyStatus:'active',actualStatusSnapshot:stage,stageTypeSnapshot:stage,sourceStageStartedOn:'2026-11-05',spend:zero?'0':'377.21',platformOpenCount:zero?0:3,actualOpenCount:zero?0:2,platformLeadCount:zero?0:1,actualLeadCount:zero?0:1,reviewDecision:metricDate==='2026-11-06'?next:stage==='scaling'?'scaling_continue':'test_continue',updatedAt:new Date('2026-11-07T01:00Z')})));}
  return post;
 }
 const saved=await seed('面试课推广讲义 · 已保存测试'),scaling=await seed('TMUA课程 · 已保存放量','scaling'),zero=await seed('面试课讲义 · 已保存真实零','testing',true);await seed('面试课课程 · 尚未首次推广','testing',false,true);
 async function makeContext(actor:any,record=false){const context=await browser.newContext({viewport:{width:1920,height:1000},locale:'zh-CN',...(record?{recordVideo:{dir:dir+'/video',size:{width:1920,height:1000}}}:{})});contexts.push(context);assert.equal((await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:actor})).status(),200);const page=await context.newPage();page.on('pageerror',(e:Error)=>errors.push(e.message));return {context,page};}
 const {page}=await makeContext(admin,!baseline),go=async(p=page)=>{await p.goto(baseURL+'/business/daily-promotion-review');await settleBusinessUI(p);};
 const row=(p=page)=>p.locator(`[data-saved-review][data-schedule-id="${saved.schedule.id}"]`);
 const shot=async(p:any,name:string)=>{await settleBusinessUI(p);await p.screenshot({path:dir+'/screenshots/'+name+'.png',fullPage:true});};
 // Chromium隐藏原生选择箭头时会改变font简写中的行高；几何单独比较，字体保留族、字号及字重。
 const geometry=async(p=page)=>row(p).evaluate((node:HTMLElement)=>{const box=node.getBoundingClientRect();return {height:box.height,fields:[...node.querySelectorAll<HTMLElement>('.review-number input,[data-toggle-day-state],.review-decision select,.review-saved-actions')].map(field=>{const r=field.getBoundingClientRect(),style=getComputedStyle(field);return {x:r.x-box.x,y:r.y-box.y,width:r.width,height:r.height,font:style.font.replace(/ \/ [\d.]+px/,''),fontFamily:style.fontFamily};})};});
 const palette=async(locator:any)=>locator.evaluate((n:HTMLElement)=>{const s=getComputedStyle(n);return {background:s.backgroundColor,color:s.color,borderColor:s.borderColor,borderStyle:s.borderStyle,opacity:s.opacity,textFill:s.webkitTextFillColor};});
 if(!baseline)await page.route('**/fonts/business.js',async(route:any)=>{await new Promise(resolve=>setTimeout(resolve,650));await route.continue();});
 await go();await page.unroute('**/fonts/business.js');assert.equal(await page.locator('[data-saved-review]').count(),3);assert.equal(await page.locator('[data-initial-row]').count(),1);
 const dimensions:Record<string,unknown>={};
 for(const width of [1920,1440,1024]){await page.setViewportSize({width,height:1000});await settleBusinessUI(page);dimensions[width]=await geometry();await shot(page,(baseline?'before-locked-':'admin-locked-')+width);}
 await writeFile(dir+'/row-geometry.json',JSON.stringify(dimensions,null,2));
 if(baseline){console.log('Captured actual pre-change rows');}
 else{
  if(process.env.PROMOTION_DISABLED_COMPARE){const prior=JSON.parse(await readFile(process.env.PROMOTION_DISABLED_COMPARE,'utf8'));for(const view of Object.values(prior) as any[])for(const field of view.fields)field.font=field.font.replace(/ \/ [\d.]+px/,'');assert.deepEqual(dimensions,prior,'三档桌面行高、控件尺寸、列锚点及字体族／字号／字重保持原样');}
  await page.setViewportSize({width:1920,height:1000});await page.reload();await settleBusinessUI(page);const f=row(),input=f.locator('[name=spend]'),select=f.locator('[name=reviewDecision]');
  const locked=await palette(input);assert.equal(locked.background,'rgb(239, 244, 246)');assert.equal(locked.color,'rgb(83, 97, 90)');assert.equal(locked.borderStyle,'dashed');assert.equal(locked.opacity,'1');assert.deepEqual(await palette(select),locked);assert.deepEqual(await palette(page.locator('[data-initial-row] .review-number input').first()),locked);
  for(const field of await page.locator('[data-saved-review] .review-number input,[data-saved-review] .review-decision select').all()){assert.equal(await field.isDisabled(),true);await field.evaluate((n:HTMLElement)=>n.focus());assert.equal(await field.evaluate((n:HTMLElement)=>document.activeElement===n),false);}
  assert.equal(await select.evaluate((n:HTMLElement)=>getComputedStyle(n).appearance),'none');assert.equal(await select.inputValue(),'test_pending');assert.equal(await page.locator(`[data-saved-review][data-schedule-id="${zero.schedule.id}"] [name=spend]`).inputValue(),'0.00');
  const common=await page.context().newPage();await common.goto(baseURL+'/business/non-promotion-review');await settleBusinessUI(common);const category=common.locator('select[name=category]');assert.equal(await category.isDisabled(),true);assert.deepEqual(await palette(category),locked);assert.equal(await category.evaluate((n:HTMLElement)=>getComputedStyle(n).appearance),'none');await shot(common,'shared-disabled-category-1920');await common.close();
  checks.push('五项指标及次日安排实际disabled，不可聚焦；真实0保留；与首次推广及公共禁用分类共享底色、文字、边框，禁用下拉无箭头');
  await shot(page,'refresh-locked-1920');const lockedGeometry=await geometry();await f.locator('[data-continue-review]').press('Enter');await settleBusinessUI(page);assert.equal(await input.isEnabled(),true);assert.equal(await select.isEnabled(),true);assert.equal(await input.evaluate((n:HTMLElement)=>document.activeElement===n),true);assert.notEqual(await select.evaluate((n:HTMLElement)=>getComputedStyle(n).appearance),'none');assert.equal((await palette(input)).borderStyle,'solid');assert.notEqual((await palette(input)).background,locked.background);assert.deepEqual(await geometry(),lockedGeometry);await shot(page,'keyboard-editing-1920');
  await input.fill('400');await f.locator('[data-cancel-saved]').click();await respondToBusinessConfirm(page,false);assert.equal(await input.inputValue(),'400');assert.equal(await input.isEnabled(),true);await f.locator('[data-cancel-saved]').click();await respondToBusinessConfirm(page,true);await settleBusinessUI(page);assert.equal(await input.inputValue(),'377.21');assert.equal(await input.isDisabled(),true);assert.deepEqual(await palette(input),locked);await shot(page,'cancel-restored-1920');
  await f.locator('[data-continue-review]').click();await input.fill('401.25');await f.locator('[data-save-saved]').click();await f.locator('[name=spend][value="401.25"]').waitFor();await page.waitForLoadState('networkidle');assert.equal(await input.isDisabled(),true);assert.deepEqual(await palette(input),locked);assert.deepEqual(await geometry(),lockedGeometry);await shot(page,'saved-again-1920');
  await page.reload();await settleBusinessUI(page);assert.equal(await input.inputValue(),'401.25');assert.equal(await input.isDisabled(),true);
  checks.push('刷新首次操作及键盘继续编辑恢复白底实线和下拉箭头；取消保护保留输入，明确取消及保存后恢复灰色锁定，原行几何不变');
  await page.getByRole('link',{name:'历史总览',exact:true}).first().click();await page.waitForURL(/view=history/);await page.getByRole('link',{name:'每日复盘',exact:true}).first().click();await page.waitForURL((url:URL)=>url.searchParams.get('view')!=='history');await settleBusinessUI(page);assert.equal(await input.isDisabled(),true);await shot(page,'navigation-locked-1920');
  const staff=await makeContext(employee);for(const [p,role]of [[page,'admin'],[staff.page,'employee']] as const)for(const width of [1920,1440,1024]){await p.setViewportSize({width,height:1000});await go(p);assert.deepEqual(await palette(row(p).locator('[name=spend]')),locked);await shot(p,role+'-locked-'+width);if(width<1920){await p.locator('[data-review-container=ready]').evaluate((n:HTMLElement)=>n.scrollLeft=n.scrollWidth);await shot(p,role+'-locked-right-'+width);}await row(p).locator('[data-continue-review]').press('Enter');await shot(p,role+'-editing-'+width);if(width<1920){await p.locator('[data-review-container=ready]').evaluate((n:HTMLElement)=>n.scrollLeft=n.scrollWidth);await shot(p,role+'-editing-right-'+width);}await row(p).locator('[data-cancel-saved]').click();assert.equal(await row(p).locator('[name=spend]').isDisabled(),true);}
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await go();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await shot(page,'mobile-obvious-left-390');await page.locator('[data-review-container=ready]').evaluate((n:HTMLElement)=>n.scrollLeft=n.scrollWidth);await shot(page,'mobile-obvious-right-390');
  checks.push('两角色三档桌面实际锁定与编辑；站内往返、慢字体首屏、减少动态效果、390有限遮挡及整页溢出核查');
 }
 assert.deepEqual(errors,[]);await writeFile(dir+'/checks.json',JSON.stringify({baseline,checks,errors,data:'本机独立PostgreSQL，2026-11-07固定时钟，虚构三篇已保存及一篇首次推广'},null,2));console.log('Promotion disabled checks passed');
}finally{for(const context of contexts)await context.close();await browser?.close();await fixture.stop();}
