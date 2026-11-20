/** 实际目标包：凌晨定稿、05:00边界、精简字段及真实归档PDF；只写隔离数据库。 */
import assert from 'node:assert/strict';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {and,eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {admin,employee,startFixture} from './auth.fixture';
import {settleBusinessUI,respondToBusinessConfirm} from './business-confirm.helper';
import {discussionFromDraft} from '../src/db/meeting-discussion-values';
import * as s from '../src/db/schema';
const dir=process.env.MEETING_GRACE_DIR??'.tools/test-artifacts/meeting-grace';
for(const name of ['screenshots','pdf','video'])await mkdir(dir+'/'+name,{recursive:true});
const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-20T22:00:00+08:00');
const f=await (process.env.MEETING_GRACE_PGLITE==='1'?startFixture({clockFile,entry:'.tools/serve-vercel.mjs'}):startPostgresFixture({clockFile,entry:'.tools/serve-vercel.mjs'})),baseURL=f.baseURL;
const db=f.db as unknown as Awaited<ReturnType<typeof startPostgresFixture>>['db'];
console.log('隔离服务已启动');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);const browser=await chromium.launch({headless:true,args:['--disable-gpu','--disable-dev-shm-usage','--renderer-process-limit=1']});
console.log('浏览器已启动');
const checks:string[]=[],errors:string[]=[];let page:any;
async function row(id:string){return (await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,id)))[0];}
async function versions(id:string){return db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId,id)).orderBy(s.operationsReviewMeetingVersion.versionNumber);}
async function call(context:any,id:string,payload:any,status=200){console.log(payload.action,payload.stage??'',Math.round(process.memoryUsage().rss/1024/1024)+'MB');const r=await context.request.patch(baseURL+'/api/meeting-reviews/'+id,{headers:{Origin:baseURL},data:payload});const body=await r.json();assert.equal(r.status(),status,JSON.stringify(body));return body;}
async function shot(name:string){await settleBusinessUI(page);await page.mouse.move(0,0);await page.screenshot({path:dir+'/screenshots/'+name+'.png'});}
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:dir+'/video',size:{width:1440,height:1000}}});await context.addInitScript({content:'window.__name = value => value;'});
 assert.equal((await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:admin})).status(),200);
 const [content]=await db.insert(s.operationsContent).values({platformNoteId:'a'.repeat(24),operationType:'promotion_only'}).returning();
 const [version]=await db.insert(s.operationsContentVersion).values({contentId:content.id,contentName:'凌晨定稿 · 完整推广样例',versionNumber:0,workType:'new',subjectId:'tmua',categoryId:'temporary'}).returning();
 const [schedule]=await db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,isPromoted:true,promotionStatus:'testing',completionStatus:'on_time',plannedPublishAt:new Date('2026-11-17T18:00:00+08:00'),actualPublishAt:new Date('2026-11-17T18:00:00+08:00')}).returning();
 const [campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:schedule.id,startedOn:'2026-11-17',dailyReviewEnabledOn:'2026-11-17',initialStage:'testing',currentStage:'testing',currentStatus:'testing'}).returning();
 await db.insert(s.operationsPromotionStage).values({campaignId:campaign.id,startedOn:'2026-11-17',stageType:'testing'});
 await db.insert(s.operationsPromotionDailyMetric).values([17,18,19].map(day=>({campaignId:campaign.id,metricDate:'2026-11-'+day,dailyStatus:'active' as const,actualStatusSnapshot:'testing' as const,stageTypeSnapshot:'testing' as const,recordKind:'regular' as const,sourceStageStartedOn:'2026-11-17',spend:'100',platformOpenCount:10,actualOpenCount:4,platformLeadCount:3,actualLeadCount:2,reviewDecision:day===19?'test_pending' as const:'test_continue' as const})));
 const created=await context.request.post(baseURL+'/api/meeting-reviews',{headers:{Origin:baseURL},form:{meetingType:'weekly',meetingAt:'2026-11-20T19:00',periodStart:'2026-11-17',periodEnd:'2026-11-19',name:'凌晨定稿验证'}});assert.equal(created.status(),201);const {id}=await created.json();
 const initial=(await versions(id))[0],meeting=await row(id),material=(await (await context.request.get(baseURL+'/api/meeting-reviews/'+id+'/material')).json()).material;
 assert.equal(material.promotions.length,1);
 console.log('真实推广材料已读取');
 const card=material.promotions[0],draft={...meeting.draftSnapshot,workflowVersion:7,candidatesConfirmed:true,materialFingerprint:material.fingerprint,promotionSelections:[card.key],promotionInputs:{[card.key]:{confirmed:true,clickRate:4,currentSituation:'根据实际开口与留资核对。',activeAction:'保留已确认安排。',recordedThrough:'2026-11-19',rateRange:card.dataRange}},promotionDecisions:{[campaign.id]:'test_discarded'},situation:'',strategy:'',coreConclusion:'核心结论保留，精简重复文字。',nextAction:'从原业务日执行确认的测试结束安排。',issues:[{problem:'核对资料',conclusion:'按原计划跟进',status:'pending'}]};
 let result=await call(context,id,{action:'finalize_version_draft',stage:'pre',draftVersionId:initial.id,expectedUpdatedAt:meeting.updatedAt.toISOString(),draft});
 let current=(await versions(id))[0],discussion=discussionFromDraft((current.snapshot as any).draft);discussion.coreConclusion='会前修订V1';
 result=await call(context,id,{action:'save_version_draft',sourceVersionId:current.id,expectedUpdatedAt:(await row(id)).updatedAt.toISOString(),discussion});
 result=await call(context,id,{action:'finalize_version_draft',stage:'pre',sourceVersionId:current.id,draftVersionId:result.versionId,expectedUpdatedAt:result.updatedAt,discussion});
 current=(await versions(id)).find(v=>v.versionNumber===1)!;discussion=discussionFromDraft((current.snapshot as any).draft);discussion.coreConclusion='凌晨继续讨论后的V2核心结论';
 result=await call(context,id,{action:'save_version_draft',sourceVersionId:current.id,expectedUpdatedAt:result.updatedAt,discussion});
 const savedDraftId=result.versionId,old=await versions(id),oldFrozen=old.filter(v=>v.lifecycleStatus!=='draft').map(v=>JSON.stringify(v.snapshot));
 await writeFile(clockFile,'2026-11-21T01:30:00+08:00');page=await context.newPage();const videoZero=performance.now();await page.clock.install({time:new Date('2026-11-21T01:30:00+08:00')});page.on('pageerror',(error:Error)=>errors.push(error.message));
 const nav=()=>page.goto(baseURL+'/business/meeting-review?meeting='+id);
 await nav();await settleBusinessUI(page);
 const post=()=>page.getByRole('button',{name:'会后定稿 V2',exact:true});assert(await post().isEnabled());
 assert(await page.getByRole('combobox',{name:card.contentName+' 下一步状态',exact:true}).isEnabled());
 assert.equal(await page.getByRole('heading',{name:'衡量情况',exact:true}).count(),0);assert.equal(await page.getByRole('heading',{name:'本期具体动作',exact:true}).count(),0);
 assert.equal(await page.getByRole('heading',{name:'事项跟进',exact:true}).count(),1);
 for(const width of [1440,1024]){await page.setViewportSize({width,height:1000});await page.getByRole('heading',{name:'事项跟进',exact:true}).scrollIntoViewIfNeeded();await shot('draft-v2-0130-'+width);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 await page.setViewportSize({width:1440,height:1000});await writeFile(clockFile,'2026-11-21T04:59:59+08:00');await page.clock.setSystemTime(new Date('2026-11-21T04:59:59+08:00'));await page.clock.runFor(1);assert(await post().isEnabled());
 await writeFile(clockFile,'2026-11-21T05:00:00+08:00');await page.clock.runFor(2100);assert.equal(await post().isEnabled(),false);assert.equal(await page.getByRole('combobox',{name:card.contentName+' 下一步状态',exact:true}).isEnabled(),false);assert.match(await post().getAttribute('title'),/05:00/);await shot('deadline-0500-1440');
 await call(context,id,{action:'finalize_version_draft',stage:'post',sourceVersionId:current.id,draftVersionId:savedDraftId,expectedUpdatedAt:result.updatedAt,discussion},422);assert.equal((await versions(id)).length,3);assert.equal((await versions(id))[2].lifecycleStatus,'draft');
 checks.push('实际V2会前草稿在01:30、04:59:59开放，页面计时跨05:00锁定；服务端直调拒绝且保留同一草稿');
 await writeFile(clockFile,'2026-11-21T01:30:00+08:00');await page.clock.setSystemTime(new Date('2026-11-21T01:30:00+08:00'));await nav();await settleBusinessUI(page);assert(await post().isEnabled());const clipStart=(performance.now()-videoZero)/1000;await post().click();await respondToBusinessConfirm(page,false);assert.equal((await versions(id))[2].lifecycleStatus,'draft');
 await post().click();await respondToBusinessConfirm(page,true);await page.waitForURL(/version=2/);await settleBusinessUI(page);
 const clipEnd=(performance.now()-videoZero)/1000;const after=await versions(id),final=after.find(v=>v.id===savedDraftId)!;assert.equal(after.length,3);assert.equal(final.lifecycleStatus,'finalized');assert.equal((final.snapshot as any).finalizationStage,'post');assert.equal(final.pdfStatus,'ready');
 assert.equal((final.snapshot as any).decisionEffectiveOn,'2026-11-21');assert.equal((final.snapshot as any).generated.meetingDecisions[0].targetStatus,'test_discarded');assert.equal((final.snapshot as any).generated.meetingDecisions[0].effectiveOn,'2026-11-21');
 assert.deepEqual(after.filter(v=>v.id!==savedDraftId).map(v=>JSON.stringify(v.snapshot)),oldFrozen);
 assert.deepEqual((final.snapshot as any).generated.summary,(old[2].snapshot as any).generated.summary);
 const [pdf]=await db.select().from(s.operationsMeetingAttachment).where(and(eq(s.operationsMeetingAttachment.meetingVersionId,savedDraftId),eq(s.operationsMeetingAttachment.mimeType,'application/pdf')));assert(pdf);await writeFile(dir+'/pdf/weekly-v2.pdf',Buffer.from(pdf.base64,'base64'));
 for(const width of [1440,1024]){await page.setViewportSize({width,height:1000});await page.getByRole('heading',{name:'事项跟进',exact:true}).scrollIntoViewIfNeeded();await shot('post-v2-'+width);}
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.getByRole('heading',{name:'事项跟进',exact:true}).scrollIntoViewIfNeeded();await shot('post-obvious-mobile-390');
 const staff=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});assert.equal((await staff.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:employee})).status(),200);const employeePage=await staff.newPage();await employeePage.clock.setFixedTime(new Date('2026-11-21T01:30:00+08:00'));await employeePage.goto(baseURL+'/business/meeting-review?meeting='+id+'&version=2');assert.equal(await employeePage.getByRole('heading',{name:'衡量情况',exact:true}).count(),0);await employeePage.getByRole('heading',{name:'事项跟进',exact:true}).scrollIntoViewIfNeeded();await settleBusinessUI(employeePage);await employeePage.screenshot({path:dir+'/screenshots/employee-post-v2-1440.png'});await staff.close();
 checks.push('两项旧文字为空可同号会后定稿，取消保留，旧版及冻结指标不变；真实推广安排仍在原生效日，PDF自动归档，管理员／员工查看同步精简');
 assert.deepEqual(errors,[]);const video=page.video();await context.close();await copyFile(await video.path(),dir+'/finalize-operation.webm');await writeFile(dir+'/result.json',JSON.stringify({passed:true,checks,errors,database:process.env.MEETING_GRACE_PGLITE==='1'?'PGlite':'PostgreSQL',video:{start:clipStart,duration:clipEnd-clipStart},pdf:'pdf/weekly-v2.pdf',productionWrites:false},null,2));console.log(checks.join('\n'));
}catch(error){await page?.screenshot({path:dir+'/failure.png'}).catch(()=>{});console.error(f.logs().slice(-1400));throw error;}finally{await browser.close();await f.stop();}
