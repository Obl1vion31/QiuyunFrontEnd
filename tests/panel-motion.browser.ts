/** 用真实逐帧几何验证面板、遮罩和背景连续性；全部写入隔离库。 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startFixture,admin} from './auth.fixture';
import * as s from '../src/db/schema';
const fixture=await startFixture();let browser:any;
const results:any[]=[];
try{
 const [content]=await fixture.db.insert(s.operationsContent).values({}).returning();const [version]=await fixture.db.insert(s.operationsContentVersion).values({contentId:content.id,versionNumber:0,workType:'new',contentName:'虚构面板连续性核对帖',subjectId:'tmua',categoryId:'temporary'}).returning();const [schedule]=await fixture.db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:new Date(Date.now()+3600000),completionStatus:'pending'}).returning();
 const response=await fetch(fixture.baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:fixture.baseURL,'Content-Type':'application/json'},body:JSON.stringify(admin)});assert.equal(response.status,200);const cookies=response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 const pw=await import(process.env.PLAYWRIGHT_MODULE||new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);browser=await pw.chromium.launch({headless:true});await mkdir('.tools/test-artifacts',{recursive:true});const errors:string[]=[];
 for(const width of [1440,1280,390,320]){
  const context=await browser.newContext({viewport:{width,height:700},reducedMotion:'no-preference'});await context.addCookies(cookies.split('; ').map(c=>({name:c.slice(0,c.indexOf('=')),value:c.slice(c.indexOf('=')+1),url:fixture.baseURL})));const page=await context.newPage();page.on('pageerror',(error:Error)=>errors.push(error.message));page.on('dialog',(dialog:any)=>{errors.push('出现原生弹框：'+dialog.type());void dialog.dismiss();});await page.goto(fixture.baseURL+'/business/operations-schedule');
  const openInspector=async()=>{await page.locator(`[data-inspect-id="${schedule.id}"]`).first().evaluate((n:HTMLElement)=>n.click());await page.locator('[data-inspector].is-open').waitFor();await page.waitForTimeout(250);};
  const capture=async(selector:string,action:()=>Promise<unknown>,opening=false)=>{
   await page.evaluate(`(()=>{const frames=[];window.__panelFrames=frames;window.__panelRecording=true;const element=document.querySelector(${JSON.stringify(selector)});function tick(){if(window.__panelFrames!==frames||!window.__panelRecording)return;const rect=element.getBoundingClientRect(),style=getComputedStyle(element),backdrop=getComputedStyle(element,'::backdrop'),calendar=document.querySelector('.content-stage').getBoundingClientRect();frames.push({visible:element instanceof HTMLDialogElement?element.open:!element.hidden,x:rect.x,width:rect.width,opacity:Number(style.opacity),position:style.position,backdrop:Number(backdrop.opacity),calendarX:calendar.x,calendarWidth:calendar.width,rootWidth:document.documentElement.clientWidth,locked:document.documentElement.hasAttribute('data-business-scroll-locked'),scrollY});if(window.__panelRecording)requestAnimationFrame(tick);}tick();})()`);
   await action();await page.locator(selector).waitFor({state:opening?'visible':'hidden'});
   if(opening)await page.locator(selector).evaluate(async(node:HTMLElement)=>{await Promise.allSettled(node.getAnimations({subtree:true}).filter(animation=>(animation.effect as KeyframeEffect|null)?.target===node).map(animation=>animation.finished));});
   await page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');return await page.evaluate('(()=>{window.__panelRecording=false;return window.__panelFrames})()');
  };
  await page.evaluate(()=>window.scrollTo(0,120));
  const entering=await capture('[data-inspector]',()=>page.locator(`[data-inspect-id="${schedule.id}"]`).first().evaluate((n:HTMLElement)=>n.click()),true),start=entering[0],arrived=entering.at(-1);
  assert.ok(arrived.visible&&arrived.opacity>.99);assert.ok(entering.every((f:any)=>Math.abs(f.rootWidth-start.rootWidth)<=1&&Math.abs(f.scrollY-start.scrollY)<=1),'详情进入不移动页面或滚动条');
  if(width<=1240)assert.ok(entering.every((f:any)=>Math.abs(f.calendarWidth-start.calendarWidth)<=1&&Math.abs(f.calendarX-start.calendarX)<=1),'覆盖详情进入不改变日历布局');
  results.push({width,name:'详情进入',frames:entering});
  for(const [name,button,selector]of [['发布登记','[data-inspector-publication]','#publication-dialog'],['编辑排期','[data-inspector-edit]','#schedule-dialog'],['创建改帖','[data-inspector-revise]','#schedule-dialog']]){
   const opening=await capture(selector,()=>page.locator(button).evaluate((n:HTMLElement)=>n.click()),true),opened=opening.filter((f:any)=>f.visible),before=opening[0],ready=opened.at(-1);
   assert.ok(opened.length>2&&ready.opacity>.99&&ready.backdrop>.99,`${name} 面板和遮罩连续进入`);
   assert.ok(opened.every((f:any)=>f.position==='fixed'&&Math.abs(f.width-ready.width)<=1&&f.locked),`${width}px ${name} 进入几何与锁：${JSON.stringify(opened)}`);
   assert.ok(opening.every((f:any)=>Math.abs(f.calendarWidth-before.calendarWidth)<=1&&Math.abs(f.calendarX-before.calendarX)<=1&&Math.abs(f.rootWidth-before.rootWidth)<=1&&Math.abs(f.scrollY-before.scrollY)<=1),`${width}px ${name} 进入时背景日历与滚动位置稳定`);results.push({width,name:name+'进入',frames:opening});
   const frames=await capture(selector,()=>page.locator(`${selector} .close-button`).click()),visible=frames.filter((f:any)=>f.visible),first=visible[0],last=visible.at(-1);
   assert.ok(visible.length>2);assert.ok(visible.every((f:any)=>f.position==='fixed'&&Math.abs(f.width-first.width)<=1),`${width}px ${name} 退出时保持面板几何`);assert.ok(last.opacity<.02&&last.backdrop<.02,`${width}px ${name} 面板和遮罩结束后才关闭：${JSON.stringify(last)}`);
   assert.ok(frames.every((f:any)=>Math.abs(f.calendarWidth-first.calendarWidth)<=1&&Math.abs(f.calendarX-first.calendarX)<=1&&Math.abs(f.rootWidth-first.rootWidth)<=1&&Math.abs(f.scrollY-first.scrollY)<=1),`${width}px ${name} 关闭时背景日历与滚动位置稳定`);assert.ok(visible.every((f:any)=>f.locked));
   assert.equal(await page.evaluate(()=>document.documentElement.hasAttribute('data-business-scroll-locked')),width<=900,'抽屉关闭后保留手机详情的外层滚动锁');results.push({width,name,frames});
  }
  const frames=await capture('[data-inspector]',()=>page.locator('[data-close-inspector]').click()),visible=frames.filter((f:any)=>f.visible),first=visible[0],last=visible.at(-1),end=frames.at(-1);
  assert.ok(visible.every((f:any)=>f.position===first.position),'Inspector 可见期间不从 fixed 切成 sticky');assert.ok(last.opacity<.02);assert.ok(Math.abs(last.calendarWidth-end.calendarWidth)<=1,'Inspector 隐藏的最后一帧不改变日历宽度');
  if(width<=1240)assert.ok(frames.every((f:any)=>Math.abs(f.calendarWidth-first.calendarWidth)<=1&&Math.abs(f.calendarX-first.calendarX)<=1),'覆盖详情不改变背景日历布局');
  assert.equal(await page.evaluate(()=>document.documentElement.hasAttribute('data-business-scroll-locked')),false);results.push({width,name:'详情',frames});
  // 快速开合撤销旧退出任务，嵌套确认不提前恢复滚动条。
  await openInspector();await page.evaluate(`(()=>{const pane=document.querySelector('[data-inspector]');pane.dispatchEvent(new CustomEvent('business:inspector-close'));requestAnimationFrame(()=>pane.dispatchEvent(new CustomEvent('business:inspector-select',{detail:{id:${JSON.stringify(schedule.id)}}})));})()`);await page.waitForTimeout(300);assert.equal(await page.locator('[data-inspector]').isVisible(),true);assert.equal(await page.locator('[data-inspector]').getAttribute('data-closing'),null);
  await page.locator('[data-inspector-edit]').evaluate((n:HTMLElement)=>n.click());await page.waitForTimeout(250);await page.evaluate(`(()=>{const sheet=document.querySelector('#schedule-dialog');sheet.close();requestAnimationFrame(()=>sheet.showModal());})()`);await page.waitForTimeout(300);assert.equal(await page.locator('#schedule-dialog').evaluate((n:HTMLDialogElement)=>n.open),true);
  await page.evaluate(()=>{void window.businessConfirm('虚构嵌套确认');});await page.locator('[data-business-confirm][open]').waitFor();await page.keyboard.press('Escape');await page.locator('[data-business-confirm]').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>document.documentElement.hasAttribute('data-business-scroll-locked')),true);await page.locator('#schedule-dialog .close-button').click();await page.locator('#schedule-dialog').waitFor({state:'hidden'});await page.locator('[data-close-inspector]').click();await page.locator('[data-inspector]').waitFor({state:'hidden'});
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator(`[data-inspect-id="${schedule.id}"]`).first().evaluate((n:HTMLElement)=>n.click());await page.locator('[data-inspector].is-open').waitFor();await page.locator('[data-inspector-edit]').evaluate((n:HTMLElement)=>n.click());await page.keyboard.press('Escape');await page.locator('#schedule-dialog').waitFor({state:'hidden'});assert.equal(await page.locator('#schedule-dialog').evaluate((n:HTMLElement)=>n.getAnimations().length),0);await page.keyboard.press('Escape');await page.locator('[data-inspector]').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>document.documentElement.hasAttribute('data-business-scroll-locked')),false);
  await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile('.tools/test-artifacts/panel-motion-regression.json',JSON.stringify(results));console.log('通过：1440/1280/390/320px 详情、发布、编辑、改帖进出逐帧几何、遮罩终帧、背景日历、非零滚动位置、滚动锁、快速重开、嵌套确认和减少动态效果。');
}catch(error){console.error(fixture.logs().slice(-4000));throw error;}finally{await browser?.close();await fixture.stop();}
