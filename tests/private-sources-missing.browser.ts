import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startPostgresFixture} from './postgres.fixture';
import {seedPrivateSources} from './private-sources.fixture';
import {admin} from './auth.fixture';
import {settleBusinessUI} from './business-confirm.helper';
import * as s from '../src/db/schema';
const dir=process.env.PRIVATE_SOURCE_EVIDENCE_DIR??'.tools/test-artifacts/private-sources-final';await mkdir(dir+'/screenshots',{recursive:true});
const clock=process.cwd()+'/'+dir+'/edge-clock.txt';await writeFile(clock,'2026-11-06T12:00:00+08:00');
const f=await startPostgresFixture({clockFile:clock}),{db,baseURL}=f;let browser:any;const checks:string[]=[],images:any[]=[];
try{
 await seedPrivateSources(db);const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);browser=await chromium.launch({headless:true,args:['--no-sandbox']});const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});assert.equal((await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:admin})).status(),200);
 const page=await context.newPage(),month='2025-01',data={schemaVersion:2,promotion:[{subjectId:'tmua',demand:'course',added:2,consulted:1,converted:1}],nonPromotion:[],note:''};
 assert.equal((await context.request.patch(baseURL+'/api/monthly-private-data',{headers:{Origin:baseURL},data:{month,expectedRevision:-1,data}})).status(),200);
 async function read(){return (await context.request.get(baseURL+'/api/monthly-operations?month='+month)).json();}
 async function shot(name:string){await page.goto(baseURL+'/business/monthly-operations?month='+month);await page.waitForFunction(()=>{const n=document.querySelector('[data-monthly-operations]');return n&&!n.closest('astro-island')?.hasAttribute('ssr');});await settleBusinessUI(page);await page.evaluate(()=>scrollTo(0,0));const crop=await page.locator('[data-private-panel]').boundingBox();await page.screenshot({path:dir+'/screenshots/'+name+'-full.png',fullPage:true});images.push({name,crop});}
 let value=await read();assert.equal(value.privateData.totalSpend,null);assert.deepEqual(value.privateData.totalCosts,{added:null,consulted:null,converted:null});assert.equal(value.privateData.subjects[0].demands[0].spend,null);await shot('monthly-unrecorded-private-1440');await page.getByRole('button',{name:'录入／更正',exact:true}).click();await settleBusinessUI(page);assert.equal(await page.locator('.ps-input-row small').first().innerText(),'消耗 —');await page.screenshot({path:dir+'/screenshots/editor-unrecorded-1440.png'});await page.locator('#monthly-private-sheet').getByRole('button',{name:'关闭',exact:true}).click();checks.push('有来源人数但无消耗记录时，汇总、用途及只读录入均保留未知');
 const at=new Date('2025-01-03T10:00:00+08:00'),[content]=await db.insert(s.operationsContent).values({operationType:'promotion_only'}).returning();
 const [version]=await db.insert(s.operationsContentVersion).values({contentId:content.id,contentName:'真实零消耗边界样本',versionNumber:0,workType:'new',subjectId:'tmua',categoryId:'small-class-or-tutoring'}).returning();
 const [schedule]=await db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:at,actualPublishAt:at,isPromoted:true,promotionStatus:'ended',completionStatus:'on_time'}).returning();
 const [campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:schedule.id,startedOn:'2025-01-03',dailyReviewEnabledOn:'2025-01-03',initialStage:'scaling',currentStage:null,currentStatus:'ended',endedOn:'2025-01-03'}).returning();
 await db.insert(s.operationsPromotionStage).values({campaignId:campaign.id,stageType:'scaling',startedOn:'2025-01-03',endedOn:'2025-01-03'});
 await db.insert(s.operationsPromotionDailyMetric).values({campaignId:campaign.id,metricDate:'2025-01-03',dailyStatus:'active',stageTypeSnapshot:'scaling',actualStatusSnapshot:'scaling',sourceStageStartedOn:'2025-01-03',spend:'0.00',platformOpenCount:0,actualOpenCount:0,platformLeadCount:0,actualLeadCount:0,reviewDecision:'ended'});
 value=await read();assert.equal(value.privateData.totalSpend,0);assert.deepEqual(value.privateData.totalCosts,{added:0,consulted:0,converted:0});await shot('monthly-zero-spend-private-1440');checks.push('实际登记0元且人数为正时，三项成本均为0');
 await writeFile(dir+'/missing-spend.json',JSON.stringify({code:'未登记消耗与真实零的正式接口对照',checks,images},null,2));await context.close();console.log('MISSING_SPEND_OK '+checks.length);
}finally{await browser?.close();await f.stop();}
