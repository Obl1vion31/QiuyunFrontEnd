import assert from 'node:assert/strict';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {notePost} from './note-identities.fixture';
import {seedLinkPost} from './monthly-plan-links.fixture';
import {admin,employee} from './auth.fixture';
import {settleBusinessUI,respondToBusinessConfirm} from './business-confirm.helper';
import * as s from '../src/db/schema';

const before=process.env.HISTORY_OVERLAY_BEFORE==='1',dir=process.env.HISTORY_OVERLAY_DIR??'.tools/test-artifacts/history-inspector-overlay';
await mkdir(dir+'/screenshots',{recursive:true});await mkdir(dir+'/video',{recursive:true});
const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-11T12:00:00+08:00');
const f=await startPostgresFixture({clockFile,entry:process.env.HISTORY_OVERLAY_ENTRY}),{db,baseURL}=f;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);const browser=await chromium.launch({headless:true});
const checks:string[]=[],errors:string[]=[],geometry:unknown[]=[];
type Scenario={name:string;url:string;layout:string;row:string;expand?:string};
async function login(context:any,actor:typeof admin|typeof employee){await context.addInitScript({content:'window.__name = value => value;'});const response=await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:actor});assert.equal(response.status(),200);}
async function measure(page:any,layout:string){return page.evaluate((selector:string)=>{
 const box=(element:Element|null)=>{const r=element?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null;};
 return {list:box(document.querySelector(selector)),main:box(document.querySelector('main.business-console-content')),toolbar:box(document.querySelector('.business-toolbar')),sidebar:box(document.querySelector('.business-sidebar')),scrollY};
},layout);}
function sameWidth(a:any,b:any){for(const key of ['list','main','toolbar','sidebar'])if(a[key]&&b[key])for(const axis of ['x','width'])assert(Math.abs(a[key][axis]-b[key][axis])<1,key+' '+axis+' changed');assert(Math.abs(a.scrollY-b.scrollY)<1,`background scroll changed ${a.scrollY} -> ${b.scrollY}`);}
async function shot(page:any,name:string){await settleBusinessUI(page);await page.mouse.move(0,0);await page.screenshot({path:dir+'/screenshots/'+name+'.png'});}
async function prepare(page:any,scenario:Scenario){await page.goto(baseURL+scenario.url);if(scenario.expand)await page.locator(scenario.expand).click();const row=page.locator(scenario.row).first();await row.scrollIntoViewIfNeeded();await row.focus();await row.hover();await settleBusinessUI(page);return row;}
try{
 const promoted:Awaited<ReturnType<typeof notePost>>[]=[];
 for(let i=0;i<10;i++){const post=await notePost(db,`TMUA 讲义与面试课案例 ${i+1} · 历史详情核对`);await db.update(s.operationsContent).set({platformNoteId:(i+101).toString(16).padStart(24,'0')}).where(eq(s.operationsContent.id,post.post.content.id));promoted.push(post);}
 const non:Awaited<ReturnType<typeof seedLinkPost>>[]=[];
 for(let i=0;i<12;i++){
  const post=await seedLinkPost(db,`TMUA 创新帖 ${i+1} · 用反例拆解数学条件与逻辑关系`,'2026-10-20T10:00',{categoryId:'innovation'});non.push(post);
  await db.update(s.operationsContent).set({platformNoteId:(i+201).toString(16).padStart(24,'0')}).where(eq(s.operationsContent.id,post.content.id));
  await db.update(s.operationsContentSchedule).set({actualPublishAt:new Date('2026-10-20T02:00:00Z'),completionStatus:'on_time',publicationUrl:'https://www.xiaohongshu.com/explore/'+(i+201).toString(16).padStart(24,'0')}).where(eq(s.operationsContentSchedule.id,post.schedule.id));
  const [metric]=await db.insert(s.operationsContentPerformanceMetric).values({scheduleId:post.schedule.id,checkpointType:'day_7',recordedThrough:'2026-10-27',exposureCount:10000,readCount:1000+i*100,clickRate:String(10+i),threeSecondReadRate:'65'}).returning();
  await db.insert(s.operationsNonPromotionReview).values({scheduleId:post.schedule.id,metricId:metric.id,checkpointType:'day_7',actualPublishAtSnapshot:new Date('2026-10-20T02:00:00Z'),subjectIdSnapshot:'tmua',subjectNameSnapshot:'TMUA',categoryIdSnapshot:'innovation',categoryNameSnapshot:'创新帖',contentNameSnapshot:post.version.contentName,exposureCountSnapshot:10000,readCountSnapshot:1000+i*100,clickRateSnapshot:String(10+i),threeSecondReadRateSnapshot:'65',cohortSnapshot:{},reviewedByLabel:'隔离验收'});
 }
 const target=promoted[7],nonTarget=non[8],range='&from=2026-10-29&to=2026-11-03';
 const scenarios:Scenario[]=[
  {name:'promotion-post',url:'/business/daily-promotion-review?view=history&mode=post'+range,layout:'.history-list',row:`[data-history-schedule="${target.post.schedule.id}"] header [data-inspector-key]`},
  {name:'promotion-day',url:'/business/daily-promotion-review?view=history&mode=day'+range,layout:'.day-history',row:`[data-inspector-key="${target.metrics[2].id}"]`,expand:'[data-day-group="2026-10-31"]>summary'},
  {name:'nonpromotion-flat',url:'/business/non-promotion-review?view=history&mode=standard&group=0',layout:'.table-pane',row:`[data-schedule-id="${nonTarget.schedule.id}"] [data-inspector-trigger]`},
  {name:'nonpromotion-grouped',url:'/business/non-promotion-review?view=history&mode=standard&group=1',layout:'.table-pane',row:`[data-schedule-id="${nonTarget.schedule.id}"] [data-inspector-trigger]`,expand:'[data-category-group="tmua:innovation"]>summary'},
  {name:'promotion-daily',url:'/business/daily-promotion-review',layout:`[data-lifecycle-schedule="${target.post.schedule.id}"]`,row:`[data-lifecycle-schedule="${target.post.schedule.id}"] header [data-inspector-key]`},
 ];
 for(const[role,actor]of(before?[['admin',admin]] as const:[['admin',admin],['employee',employee]] as const)){
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});await login(context,actor);const page=await context.newPage();await page.clock.setFixedTime(new Date('2026-11-11T12:00:00+08:00'));page.on('pageerror',(error:Error)=>errors.push(error.message));
  for(const width of before?[1440]:role==='admin'?[1920,1440,1024]:[1440]){
   await page.setViewportSize({width,height:1000});
   for(const scenario of before?scenarios.slice(0,1):scenarios.filter(s=>width===1440||['promotion-post','promotion-day','nonpromotion-flat'].includes(s.name))){
    const row=await prepare(page,scenario),node=await page.locator(scenario.layout).elementHandle(),initial=await measure(page,scenario.layout);
    if(before||width===1440&&role==='admin'&&scenario.name==='promotion-post')await shot(page,role+'-'+scenario.name+'-closed-'+width);
    await page.evaluate((selector:string)=>{const target=document.querySelector(selector)!;(window as any).inspectorFrames=[];(window as any).inspectorSampling=true;const sample=()=>{if(!(window as any).inspectorSampling)return;const r=target.getBoundingClientRect();(window as any).inspectorFrames.push({x:r.x,width:r.width,scrollY});requestAnimationFrame(sample);};sample();},scenario.layout);
    await row.click();const pane=page.locator('[data-inspector].is-open');await pane.waitFor();await settleBusinessUI(page);const opened=await measure(page,scenario.layout);geometry.push({role,width,scenario:scenario.name,initial,opened,before});
    if(before){await shot(page,role+'-'+scenario.name+'-docked-'+width);assert(opened.list.width<initial.list.width-200);break;}
    assert.equal(await pane.evaluate((el:HTMLElement)=>el instanceof HTMLDialogElement&&el.matches(':modal')),true);sameWidth(initial,opened);
    const panel=await pane.boundingBox();assert.equal(panel.width,width>1240?338:380,'保留原Inspector窄宽度');
    if(width>1240){assert.equal(panel.y,92,'保留顶栏下方原有20px间距');assert.equal(panel.height,888);}
    assert(await node!.evaluate((el:Element,selector:string)=>el===document.querySelector(selector),scenario.layout));
    const frames=await page.evaluate(()=>{(window as any).inspectorSampling=false;return (window as any).inspectorFrames;});for(const frame of frames){assert(Math.abs(frame.width-initial.list.width)<1);assert(Math.abs(frame.x-initial.list.x)<1);assert(Math.abs(frame.scrollY-initial.scrollY)<1);}
    await shot(page,role+'-'+scenario.name+'-overlay-'+width);
    await page.keyboard.press('Tab');assert(await pane.evaluate((el:HTMLElement)=>el.contains(document.activeElement)));
    await page.mouse.move(30,500);await page.mouse.wheel(0,400);assert.equal((await measure(page,scenario.layout)).scrollY,initial.scrollY);
    await page.keyboard.press('Escape');await pane.waitFor({state:'hidden'});sameWidth(initial,await measure(page,scenario.layout));assert(await row.evaluate((el:Element)=>document.activeElement===el));
    if(width===1440&&scenario.name==='promotion-post'){
     await row.click();await page.locator('dialog[data-inspector-modal][open]').waitFor();await page.goBack();await page.goForward();await page.locator('dialog[data-inspector-modal][open]').waitFor();await settleBusinessUI(page);assert.equal(await page.locator('dialog[data-inspector-modal][open]').count(),1);sameWidth(initial,await measure(page,scenario.layout));
     await page.keyboard.press('Escape');await page.locator('[data-inspector-modal]').waitFor({state:'hidden'});
     await row.click();await page.locator('dialog[data-inspector-modal][open]').waitFor();await page.mouse.click(30,500);await page.locator('[data-inspector-modal]').waitFor({state:'hidden'});sameWidth(initial,await measure(page,scenario.layout));
    }
    if(width===1440&&scenario.name==='promotion-day'){
     await row.click();const modal=page.locator('dialog[data-inspector-modal][open]');await modal.locator('.surface-resource-meta>summary').click();await modal.locator('.note-id-correction>summary').click();await modal.locator('[name=platformNoteId]').fill('f'.repeat(24));const body=modal.locator('[data-inspector-body]'),scroll=await body.evaluate((el:HTMLElement)=>el.scrollTop);await page.keyboard.press('Escape');await respondToBusinessConfirm(page,false);assert.equal(await modal.locator('[name=platformNoteId]').inputValue(),'f'.repeat(24));assert.equal(await body.evaluate((el:HTMLElement)=>el.scrollTop),scroll);await page.keyboard.press('Escape');await respondToBusinessConfirm(page,true);await modal.waitFor({state:'hidden'});sameWidth(initial,await measure(page,scenario.layout));
    }
    checks.push(`${role} ${width} ${scenario.name}: original ${panel.width}px inspector, stable list/main/toolbar, entry frames, scroll lock, Esc and focus`);
   }
  }
  await context.close();
 }
 if(!before){
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',reducedMotion:'reduce'});await login(context,admin);const page=await context.newPage(),row=await prepare(page,scenarios[0]);await row.click();await page.locator('dialog[data-inspector-modal][open]').waitFor();assert.equal(await page.locator('[data-inspector-modal]').evaluate((el:HTMLElement)=>getComputedStyle(el).animationName),'none');await page.keyboard.press('Escape');await page.locator('[data-inspector-modal]').waitFor({state:'hidden'});checks.push('减少动态效果：直接切换并释放滚动锁');await page.setViewportSize({width:390,height:844});await row.click();const narrow=page.locator('dialog[data-inspector-modal][open]');await narrow.waitFor();assert(await narrow.locator('[data-close-inspector]').isVisible());assert((await narrow.boundingBox()).width<=390);await page.keyboard.press('Escape');await narrow.waitFor({state:'hidden'});await context.close();checks.push('390px仅检查关闭入口和浮层宽度');
  const videoContext=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:dir+'/video',size:{width:1440,height:1000}}});await login(videoContext,admin);const clip=await videoContext.newPage(),videoRow=await prepare(clip,scenarios[0]);await clip.waitForTimeout(400);await videoRow.click();await settleBusinessUI(clip);await clip.waitForTimeout(600);await clip.keyboard.press('Escape');await clip.locator('[data-inspector-modal]').waitFor({state:'hidden'});await clip.waitForTimeout(400);const video=clip.video();await videoContext.close();await copyFile(await video.path(),dir+'/history-overlay-operation.webm');
 }
 assert.deepEqual(errors,[]);await writeFile(dir+'/result.json',JSON.stringify({passed:true,before,checks,geometry,errors,productionWrites:false},null,2));for(const check of checks)console.log('PASS '+check);
}catch(error){await writeFile(dir+'/failure.json',JSON.stringify({geometry,errors},null,2));throw error;}finally{await browser.close();await f.stop();}
