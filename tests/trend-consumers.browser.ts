import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startPostgresFixture} from './postgres.fixture';
import {admin,employee} from './auth.fixture';
import {seedPrivateSources} from './private-sources.fixture';
import {readWeeklyMaterial} from '../src/db/meeting-weekly-material';
import {settleBusinessUI} from './business-confirm.helper';
import * as s from '../src/db/schema';
const dir='.tools/test-artifacts/trend-consumers';await mkdir(dir+'/screenshots',{recursive:true});
const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-06T12:00:00+08:00');
const f=await startPostgresFixture({clockFile,entry:process.env.PARITY_ENTRY}),{db,baseURL}=f;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);let browser:any;const images:string[]=[],errors:string[]=[];
try {
 await seedPrivateSources(db);
 const draft={schemaVersion:4 as const,workflowVersion:7 as const,coreConclusion:'核对本期推广与历史有效记录。',nextAction:'按既有推广流程补充下一期数据。',promotionInputs:{},issues:[],nonPromotionSelections:[]};
 const [meeting]=await db.insert(s.operationsReviewMeeting).values({name:'周会共享趋势验收',meetingType:'weekly',periodStart:'2026-10-10',periodEnd:'2026-10-16',meetingAt:new Date('2026-10-17T08:00Z'),status:'completed',createdByLabel:'test_admin',draftSnapshot:draft}).returning();
 const material=await readWeeklyMaterial(db,meeting);
 const snapshot={schemaVersion:4,finalizationStage:'post',meeting:{id:meeting.id,name:meeting.name,meetingType:'weekly',periodStart:meeting.periodStart,periodEnd:meeting.periodEnd},draft,generated:{...material,attachments:[]}};
 await db.insert(s.operationsReviewMeetingVersion).values({meetingId:meeting.id,versionNumber:0,lifecycleStatus:'finalized',snapshot,changeSummary:'隔离真实读模型',finalizedByLabel:'test_admin'});
 browser=await chromium.launch({headless:true});
 for(const actor of [admin,employee]){
  const ctx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await ctx.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:actor});
  const p=await ctx.newPage();p.on('pageerror',(e:Error)=>errors.push(e.message));
  for(const width of [1920,1440,1024]){
   await p.setViewportSize({width,height:1000});await p.goto(baseURL+'/business/meeting-review?meeting='+meeting.id);
   await p.waitForSelector('astro-island[component-url*=BusinessMeetingDiscussion]:not([ssr])');await settleBusinessUI(p);
   const points=p.locator('.report-trend svg circle');assert(await points.count()>1);
   const geometry=await points.evaluateAll((nodes:SVGCircleElement[])=>nodes.map(n=>{const r=n.getBoundingClientRect();return {width:r.width,height:r.height};}));
   assert(geometry.every((g:any)=>Math.abs(g.width-g.height)<.5));
   const interactive=p.locator('.report-trend-point>button');
   if(await interactive.count()){const styles=await interactive.evaluateAll((nodes:HTMLElement[])=>nodes.map(n=>{const s=getComputedStyle(n,'::after');return {width:s.width,height:s.height,display:s.display};}));assert(styles.every((g:any)=>g.width===g.height&&g.display==='block'));}
   if(await interactive.count()){const first=interactive.first(),before=await first.boundingBox();await first.click();assert.deepEqual(await first.boundingBox(),before);await p.keyboard.press('Escape');}else await points.first().focus();await p.mouse.move(0,0);await settleBusinessUI(p);
   const path=dir+'/screenshots/'+actor.role+'-'+width+'-weekly.png';await p.screenshot({path});images.push(path);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  await ctx.close();
 }
 assert.deepEqual(errors,[]);await writeFile(dir+'/result.json',JSON.stringify({passed:true,images,errors,dataSource:'seedPrivateSources + readWeeklyMaterial'},null,2));console.log('WEEKLY_TREND_CONSUMERS_PASSED');
}finally{await browser?.close();await f.stop();}
