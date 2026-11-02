import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startFixture,admin} from './auth.fixture';
import {settleBusinessUI} from './business-confirm.helper';
import * as s from '../src/db/schema';
const folder=process.env.RESULTS_MOTION_DIR||'.tools/test-artifacts/nonpromotion-results/motion';await mkdir(folder,{recursive:true});
const clockFile=new URL('../'+folder+'/clock.txt',import.meta.url).pathname;await writeFile(clockFile,'2026-11-24T12:00:00+08:00');
const fixture=await startFixture({clockFile}),{db,baseURL}=fixture;
const {chromium}=await import(new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href),browser=await chromium.launch({headless:true});
try{
 let number=0;
 for(const mode of ['standard','instant','continuous'] as const){
  const [content]=await db.insert(s.operationsContent).values({platformNoteId:(++number).toString(16).padStart(24,'0')}).returning();
  const name=mode==='standard'?'真题解析：分类节点阅读对照':mode==='instant'?'即时解析：考试重点问题回应':'持续观察：讲义内容的长期阅读表现';
  const [version]=await db.insert(s.operationsContentVersion).values({contentId:content.id,versionNumber:0,workType:'new',contentName:name,subjectId:'tmua',categoryId:'innovation'}).returning();
  const actual=new Date('2026-11-02T10:00:00+08:00'),[post]=await db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:actual,actualPublishAt:actual,isPromoted:false,promotionStatus:'none',completionStatus:'on_time'}).returning();
  await db.insert(s.operationsNonPromotionReviewPlan).values({contentId:content.id,anchorScheduleId:post.id,mode,day7:mode==='standard',day15:mode==='standard'});
  for(const [index,day]of (mode==='standard'?['2026-11-09','2026-11-17']:mode==='instant'?['2026-11-04']:['2026-11-04','2026-11-11','2026-11-20']).entries()){
   const custom=mode==='standard'?null:(await db.insert(s.operationsNonPromotionCustomCheckpoint).values({contentId:content.id,scheduleId:post.id,dueOn:day}).returning())[0].id;
   const type=custom?'custom:'+custom:index===0?'day_7':'day_15',count=[120,560,1620][index];
   const [metric]=await db.insert(s.operationsContentPerformanceMetric).values({scheduleId:post.id,checkpointType:type,customCheckpointId:custom,recordedThrough:day,exposureCount:10000,readCount:count,clickRate:String(count/100),threeSecondReadRate:'72.36'}).returning();
   await db.insert(s.operationsNonPromotionReview).values({scheduleId:post.id,metricId:metric.id,checkpointType:type,customCheckpointId:custom,actualPublishAtSnapshot:actual,subjectIdSnapshot:'tmua',subjectNameSnapshot:'TMUA',categoryIdSnapshot:'innovation',categoryNameSnapshot:'创新帖',contentNameSnapshot:name,clickRateSnapshot:metric.clickRate,threeSecondReadRateSnapshot:'72.36',cohortSnapshot:{},reviewedByLabel:'隔离验收'});
  }
 }
 const login=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(admin)}),cookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 const report:any[]=[];
 for(const mobile of [false,true]){
  const kind=mobile?'mobile':'desktop',context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,locale:'zh-CN',recordVideo:{dir:folder+'/'+kind,size:mobile?{width:390,height:844}:{width:1440,height:1000}}});
  await context.addCookies(cookie.split('; ').map(c=>({name:c.slice(0,c.indexOf('=')),value:c.slice(c.indexOf('=')+1),url:baseURL})));
  await context.addInitScript(()=>{const animate=Element.prototype.animate;(window as any).__resultMotion=[];Element.prototype.animate=function(keyframes,options){if(this.hasAttribute('data-result-track')||this.hasAttribute('data-result-line'))(window as any).__resultMotion.push({line:this.hasAttribute('data-result-line'),duration:typeof options==='object'?options.duration:options});return animate.call(this,keyframes,options);};});
  const page=await context.newPage();await page.clock.setFixedTime(new Date('2026-11-24T12:00:00+08:00'));
  await page.goto(baseURL+'/business/non-promotion-review?view=history&mode=standard');await settleBusinessUI(page);await page.waitForTimeout(450);
  if(!mobile){assert((await page.evaluate(()=>(window as any).__resultMotion)).some((v:any)=>v.duration===360));await page.locator('[data-category-details]>summary').click();await settleBusinessUI(page);await page.waitForTimeout(450);}
  await page.locator('[name=mode]').selectOption('instant');await page.waitForURL(/mode=instant/);await settleBusinessUI(page);await page.waitForTimeout(450);
  await page.locator('[name=mode]').selectOption('continuous');await page.waitForURL(/mode=continuous/);await settleBusinessUI(page);await page.waitForTimeout(450);
  const details=page.locator('[data-post-history]');await details.locator('summary').click();await settleBusinessUI(page);await page.waitForTimeout(450);const after=await page.evaluate(()=>(window as any).__resultMotion);assert(after.some((v:any)=>v.line&&v.duration===360));
  await details.locator('summary').click();await settleBusinessUI(page);await details.locator('summary').click();await settleBusinessUI(page);await page.waitForTimeout(350);assert.equal((await page.evaluate(()=>(window as any).__resultMotion)).length,after.length,'再次展开不重播已呈现结果');
  await page.screenshot({path:folder+'/'+kind+'-stable.png'});report.push({kind,firstVisible:true,noReplay:true,animations:after});await context.close();
 }
 await writeFile(folder+'/checks.json',JSON.stringify({passed:true,report},null,2));console.log(JSON.stringify({passed:true,folder}));
}finally{await browser.close();await fixture.stop();}
