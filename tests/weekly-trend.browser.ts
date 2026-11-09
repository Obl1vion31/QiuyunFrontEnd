import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {and,desc,eq,gte} from 'drizzle-orm';
import {startFixture,admin} from './auth.fixture';
import {settleBusinessUI,respondToBusinessConfirm} from './business-confirm.helper';
import * as s from '../src/db/schema';

const dir=process.env.TREND_DIR??'.tools/test-artifacts/weekly-trend/after',baseline=process.env.TREND_BASELINE==='1';
await mkdir(dir,{recursive:true});const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-09T12:00:00+08:00');
const fixture=await startFixture({clockFile,entry:process.env.TREND_ENTRY}),{db,baseURL}=fixture;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);
let browser:any;const checks:string[]=[],errors:string[]=[];
async function ready(page:any){
 await page.waitForFunction(()=>!document.querySelector('astro-island[ssr]'));
 await page.waitForFunction(()=>{const charts=document.querySelectorAll('.report-weekly-overview [data-report-chart]');return charts.length===4&&[...charts].every(chart=>!chart.hasAttribute('data-chart-pending'));});
 await settleBusinessUI(page);
}
try{
 const [content]=await db.insert(s.operationsContent).values({platformNoteId:'a'.repeat(24)}).returning();
 const [version]=await db.insert(s.operationsContentVersion).values({contentId:content.id,versionNumber:0,workType:'new',contentName:'TMUA 讲义推广 · 折线样例',subjectId:'tmua',categoryId:'promotional-handout'}).returning();
 const [schedule]=await db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:new Date('2026-10-12T10:00:00+08:00'),actualPublishAt:new Date('2026-10-12T10:00:00+08:00'),isPromoted:true,promotionStatus:'scaling',completionStatus:'on_time'}).returning();
 const [campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:schedule.id,startedOn:'2026-10-12',dailyReviewEnabledOn:'2026-10-12',initialStage:'scaling',currentStage:'scaling',currentStatus:'scaling'}).returning();
 await db.insert(s.operationsPromotionStage).values({campaignId:campaign.id,startedOn:'2026-10-12',stageType:'scaling'});
 await db.insert(s.operationsPromotionDailyMetric).values(Array.from({length:28},(_,i)=>({campaignId:campaign.id,metricDate:new Date(Date.parse('2026-10-12T00:00:00Z')+i*864e5).toISOString().slice(0,10),dailyStatus:'active' as const,stageTypeSnapshot:'scaling' as const,actualStatusSnapshot:'scaling' as const,sourceStageStartedOn:'2026-10-12',spend:String([80,120,100,160][Math.floor(i/7)]),platformOpenCount:6,actualOpenCount:[2,3,2,4][Math.floor(i/7)],platformLeadCount:4,actualLeadCount:[1,2,1,3][Math.floor(i/7)],reviewDecision:'scaling_continue' as const})));
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1920,height:1000},locale:'zh-CN'});
 assert.equal((await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:admin})).status(),200);
 async function create(name:string,from='2026-11-01'){
  const response=await context.request.post(baseURL+'/api/meeting-reviews',{headers:{Origin:baseURL},form:{meetingType:'weekly',meetingAt:'2026-11-09T16:00',periodStart:from,periodEnd:'2026-11-08',name}});assert.equal(response.status(),201,await response.text());const id=(await response.json()).id as string;
  const [row]=await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,id)),[v0]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId,id));
  const saved=await context.request.patch(baseURL+'/api/meeting-reviews/'+id,{headers:{Origin:baseURL},data:{action:'save_version_draft',draftVersionId:v0.id,expectedUpdatedAt:row.updatedAt.toISOString(),draft:{...row.draftSnapshot,workflowVersion:6,candidatesConfirmed:true}}});assert.equal(saved.status(),200,await saved.text());return id;
 }
 const id=await create('2026M11W1 周例会 · 隔离样例'),[meeting]=await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,id)),[initial]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId,id));
 const draft={...meeting.draftSnapshot,workflowVersion:6,candidatesConfirmed:true,coreConclusion:'按已登记的推广事实核对本期结果。',nextAction:'保留有效内容，继续观察咨询质量。',situation:'本期结果按会议区间读取。',strategy:'按既定排期执行。'};
 const pre=await context.request.patch(baseURL+'/api/meeting-reviews/'+id,{headers:{Origin:baseURL},data:{action:'finalize_version_draft',stage:'pre',draftVersionId:initial.id,expectedUpdatedAt:meeting.updatedAt.toISOString(),draft}});assert.equal(pre.status(),200,await pre.text());
 const page=await context.newPage();page.on('pageerror',(e:Error)=>errors.push(e.message));await page.goto(baseURL+'/business/meeting-review?meeting='+id);await settleBusinessUI(page);
 await page.getByRole('radio',{name:'编辑模式',exact:true}).check();await page.getByRole('button',{name:'会后定稿 V1',exact:true}).click();await respondToBusinessConfirm(page,true);await page.waitForURL(/version=1/);await ready(page);
 const [frozen]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId,id)).orderBy(desc(s.operationsReviewMeetingVersion.versionNumber));assert.equal(frozen.pdfStatus,'ready');const stored=JSON.stringify(frozen.snapshot);
 const [attachment]=await db.select().from(s.operationsMeetingAttachment).where(and(eq(s.operationsMeetingAttachment.meetingVersionId,frozen.id),eq(s.operationsMeetingAttachment.source,'generated')));assert(attachment);const pdfBytes=Buffer.from(attachment.base64,'base64');await writeFile(dir+'/weekly.pdf',pdfBytes);
 async function inspect(p:any,expected:number,emptyCosts=false){
  const charts=p.locator('.report-weekly-overview .report-trend');assert.equal(await charts.count(),4);
  for(let i=0;i<4;i++){const chart=charts.nth(i);assert.equal(await chart.locator('circle.is-current').count(),emptyCosts&&i>=2?0:expected);const visible=await chart.locator('.report-period-highlight').evaluateAll((nodes:Element[])=>nodes.filter(n=>getComputedStyle(n).display!=='none').length);assert.equal(visible,baseline?expected:0);assert(!(await chart.locator('svg').getAttribute('aria-label')).includes('NaN'));}
 }
 const recording=await browser.newContext({viewport:{width:1920,height:1000},locale:'zh-CN',recordVideo:{dir:dir+'/video',size:{width:1920,height:1000}}});await recording.addCookies(await context.cookies());const visual=await recording.newPage();visual.on('pageerror',(e:Error)=>errors.push(e.message));await visual.goto(baseURL+'/business/meeting-review?meeting='+id+'&version=1');await ready(visual);await inspect(visual,baseline?2:1);
 const geometry=await visual.locator('.report-weekly-overview').evaluate((node:Element)=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});
 await visual.locator('.report-trend circle').first().focus();await visual.keyboard.press('Tab');await inspect(visual,baseline?2:1);await visual.waitForTimeout(600);const video=visual.video();await recording.close();await video.saveAs(dir+'/weekly-entry.webm');
 await page.goto(baseURL+'/business/meeting-review?meeting='+id+'&version=1');await page.getByRole('radio',{name:'只读模式',exact:true}).check();await ready(page);await page.screenshot({path:dir+'/weekly-1920.png'});await page.locator('.report-kpis').screenshot({path:dir+'/weekly-chart-detail.png'});
 checks.push(baseline?'复现：11月1—8日同时出现两个实心点与两条底纹':'8天复盘区间：每项仅一个末有效实心点，无可见竖条；进入动效及键盘不增加标记');
 if(!baseline){
  const seven=await create('正常7天区间样例','2026-11-02');await page.goto(baseURL+'/business/meeting-review?meeting='+seven);await ready(page);await inspect(page,1);checks.push('正常7天复盘区间同样只强调末有效点');
  await db.update(s.operationsPromotionDailyMetric).set({spend:'0',actualOpenCount:0,actualLeadCount:0}).where(and(eq(s.operationsPromotionDailyMetric.campaignId,campaign.id),gte(s.operationsPromotionDailyMetric.metricDate,'2026-11-02')));
  const tail=await create('末周成本未知与零消耗样例');await page.goto(baseURL+'/business/meeting-review?meeting='+tail);await ready(page);await inspect(page,1);assert.equal(await page.locator('.report-kpi-actualOpenCost circle.is-current').getAttribute('cx'),'196');assert.equal(await page.locator('.report-kpi-spend circle.is-current').getAttribute('cx'),'288');await page.locator('.report-kpis').screenshot({path:dir+'/unknown-tail-and-zero.png'});checks.push('末周成本未知时强调前一有效点，真实0消耗仍强调末周；缺值不补0');
  await db.update(s.operationsPromotionDailyMetric).set({actualOpenCount:0,actualLeadCount:0}).where(eq(s.operationsPromotionDailyMetric.campaignId,campaign.id));const unknown=await create('成本全部未知样例');await page.goto(baseURL+'/business/meeting-review?meeting='+unknown);await ready(page);await inspect(page,1,true);assert.equal(await page.locator('.report-kpi-actualOpenCost circle').count(),0);checks.push('成本全未知时没有实心或空心数据点，不制造零值');
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto(baseURL+'/business/meeting-review?meeting='+id+'&version=1');await ready(page);await inspect(page,1);const current=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,frozen.id));assert.equal(JSON.stringify(current[0].snapshot),stored);
  const cached=await context.request.post(baseURL+'/api/meeting-versions/'+frozen.id+'/pdf',{headers:{Origin:baseURL}});assert.equal(cached.status(),200);assert.equal((await cached.json()).id,attachment.id);assert.equal((await db.select().from(s.operationsMeetingAttachment).where(eq(s.operationsMeetingAttachment.id,attachment.id)))[0].base64,attachment.base64);checks.push('减少动态效果、冻结JSON和已生成PDF字节保持；实际运行包生成周会PDF成功');
 }
 assert.deepEqual(errors,[]);await context.close();await writeFile(dir+'/result.json',JSON.stringify({baseline,checks,errors,geometry,pdfSha256:createHash('sha256').update(pdfBytes).digest('hex'),role:'admin',viewport:'1920x1000',database:'isolated PGlite',productionBusinessWrites:false},null,2));for(const check of checks)console.log((baseline?'REPRO ':'PASS ')+check);
}finally{await browser?.close();await fixture.stop();}
