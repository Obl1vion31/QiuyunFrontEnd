/** 正式工作台与只读查帖；数据、账号和失败重试只使用隔离 PGlite。 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startFixture,admin} from './auth.fixture';
import {openPostLookup,settleBusinessUI} from './business-confirm.helper';
import {previousDateKey,shanghaiDateKey} from '../src/db/promotion-rules.mjs';
import * as schema from '../src/db/schema';

const folder=process.env.ASSISTANT_EVIDENCE_DIR||'.tools/test-artifacts/workspace-assistant';
await mkdir(folder,{recursive:true});
const fixture=await startFixture(),{db,baseURL}=fixture;
let browser:any;const checks:string[]=[],errors:string[]=[];
const shot=async(page:any,name:string)=>{await settleBusinessUI(page);await page.screenshot({path:`${folder}/${name}.png`});};
const close=async(page:any)=>{await page.keyboard.press('Escape');await page.locator('[data-post-lookup]').waitFor({state:'hidden'});};
try{
 const today=shanghaiDateKey(new Date()),start=previousDateKey(previousDateKey(today));
 let firstId='';
 for(let i=0;i<23;i++){
  const [content]=await db.insert(schema.operationsContent).values({platformNoteId:String(i+1).padStart(24,'0')}).returning();
  const [version]=await db.insert(schema.operationsContentVersion).values({contentId:content.id,versionNumber:0,workType:'new',contentName:`助手验收样本 ${String(i+1).padStart(2,'0')} · 长名称内容阅读与排期`,subjectId:'tmua',categoryId:'temporary',projectDocUrl:'https://example.com/document'}).returning();
  const [schedule]=await db.insert(schema.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:new Date(start+'T12:00:00Z'),actualPublishAt:new Date(start+'T12:00:00Z'),isPromoted:i===0,promotionStatus:i===0?'testing':'none',completionStatus:'on_time'}).returning();
  if(i===0){firstId=schedule.id;const [campaign]=await db.insert(schema.operationsPromotionCampaign).values({scheduleId:firstId,startedOn:start,initialStage:'testing',currentStage:'testing',currentStatus:'testing'}).returning();await db.insert(schema.operationsPromotionStage).values({campaignId:campaign.id,stageType:'testing',startedOn:start});}
 }
 const response=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(admin)});assert.equal(response.status,200);
 const cookies=response.headers.getSetCookie().map(value=>{const pair=value.split(';')[0],i=pair.indexOf('=');return {name:pair.slice(0,i),value:pair.slice(i+1),url:baseURL};});
 const playwright=await import(process.env.PLAYWRIGHT_MODULE||new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);browser=await playwright.chromium.launch({headless:true});
 for(const width of [1920,1440,1024,390,320]){
  const context=await browser.newContext({viewport:{width,height:width<500?780:1000},...(width<500?{isMobile:true,hasTouch:true}:{}),...(width===1440||width===390?{recordVideo:{dir:folder+'/video',size:{width:Math.min(width,1440),height:width<500?780:1000}}}:{})});await context.addCookies(cookies);const page=await context.newPage();page.on('pageerror',(error:Error)=>errors.push(error.message));
  for(const path of ['daily-promotion-review','operations-schedule']){
   await page.goto(baseURL+'/business/'+path);await settleBusinessUI(page);
   assert.equal(await page.locator('.business-tools,[data-tools-trigger]').count(),0);
   const selected=await page.locator('[data-business-console-sidebar] [aria-current=page]').getAttribute('data-module-id');
   const before=await page.locator('.business-console-content').boundingBox();
   if(width>900){const entry=page.locator('.business-assistant-entry--sidebar'),box=await entry.boundingBox(),account=await page.locator('.business-sidebar__account').boundingBox();assert.ok(box&&box.height>=64&&box.width>=190&&account&&box.y+box.height<account.y);await entry.hover();assert.equal(await page.locator('[data-post-lookup][open]').count(),0);}
   await shot(page,`${path}-entry-${width}`);
   if(width<500){await page.locator('.business-account--toolbar [data-account-trigger]').tap();await shot(page,`${path}-account-${width}`);await page.locator('.business-assistant-entry--menu').tap();await settleBusinessUI(page);}else await openPostLookup(page);
   const dialog=page.locator('[data-post-lookup]');assert.equal(await dialog.getAttribute('aria-labelledby'),'post-lookup-title');assert.ok(await dialog.getByRole('heading',{name:'想找哪篇帖子？',exact:true}).isVisible());assert.equal(await dialog.locator('.assistant-capabilities button:disabled').count(),3);
   const after=await page.locator('.business-console-content').boundingBox();for(const key of ['x','y','width','height'])assert.ok(Math.abs(before[key]-after[key])<=1,`${path} ${width} 打开助手不改变正文${key}`);
   assert.equal(await page.locator('[data-business-console-sidebar] [aria-current=page]').getAttribute('data-module-id'),selected);
   assert.ok(await dialog.locator('input').evaluate((n:HTMLElement)=>document.activeElement===n));
   assert.ok(await dialog.evaluate((n:HTMLElement)=>n.scrollWidth<=n.clientWidth));await shot(page,`${path}-assistant-${width}`);
   await close(page);const returned=page.locator(width>900?'.business-assistant-entry--sidebar':'.business-account--toolbar [data-account-trigger]');assert.ok(await returned.evaluate((n:HTMLElement)=>document.activeElement===n));
  }
  checks.push(`${width}px推广与排期入口、助手首屏、正文几何、触屏和焦点返回`);
  await page.goto(baseURL+'/business/daily-promotion-review');await settleBusinessUI(page);
  const spend=page.locator(`[data-metric-form][data-schedule-id="${firstId}"] [name=spend]`).first();await spend.fill('123.45');const initialNode=await spend.evaluateHandle((n:HTMLElement)=>n),scroll=await page.evaluate(()=>scrollY);
  await openPostLookup(page);await page.locator('[data-post-lookup] input').fill('助手验收样本');await page.locator('[data-post-lookup] button[type=submit]').click();await page.locator('.lookup-result').nth(19).waitFor();await page.locator('[data-lookup-more]').click();await page.locator('.lookup-result').nth(22).waitFor();
  assert.equal(await page.locator('.lookup-result').count(),23);assert.ok(await page.locator('.assistant-capabilities').isHidden());await shot(page,`search-results-${width}`);
  const result=page.locator(`.lookup-result[data-post-id="${firstId}"]`);await result.scrollIntoViewIfNeeded();const resultScroll=await page.locator('.lookup-body').evaluate((n:HTMLElement)=>n.scrollTop);await result.click();await page.locator('[data-lookup-detail]:not([hidden])').waitFor();await shot(page,`search-detail-${width}`);
  if(width<500){const touch=await context.newCDPSession(page);await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:160,y:650}]});for(let y=610;y>=250;y-=40)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:160,y}]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(()=>document.querySelector('.lookup-body')!.scrollTop>0);await shot(page,`search-touch-${width}`);}
  await page.locator('.lookup-body').evaluate((n:HTMLElement)=>n.scrollTop=n.scrollHeight);await shot(page,`search-bottom-${width}`);assert.ok(await page.locator('.lookup-body').evaluate((n:HTMLElement)=>n.scrollHeight-n.clientHeight-n.scrollTop<3));
  await page.locator('[data-lookup-back]').click();assert.ok(Math.abs(await page.locator('.lookup-body').evaluate((n:HTMLElement)=>n.scrollTop)-resultScroll)<=1);await close(page);assert.equal(await spend.inputValue(),'123.45');assert.ok(await spend.evaluate((n:HTMLElement,original:HTMLElement)=>n===original,initialNode));assert.equal(await page.evaluate(()=>scrollY),scroll);
  await openPostLookup(page);assert.equal(await page.locator('.lookup-result').count(),23);await page.locator('[data-post-lookup] input').fill('不存在的助手验收样本');await page.locator('[data-post-lookup] button[type=submit]').click();await page.getByText('没有找到匹配的帖子',{exact:true}).waitFor();await shot(page,`search-empty-${width}`);
  await page.route('**/api/content-search?q=*',async(route:any)=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'查找暂时不可用，请重试。'})}));await page.locator('[data-post-lookup] input').fill('助手验收样本');await page.locator('[data-post-lookup] button[type=submit]').click();await page.getByText('查找暂时不可用，请重试。',{exact:true}).waitFor();assert.equal(await page.locator('[data-post-lookup] input').inputValue(),'助手验收样本');await shot(page,`search-failure-${width}`);await page.unroute('**/api/content-search?q=*');await page.locator('[data-post-lookup] button[type=submit]').click();await page.locator('.lookup-result').nth(19).waitFor();await close(page);
  checks.push(`${width}px分页、详情末尾、返回位置、原指标草稿与节点、空态及失败重试`);
  const released=page.waitForResponse((response:any)=>response.url().includes('/api/collaboration/locks')&&response.request().method()==='DELETE');await page.locator('[data-module-id=annual-plan]').click();await page.locator('[data-confirm-accept]').click();await page.waitForURL('**/business/annual-plan');await released;
  await context.close();
 }
 const context=await browser.newContext({viewport:{width:1024,height:600},reducedMotion:'reduce'});await context.addCookies(cookies);const page=await context.newPage();
 for(const path of ['annual-plan','operations-schedule','daily-promotion-review','non-promotion-review','meeting-review','settings']){await page.goto(baseURL+'/business/'+path);const entry=page.locator('.business-assistant-entry--sidebar');await settleBusinessUI(page);await entry.scrollIntoViewIfNeeded();const box=await entry.boundingBox();assert.ok(box&&box.y>=0&&box.y+box.height<=600);await shot(page,`${path}-short-1024`);await entry.focus();await page.keyboard.press('Enter');await page.locator('[data-post-lookup][open]').waitFor();await page.keyboard.press('Shift+Tab');assert.ok(await page.locator('[data-post-lookup]').evaluate((n:HTMLElement)=>n.contains(document.activeElement)));await close(page);}
 await page.setViewportSize({width:1440,height:1000});await page.goto(baseURL+'/business/daily-promotion-review');await page.evaluate(()=>{(window as any).__assistantEntry=document.querySelector('.business-assistant-entry--sidebar');});await page.locator('[data-module-id=schedule]').click();await page.waitForURL('**/business/operations-schedule');assert.ok(await page.evaluate(()=>(window as any).__assistantEntry===document.querySelector('.business-assistant-entry--sidebar')));await openPostLookup(page);await close(page);assert.equal(await page.locator('.business-assistant-entry--sidebar').getAttribute('aria-expanded'),'false');
 await context.close();checks.push('六页短窗口、键盘与减少动态效果、跨页入口节点和状态');
 assert.deepEqual(errors,[]);await writeFile(folder+'/result.json',JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,checks,folder}));
}finally{await browser?.close();await fixture.stop();}
