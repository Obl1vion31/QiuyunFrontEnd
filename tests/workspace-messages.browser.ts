/** 实际目标包：提示语义、角色指引、网络结果未知和PDF状态；只写隔离数据库。 */
import assert from 'node:assert/strict';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {and,eq} from 'drizzle-orm';
import {withDatabase,type Database} from '../src/db/client';
import {saveJuguangConnection} from '../src/integrations/xiaohongshu-juguang';
import {seedLinkPlan} from './monthly-plan-links.fixture';
import {admin,employee,startFixture} from './auth.fixture';
import {settleBusinessUI,respondToBusinessConfirm} from './business-confirm.helper';
import {discussionFromDraft} from '../src/db/meeting-discussion-values';
import * as s from '../src/db/schema';
process.env.XHS_JUGUANG_APP_ID='42';process.env.XHS_JUGUANG_APP_SECRET='fictional-app-secret';process.env.BETTER_AUTH_SECRET='fictional-browser-secret-at-least-32-characters';
const dir=process.env.WORKSPACE_MESSAGES_DIR??'.tools/test-artifacts/workspace-messages';
for(const name of ['screenshots','pdf','video'])await mkdir(dir+'/'+name,{recursive:true});
const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-20T22:00:00+08:00');
const f=await startFixture({clockFile,entry:'.tools/serve-vercel.mjs'}),baseURL=f.baseURL;
const db=f.db as unknown as Database;
console.log('隔离服务已启动');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);const browser=await chromium.launch({headless:true,args:['--disable-gpu','--disable-dev-shm-usage','--renderer-process-limit=1']});
console.log('浏览器已启动');
const checks:string[]=[],errors:string[]=[],copyClips:Array<{name:string;start:number;duration:number}>=[];let page:any;
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
 await writeFile(clockFile,'2026-11-21T05:00:00+08:00');await page.clock.runFor(2100);assert.equal(await post().isEnabled(),false);assert.equal(await page.getByRole('combobox',{name:card.contentName+' 下一步状态',exact:true}).isEnabled(),false);assert.match(await post().getAttribute('title'),/05:00/);await shot('deadline-0500-1440');assert.match(await page.locator('.weekly-expired').first().innerText(),/2026-11-21 05:00.*锁定/);assert.match(await page.locator('.weekly-expired').first().innerText(),/结论和说明仍可修订/);
 await page.setViewportSize({width:1024,height:1000});await shot('deadline-0500-1024');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.setViewportSize({width:1440,height:1000});
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
 const staff=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});assert.equal((await staff.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:employee})).status(),200);const employeePage=await staff.newPage();await employeePage.clock.setFixedTime(new Date('2026-11-21T01:30:00+08:00'));await employeePage.goto(baseURL+'/business/meeting-review?meeting='+id+'&version=2');assert.equal(await employeePage.getByRole('heading',{name:'衡量情况',exact:true}).count(),0);await employeePage.getByRole('heading',{name:'事项跟进',exact:true}).scrollIntoViewIfNeeded();await settleBusinessUI(employeePage);await employeePage.screenshot({path:dir+'/screenshots/employee-post-v2-1440.png'});
 await page.setViewportSize({width:1440,height:1000});
 for(const [target,role] of [[page,'admin'],[employeePage,'employee']] as const){
  await target.goto(baseURL+'/business/operations-schedule?month=2026-12&display=calendar&view=schedule');await settleBusinessUI(target);
  const hint=await target.locator('.arrangement-heading').innerText();assert.match(hint,/2026-12.*预排期尚未确认/);assert.equal(hint.includes('联系管理员'),role==='employee');
  await target.screenshot({path:dir+'/screenshots/'+role+'-preplan-1440.png'});
 }
 const form={contentName:'隔离提示样例',subjectId:'tmua',categoryId:'temporary',contentRole:'',operationType:'promotion_only',promotionStatus:'awaiting_promotion',plannedPublishAt:'2026-12-18T18:00',projectDocUrl:''};
 for(const [request,role] of [[context.request,'admin'],[staff.request,'employee']] as const){const r=await request.post(baseURL+'/api/operations-content',{headers:{Origin:baseURL},form});const body=await r.json();assert.equal(r.status(),422,JSON.stringify(body));assert.equal(body.message.includes('联系管理员'),role==='employee');}
 const denied=await staff.request.get(baseURL+'/api/admin/accounts');assert.equal(denied.status(),403);assert.match((await denied.json()).message,/管理员/);
 const invalid=await context.request.post(baseURL+'/api/non-promotion-reviews',{headers:{Origin:baseURL},form:{scheduleId:schedule.id,checkpointType:'day_7',recordedThrough:'2026-11-19',exposureCount:'',readCount:'-1',threeSecondReadRate:'101',conclusion:''}});
 assert.equal(invalid.status(),422);const invalidBody=await invalid.json();assert.match(invalidBody.fields.exposureCount.join(''),/曝光量/);assert.match(invalidBody.fields.readCount.join(''),/阅读量/);assert.doesNotMatch(JSON.stringify(invalidBody.fields),/Invalid input|Too small|Too big|received NaN/);
 checks.push('真实接口中文字段校验、重复与冲突规则、管理员／员工预排期指引及服务端门禁保持');
 const linked=await seedLinkPlan(db,{month:'2026-11',groups:[{name:'隔离预排期',quantity:1,week:3}]});
 await db.update(s.operationsMonthlyPlan).set({arrangementStatus:'editing'}).where(eq(s.operationsMonthlyPlan.id,linked.plan.id));
 await page.goto(baseURL+'/business/operations-schedule?month=2026-11&display=calendar&view=schedule');await settleBusinessUI(page);
 const monthClip=(performance.now()-videoZero)/1000;await page.getByRole('button',{name:'定稿并封存',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'定稿并封存',exact:true});await dialog.waitFor();assert.match(await dialog.innerText(),/核心结论、下一步行动仍可修订/);assert.match(await dialog.innerText(),/统计、原计划和事项将固定/);await shot('monthly-seal-confirm-1440');await respondToBusinessConfirm(page,false);
 copyClips.push({name:'monthly-confirm',start:monthClip,duration:(performance.now()-videoZero)/1000-monthClip});
 const actor=(await (await context.request.get(baseURL+'/api/auth/get-session')).json()).user;
 await withDatabase(db,()=>saveJuguangConnection({access_token:'fictional-access',refresh_token:'fictional-refresh',access_token_expires_in:86400,refresh_token_expires_in:2592000,user_id:'fictional-upstream',platform_type:1,scope:'["report_service"]',approval_advertisers:[{advertiser_id:11,advertiser_name:'隔离报表账户'}]},'42',actor.id));
 await db.update(s.xiaohongshuJuguangConnection).set({refreshTokenExpiresAt:new Date('2026-11-20T00:00:00+08:00')});
 const previewURL=baseURL+'/api/promotion-daily/juguang-preview?date=2026-11-20&campaignId='+campaign.id;
 for(const [request,role]of[[context.request,'admin'],[staff.request,'employee']] as const){const r=await request.get(previewURL);assert.equal(r.status(),503);const body=await r.json();assert.match(body.message,/授权已失效/);assert.doesNotMatch(body.message,/令牌/);assert.equal(body.message.includes('联系管理员'),role==='employee');}
 for(const[target,role]of[[page,'admin'],[employeePage,'employee']] as const){
  await target.goto(baseURL+'/business/daily-promotion-review?view=daily');await settleBusinessUI(target);
  const metric=target.locator('form[data-metric-form][data-pending-record="'+campaign.id+':2026-11-20"]');await metric.waitFor();
  await metric.getByRole('button',{name:'查看聚光数据来源',exact:true}).click();
  await metric.locator('[data-juguang-message]').filter({hasText:'授权已失效'}).waitFor();await target.screenshot({path:dir+'/screenshots/'+role+'-authorization-expired-1440.png'});
  await target.keyboard.press('Escape');
 }
 checks.push('真实已过期的隔离聚光连接返回不同角色指引，原数据保持，不向外部平台发送测试凭据');
 const metric=page.locator('form[data-metric-form][data-pending-record="'+campaign.id+':2026-11-20"]');
 const nativeSpend=metric.locator('[name=spend]');await nativeSpend.fill('');const requiredMessage=await nativeSpend.evaluate((node:HTMLInputElement)=>{node.reportValidity();return node.validationMessage;});assert.match(requiredMessage,/消耗.*请填写/);assert.doesNotMatch(requiredMessage,/Please|fill out/);await shot('native-validation-1440');await nativeSpend.fill('0');assert(await nativeSpend.evaluate((node:HTMLInputElement)=>node.checkValidity()));
 const nativeCount=metric.locator('[name=actualOpenCount]');await nativeCount.fill('-1');assert.match(await nativeCount.evaluate((node:HTMLInputElement)=>{node.reportValidity();return node.validationMessage;}),/实际开口.*0/);await nativeCount.fill('0');assert(await nativeCount.evaluate((node:HTMLInputElement)=>node.checkValidity()));
 checks.push('实际必填和数字范围的浏览器默认提示为中文且含字段名，纠正输入后原校验正常通过');
 for(const name of ['spend','platformOpenCount','actualOpenCount','platformLeadCount','actualLeadCount'])await metric.locator('[name="'+name+'"]').fill('0');
 const decision=metric.locator('select[name=reviewDecision]');if(await decision.count())await decision.selectOption('wait_continue');
 let committed=false;
 await page.route('**/api/promotion-daily',async(route:any)=>{const response=await route.fetch();assert(response.ok(),await response.text());committed=true;await route.fulfill({response});});
 await page.route('**/business/daily-promotion-review*',async(route:any)=>{if(committed&&route.request().method()==='GET')await route.fulfill({status:503,body:'fixture read interruption'});else await route.continue();});
 await metric.getByRole('button',{name:'完成复盘',exact:true}).click();await metric.locator('[data-form-message]').filter({hasText:'保存已成功'}).waitFor();assert(await metric.locator('[data-form-message]').evaluate((node:HTMLElement)=>{const box=node.getBoundingClientRect(),parent=node.closest('.review-entry-scroll')!.getBoundingClientRect();return box.left>=parent.left&&box.right<=parent.right+1;}),'横向滚动后仍能完整看到保存反馈');await shot('saved-read-failed-1440');
 assert.equal((await db.select().from(s.operationsPromotionDailyMetric).where(and(eq(s.operationsPromotionDailyMetric.campaignId,campaign.id),eq(s.operationsPromotionDailyMetric.metricDate,'2026-11-20')))).length,1);
 await page.unroute('**/api/promotion-daily');await page.unroute('**/business/daily-promotion-review*');
 checks.push('真实日度保存成功后注入列表读取503，提示明确已保存，数据库仅一条记录');
 await db.delete(s.operationsMeetingAttachment).where(eq(s.operationsMeetingAttachment.meetingVersionId,savedDraftId));await db.update(s.operationsReviewMeetingVersion).set({pdfStatus:'failed'}).where(eq(s.operationsReviewMeetingVersion.id,savedDraftId));
 await page.goto(baseURL+'/business/meeting-review');await settleBusinessUI(page);await page.route('**/api/meeting-versions/*/pdf',(route:any)=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({status:'failed'})}));
 await page.getByRole('button',{name:'重试 PDF',exact:true}).click();await page.getByRole('region',{name:'例会记录',exact:true}).getByText(/会议已完成定稿，PDF暂未生成成功/).waitFor();await shot('pdf-failed-1440');assert.equal((await versions(id))[2].lifecycleStatus,'finalized');await page.unroute('**/api/meeting-versions/*/pdf');
 await page.getByRole('button',{name:'重试 PDF',exact:true}).click();await page.getByRole('link',{name:'查看 PDF',exact:false}).first().waitFor();assert.equal((await versions(id))[2].pdfStatus,'ready');
 checks.push('PDF失败与重试不会重新定稿，会议及已执行安排保留');
 await page.goto(baseURL+'/business/meeting-review?meeting='+id+'&version=2&mode=edit');await settleBusinessUI(page);
 await page.getByRole('button',{name:'修改核心结论',exact:true}).click();await page.getByRole('textbox',{name:'核心结论',exact:true}).fill('服务器已收到，但网络未返回结果的隔离文字');
 let savedButDisconnected=false;
 await page.route('**/api/meeting-reviews/'+id,async(route:any)=>{if(route.request().method()!=='PATCH')return route.continue();const r=await route.fetch();assert(r.ok(),await r.text());savedButDisconnected=true;await route.abort('failed');});
 await page.getByRole('button',{name:'保存草稿',exact:true}).click();await respondToBusinessConfirm(page,true);await page.getByText(/^暂未收到保存结果/).waitFor();assert(savedButDisconnected);
 const saved=(await versions(id)).find(v=>v.versionNumber===3)!;assert.equal(saved.lifecycleStatus,'draft');assert.equal((saved.snapshot as any).draft.coreConclusion,'服务器已收到，但网络未返回结果的隔离文字');await page.getByRole('button',{name:'修改核心结论',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'核心结论',exact:true}).inputValue(),'服务器已收到，但网络未返回结果的隔离文字');
 await shot('save-result-unknown-1440');await page.setViewportSize({width:1024,height:1000});await shot('save-result-unknown-1024');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.setViewportSize({width:1440,height:1000});await page.unroute('**/api/meeting-reviews/'+id);
 await page.getByRole('link',{name:'返回例会总览',exact:true}).click();await respondToBusinessConfirm(page,true);await page.waitForURL(baseURL+'/business/meeting-review');await settleBusinessUI(page);await page.getByRole('link',{name:'凌晨定稿验证 · V3',exact:true}).waitFor();await shot('saved-draft-verified-1440');
 checks.push('真实V3已保存后丢失网络响应，页面保留输入并提示结果未知；核对总览可见草稿，不引导重复提交');
 await staff.close();

 checks.push('两项旧文字为空可同号会后定稿，取消保留，旧版及冻结指标不变；真实推广安排仍在原生效日，PDF自动归档，管理员／员工查看同步精简');
 assert.deepEqual(errors,[]);const video=page.video();await context.close();await copyFile(await video.path(),dir+'/finalize-operation.webm');await writeFile(dir+'/result.json',JSON.stringify({passed:true,checks,errors,database:'PGlite',video:{start:clipStart,duration:clipEnd-clipStart},copyClips,pdf:'pdf/weekly-v2.pdf',productionWrites:false},null,2));console.log(checks.join('\n'));
}catch(error){await page?.screenshot({path:dir+'/failure.png'}).catch(()=>{});console.error(f.logs().slice(-1400));throw error;}finally{await browser.close();await f.stop();}

