import assert from 'node:assert/strict';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {admin,employee} from './auth.fixture';
import {prepareMonthlyArrangement} from './monthly-arrangement.fixture';
import {seedLinkPost} from './monthly-plan-links.fixture';
import {settleBusinessUI,respondToBusinessConfirm} from './business-confirm.helper';
import * as s from '../src/db/schema';

const before=process.env.INSPECTOR_SCROLL_BEFORE==='1';
const dir=process.env.INSPECTOR_SCROLL_DIR??'.tools/test-artifacts/inspector-scroll-stability';
await mkdir(dir+'/screenshots',{recursive:true});await mkdir(dir+'/video',{recursive:true});
const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-18T12:00:00+08:00');
const f=await startPostgresFixture({clockFile,entry:process.env.INSPECTOR_SCROLL_ENTRY});
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);let browser:any;
const checks:string[]=[],records:any[]=[],errors:string[]=[];
const readGeometry=()=>{
 const box=(selector:string)=>{const node=document.querySelector(selector),r=node?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null;};
 return {scrollY,bodyOverflow:getComputedStyle(document.body).overflowX,sidebar:box('.business-sidebar'),brand:box('.business-sidebar__brand'),toolbar:box('.business-toolbar'),content:box('.business-console-content'),locked:document.documentElement.hasAttribute('data-business-scroll-locked')};
};
function same(a:any,b:any,label:string){
 assert(Math.abs(a.scrollY-b.scrollY)<1,label+' 页面位置');
 for(const node of ['sidebar','brand','toolbar','content'])for(const key of ['x','y','width'])assert(Math.abs(a[node][key]-b[node][key])<1,`${label} ${node}.${key}: ${a[node][key]} → ${b[node][key]}`);
}
async function follow(page:any,link:any){
 await page.evaluate(()=>{(window as any).__scrollRouteReady=false;document.addEventListener('astro:page-load',()=>{(window as any).__scrollRouteReady=true;},{once:true});});
 await link.click();await page.waitForFunction(()=>(window as any).__scrollRouteReady===true);await settleBusinessUI(page);
}
try{
 const login=await fetch(f.baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:f.baseURL,'Content-Type':'application/json'},body:JSON.stringify(admin)});assert.equal(login.status,200);
 const cookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');await prepareMonthlyArrangement(f.db,f.baseURL,cookie);
 const source=await seedLinkPost(f.db,'排期位移核对 · 隔离样本','2026-11-17T12:00');
 await f.db.update(s.operationsContentSchedule).set({actualPublishAt:new Date('2026-11-17T14:00Z'),completionStatus:'delayed'}).where(eq(s.operationsContentSchedule.id,source.schedule.id));
 for(let i=0;i<28;i++)await seedLinkPost(f.db,`隔离内容 ${i+1}`,'2026-11-'+(i<8?'07':i<16?'17':'24')+'T18:00');
 browser=await chromium.launch({headless:true});
 for(const actor of before?[admin]:[admin,employee]){
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});await context.addInitScript(()=>{(window as any).__name=(v:any)=>v;});
  assert.equal((await context.request.post(f.baseURL+'/api/auth/sign-in/username',{headers:{Origin:f.baseURL},data:actor})).status(),200);
  const page=await context.newPage();page.on('pageerror',(e:Error)=>errors.push(e.message));
  const widths=before||actor.role==='employee'?[1440]:[1920,1440,1024];
  for(const width of widths)for(const display of before?['calendar']:['calendar','ledger']){
   await page.setViewportSize({width,height:1000});
   const url=f.baseURL+'/business/operations-schedule?month=2026-11&display='+display;
   await page.goto(url);await settleBusinessUI(page);
   const card=page.locator('[data-inspect-id="'+source.schedule.id+'"]');
   const positionCard=async()=>{await card.scrollIntoViewIfNeeded();await page.evaluate((id:string)=>{const r=document.querySelector('[data-inspect-id="'+id+'"]')!.getBoundingClientRect();scrollTo(0,scrollY+r.y-180);},source.schedule.id);await settleBusinessUI(page);const geometry=await page.evaluate(readGeometry);assert(geometry.scrollY>200,`${actor.role} ${width} ${display} 深滚动前置：${JSON.stringify(geometry)}`);};
   await positionCard();let initial=await page.evaluate(readGeometry);await card.click();await page.locator('#schedule-panel[open]').waitFor();await settleBusinessUI(page);same(initial,await page.evaluate(readGeometry),'直接进入打开');await page.keyboard.press('Escape');await page.locator('#schedule-panel').waitFor({state:'hidden'});same(initial,await page.evaluate(readGeometry),'直接进入关闭');
   // ClientRouter reorders route CSS; a hard navigation alone did not expose the old overflow conflict.
   await follow(page,page.locator('[data-module-id=settings]'));
   await follow(page,page.locator('[data-module-id=schedule]'));
   if(display==='ledger')await follow(page,page.locator('a[href*="display=ledger"]').filter({hasText:'台账'}));
   await positionCard();initial=await page.evaluate(readGeometry);
   const prefix=actor.role+'-'+display+'-'+width;
   await page.screenshot({path:dir+'/screenshots/'+prefix+'-closed.png'});
   await page.evaluate(()=>{(window as any).__inspectorFrames=[];(window as any).__inspectorSampling=true;const sample=()=>{if(!(window as any).__inspectorSampling)return;const box=(selector:string)=>{const r=document.querySelector(selector)!.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};(window as any).__inspectorFrames.push({scrollY,sidebar:box('.business-sidebar'),brand:box('.business-sidebar__brand'),toolbar:box('.business-toolbar'),content:box('.business-console-content')});requestAnimationFrame(sample);};requestAnimationFrame(sample);});
   await card.click();await page.locator('#schedule-panel[open]').waitFor();await settleBusinessUI(page);
   await page.screenshot({path:dir+'/screenshots/'+prefix+'-open.png'});
   const opened=await page.evaluate(readGeometry);
   if(before){
    const frames=await page.evaluate(()=>{(window as any).__inspectorSampling=false;return (window as any).__inspectorFrames;});
    assert.equal(initial.bodyOverflow,'hidden');assert(opened.sidebar!.y<initial.sidebar!.y-50,'旧包应复现侧栏上移');records.push({role:actor.role,width,display,initial,opened,frames});await page.keyboard.press('Escape');await page.locator('#schedule-panel').waitFor({state:'hidden'});checks.push('旧包：站内切页后body横向hidden与根滚动锁冲突，复现侧栏及顶栏上移');continue;
   }
   assert.equal(initial.bodyOverflow,'clip');same(initial,opened,'站内进入打开');assert.equal(await page.locator('dialog[open]').count(),1);
   for(const [trigger,view,form]of [['[data-inspector-edit]','form','#schedule-form'],['[data-inspector-publication]','publication','#publication-form']]){
    await page.locator(trigger).click();await page.locator('#schedule-panel[data-view='+view+']').waitFor();await settleBusinessUI(page);same(initial,await page.evaluate(readGeometry),'面板内切换');
    await page.locator(form+' footer button').filter({hasText:'取消'}).click();await page.locator('#schedule-panel[data-view=detail]').waitFor();await settleBusinessUI(page);same(initial,await page.evaluate(readGeometry),'取消返回详情');
   }
   await page.mouse.move(30,500);await page.mouse.wheel(0,400);same(initial,await page.evaluate(readGeometry),'背景滚轮被锁定');
   await page.keyboard.press('Escape');await page.locator('#schedule-panel').waitFor({state:'hidden'});same(initial,await page.evaluate(readGeometry),'Esc关闭');
   const frames=await page.evaluate(()=>{(window as any).__inspectorSampling=false;return (window as any).__inspectorFrames;});assert(frames.length>2);for(const frame of frames)same(initial,frame,'逐帧');assert(await card.evaluate((n:Element)=>n===document.activeElement));
   for(const method of ['x','backdrop']){await card.click();await settleBusinessUI(page);if(method==='x')await page.locator('[data-close-inspector]').click();else await page.mouse.click(40,300);await page.locator('#schedule-panel').waitFor({state:'hidden'});same(initial,await page.evaluate(readGeometry),'关闭'+method);}
   assert.equal((await page.evaluate(readGeometry)).locked,false);records.push({role:actor.role,width,display,initial,opened,frames});checks.push(`${prefix}：直接进入／站内切换、打开／表单往返／三种关闭，逐帧背景与焦点保持`);
  }
  if(!before&&actor.role==='admin'){
   await page.setViewportSize({width:1440,height:1000});await page.goto(f.baseURL+'/business/operations-schedule?month=2026-11');await settleBusinessUI(page);
   const card=page.locator('[data-inspect-id="'+source.schedule.id+'"]');await card.scrollIntoViewIfNeeded();await card.click();await page.locator('[data-inspector-edit]').click();await page.locator('#schedule-form [name=contentName]').fill('保留输入 · 隔离样本');const initial=await page.evaluate(readGeometry);
   await page.keyboard.press('Escape');await respondToBusinessConfirm(page,false);same(initial,await page.evaluate(readGeometry),'嵌套确认取消');assert.equal(await page.locator('#schedule-form [name=contentName]').inputValue(),'保留输入 · 隔离样本');
   await page.keyboard.press('Escape');await respondToBusinessConfirm(page,true);await page.locator('#schedule-panel').waitFor({state:'hidden'});same(initial,await page.evaluate(readGeometry),'放弃后关闭');
   await page.emulateMedia({reducedMotion:'reduce'});await card.click();await page.locator('#schedule-panel[open]').waitFor();same(initial,await page.evaluate(readGeometry),'减少动态');await page.keyboard.press('Escape');await page.locator('#schedule-panel').waitFor({state:'hidden'});
   for(const width of [390,320]){await page.setViewportSize({width,height:844});await card.click();await page.locator('#schedule-panel[open]').waitFor();assert(await page.locator('[data-close-inspector]').isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.keyboard.press('Escape');await page.locator('#schedule-panel').waitFor({state:'hidden'});}
   checks.push('未保存继续编辑／放弃的嵌套锁、减少动态、390／320关闭及明显溢出');
  }
  await context.close();
 }
 if(!before){
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:dir+'/video',size:{width:1440,height:1000}}});await context.addInitScript(()=>{(window as any).__name=(v:any)=>v;});assert.equal((await context.request.post(f.baseURL+'/api/auth/sign-in/username',{headers:{Origin:f.baseURL},data:admin})).status(),200);
  const page=await context.newPage();await page.goto(f.baseURL+'/business/settings');await settleBusinessUI(page);await follow(page,page.locator('[data-module-id=schedule]'));
  const card=page.locator('[data-inspect-id="'+source.schedule.id+'"]');await card.scrollIntoViewIfNeeded();await page.evaluate((id:string)=>{const r=document.querySelector('[data-inspect-id="'+id+'"]')!.getBoundingClientRect();scrollTo(0,scrollY+r.y-180);},source.schedule.id);await settleBusinessUI(page);await page.waitForTimeout(500);await card.click();await settleBusinessUI(page);await page.waitForTimeout(600);await page.locator('[data-inspector-publication]').click();await settleBusinessUI(page);await page.waitForTimeout(500);await page.locator('#publication-form footer button').filter({hasText:'取消'}).click();await settleBusinessUI(page);await page.keyboard.press('Escape');await page.locator('#schedule-panel').waitFor({state:'hidden'});await page.waitForTimeout(500);const video=page.video();await context.close();await copyFile(await video.path(),dir+'/inspector-scroll-operation.webm');
 }
 assert.deepEqual(errors,[]);await writeFile(dir+'/result.json',JSON.stringify({mode:before?'baseline-reproduced':'candidate',checks,records,errors,isolatedPostgres:true},null,2));console.log(checks.join('\n'));
}finally{await browser?.close();await f.stop();}
