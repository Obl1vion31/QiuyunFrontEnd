/** 实际运行包：完整遮罩点击与拖动分离，保留各 Inspector 的关闭保护。 */
import assert from 'node:assert/strict';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {seedLinkPost} from './monthly-plan-links.fixture';
import {prepareMonthlyArrangement} from './monthly-arrangement.fixture';
import {notePost} from './note-identities.fixture';
import {admin,employee} from './auth.fixture';
import {settleBusinessUI,respondToBusinessConfirm} from './business-confirm.helper';
import * as s from '../src/db/schema';

const before=process.env.POINTER_BEFORE==='1',dir=process.env.POINTER_DIR??'.tools/test-artifacts/inspector-pointer';
await mkdir(dir+'/screenshots',{recursive:true});await mkdir(dir+'/video',{recursive:true});
const clockFile=resolve(dir,'clock.txt');await writeFile(clockFile,'2026-11-16T12:00:00+08:00');
const fixture=await startPostgresFixture({clockFile,entry:'.tools/serve-vercel.mjs'}),{db,baseURL}=fixture;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);const browser=await chromium.launch({headless:true});
const contexts:any[]=[],checks:string[]=[],errors:string[]=[];let page:any,video:any;let clipStart=0,clipEnd=0,recordStarted=0;
async function login(actor:any,record=false){
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',...(record?{recordVideo:{dir:dir+'/video',size:{width:1440,height:1000}}}:{})});
 contexts.push(context);await context.addInitScript({content:'window.__name = value => value;'});
 assert.equal((await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:actor})).status(),200);
 const tab=await context.newPage();tab.on('pageerror',(error:Error)=>errors.push(error.message));return tab;
}
async function drag(tab:any,from:{x:number;y:number},to:{x:number;y:number}){
 await tab.mouse.move(from.x,from.y);await tab.mouse.down();await tab.mouse.move(to.x,to.y,{steps:8});await tab.mouse.up();await tab.waitForTimeout(300);
}
async function points(pane:any){
 const box=await pane.boundingBox();return {inside:{x:box.x+4,y:box.y+140},outside:{x:box.x-40,y:box.y+140},box};
}
async function gestures(tab:any,pane:any,label:string){
 await settleBusinessUI(tab);const {inside,outside}=await points(pane);
 const url=tab.url(),scroll=await tab.evaluate(()=>scrollY);
 await tab.evaluate(()=>getSelection()?.removeAllRanges());await drag(tab,inside,outside);
 if(before){assert.equal(await pane.isVisible(),false);assert.equal(await tab.evaluate(()=>getSelection()?.toString()),'');checks.push('旧包复现：无选区的面板内按下／外面松开直接关闭');return;}
 assert(await pane.isVisible(),label+' 内按外放保留');assert.equal(tab.url(),url);assert.equal(await tab.evaluate(()=>scrollY),scroll);
 await drag(tab,outside,inside);assert(await pane.isVisible(),label+' 外按内放保留');
 await tab.mouse.move(outside.x,outside.y);await tab.mouse.down();await tab.mouse.move(outside.x-80,outside.y+80,{steps:8});await tab.mouse.move(outside.x,outside.y,{steps:8});await tab.mouse.up();await tab.waitForTimeout(280);assert(await pane.isVisible(),label+' 遮罩拖动返回不关闭');
 await tab.mouse.move(outside.x,outside.y);await tab.mouse.down();await pane.dispatchEvent('pointercancel',{pointerId:1,pointerType:'mouse',isPrimary:true});await tab.mouse.up();await tab.waitForTimeout(280);assert(await pane.isVisible(),label+' pointercancel 后不关闭');
 checks.push(label+': 内按外放、外按内放、遮罩拖动与pointercancel保留；URL／背景滚动保持');
}
try{
 const post=await seedLinkPost(db,'鼠标手势隔离样本','2026-11-15T18:00');
 page=await login(admin,!before);video=page.video();recordStarted=Date.now();
 if(!before){const cookie=(await page.context().cookies()).map((entry:any)=>entry.name+'='+entry.value).join('; ');await prepareMonthlyArrangement(db,baseURL,cookie);}
 const openSchedule=async(tab=page)=>{await tab.goto(baseURL+'/business/operations-schedule?month=2026-11');await tab.locator('[data-inspect-id="'+post.schedule.id+'"]').first().click();await tab.locator('[data-schedule-workflow][data-ready=true]').waitFor({state:'attached'});await settleBusinessUI(tab);};
 await openSchedule();const sheet=page.locator('#schedule-panel');clipStart=(Date.now()-recordStarted)/1000;await gestures(page,sheet,'管理员排期详情1440');clipEnd=(Date.now()-recordStarted)/1000;
 if(!before){
  await page.screenshot({path:dir+'/screenshots/schedule-drag-kept-1440.png'});
  for(const[view,trigger]of [['编辑排期','[data-inspector-edit]'],['发布登记','[data-inspector-publication]'],['移动对换','[data-inspector-placement]']]){
   await page.locator(trigger).click();await gestures(page,sheet,'管理员'+view);const outside=(await points(sheet)).outside;await page.mouse.click(outside.x,outside.y);await sheet.waitFor({state:'hidden'});await openSchedule();
  }
  await page.locator('[data-inspector-edit]').click();const input=page.locator('#schedule-form [name=contentName]');await input.fill('未保存的手势草稿');
  await gestures(page,sheet,'未保存编辑');assert.equal(await page.locator('[data-business-confirm][open]').count(),0);assert.equal(await input.inputValue(),'未保存的手势草稿');
  const outside=(await points(sheet)).outside;await page.mouse.click(outside.x,outside.y);await respondToBusinessConfirm(page,false);assert.equal(await input.inputValue(),'未保存的手势草稿');
  await page.mouse.click(outside.x,outside.y);await respondToBusinessConfirm(page,true);await sheet.waitFor({state:'hidden'});checks.push('真实遮罩点击仍确认草稿，取消保留，确认后关闭');
  const promoted=await notePost(db,'窄Inspector手势隔离样本');
  const non=await seedLinkPost(db,'非推广手势隔离样本','2026-10-20T10:00',{categoryId:'innovation'});
  await db.update(s.operationsContentSchedule).set({actualPublishAt:new Date('2026-10-20T02:00:00Z'),completionStatus:'on_time'}).where(eq(s.operationsContentSchedule.id,non.schedule.id));
  const [metric]=await db.insert(s.operationsContentPerformanceMetric).values({scheduleId:non.schedule.id,checkpointType:'day_7',recordedThrough:'2026-10-27',exposureCount:10000,readCount:1000,clickRate:'10',threeSecondReadRate:'65'}).returning();
  await db.insert(s.operationsNonPromotionReview).values({scheduleId:non.schedule.id,metricId:metric.id,checkpointType:'day_7',actualPublishAtSnapshot:new Date('2026-10-20T02:00:00Z'),subjectIdSnapshot:'tmua',subjectNameSnapshot:'TMUA',categoryIdSnapshot:'innovation',categoryNameSnapshot:'创新帖',contentNameSnapshot:non.version.contentName,exposureCountSnapshot:10000,readCountSnapshot:1000,clickRateSnapshot:'10',threeSecondReadRateSnapshot:'65',cohortSnapshot:{},reviewedByLabel:'隔离验收'});
  const scenarios=[
   {name:'promotion-post',label:'推广帖子',url:'/business/daily-promotion-review?view=history&mode=post&from=2026-10-29&to=2026-11-03',row:`[data-history-schedule="${promoted.post.schedule.id}"] header [data-inspector-key]`,expand:''},
   {name:'promotion-day',label:'推广单日',url:'/business/daily-promotion-review?view=history&mode=day&from=2026-10-29&to=2026-11-03',row:`[data-inspector-key="${promoted.metrics[2].id}"]`,expand:'[data-day-group="2026-10-31"]>summary'},
   {name:'nonpromotion',label:'非推广',url:'/business/non-promotion-review?view=history&mode=standard&group=0',row:`[data-schedule-id="${non.schedule.id}"] [data-inspector-trigger]`,expand:''},
  ];
  for(const[role,tab]of [['admin',page],['employee',await login(employee)]] as const){
   for(const width of role==='admin'?[1440,1024]:[1440]){
    await tab.setViewportSize({width,height:1000});
    if(role==='employee'){await openSchedule(tab);const pane=tab.locator('#schedule-panel');await gestures(tab,pane,'员工排期');await tab.keyboard.press('Escape');await pane.waitFor({state:'hidden'});}
    for(const scenario of scenarios){
     await tab.goto(baseURL+scenario.url);if(scenario.expand)await tab.locator(scenario.expand).click();const row=tab.locator(scenario.row).first();await row.click();const pane=tab.locator('dialog[data-inspector-modal][open]');await pane.waitFor();await gestures(tab,pane,role+' '+scenario.label+' '+width);
     if(role==='admin'&&width===1440)await tab.screenshot({path:dir+'/screenshots/'+scenario.name+'-drag-kept-1440.png'});
     const outside=(await points(pane)).outside;await tab.mouse.click(outside.x,outside.y);await pane.waitFor({state:'hidden'});assert(await row.evaluate((node:HTMLElement)=>document.activeElement===node));
     await row.click();await pane.waitFor();await tab.keyboard.press('Escape');await pane.waitFor({state:'hidden'});
    }
   }
  }
  await page.emulateMedia({reducedMotion:'reduce'});await openSchedule();await gestures(page,sheet,'减少动态排期');await page.keyboard.press('Escape');await sheet.waitFor({state:'hidden'});
  checks.push('两种共享外壳的真实遮罩点击、Esc、关闭后焦点及减少动态保持');
 }
 if(!before)await writeFile(dir+'/video-timing.json',JSON.stringify({start:clipStart,duration:clipEnd-clipStart}));
 assert.deepEqual(errors,[]);await writeFile(dir+'/result.json',JSON.stringify({passed:true,before,checks,errors,productionWrites:false},null,2));console.log(checks.join('\n'));
}catch(error){await page?.screenshot({path:dir+'/failure.png'}).catch(()=>{});console.error(fixture.logs().slice(-1200));throw error;}
finally{for(const context of contexts)await context.close();if(video)await copyFile(await video.path(),dir+'/pointer-operation.webm');await browser.close();await fixture.stop();}
