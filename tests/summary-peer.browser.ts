/** 同类摘要、历史计数和长金额的真实组件回归；隔离PGlite。 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startFixture,admin} from './auth.fixture';
import {settleBusinessUI} from './business-confirm.helper';
import * as s from '../src/db/schema';
const folder=process.env.SUMMARY_EVIDENCE_DIR||'.tools/test-artifacts/summary-controls';await mkdir(folder+'/screenshots',{recursive:true});const fixture=await startFixture(),{db,baseURL}=fixture;let browser:any;
try{
 const draft:any={schemaVersion:4,workflowVersion:7,finalizationStage:'post',coreConclusion:'隔离验收：同级统计保持共同锚点。',nextAction:'继续观察',promotionInputs:{},issues:[],nonPromotionSelections:[]};
 const [meeting]=await db.insert(s.operationsReviewMeeting).values({name:'统计同级对齐验收例会',periodStart:'2026-10-16',periodEnd:'2026-10-24',meetingAt:new Date('2026-10-25T16:00:00+08:00'),status:'completed',currentVersionNumber:2,draftSnapshot:draft,createdByLabel:'虚构验收'}).returning();
 const snapshot:any={schemaVersion:4,finalizationStage:'post',meeting:{id:meeting.id,name:meeting.name,periodStart:meeting.periodStart,periodEnd:meeting.periodEnd},draft,generated:{summary:{posts:12,spend:12345.67,actualOpenCost:123.45,actualLeadCost:999.99},promotions:[],nonPromotions:[],excludedNonPromotions:[{key:'fixture',contentName:'虚构不复盘样本',checkpointType:'day_7',reason:'测试样本不适用'}]}};
 await db.insert(s.operationsReviewMeetingVersion).values([0,1,2].map(n=>({meetingId:meeting.id,versionNumber:n,lifecycleStatus:'finalized',snapshot,changeSummary:'隔离视觉验收',pdfStatus:'failed',finalizedByLabel:'虚构验收'})));
 const {chromium}=await import(new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);browser=await chromium.launch({headless:true});const context=await browser.newContext({locale:'zh-CN',reducedMotion:'reduce'});const login=await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:admin});assert.equal(login.status(),200);const page=await context.newPage();const checks=[];
 for(const width of [1920,1440,1024,390,320]){
  await page.setViewportSize({width,height:width<500?780:1000});await page.goto(baseURL+'/business/meeting-review');await page.locator('.meeting-history-overview>summary').click();const text=await page.locator('.meeting-history>summary').innerText();assert.match(text,/\(3 版\)/);await settleBusinessUI(page);await page.screenshot({path:`${folder}/screenshots/meeting-history-count-${width}.png`});
  await page.goto(baseURL+`/business/meeting-review?meeting=${meeting.id}&version=0`);await page.locator('.weekly-summary').waitFor();await settleBusinessUI(page);const heights=await page.locator('.weekly-summary strong').evaluateAll((nodes:HTMLElement[])=>nodes.map(n=>n.getBoundingClientRect().height));assert.ok(heights.every((height:number)=>height<=31),`摘要数值必须完整同行：${width} ${JSON.stringify(heights)}`);await page.screenshot({path:`${folder}/screenshots/meeting-summary-${width}.png`});assert.equal(await page.getByText('本期不复盘 (1 项)',{exact:true}).count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);checks.push(`${width}px例会摘要及历史版本计数`);
 }
 await page.emulateMedia({media:'print'});assert.equal(await page.locator('.weekly-results').evaluate((n:HTMLElement)=>getComputedStyle(n).containerType),'normal');assert.equal(await page.locator('.weekly-summary').evaluate((n:HTMLElement)=>getComputedStyle(n).gridTemplateColumns.split(' ').length),4);checks.push('屏幕容器重排不覆盖打印四列');
 await writeFile(folder+'/peers-result.json',JSON.stringify({passed:true,checks},null,2));console.log(JSON.stringify({passed:true,checks}));await context.close();
}finally{await browser?.close();await fixture.stop();}
