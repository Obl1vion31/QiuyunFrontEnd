/** 统计卡内容组与真实计数回显；只写隔离PGlite，故障注入只控制延迟和网络。 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {startFixture,admin,employee} from './auth.fixture';
import {settleBusinessUI,openPostLookup} from './business-confirm.helper';
import * as s from '../src/db/schema';
const folder=process.env.SUMMARY_EVIDENCE_DIR||'.tools/test-artifacts/summary-controls';
await mkdir(folder+'/screenshots',{recursive:true});
const clockFile=new URL('../'+folder+'/clock.txt',import.meta.url).pathname;
await writeFile(clockFile,'2026-10-30T12:00:00+08:00');
const fixture=await startFixture({clockFile}),{db,baseURL}=fixture;
const measurements:any[]=[],checks:string[]=[],errors:string[]=[],videos:string[]=[];
let browser:any;
const widths=[1920,1440,1024,390,320];
async function shot(page:any,name:string){await settleBusinessUI(page);await page.screenshot({path:`${folder}/screenshots/${name}.png`});}
async function stats(page:any,name:string){
 const measured=await page.locator('.status-strip>a').evaluateAll((nodes:HTMLElement[])=>nodes.map(n=>{
  const box=n.getBoundingClientRect(),label=n.querySelector('span')!,value=n.querySelector('strong')!,l=label.getBoundingClientRect(),v=value.getBoundingClientRect();
  const range=document.createRange();range.selectNodeContents(label);const lt=range.getBoundingClientRect();range.selectNodeContents(value);const vt=range.getBoundingClientRect();
  const font=getComputedStyle(value);return {label:label.textContent,value:value.textContent,height:box.height,groupCenterError:Math.abs((l.left+v.right)/2-(box.left+box.width/2)),labelCenterError:Math.abs(l.y+l.height/2-box.y-box.height/2),valueCenterError:Math.abs(v.y+v.height/2-box.y-box.height/2),gap:v.left-l.right,labelTop:l.y,valueTop:v.y,labelSize:getComputedStyle(label).fontSize,valueSize:font.fontSize,figures:font.fontVariantNumeric,labelFits:lt.width<=l.width+1,valueFits:vt.width<=v.width+1};
 }));
 assert.equal(measured.length,7);assert.ok(measured.every((v:any)=>v.groupCenterError<=1&&v.labelCenterError<=1&&v.valueCenterError<=1&&Math.abs(v.gap-8)<=1&&v.labelFits&&v.valueFits),JSON.stringify(measured));
 assert.equal(new Set(measured.map((v:any)=>v.labelTop)).size,1);assert.equal(new Set(measured.map((v:any)=>v.valueTop)).size,1);
 assert.ok(measured.every((v:any)=>v.labelSize==='12px'&&v.valueSize==='22px'&&v.figures.includes('tabular-nums')&&v.height===(page.viewportSize().width<760?58:64)),JSON.stringify(measured));
 assert.equal(await page.locator('.status-strip small').count(),0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 measurements.push({name,width:page.viewportSize().width,cards:measured});
 const strip=page.locator('.status-strip');await strip.evaluate((n:HTMLElement)=>n.scrollLeft=0);await shot(page,name+'-left');await strip.evaluate((n:HTMLElement)=>n.scrollLeft=n.scrollWidth);await shot(page,name+'-right');
}
async function button(page:any,name:string){
 const b=page.locator('[data-save-all]');await b.evaluate((n:HTMLElement)=>n.scrollIntoView({block:'center'}));await settleBusinessUI(page);
 const v=await b.evaluate((n:HTMLElement)=>{const box=n.getBoundingClientRect(),r=document.createRange();r.selectNodeContents(n);const text=r.getBoundingClientRect(),style=getComputedStyle(n);return {text:n.textContent,height:box.height,font:style.font,fontSize:style.fontSize,lineHeight:style.lineHeight,centerX:Math.abs(text.x+text.width/2-box.x-box.width/2),centerY:Math.abs(text.y+text.height/2-box.y-box.height/2),padding:style.padding,disabled:(n as HTMLButtonElement).disabled};});
 assert.equal(v.height,36);assert.equal(v.fontSize,'13px');assert.equal(v.lineHeight,'20px');assert.ok(v.centerX<=1&&v.centerY<=2.5,JSON.stringify(v));assert.doesNotMatch(v.text,/（|）/);measurements.push({name,width:page.viewportSize().width,button:v});await shot(page,name);
}
try{
 // 真实四位数月排期；一/二/三位数及零值分别由实际发布与推广状态得出。
 const contents=await db.insert(s.operationsContent).values(Array.from({length:1000},()=>({platformNoteId:randomUUID().replaceAll('-','').slice(0,24)}))).returning();
 const versions=await db.insert(s.operationsContentVersion).values(contents.map((c,i)=>({contentId:c.id,versionNumber:0,workType:'new',contentName:i<12?`统计计数验收推广${i+1}`:`隔离排期样本${i+1}`,subjectId:'tmua',categoryId:'non-promotional-handout'}))).returning();
 const posts=await db.insert(s.operationsContentSchedule).values(versions.map((v,i)=>({contentVersionId:v.id,isPromoted:i<12,promotionStatus:i<11?'testing':i===11?'scaling':'none',completionStatus:i<100?'pending':'on_time',plannedPublishAt:new Date(i<99?'2026-10-31T09:00:00+08:00':'2026-10-29T09:00:00+08:00'),actualPublishAt:i<100?null:new Date('2026-10-29T09:00:00+08:00')}))).returning();
 // 推广记录必须已发布；保留未来待发布87项和一项超时未登记。
 for(let i=0;i<12;i++)await db.update(s.operationsContentSchedule).set({plannedPublishAt:new Date('2026-10-29T09:00:00+08:00'),actualPublishAt:new Date('2026-10-29T09:00:00+08:00'),completionStatus:'on_time'}).where(eq(s.operationsContentSchedule.id,posts[i].id));
 const campaigns=await db.insert(s.operationsPromotionCampaign).values(posts.slice(0,12).map((p,i)=>({scheduleId:p.id,startedOn:'2026-10-29',dailyReviewEnabledOn:'2026-10-29',initialStage:i===11?'scaling':'testing',currentStage:i===11?'scaling':'testing',currentStatus:i===11?'scaling':'testing'}))).returning();
 await db.insert(s.operationsPromotionStage).values(campaigns.map(c=>({campaignId:c.id,stageType:c.currentStage!,startedOn:'2026-10-29'})));
 const pw=await import(process.env.PLAYWRIGHT_MODULE||new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);browser=await pw.chromium.launch({headless:true});
 const context=await browser.newContext({locale:'zh-CN',reducedMotion:'reduce'});let login=await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:admin});assert.equal(login.status(),200);let page=await context.newPage();page.on('pageerror',(e:Error)=>errors.push(e.message));page.setDefaultTimeout(15000);
 for(const width of widths){
  await page.setViewportSize({width,height:width<500?780:1000});
  for(const display of ['calendar','ledger']){await page.goto(baseURL+`/business/operations-schedule?display=${display}`);await page.locator('.status-strip').waitFor();await stats(page,`schedule-${display}-${width}`);assert.equal(await page.locator('.status-strip strong').first().innerText(),'1000');}
  await page.goto(baseURL+'/business/operations-schedule?view=promotion&promotion=testing');await stats(page,`schedule-testing-${width}`);assert.ok(await page.locator('.testing-summary.active').isVisible());
  await page.goto(baseURL+'/business/operations-schedule?month=2026-11');await stats(page,`schedule-zero-${width}`);assert.equal(await page.locator('.status-strip strong').first().innerText(),'0');
 }
 await context.close();checks.push('五档月历／台账／筛选／零值，1至4位真实数字，内容组双向居中、8px间距、横滚首尾');
 // 桌面和手机各实际完成一次十二项批量保存；第二天由同一正式T+1规则重新开放。
 for(const mobile of [false,true]){
  if(mobile)await writeFile(clockFile,'2026-10-31T12:00:00+08:00');
  const startWidth=mobile?390:1440,tag=mobile?'mobile':'desktop';
  const c=await browser.newContext({viewport:{width:startWidth,height:mobile?780:1000},locale:'zh-CN',...(mobile?{isMobile:true,hasTouch:true}:{}),recordVideo:{dir:folder+'/video',size:{width:startWidth,height:mobile?780:1000}}});
  login=await c.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:mobile?employee:admin});assert.equal(login.status(),200);page=await c.newPage();await page.clock.setFixedTime(new Date(mobile?'2026-10-31T12:00:00+08:00':'2026-10-30T12:00:00+08:00'));page.setDefaultTimeout(15000);page.on('pageerror',(e:Error)=>errors.push(e.message));
  await page.goto(baseURL+'/business/daily-promotion-review');const forms=page.locator('#daily-table [data-review-container=ready] [data-metric-form]');assert.equal(await forms.count(),12);const batch=page.locator('[data-save-all]');assert.equal(await batch.innerText(),'一键保存 (12)');
  for(const width of mobile?[390,320]:[1920,1440,1024]){await page.setViewportSize({width,height:mobile?780:1000});await button(page,`batch-default-${width}`);}
  for(let i=0;i<12;i++){const f=forms.nth(i);for(const name of ['spend','platformOpenCount','actualOpenCount','platformLeadCount','actualLeadCount'])await f.locator(`[name=${name}]`).fill(name==='spend'?'123.45':'1');await f.locator('[name=reviewDecision]').selectOption((await f.getAttribute('data-current-stage'))==='scaling'?'scaling_continue':'test_continue');}
  let release:()=>void=()=>{};await page.route('**/api/promotion-daily/batch',async(route:any)=>{await new Promise<void>(resolve=>release=resolve);await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'模拟连接失败，整批输入已保留，可重试。'})});});
  await batch.click();await batch.filter({hasText:'正在保存…'}).waitFor();for(const width of mobile?[390,320]:[1920,1440,1024]){await page.setViewportSize({width,height:mobile?780:1000});await button(page,`batch-saving-${width}`);}release();await page.locator('[data-form-message]').filter({hasText:'模拟连接失败，整批输入已保留，可重试。'}).first().waitFor();assert.equal(await forms.first().locator('[name=spend]').inputValue(),'123.45');assert.equal(await batch.innerText(),'一键保存 (12)');for(const width of mobile?[390,320]:[1920,1440,1024]){await page.setViewportSize({width,height:mobile?780:1000});await button(page,`batch-failure-${width}`);}await page.unroute('**/api/promotion-daily/batch');
  let releaseRefresh:()=>void=()=>{},refreshStarted:()=>void=()=>{};const refreshing=new Promise<void>(resolve=>refreshStarted=resolve);await page.route('**/business/daily-promotion-review',async(route:any)=>{if(route.request().method()!=='GET')return route.continue();refreshStarted();await new Promise<void>(resolve=>releaseRefresh=resolve);await route.continue();});
  const saved=page.waitForResponse((r:any)=>r.url().endsWith('/api/promotion-daily/batch')&&r.request().method()==='POST');await batch.click();const response=await saved;assert.equal(response.status(),201,await response.text());await page.getByRole('button',{name:'全部已保存',exact:true}).waitFor();await refreshing;
  for(const width of mobile?[390,320]:[1920,1440,1024]){await page.setViewportSize({width,height:mobile?780:1000});await button(page,`batch-success-${width}`);}
  releaseRefresh();await page.getByRole('button',{name:'一键保存 (0)',exact:true}).waitFor();assert.equal(await batch.isDisabled(),true);for(const width of mobile?[390,320]:[1920,1440,1024]){await page.setViewportSize({width,height:mobile?780:1000});await button(page,`batch-disabled-${width}`);}
  const metrics=await db.select().from(s.operationsPromotionDailyMetric);assert.equal(metrics.length,mobile?24:12);
  if(!mobile){await page.setViewportSize({width:1440,height:1000});await page.goto(baseURL+'/business/non-promotion-review');await shot(page,'non-promotion-summary-1440');await page.goto(baseURL+'/business/daily-promotion-review?view=history');await shot(page,'promotion-history-counts-1440');await openPostLookup(page);await page.locator('[data-post-lookup] input').fill('统计计数验收推广1');await page.locator('[data-post-lookup] button[type=submit]').click();await page.locator('.lookup-result').first().click();await page.getByText('已登记日度数据 (1 条)',{exact:true}).waitFor();await page.getByText('已登记日度数据 (1 条)',{exact:true}).scrollIntoViewIfNeeded();await shot(page,'lookup-count-1440');}
  const video=page.video();await c.close();if(video){const path=`${folder}/video/${tag}.webm`;await video.saveAs(path);videos.push(path);}
 }
 checks.push('管理员桌面／员工触屏真实十二项批量保存、503保留重试、服务端落库、成功／禁用五档、次日回显；查帖和同类摘要');
 assert.deepEqual(errors,[]);await writeFile(folder+'/result.json',JSON.stringify({passed:true,checks,measurements,errors,videos},null,2));console.log(JSON.stringify({passed:true,checks,folder}));
}catch(error){console.error(fixture.logs().slice(-3000));throw error;}finally{await browser?.close();await fixture.stop();}
