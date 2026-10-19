/** 单帖卡片的真实尺寸、完整文本、条件字段与连续填写；只使用隔离数据库。 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startFixture,employee} from './auth.fixture';
import * as s from '../src/db/schema';
import {previousDateKey,shanghaiDateKey} from '../src/db/promotion-rules.mjs';

const fixture=await startFixture();let browser:any;
const folder=`.tools/test-artifacts/review-cards-${process.env.CARD_CAPTURE_TAG||'verified'}`;
try{
 const day=previousDateKey(shanghaiDateKey(new Date())),ids:string[]=[];
 for(const knownId of [true,false]){
  const [content]=await fixture.db.insert(s.operationsContent).values({platformNoteId:knownId?'a'.repeat(24):null}).returning();
  const [version]=await fixture.db.insert(s.operationsContentVersion).values({contentId:content.id,versionNumber:0,workType:'new',contentName:'虚构面试课发布与复盘数据核对帖',subjectId:'tmua',categoryId:'temporary'}).returning();
  const [schedule]=await fixture.db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:new Date(day+'T18:00+08:00'),actualPublishAt:new Date(day+'T18:00+08:00'),isPromoted:true,promotionStatus:'testing',completionStatus:'on_time'}).returning();ids.push(schedule.id);
  const [campaign]=await fixture.db.insert(s.operationsPromotionCampaign).values({scheduleId:schedule.id,startedOn:day,initialStage:'testing',currentStage:'testing',currentStatus:'testing'}).returning();
  await fixture.db.insert(s.operationsPromotionStage).values({campaignId:campaign.id,stageType:'testing',startedOn:day});
 }
 const login=await fetch(fixture.baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:fixture.baseURL,'Content-Type':'application/json'},body:JSON.stringify(employee)});assert.equal(login.status,200);
 const pw=await import(process.env.PLAYWRIGHT_MODULE||new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);browser=await pw.chromium.launch({headless:true});await mkdir(folder,{recursive:true});
 const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'});await context.addCookies(login.headers.getSetCookie().map(cookie=>{const pair=cookie.split(';')[0];return {name:pair.slice(0,pair.indexOf('=')),value:pair.slice(pair.indexOf('=')+1),url:fixture.baseURL};}));
 const page=await context.newPage(),errors:string[]=[],measurements:any[]=[];page.on('pageerror',(e:Error)=>errors.push(e.message));page.on('dialog',(dialog:any)=>{errors.push(dialog.type());void dialog.dismiss();});
 await page.goto(fixture.baseURL+'/business/daily-promotion-review');
 const card=(id:string)=>page.locator(`[data-metric-form][data-schedule-id="${id}"]`);
 for(const id of ids){for(const [name,value]of Object.entries({spend:'123456.78',platformOpenCount:'123456',actualOpenCount:'1',platformLeadCount:'98765',actualLeadCount:'2'}))await card(id).locator(`[name=${name}]`).fill(value);await card(id).locator('[name=reviewDecision]').selectOption('test_continue');}
 await page.evaluate(()=>(document.activeElement as HTMLElement)?.blur());
 for(const width of [1920,1600,1440,1366,1280,1080,900,768,600,390,320]){
  await page.setViewportSize({width,height:1100});
  for(const [index,id]of ids.entries()){
   const form=card(id);await form.evaluate((n:HTMLElement)=>n.scrollIntoView({block:'center'}));
   await form.screenshot({path:`${folder}/${width}-${index?'missing-id':'known-id'}.png`});
   measurements.push(await form.evaluate((node:HTMLElement)=>{
    const form=node.getBoundingClientRect(),entry=node.querySelector<HTMLElement>('.review-entry-data')!.getBoundingClientRect(),header=node.querySelector('header')!.getBoundingClientRect();
    const controls=[...node.querySelectorAll<HTMLElement>('.review-metric-inputs input,.review-cost output,.review-decision select,.review-completion button')];
    const fields=controls.map(input=>{const style=getComputedStyle(input),rect=input.getBoundingClientRect(),canvas=document.createElement('canvas').getContext('2d')!;canvas.font=style.font;const value=(input as HTMLInputElement).value??input.textContent??'';return {left:rect.left,top:rect.top,width:rect.width,height:rect.height,font:style.fontFamily,size:parseFloat(style.fontSize),textFits:canvas.measureText(value).width+parseFloat(style.paddingLeft)+parseFloat(style.paddingRight)+(input.tagName==='INPUT'?16:0)<=input.clientWidth};});
    return {viewport:innerWidth,id:node.dataset.scheduleId,width:form.width,height:form.height,overflow:node.scrollWidth>node.clientWidth+1,headerHeight:header.height,dataTop:entry.top-form.top,fields,costText:[...node.querySelectorAll<HTMLElement>('.review-cost dt,.review-cost output')].map(text=>{const range=document.createRange();range.selectNodeContents(text);return {text:text.textContent,width:range.getBoundingClientRect().width,available:text.getBoundingClientRect().width,size:parseFloat(getComputedStyle(text).fontSize)};})};
   }));
  }
 }
 await writeFile(`${folder}/measurements.json`,JSON.stringify(measurements,null,2));
 for(const item of measurements){
  assert.equal(item.overflow,false,`${item.viewport}px 卡片不溢出`);
  assert.ok(item.fields.every((f:any)=>f.width>=111&&Math.abs(f.height-40)<=1&&f.size>=13&&f.font.includes('PingFang')&&f.textFits),`${item.viewport}px 输入宽度能完整阅读金额和人数：${JSON.stringify(item.fields)}`);
  assert.ok(Math.max(...item.fields.map((f:any)=>f.width))-Math.min(...item.fields.map((f:any)=>f.width))<=1,'九项控件与结果等宽');
  assert.ok(item.costText.every((t:any)=>t.width<=t.available+1&&t.size>=13),`${item.viewport}px 成本标签与数值完整清楚：${JSON.stringify(item.costText)}`);
  for(const field of item.fields){const peers=item.fields.filter((other:any)=>Math.abs(other.top-field.top)<3);assert.ok(peers.every((other:any)=>Math.abs(other.top-field.top)<=1),'同行控件底边与顶部对齐');}
 }
 for(const width of new Set(measurements.map(item=>item.viewport))){const pair=measurements.filter(item=>item.viewport===width);assert.ok(Math.abs(pair[0].headerHeight-pair[1].headerHeight)<=1&&Math.abs(pair[0].dataTop-pair[1].dataTop)<=1,`${width}px 有无 ID 沿用同一结构与数据起点`);}
 const missing=card(ids[1]);await missing.locator('.review-note-field label').click();assert.equal(await missing.locator('[name=platformNoteId]').evaluate((node:HTMLElement)=>node===document.activeElement),true,'ID 标签关联真实输入');await missing.locator('[name=platformNoteId]').fill('b'.repeat(24));await missing.locator('[name=dayAction]').selectOption('pause');assert.equal(await missing.locator('.review-costs').isVisible(),false);assert.equal(await missing.locator('[name=platformNoteId]').isDisabled(),true);await missing.locator('[data-paused-note-id]').waitFor();await missing.screenshot({path:`${folder}/320-paused.png`});
 await missing.locator('[name=dayAction]').selectOption('active');assert.equal(await missing.locator('[name=platformNoteId]').inputValue(),'b'.repeat(24));assert.equal(await missing.locator('[name=spend]').inputValue(),'123456.78');await missing.locator('[name=actualLeadCount]').fill('0');assert.equal(await missing.locator('[data-lead-cost]').innerText(),'—');await missing.locator('[name=actualLeadCount]').fill('2');
 await page.route('**/api/promotion-daily',async(route:any)=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'虚构保存失败，请重试。'})}));await missing.getByRole('button',{name:'完成复盘',exact:true}).click();await missing.locator('[data-form-message]').getByText('虚构保存失败，请重试。',{exact:true}).waitFor();await missing.screenshot({path:`${folder}/320-save-error.png`});assert.equal(await missing.locator('[name=spend]').inputValue(),'123456.78');await page.unroute('**/api/promotion-daily');
 await missing.getByRole('button',{name:'完成复盘',exact:true}).click();await missing.waitFor({state:'hidden'});assert.equal((await fixture.db.select().from(s.operationsPromotionDailyMetric)).length,1);assert.equal(await card(ids[0]).locator('[name=spend]').inputValue(),'123456.78');
 const [saved]=await fixture.db.select().from(s.operationsContentSchedule).where(eq(s.operationsContentSchedule.id,ids[1]));const [version]=await fixture.db.select().from(s.operationsContentVersion).where(eq(s.operationsContentVersion.id,saved.contentVersionId));const [content]=await fixture.db.select().from(s.operationsContent).where(eq(s.operationsContent.id,version.contentId));assert.equal(content.platformNoteId,'b'.repeat(24));
 assert.deepEqual(errors,[]);await context.close();console.log('通过：11 种屏宽的输入可读宽度、成本完整文字、操作比例、有无笔记 ID 一致结构、暂停草稿、零分母、失败重试及真实保存。截图与计算尺寸已留存供视觉审查。');
}catch(error){console.error(fixture.logs().slice(-3000));throw error;}finally{await browser?.close();await fixture.stop();}
