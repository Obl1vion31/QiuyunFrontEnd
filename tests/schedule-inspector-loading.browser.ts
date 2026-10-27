/** 排期真实 Inspector：加载空容器不应绘制业务分隔线；写入仅隔离库。 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startFixture,admin} from './auth.fixture';
import * as s from '../src/db/schema';
import {completionStatus} from '../src/db/schedule-rules.mjs';
const baseline=process.env.INSPECTOR_LOADING_BASELINE==='1';
const folder=process.env.INSPECTOR_LOADING_DIR||'.tools/test-artifacts/inspector-loading';await mkdir(folder,{recursive:true});
const fixture=await startFixture(),{db,baseURL}=fixture;let browser:any;const checks:any[]=[],errors:string[]=[],releaseReads:Array<()=>void>=[];
try{
 const login=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(admin)});assert.equal(login.status,200);const cookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 async function seed(name:string,hours:number,revision=false){
  const [content]=await db.insert(s.operationsContent).values({}).returning();
  const [v0]=await db.insert(s.operationsContentVersion).values({contentId:content.id,versionNumber:0,workType:'new',contentName:name,subjectId:'interview',categoryId:'interview-course',projectDocUrl:'https://example.test/document'}).returning();
  const version=revision?(await db.insert(s.operationsContentVersion).values({...v0,id:undefined,versionNumber:1,sourceVersionId:v0.id,workType:'revision',revisionSummary:'融入讲义修改'}).returning())[0]:v0;
  const plannedPublishAt=new Date(Date.now()+hours*3600000);
  return (await db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt,completionStatus:completionStatus(plannedPublishAt,null)}).returning())[0];
 }
 const first=await seed('面试课加载验收③',24,true),second=await seed('面试课另一篇验收',25),pending=await seed('有真实待处理事项的验收帖',-30);
 const workflows=new Map();for(const post of [first,second,pending]){const r=await fetch(baseURL+`/api/operations-content/${post.id}/workflow`,{headers:{Cookie:cookie}});assert.equal(r.status,200);workflows.set(post.id,await r.json());}
 const pw=await import(new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);browser=await pw.chromium.launch({headless:true});
 for(const width of baseline?[1440]:[1920,1440,1280,1024,390,320]){
  const context=await browser.newContext({viewport:{width,height:1000},locale:'zh-CN',recordVideo:width===1440?{dir:folder+'/video',size:{width:1440,height:1000}}:undefined});
  await context.addCookies(cookie.split('; ').map(v=>({name:v.slice(0,v.indexOf('=')),value:v.slice(v.indexOf('=')+1),url:baseURL})));
  const page=await context.newPage();page.on('pageerror',(e:Error)=>errors.push(e.message));page.setDefaultTimeout(12000);
  let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);releaseReads.push(release);
  const firstPath=`**/api/operations-content/${first.id}/workflow`;
  await page.route(firstPath,async(route:any)=>{await held;try{await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(workflows.get(first.id))});}catch{}});
  await page.goto(baseURL+'/business/operations-schedule');await page.evaluate(()=>document.fonts.ready);
  const pane=page.locator('[data-inspector]'),panel=page.locator('[data-schedule-workflow]');
  const open=async(id:string)=>{await page.locator(`[data-inspect-id="${id}"]`).first().evaluate((n:HTMLElement)=>n.click());await pane.locator(`[data-schedule-workflow][data-schedule-id="${id}"][data-ready=false]`).waitFor({state:'attached'});};
  await open(first.id);await page.waitForTimeout(260);
  const geometry=()=>page.evaluate(()=>{const panel=document.querySelector<HTMLElement>('[data-schedule-workflow]')!,reference=document.querySelector('.inspector-reference')!,r=panel.getBoundingClientRect();return {hidden:panel.hidden,height:r.height,children:panel.childElementCount,referenceY:reference.getBoundingClientRect().top,scrollY,loaders:document.querySelectorAll('[data-inspector-loading]').length};});
  const early=await geometry();await page.screenshot({path:`${folder}/loading-early-${width}.png`});
  if(baseline){assert.equal(early.children,0);assert.ok(early.height>0);checks.push({width,reproduced:true,early});release();await context.close();break;}
  assert.equal(early.height,0,'读取时空待处理区域不能占高或画边线');assert.equal(early.hidden,true);assert.equal(early.loaders,0);
  await page.locator('[data-inspector-loading]').waitFor();assert.equal(await page.locator('[data-inspector-loading]').count(),1);await page.screenshot({path:`${folder}/loading-slow-${width}.png`});
  release();await panel.locator('..').locator('[data-schedule-workflow][data-ready=true]').waitFor({state:'attached'});
  const ready=await geometry();assert.equal(ready.height,0);assert.equal(ready.hidden,true);assert.ok(Math.abs(ready.referenceY-early.referenceY)<=1);assert.equal(ready.scrollY,early.scrollY);assert.equal(ready.loaders,0);await page.screenshot({path:`${folder}/ready-empty-${width}.png`});
  await page.unroute(firstPath);
  // 有待办才显示业务分组；切到另一篇时不能留下旧待办的边线。
  await page.locator(`[data-inspect-id="${pending.id}"]`).first().evaluate((n:HTMLElement)=>n.click());await panel.locator('..').locator('[data-schedule-workflow][data-ready=true]').waitFor({state:'attached'});assert.equal(await panel.isVisible(),true);assert.ok(await panel.locator('h3').count()>0);
  let releaseSecond!:()=>void;const holdSecond=new Promise<void>(resolve=>releaseSecond=resolve);releaseReads.push(releaseSecond);const secondPath=`**/api/operations-content/${second.id}/workflow`;
  await page.route(secondPath,async(route:any)=>{await holdSecond;try{await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(workflows.get(second.id))});}catch{}});
  await open(second.id);assert.equal((await geometry()).height,0);await page.locator('[data-close-inspector]').click();await pane.waitFor({state:'hidden'});releaseSecond();await page.unroute(secondPath);assert.equal(await page.locator('[data-inspector-loading]').count(),0);
  // 失败保持可见且允许重试；成功无待办后重新收起。
  await page.route(secondPath,(route:any)=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'验收读取失败'})}));await page.locator(`[data-inspect-id="${second.id}"]`).first().evaluate((n:HTMLElement)=>n.click());await panel.getByRole('button',{name:'重新读取',exact:true}).waitFor();assert.equal(await panel.isVisible(),true);
  await page.unroute(secondPath);await panel.getByRole('button',{name:'重新读取',exact:true}).click();await page.locator('[data-schedule-workflow][data-ready=true]').waitFor({state:'attached'});assert.equal((await geometry()).height,0);
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-close-inspector]').click();await pane.waitFor({state:'hidden'});await page.locator(`[data-inspect-id="${first.id}"]`).first().evaluate((n:HTMLElement)=>n.click());await page.locator('[data-schedule-workflow][data-ready=true]').waitFor({state:'attached'});assert.equal((await geometry()).height,0);
  checks.push({width,early,ready,pendingVisible:true,failureRetry:true,closeReopen:true,reducedMotion:true});await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile(folder+'/checks.json',JSON.stringify({baseline,checks,errors},null,2));console.log(JSON.stringify({baseline,viewports:checks.map(c=>c.width),folder}));
}catch(error){console.error(fixture.logs().slice(-2000));throw error;}finally{releaseReads.forEach(release=>release());await browser?.close();await fixture.stop();}
