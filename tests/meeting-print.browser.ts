import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {admin,employee} from './auth.fixture';
import {seedPrivateSources,seedFrozenPrivateMeeting} from './private-sources.fixture';
import {settleBusinessUI} from './business-confirm.helper';
import * as s from '../src/db/schema';

const dir=process.env.MEETING_PRINT_DIR??'.tools/test-artifacts/portrait/browser';
for(const name of ['screenshots','pdf'])await mkdir(dir+'/'+name,{recursive:true});
const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-07T12:00:00+08:00');
const f=await startPostgresFixture({clockFile,entry:process.env.MEETING_PRINT_ENTRY});
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);
let browser:any;const errors:string[]=[],checks:string[]=[];
try{
 await seedPrivateSources(f.db);
 const monthly=await seedFrozenPrivateMeeting(f.db,'2026-10','竖版验收 · 月度业务复盘');
 const [week]=await f.db.insert(s.operationsReviewMeeting).values({name:'竖版验收 · 空态周会',meetingType:'weekly',meetingAt:new Date('2026-11-07T10:00:00+08:00'),periodStart:'2026-11-01',periodEnd:'2026-11-06',status:'completed',currentVersionNumber:0,createdByLabel:'test_admin'}).returning();
 const weeklySnapshot={schemaVersion:4,finalizationStage:'post',meeting:{id:week.id,name:week.name,meetingType:'weekly',periodStart:week.periodStart,periodEnd:week.periodEnd},draft:{schemaVersion:4 as const,workflowVersion:6 as const,coreConclusion:'本周尚无可复盘内容，保留真实空态。',nextAction:'后续按实际发布情况核对。',situation:'本周无可复盘内容。',strategy:'按计划继续准备。',issues:[],promotionInputs:{},promotionSelections:[],nonPromotionSelections:[]},generated:{schemaVersion:4,summary:{posts:0,spend:0,actualOpenCost:null,actualLeadCost:null},promotions:[],nonPromotions:[],pending:[],excludedNonPromotions:[]}};
 const [weekly]=await f.db.insert(s.operationsReviewMeetingVersion).values({meetingId:week.id,versionNumber:0,lifecycleStatus:'finalized',snapshot:weeklySnapshot,changeSummary:'真实空态纸面验收',finalizedByLabel:'test_admin'}).returning();
 await f.db.update(s.operationsReviewMeeting).set({draftSnapshot:weeklySnapshot.draft}).where(eq(s.operationsReviewMeeting.id,week.id));
 const samples=[{kind:'monthly-current',meeting:monthly.meeting,version:monthly.version},{kind:'weekly-empty',meeting:week,version:weekly}];
 for(const sample of samples)await writeFile(dir+'/'+sample.kind+'-snapshot.json',JSON.stringify(sample.version.snapshot));
 browser=await chromium.launch({headless:true});
 const generated=new Map<string,string>();
 for(const actor of [admin,employee]){
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'}),page=await context.newPage();
  page.on('pageerror',(error:Error)=>errors.push(error.message));
  const login=await context.request.post(f.baseURL+'/api/auth/sign-in/username',{headers:{Origin:f.baseURL},data:actor});assert.equal(login.status(),200);
  for(const sample of samples){
   const response=await context.request.post(f.baseURL+'/api/meeting-versions/'+sample.version.id+'/pdf',{headers:{Origin:f.baseURL}}),result=await response.json();assert.equal(response.status(),200,JSON.stringify(result));assert.equal(result.status,'ready');
   if(generated.has(sample.kind))assert.equal(result.id,generated.get(sample.kind),'另一角色复用同一归档');else generated.set(sample.kind,result.id);
   const download=await context.request.get(f.baseURL+'/api/meeting-attachments/'+result.id+'?download=1');assert.equal(download.status(),200);const bytes=await download.body();assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
   await writeFile(dir+'/pdf/'+actor.role+'-'+sample.kind+'.pdf',bytes);
   const [file]=await f.db.select().from(s.operationsMeetingAttachment).where(eq(s.operationsMeetingAttachment.id,result.id));assert.equal(file.byteLength,bytes.length);
   await page.goto(f.baseURL+'/business/meeting-review?meeting='+sample.meeting.id+'&version='+sample.version.versionNumber);await settleBusinessUI(page);
   assert.equal(await page.locator('[data-weekly-snapshot]').count(),1);
   for(const width of [1920,1440,1024]){
    await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));await settleBusinessUI(page);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'屏幕布局不溢出');
    await page.screenshot({path:dir+'/screenshots/'+actor.role+'-'+sample.kind+'-'+width+'.png',fullPage:true});
   }
   await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'窄屏无新增页面溢出');
   await page.setViewportSize({width:794,height:1123});await page.emulateMedia({media:'print'});
   const print=await page.locator('[data-weekly-snapshot]').evaluate((node:HTMLElement)=>({width:node.getBoundingClientRect().width,zoom:getComputedStyle(document.body).zoom,font:getComputedStyle(node).fontFamily}));
   assert.equal(Number(print.zoom),1);assert(print.font.includes('MiSans'));assert(print.width>700&&print.width<=794);
   await page.pdf({path:dir+'/pdf/'+actor.role+'-'+sample.kind+'-browser.pdf',format:'A4',landscape:false,preferCSSPageSize:true,printBackground:true});await page.emulateMedia({media:'screen'});
   const [after]=await f.db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,sample.version.id));assert.deepEqual(after.snapshot,sample.version.snapshot,'导出和打印不改冻结数据');
   checks.push(actor.role+' '+sample.kind+'：生成／下载／缓存／屏幕三档／390溢出／实际打印与冻结不变');
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile(dir+'/result.json',JSON.stringify({passed:true,checks,errors,isolatedPostgres:true},null,2));console.log(checks.join('\n'));
}finally{await browser?.close();await f.stop();}
