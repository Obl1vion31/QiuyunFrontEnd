/** Real frame geometry; performance sampling is kept separate from these heavier reads. */
import assert from 'node:assert/strict';import{mkdir,writeFile}from'node:fs/promises';import{eq}from'drizzle-orm';
import{startFixture,admin}from'./auth.fixture';import{prepareMonthlyArrangement}from'./monthly-arrangement.fixture';import{seedLinkPost}from'./monthly-plan-links.fixture';import{settleBusinessUI}from'./business-confirm.helper';import * as s from '../src/db/schema';
const dir='.tools/test-artifacts/panel-motion';await mkdir(dir,{recursive:true});const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-06T12:00:00+08:00');
const f=await startFixture({clockFile});let browser:any;const facts:any[]=[],errors:string[]=[];
try{
 const response=await fetch(f.baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:f.baseURL,'Content-Type':'application/json'},body:JSON.stringify(admin)});assert.equal(response.status,200);const cookies=response.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
 await prepareMonthlyArrangement(f.db as any,f.baseURL,cookies);const source=await seedLinkPost(f.db as any,'已发布 · 面板连续性核对','2026-11-05T10:00');
 await f.db.update(s.operationsContentSchedule).set({actualPublishAt:new Date('2026-11-05T02:00Z'),completionStatus:'on_time'}).where(eq(s.operationsContentSchedule.id,source.schedule.id));
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);browser=await chromium.launch({headless:true});
 for(const width of[1920,1440,1024]){
  const c=await browser.newContext({viewport:{width,height:1000},locale:'zh-CN'});await c.addCookies(cookies.split('; ').map(x=>({name:x.slice(0,x.indexOf('=')),value:x.slice(x.indexOf('=')+1),url:f.baseURL})));const p=await c.newPage();p.on('pageerror',(e:any)=>errors.push(e.message));
  await p.goto(f.baseURL+'/business/operations-schedule?month=2026-11');await settleBusinessUI(p);
  const card=p.locator('[data-inspect-id="'+source.schedule.id+'"]');await card.scrollIntoViewIfNeeded();
  async function capture(label:string,action:()=>Promise<unknown>){
   await p.evaluate("(()=>{window.__frames=[];window.__sampling=true;const q=s=>document.querySelector(s),box=s=>q(s)?.getBoundingClientRect();const take=()=>{if(!window.__sampling)return;const d=q('#schedule-panel'),r=box('.calendar');window.__frames.push({t:performance.now(),scroll:scrollY,width:r?.width,x:r?.x,nav:box('.business-sidebar')?.y,title:box('.business-toolbar')?.y,open:d?.open,locked:document.documentElement.hasAttribute('data-business-scroll-locked'),opacity:d?getComputedStyle(d).opacity:'0'});requestAnimationFrame(take);};requestAnimationFrame(take);})()");
   await action();await p.waitForTimeout(320);const frames=await p.evaluate(()=>{(window as any).__sampling=false;return(window as any).__frames;});assert(frames.length>2,label);
   for(const key of['scroll','width','x','nav','title']){const values=frames.map((x:any)=>x[key]).filter((v:any)=>v!=null);assert(Math.max(...values)-Math.min(...values)<=1,label+' '+key+' '+JSON.stringify(values));}
   facts.push({width,label,frames});
  }
  await capture('打开详情',()=>card.click());await p.locator('#schedule-panel[open][data-view=detail]').waitFor();assert.equal(await p.locator('dialog[open]').count(),1);
  await p.evaluate(()=>{const d=document.querySelector('#schedule-panel')!;(window as any).__closes=0;d.addEventListener('close',()=>{(window as any).__closes++;});});
  for(const[button,view,form]of[['[data-inspector-edit]','form','#schedule-form'],['[data-inspector-publication]','publication','#publication-form'],['[data-inspector-revise]','form','#schedule-form']]){
   await capture('切换'+view,()=>p.locator(button).click());await p.locator('#schedule-panel[data-view='+view+']').waitFor();assert.equal(await p.locator('dialog[open]').count(),1);
   await p.locator(form+' footer button').filter({hasText:'取消'}).click();await p.locator('#schedule-panel[data-view=detail]').waitFor();assert.equal(await p.evaluate(()=>(window as any).__closes),0,'内部切换不native close');
  }
  for(const method of['x','escape','backdrop']){
   if(!await p.locator('#schedule-panel').evaluate((d:any)=>d.open))await card.click();await settleBusinessUI(p);
   await capture('关闭'+method,async()=>{if(method==='x')await p.locator('[data-close-inspector]').click();else if(method==='escape')await p.keyboard.press('Escape');else await p.mouse.click(40,300);});
   await p.locator('#schedule-panel').waitFor({state:'hidden'});assert.equal(await p.evaluate(()=>document.documentElement.hasAttribute('data-business-scroll-locked')),false);
   assert(await card.evaluate((n:Element)=>n===document.activeElement),'关闭焦点回卡片');
  }
  await card.click();await settleBusinessUI(p);await p.locator('[data-close-inspector]').click();await p.evaluate((id:string)=>document.querySelector('[data-inspector]')!.dispatchEvent(new CustomEvent('business:inspector-select',{detail:{id}})),source.schedule.id);await p.waitForTimeout(350);assert(await p.locator('#schedule-panel').evaluate((d:any)=>d.open),'打断关闭后保持打开');await p.locator('[data-close-inspector]').click();await p.locator('#schedule-panel').waitFor({state:'hidden'});
  await p.emulateMedia({reducedMotion:'reduce'});await card.click();await settleBusinessUI(p);assert.equal(await p.locator('#schedule-panel').evaluate((n:HTMLElement)=>n.getAnimations().length),0);await p.keyboard.press('Escape');await p.locator('#schedule-panel').waitFor({state:'hidden'});
  await c.close();
 }
 assert.deepEqual(errors,[]);await writeFile(dir+'/result.json',JSON.stringify({passed:true,facts,errors},null,2));console.log('三档桌面单层切换、开关几何/焦点/锁、三种关闭、打断和减少动态通过');
}finally{await browser?.close();await f.stop();}
