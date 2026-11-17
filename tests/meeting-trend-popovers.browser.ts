import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {admin,employee} from './auth.fixture';
import {settleBusinessUI} from './business-confirm.helper';
import * as s from '../src/db/schema';

// Frozen presentation sample: no scheduling, metrics or finalization rules are being changed.
const dir=process.env.TREND_POPOVER_DIR??'.tools/test-artifacts/trend-point-details';
await mkdir(dir+'/screenshots',{recursive:true});await mkdir(dir+'/video',{recursive:true});
const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-17T12:00:00+08:00');
const f=await startPostgresFixture({clockFile,entry:process.env.TREND_POPOVER_ENTRY});
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);
let browser:any;const errors:string[]=[],checks:string[]=[],geometry:any[]=[];
try{
 const weeks=[
  {from:'2026-10-20',through:'2026-10-26',posts:0,spend:0,actualOpenCost:null,actualLeadCost:null,missing:[]},
  {from:'2026-10-27',through:'2026-11-02',posts:3,spend:2000,actualOpenCost:200,actualLeadCost:400,missing:[]},
  {from:'2026-11-03',through:'2026-11-09',posts:4,spend:4115.36,actualOpenCost:342.95,actualLeadCost:587.91,missing:[]},
  {from:'2026-11-10',through:'2026-11-16',posts:4,spend:4071.79,actualOpenCost:339.32,actualLeadCost:370.16,missing:[]},
 ];
 const totals={spend:1591.05,actualOpenCount:3,actualLeadCount:3,actualOpenCost:530.35,actualLeadCost:530.35};
 const card={key:'trend-sample',originKey:'trend-sample',sourceHash:'frozen',campaignId:randomUUID(),scheduleId:randomUUID(),contentId:randomUUID(),versionNumber:1,contentName:'TMUA 讲义 · 隔离样本',subjectId:'TMUA',subjectName:'TMUA',categoryId:null,categoryName:'推广讲义帖',stageType:'scaling',currentStatus:'scaling',startedOn:'2026-11-09',endedOn:'2026-11-16',kind:'current',label:'本期放量',dataRange:{from:'2026-11-09',through:'2026-11-16'},events:[],facts:[],total:totals,periodTotal:totals,changes:totals,missingDates:[],previous:[],historical:{n:0},peers:{n:0},ownHistory:[],leadCostTrend:[
  {key:'past',versionNumber:0,from:'2026-11-01',through:'2026-11-08',value:225.45,current:false},
  {key:'current',versionNumber:1,from:'2026-11-09',through:'2026-11-16',value:530.35,current:true},
 ]};
 const [meeting]=await f.db.insert(s.operationsReviewMeeting).values({name:'周会趋势提示 · 隔离样本',meetingType:'weekly',meetingAt:new Date('2026-11-17T10:00:00+08:00'),periodStart:'2026-11-10',periodEnd:'2026-11-16',status:'completed',currentVersionNumber:0,createdByLabel:'test_admin'}).returning();
 const snapshot={schemaVersion:4,finalizationStage:'post',meeting:{id:meeting.id,name:meeting.name,meetingType:'weekly',periodStart:meeting.periodStart,periodEnd:meeting.periodEnd},draft:{schemaVersion:4 as const,workflowVersion:7 as const,coreConclusion:'隔离样本：悬停圆点查看该周期的实际数值。',nextAction:'仅测试展示交互，原始统计与业务流程保持不变。',situation:'按真实日期范围展示。',strategy:'继续按既有流程执行。',issues:[],promotionInputs:{'trend-sample':{clickRate:3.4,confirmed:true,currentSituation:'查看历史版本与对应周期。',activeAction:'按既有安排继续执行。'}},promotionSelections:['trend-sample'],nonPromotionSelections:[]},generated:{schemaVersion:4,summary:weeks[3],reportMetrics:{scope:'all-promotion-facts',current:weeks[3],previous:weeks[2],weeks},promotions:[card],nonPromotions:[],pending:[],excludedNonPromotions:[]}};
 const [version]=await f.db.insert(s.operationsReviewMeetingVersion).values({meetingId:meeting.id,versionNumber:0,lifecycleStatus:'finalized',snapshot,changeSummary:'趋势圆点展示验收',finalizedByLabel:'test_admin'}).returning();
 await f.db.update(s.operationsReviewMeeting).set({draftSnapshot:snapshot.draft}).where(eq(s.operationsReviewMeeting.id,meeting.id));
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'}),page=await context.newPage();
 await context.addInitScript(()=>{(window as any).__name=(value:any)=>value;});
 page.on('pageerror',(e:Error)=>errors.push(e.message));
 assert.equal((await context.request.post(f.baseURL+'/api/auth/sign-in/username',{headers:{Origin:f.baseURL},data:admin})).status(),200);
 await page.goto(f.baseURL+'/business/meeting-review?meeting='+meeting.id+'&version=0');await settleBusinessUI(page);
 assert.equal(await page.getByText('例会数据暂时不可用，请稍后重试。',{exact:true}).count(),0,'正常冻结样本可读取');
 const overview=page.locator('.report-weekly-overview'),visible=page.locator('.report-trend-tooltip:popover-open');
 const buttons=overview.locator('[data-popover-trigger]');assert.equal(await buttons.count(),14,'零值有圆点，缺失成本无交互点');
 const requests:string[]=[];page.on('request',(r:any)=>{if(r.url().includes('/api/'))requests.push(r.method()+' '+new URL(r.url()).pathname);});
 for(const [index,key] of ['posts','spend','actualOpenCost','actualLeadCost'].entries()){
  const section=overview.locator('.report-kpi-'+key),points=section.locator('[data-popover-trigger]');
  for(let i=0;i<await points.count();i++){
   const point=points.nth(i);await point.hover();await visible.waitFor({state:'visible'});assert.equal(await visible.count(),1);
   assert.equal(await visible.getAttribute('aria-label'),await point.getAttribute('aria-label'),'提示对应实际圆点');
   const content=await visible.innerText();assert(content.includes('2026-'));assert(content.includes(index===0?'篇':index<2?'¥':'/人'));
   if(index<2&&i===0)assert(content.includes(index===0?'0 篇':'¥0.00'),'零值不能变成未记录');
  }
 }
 await buttons.nth(2).focus();await visible.waitFor({state:'visible'});assert((await visible.innerText()).includes('2026-11-03—2026-11-09'));
 await page.keyboard.press('Escape');await visible.waitFor({state:'hidden'});assert(await buttons.nth(2).evaluate((el:HTMLElement)=>el===document.activeElement));
 await buttons.nth(1).click();await page.mouse.move(0,0);await page.waitForTimeout(230);assert.equal(await visible.count(),1,'单击固定提示');
 await page.keyboard.press('Escape');await visible.waitFor({state:'hidden'});
 for(const width of [1920,1440,1024]){
  await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));await settleBusinessUI(page);
  await page.mouse.click(630,30);
  const centers=await page.locator('.report-trend-plot').evaluateAll((plots:HTMLElement[])=>plots.flatMap(plot=>[...plot.querySelectorAll('.report-trend-point button')].map((button,i)=>{const a=button.getBoundingClientRect(),b=plot.querySelectorAll('svg circle')[i].getBoundingClientRect();return Math.hypot(a.x+a.width/2-b.x-b.width/2,a.y+a.height/2-b.y-b.height/2);})));assert(centers.every((distance:number)=>distance<1),'点击热区与圆点中心对齐');
  const top=overview.locator('.report-kpi-actualOpenCost [data-popover-trigger]').nth(1);await top.hover();await visible.waitFor({state:'visible'});
  const bounds=await visible.boundingBox();assert(bounds&&bounds.x>=8&&bounds.x+bounds.width<=width-8,'提示不出屏');
  geometry.push({width,tooltip:bounds});
  await page.screenshot({path:dir+'/screenshots/weekly-result-hover-'+width+'.png',fullPage:false});
  await page.keyboard.press('Escape');await visible.waitFor({state:'hidden'});
  await page.screenshot({path:dir+'/screenshots/weekly-page-'+width+'.png',fullPage:true});
  const history=page.locator('[data-lead-cost-trend] [data-popover-trigger]').first();await history.hover();await visible.waitFor({state:'visible'});
  assert((await visible.innerText()).includes('V0 · 2026-11-01—2026-11-08'));assert((await visible.innerText()).includes('¥225.45/人'));
  const b=await visible.boundingBox();assert(b&&b.x>=8&&b.x+b.width<=width-8);
  await page.screenshot({path:dir+'/screenshots/weekly-history-hover-'+width+'.png'});
  await page.keyboard.press('Escape');await visible.waitFor({state:'hidden'});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 }
 await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>scrollTo(0,0));
 await buttons.nth(1).hover();await visible.waitFor({state:'visible'});await page.mouse.move(0,0);await visible.waitFor({state:'hidden'});
 await buttons.nth(1).hover();await visible.waitFor({state:'visible'});await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await visible.waitFor({state:'hidden'});
 for(const width of [390,320]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 assert.deepEqual(requests,[],'查看趋势不新增接口请求或写入');
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>scrollTo(0,0));await settleBusinessUI(page);
 await page.emulateMedia({media:'print'});assert.equal(await overview.locator('.report-trend-point:visible').count(),0,'打印不显示交互覆盖层');
 await page.pdf({path:dir+'/weekly-trends.pdf',format:'A4',landscape:false,preferCSSPageSize:true,printBackground:true});await page.emulateMedia({media:'screen'});
 const result=await context.request.post(f.baseURL+'/api/meeting-versions/'+version.id+'/pdf',{headers:{Origin:f.baseURL}});assert.equal(result.status(),200);const attachment=await result.json();assert.equal(attachment.status,'ready');
 const file=await context.request.get(f.baseURL+'/api/meeting-attachments/'+attachment.id+'?download=1');assert.equal(file.status(),200);await writeFile(dir+'/weekly-archived.pdf',await file.body());
 const [after]=await f.db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,version.id));assert.deepEqual(after.snapshot,snapshot,'查看与打印不改冻结快照');
 checks.push('全部14个有效点、零值／缺失值、日期与单位、悬停／聚焦／单击／Esc、移开／滚动关闭、三档桌面边界、减少动态、320／390明显溢出、零额外请求、打印与冻结保持');
 await context.close();
 const employeeContext=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});assert.equal((await employeeContext.request.post(f.baseURL+'/api/auth/sign-in/username',{headers:{Origin:f.baseURL},data:employee})).status(),200);
 const employeePage=await employeeContext.newPage();await employeePage.goto(f.baseURL+'/business/meeting-review?meeting='+meeting.id+'&version=0');await settleBusinessUI(employeePage);await employeePage.locator('.report-kpi-spend [data-popover-trigger]').last().hover();await employeePage.locator('.report-trend-tooltip:popover-open').waitFor({state:'visible'});assert((await employeePage.locator('.report-trend-tooltip:popover-open').innerText()).includes('¥4,071.79'));await employeeContext.close();checks.push('员工同一冻结周会提示可用');
 const recording=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:dir+'/video',size:{width:1440,height:1000}}});
 await recording.addInitScript(()=>{(window as any).__name=(value:any)=>value;});assert.equal((await recording.request.post(f.baseURL+'/api/auth/sign-in/username',{headers:{Origin:f.baseURL},data:admin})).status(),200);
 const recorded=await recording.newPage();await recorded.goto(f.baseURL+'/business/meeting-review?meeting='+meeting.id+'&version=0');await settleBusinessUI(recorded);
 for(const selector of ['.report-kpi-posts','.report-kpi-spend','.report-kpi-actualOpenCost','.report-kpi-actualLeadCost','[data-lead-cost-trend]']){const points=recorded.locator(selector+' [data-popover-trigger]');await points.first().hover();await recorded.waitForTimeout(700);await points.last().hover();await recorded.waitForTimeout(700);await recorded.keyboard.press('Escape');}
 await recording.close();await writeFile(dir+'/result.json',JSON.stringify({passed:true,checks,errors,geometry,isolatedPostgres:true},null,2));assert.deepEqual(errors,[]);console.log(checks.join('\n'));
}finally{await browser?.close();await f.stop();}
