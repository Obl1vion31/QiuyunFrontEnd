/** 最新会前直接讨论、冻结均值与PDF版本归档；所有写入仅在隔离库。 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {eq,and} from 'drizzle-orm';
import {startFixture,employee} from './auth.fixture';
import {respondToBusinessConfirm} from './business-confirm.helper';
import {discussionFromDraft} from '../src/db/meeting-discussion-values';
import * as s from '../src/db/schema';
const folder=process.env.MEETING_DISCUSSION_DIR||'.tools/test-artifacts/meeting-discussion';await mkdir(folder,{recursive:true});
const clockFile=new URL('../'+folder+'/clock.txt',import.meta.url).pathname;await writeFile(clockFile,'2026-10-25T18:00:00+08:00');
const fixture=await startFixture({clockFile}),{db,baseURL}=fixture;let browser:any;const checks:string[]=[],errors:string[]=[];
try{
 const login=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(employee)});assert.equal(login.status,200);const cookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 async function api(path:string,body?:any,status=200){const res=await fetch(baseURL+path,{method:body?'PATCH':'GET',headers:{Origin:baseURL,Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),json=await res.json();assert.equal(res.status,status,JSON.stringify(json));return json;}
 async function create(){const data=new FormData();for(const[k,v]of Object.entries({meetingType:'weekly',meetingAt:'2026-10-25T18:00',periodStart:'2026-10-17',periodEnd:'2026-10-24'}))data.set(k,v);const res=await fetch(baseURL+'/api/meeting-reviews',{method:'POST',headers:{Origin:baseURL,Cookie:cookie},body:data});assert.equal(res.status,201);return(await res.json()).id;}
 async function seed(name:string,promoted:boolean,index:number){
  const[c]=await db.insert(s.operationsContent).values({platformNoteId:randomUUID().replaceAll('-','').slice(0,24)}).returning();
  const[v]=await db.insert(s.operationsContentVersion).values({contentId:c.id,contentName:name,versionNumber:0,workType:'new',subjectId:'tmua',categoryId:'temporary',projectDocUrl:'https://example.test/doc/'+c.id}).returning();
  const day=promoted?'2026-10-20':'2026-10-14';
  const[p]=await db.insert(s.operationsContentSchedule).values({contentVersionId:v.id,isPromoted:promoted,promotionStatus:promoted?'testing':'none',completionStatus:'on_time',plannedPublishAt:new Date(day+'T18:00:00+08:00'),actualPublishAt:new Date(day+'T18:00:00+08:00')}).returning();
  if(promoted){const[campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:p.id,startedOn:day,dailyReviewEnabledOn:day,initialStage:'testing',currentStage:'testing',currentStatus:'testing'}).returning();await db.insert(s.operationsPromotionStage).values({campaignId:campaign.id,startedOn:day,stageType:'testing'});await db.insert(s.operationsPromotionDailyMetric).values({campaignId:campaign.id,metricDate:'2026-10-21',dailyStatus:'active',actualStatusSnapshot:'testing',stageTypeSnapshot:'testing',recordKind:'regular',sourceStageStartedOn:day,spend:String(100+index*50),actualOpenCount:4,platformOpenCount:5,actualLeadCount:1,platformLeadCount:2,reviewDecision:'test_continue'});return p;}
  const[metric]=await db.insert(s.operationsContentPerformanceMetric).values({scheduleId:p.id,checkpointType:'day_7',recordedThrough:'2026-10-'+(21+index%3),clickRate:String(index),threeSecondReadRate:String(40+index)}).returning();
  await db.insert(s.operationsNonPromotionReview).values({scheduleId:p.id,metricId:metric.id,actualPublishAtSnapshot:p.actualPublishAt!,subjectIdSnapshot:'tmua',subjectNameSnapshot:'TMUA',categoryIdSnapshot:'temporary',categoryNameSnapshot:'临时帖',contentNameSnapshot:name,checkpointType:'day_7',clickRateSnapshot:String(index),threeSecondReadRateSnapshot:String(40+index),cohortSnapshot:{},conclusion:'首轮阅读完整，下一轮观察咨询质量。',reviewedByLabel:'fixture',cause:'验证阅读',nextAction:'继续观察'});return p;
 }
 for(let i=0;i<9;i++)await seed('第一时间解析 · '+(i+1),false,i);
 const posts:Array<typeof s.operationsContentSchedule.$inferSelect>=[];for(let i=0;i<4;i++)posts.push(await seed(i===1?'长标题：从图像、逻辑关系与反例理解复杂条件并建立完整解题过程':'面试课第'+(i+1)+'轮',true,i));
 const id=await create();let material=(await api('/api/meeting-reviews/'+id+'/material')).material;
 assert.equal(material.nonPromotions[0].rateComparison.n,9);assert.equal(material.nonPromotions[0].rateComparison.clickRate,4);assert.equal(material.nonPromotions[0].rateComparison.threeSecondReadRate,44);
 const priorId=await create(),pastCard=material.promotions.find((r:any)=>r.scheduleId===posts[2].id);
 const priorDraft={schemaVersion:4,promotionInputs:{[pastCard.key]:{clickRate:8,confirmed:true,rateRange:pastCard.dataRange}},issues:[]};
 for(let n=0;n<3;n++)await db.insert(s.operationsReviewMeetingVersion).values({meetingId:priorId,versionNumber:n,snapshot:{schemaVersion:4,meeting:{periodEnd:'2026-10-23',name:'历史样本'},draft:priorDraft,finalizationStage:n<2?'pre':'post',generated:{promotions:[pastCard]}},changeSummary:'隔离历史均值样本',finalizedByLabel:'fixture'});
 material=(await api('/api/meeting-reviews/'+id+'/material')).material;
 let[meeting]=await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,id));
 const selected=material.promotions.filter((r:any)=>posts.slice(0,2).some(p=>p.id===r.scheduleId));
 const draft={...meeting.draftSnapshot,workflowVersion:5,candidatesConfirmed:true,materialFingerprint:material.fingerprint,promotionSelections:selected.map((r:any)=>r.key),promotionInputs:Object.fromEntries(selected.map((r:any,i:number)=>[r.key,{confirmed:true,clickRate:i?6:4,rateRange:r.dataRange,currentSituation:'原观察',activeAction:'保留内容，验证咨询质量。',recordedThrough:'2026-10-24'}])),promotionDecisions:{[selected[0].campaignId]:'test_paused'},coreConclusion:'本期有效开口保持稳定，后续优先验证咨询质量。',nextAction:'会中确定下一轮素材与安排。',situation:'从实际开口与留资衡量效果。',strategy:'补充关键条件，复查内容表达。',issues:[{problem:'核对素材',conclusion:'整理图像与反例',status:'pending'}]};
 await api('/api/meeting-reviews/'+id,{action:'finalize_pre',draft,expectedUpdatedAt:meeting.updatedAt.toISOString()});
 let[pre]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId,id));const original=JSON.stringify(pre.snapshot);
 const frozen:any=pre.snapshot;assert.equal(frozen.generated.nonPromotions[0].rateComparison.n,9);assert.equal(frozen.generated.promotions[0].rateComparison.n,3,'本期同类确认值及一个去重后的历史样本');
 const pw=await import(new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);browser=await pw.chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:folder+'/video',size:{width:1440,height:1000}}});await context.addCookies(cookie.split('; ').map(v=>({name:v.slice(0,v.indexOf('=')),value:v.slice(v.indexOf('=')+1),url:baseURL})));
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',(e:Error)=>errors.push(e.message));
 const nav=async(path:string)=>{await page.evaluate(()=>document.documentElement.dataset.unsaved='false').catch(()=>{});await page.goto(baseURL+path);await page.waitForLoadState('networkidle');await page.evaluate(()=>document.fonts.ready);};
 await nav('/business/meeting-review?meeting='+id);await page.locator('.weekly-discussion-host').waitFor();
 assert.equal(await page.locator('.weekly-non-card input,.weekly-non-card textarea,.weekly-non-card select').count(),0);assert.equal(await page.locator('.weekly-metrics input').count(),0);assert.ok(await page.getByText('同类均值 4.00% · 9 份样本',{exact:true}).count()>0);
 await page.getByRole('button',{name:'修改核心结论',exact:true}).click();await page.getByRole('textbox',{name:'核心结论',exact:true}).fill('会中结论：有效开口稳定，优先调整留资转化。');
 await page.getByRole('button',{name:'保存讨论稿',exact:true}).click();await page.getByText('讨论稿已保存，安排尚未生效。',{exact:true}).waitFor();assert.equal((await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId,id))).length,1);assert.equal((await db.select().from(s.operationsReviewActionItem)).length,0);
 [meeting]=await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,id));assert.equal(meeting.draftSnapshot.coreConclusion,'会中结论：有效开口稳定，优先调整留资转化。');
 await nav('/business/meeting-review?meeting='+id);assert.match(await page.locator('.weekly-core-conclusion').innerText(),/会中结论/);
 // 保存中的新增输入保留，并明确提示还有未保存修改。
 let releaseSave!:()=>void,arrived!:()=>void;const gate=new Promise<void>(r=>releaseSave=r),sent=new Promise<void>(r=>arrived=r);
 await page.route(`**/api/meeting-reviews/${id}`,async(route:any)=>{arrived();await gate;await route.continue();},{times:1});
 await page.getByRole('button',{name:'保存讨论稿',exact:true}).click();await sent;
 await page.getByRole('button',{name:'修改核心结论',exact:true}).click();await page.getByRole('textbox',{name:'核心结论',exact:true}).fill('保存期间继续写的结论');releaseSave();await page.getByText('已保存提交时的内容，后续修改仍待保存。',{exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'核心结论',exact:true}).inputValue(),'保存期间继续写的结论');
 await page.getByRole('button',{name:'保存讨论稿',exact:true}).click();await page.getByText('讨论稿已保存，安排尚未生效。',{exact:true}).waitFor();
 await page.getByRole('button',{name:'会后定稿 V1',exact:true}).click();await respondToBusinessConfirm(page,false);assert.equal((await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId,id))).length,1);
 [meeting]=await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,id));
 for(const width of [1920,1440,1280,1024]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${folder}/pre-overview-${width}.png`});const c=page.locator('[data-weekly-promotion]').first();await c.scrollIntoViewIfNeeded();await page.screenshot({path:`${folder}/pre-cards-${width}.png`});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:folder+'/pre-full-1440.png',fullPage:true});
 const values=discussionFromDraft(meeting.draftSnapshot);values.coreConclusion='完整会后结论：'+('以实际开口与留资判断有效性，结合素材表达复查。'.repeat(70));values.nextAction='从明天起执行安排，核对素材后继续验证。';values.issues.push({problem:'长事项：'+('核对素材与结论。'.repeat(60)),conclusion:'解决方案：'+('补充反例并整理关键条件，复查后持续跟进。'.repeat(80)),status:'validating'});
 const payload={action:'save_discussion',sourceVersionId:pre.id,expectedUpdatedAt:meeting.updatedAt.toISOString(),discussion:values};
 await api('/api/meeting-reviews/'+id,{...payload,discussion:{...values,nonPromotionInputs:{}}},422);await api('/api/meeting-reviews/'+id,{...payload,discussion:{...values,promotionInputs:{...values.promotionInputs,[selected[0].key]:{...values.promotionInputs[selected[0].key],clickRate:99}}}},422);
 await api('/api/meeting-reviews/'+id,{...payload,expectedUpdatedAt:'2026-01-01T00:00:00.000Z'},409);await api('/api/meeting-reviews/'+id,{...payload,sourceVersionId:randomUUID()},409);
 // 来源指标改变后，会后讨论仍严格继承冻结材料。
 await db.update(s.operationsPromotionDailyMetric).set({spend:'999'}).where(eq(s.operationsPromotionDailyMetric.campaignId,selected[0].campaignId));
 const done=await api('/api/meeting-reviews/'+id,{...payload,action:'finalize_discussion'});assert.equal(done.versionNumber,1);assert.equal(done.pdfStatus,'ready',fixture.logs().slice(-2500));
 const[post]=await db.select().from(s.operationsReviewMeetingVersion).where(and(eq(s.operationsReviewMeetingVersion.meetingId,id),eq(s.operationsReviewMeetingVersion.versionNumber,1)));const snapshot:any=post.snapshot;assert.deepEqual(snapshot.generated.summary,frozen.generated.summary);assert.deepEqual(snapshot.generated.nonPromotions,frozen.generated.nonPromotions);assert.deepEqual(snapshot.generated.promotions,frozen.generated.promotions);assert.equal(snapshot.generated.meetingDecisions[0].effectiveOn,'2026-10-26');
 assert.equal(JSON.stringify((await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,pre.id)))[0].snapshot),original);
 assert.equal((await db.select().from(s.operationsReviewActionItem)).length,2);await api('/api/meeting-reviews/'+id,{...payload,action:'finalize_discussion'},409);
 const[file]=await db.select().from(s.operationsMeetingAttachment).where(eq(s.operationsMeetingAttachment.meetingVersionId,post.id));assert.equal(file.source,'generated');assert.ok(file.byteLength<3145728);const pdf=Buffer.from(file.base64,'base64');await writeFile(folder+'/post-report.pdf',pdf);
 const repeat=await fetch(baseURL+`/api/meeting-versions/${post.id}/pdf`,{method:'POST',headers:{Cookie:cookie,Origin:baseURL}});assert.equal(repeat.status,200);assert.equal((await repeat.json()).id,file.id);assert.equal((await db.select().from(s.operationsMeetingAttachment)).length,1);
 assert.equal((await fetch(baseURL+`/api/meeting-versions/${post.id}/pdf`,{method:'POST',headers:{Cookie:cookie,Origin:'https://evil.test'}})).status,403);
 assert.equal((await fetch(baseURL+`/api/meeting-attachments/${file.id}`)).status,401);const download=await fetch(baseURL+`/api/meeting-attachments/${file.id}?download=1`,{headers:{Cookie:cookie}});assert.match(download.headers.get('content-disposition')??'',/^attachment;/);assert.equal(download.headers.get('content-type'),'application/pdf');assert.equal(Buffer.compare(Buffer.from(await download.arrayBuffer()),pdf),0);
 const form=new FormData();form.set('meetingId',id);form.set('versionId',post.id);form.set('file',new File([pdf],'补充报告.pdf',{type:'application/pdf'}));const uploaded=await fetch(baseURL+'/api/meeting-attachments',{method:'POST',headers:{Cookie:cookie,Origin:baseURL},body:form});assert.equal(uploaded.status,201);assert.equal((await uploaded.json()).source,'manual');
 await nav('/business/meeting-review?meeting='+id+'&version=1');assert.equal(await page.locator('.weekly-frozen input,.weekly-frozen textarea,.weekly-frozen select').count(),0);assert.match(await page.locator('.weekly-next-action').innerText(),/2026-10-26/);
 for(const width of [1920,1440,1280,1024]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${folder}/post-overview-${width}.png`});await page.locator('[data-weekly-promotion]').first().scrollIntoViewIfNeeded();await page.screenshot({path:`${folder}/post-cards-${width}.png`});}
 // 常规长度的会后展示与打印样例，长文本压力文件另保留。
 await writeFile(clockFile,'2026-10-26T18:00:00+08:00');
 const normalId=await create(),normalMaterial=(await api('/api/meeting-reviews/'+normalId+'/material')).material;
 let[normalMeeting]=await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,normalId));
 const normalDraft={...normalMeeting.draftSnapshot,...draft,materialFingerprint:normalMaterial.fingerprint,coreConclusion:'本期实际跑量4篇，咨询开口保持稳定；下一轮优先验证留资质量。',nextAction:'核对讲义素材，按已定安排暂停第一组测试，继续观察第二组。',issues:[{problem:'讲义素材需要补充反例',conclusion:'整理典型题和反例，下一次例会核对效果。',status:'validating'}]};
 await api('/api/meeting-reviews/'+normalId,{action:'finalize_pre',draft:normalDraft,expectedUpdatedAt:normalMeeting.updatedAt.toISOString()});
 [normalMeeting]=await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,normalId));const[normalPre]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId,normalId));
 const normalDone=await api('/api/meeting-reviews/'+normalId,{action:'finalize_discussion',sourceVersionId:normalPre.id,discussion:discussionFromDraft(normalMeeting.draftSnapshot),expectedUpdatedAt:normalMeeting.updatedAt.toISOString()});assert.equal(normalDone.pdfStatus,'ready');
 const[normalPdf]=await db.select().from(s.operationsMeetingAttachment).where(eq(s.operationsMeetingAttachment.meetingVersionId,normalDone.versionId));await writeFile(folder+'/example-report.pdf',Buffer.from(normalPdf.base64,'base64'));
 await nav('/business/meeting-review?meeting='+normalId+'&version=1');await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:folder+'/post-normal-overview-1440.png'});await page.screenshot({path:folder+'/post-normal-full-1440.png',fullPage:true});await page.locator('.weekly-support').scrollIntoViewIfNeeded();await page.screenshot({path:folder+'/post-issues-1440.png'});
 await page.setViewportSize({width:1440,height:1000});await nav('/business/meeting-review?meeting='+id+'&version=0');assert.equal(await page.locator('.weekly-discussion-host').count(),0);assert.equal(await page.locator('.weekly-frozen textarea').count(),0);
 await nav('/business/meeting-review');assert.equal(await page.locator('.meeting-history-overview').getAttribute('open'),null);await page.screenshot({path:folder+'/overview-1440.png'});await page.locator('.meeting-history-overview>summary').click();await page.screenshot({path:folder+'/history-expanded-1440.png'});
 checks.push('同一期9份首轮样本含本帖与0值，推广人工率跨版本去重；均值和来源冻结','最新会前直接讨论、保存不新增V/不流转、指标与非推广只读、输入重开保留','白名单注入、过期baseline、并发写拒绝；来源变更不覆盖会前事实；会后次日生效且旧快照不改写','会后自动PDF、重复生成幂等、独立手工补充、权限/同源/下载一致','1920/1440/1280/1024会前会后；历史默认折叠，会议单行与PDF归档');
 assert.deepEqual(errors,[]);await context.close();await writeFile(folder+'/checks.json',JSON.stringify({checks,errors,baseURL},null,2));console.log(JSON.stringify({checks,folder}));
}catch(error){console.error(fixture.logs().slice(-5000));throw error;}finally{await browser?.close();await fixture.stop();}
