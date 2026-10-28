import {businessFetch as fetch} from './business-request.helper';
import {versionDraftPayload} from './meeting-write.helper';
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
 async function api(path:string,body?:any,status=200){const res=await fetch(baseURL+path,{method:body?'PATCH':'GET',headers:{Origin:baseURL,Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(await versionDraftPayload(db,path,body)):undefined}),json=await res.json();assert.equal(res.status,status,JSON.stringify(json));return json;}
 async function create(){const data=new FormData();for(const[k,v]of Object.entries({meetingType:'weekly',meetingAt:'2026-10-25T18:00',periodStart:'2026-10-17',periodEnd:'2026-10-24'}))data.set(k,v);const res=await fetch(baseURL+'/api/meeting-reviews',{method:'POST',headers:{Origin:baseURL,Cookie:cookie},body:data});assert.equal(res.status,201);return(await res.json()).id;}
 async function seed(name:string,promoted:boolean,index:number){
  const[c]=await db.insert(s.operationsContent).values({platformNoteId:randomUUID().replaceAll('-','').slice(0,24)}).returning();
  const[v]=await db.insert(s.operationsContentVersion).values({contentId:c.id,contentName:name,versionNumber:0,workType:'new',subjectId:'tmua',categoryId:'temporary',projectDocUrl:'https://example.test/doc/'+c.id}).returning();
  const day=promoted?'2026-10-20':'2026-10-14';
  const[p]=await db.insert(s.operationsContentSchedule).values({contentVersionId:v.id,isPromoted:promoted,promotionStatus:promoted?'testing':'none',completionStatus:'on_time',plannedPublishAt:new Date(day+'T18:00:00+08:00'),actualPublishAt:new Date(day+'T18:00:00+08:00')}).returning();
  if(promoted){const[campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:p.id,startedOn:day,dailyReviewEnabledOn:day,initialStage:'testing',currentStage:'testing',currentStatus:'testing'}).returning();await db.insert(s.operationsPromotionStage).values({campaignId:campaign.id,startedOn:day,stageType:'testing'});await db.insert(s.operationsPromotionDailyMetric).values({campaignId:campaign.id,metricDate:day,dailyStatus:'active',actualStatusSnapshot:'testing',stageTypeSnapshot:'testing',sourceStageStartedOn:day,spend:'0',actualOpenCount:0,platformOpenCount:0,actualLeadCount:0,platformLeadCount:0,reviewDecision:'test_continue'});await db.insert(s.operationsPromotionDailyMetric).values({campaignId:campaign.id,metricDate:'2026-10-21',dailyStatus:'active',actualStatusSnapshot:'testing',stageTypeSnapshot:'testing',recordKind:'regular',sourceStageStartedOn:day,spend:String(100+index*50),actualOpenCount:4,platformOpenCount:5,actualLeadCount:1,platformLeadCount:2,reviewDecision:'test_pending'});return p;}
  const[metric]=await db.insert(s.operationsContentPerformanceMetric).values({scheduleId:p.id,checkpointType:'day_7',recordedThrough:'2026-10-'+(21+index%3),clickRate:String(index),threeSecondReadRate:String(index===8?99.99:40+index)}).returning();
  await db.insert(s.operationsNonPromotionReview).values({scheduleId:p.id,metricId:metric.id,actualPublishAtSnapshot:p.actualPublishAt!,subjectIdSnapshot:'tmua',subjectNameSnapshot:'TMUA',categoryIdSnapshot:'temporary',categoryNameSnapshot:'临时帖',contentNameSnapshot:name,checkpointType:'day_7',clickRateSnapshot:String(index),threeSecondReadRateSnapshot:String(index===8?99.99:40+index),cohortSnapshot:{},conclusion:'首轮阅读完整，下一轮观察咨询质量。',reviewedByLabel:'fixture',cause:'验证阅读',nextAction:'继续观察'});return p;
 }
 for(let i=0;i<9;i++)await seed('第一时间解析 · '+(i+1),false,i);
 const posts:Array<typeof s.operationsContentSchedule.$inferSelect>=[];for(let i=0;i<4;i++)posts.push(await seed(i===1?'长标题：从图像、逻辑关系与反例理解复杂条件并建立完整解题过程':'面试课第'+(i+1)+'轮',true,i));
 const id=await create();let material=(await api('/api/meeting-reviews/'+id+'/material')).material;
 assert.equal(material.nonPromotions[0].rateComparison.n,9);assert.equal(material.nonPromotions[0].rateComparison.clickRate,4);assert.ok(Math.abs(material.nonPromotions[0].rateComparison.threeSecondReadRate-(44*9-48+99.99)/9)<1e-8);
 const priorId=await create(),pastCard=material.promotions.find((r:any)=>r.scheduleId===posts[2].id);
 const priorDraft={schemaVersion:4,promotionInputs:{[pastCard.key]:{clickRate:8,confirmed:true,rateRange:pastCard.dataRange}},issues:[]};
 await db.delete(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId,priorId));for(let n=0;n<3;n++)await db.insert(s.operationsReviewMeetingVersion).values({meetingId:priorId,versionNumber:n,snapshot:{schemaVersion:4,meeting:{periodEnd:'2026-10-23',name:'历史样本'},draft:priorDraft,finalizationStage:n<2?'pre':'post',generated:{promotions:[pastCard]}},changeSummary:'隔离历史均值样本',finalizedByLabel:'fixture'});
 material=(await api('/api/meeting-reviews/'+id+'/material')).material;
 let[meeting]=await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,id));
 const selected=material.promotions.filter((r:any)=>posts.slice(0,2).some(p=>p.id===r.scheduleId));
 const draft={...meeting.draftSnapshot,workflowVersion:6,candidatesConfirmed:true,materialFingerprint:material.fingerprint,promotionSelections:selected.map((r:any)=>r.key),promotionInputs:Object.fromEntries(selected.map((r:any,i:number)=>[r.key,{confirmed:true,clickRate:i?6:4,rateRange:r.dataRange,currentSituation:'原观察',activeAction:'保留内容，验证咨询质量。',recordedThrough:'2026-10-24'}])),promotionDecisions:{[selected[0].campaignId]:'test_pending'},coreConclusion:'本期有效开口保持稳定，后续优先验证咨询质量。',nextAction:'会中确定下一轮素材与安排。',situation:'从实际开口与留资衡量效果。',strategy:'补充关键条件，复查内容表达。',issues:[{problem:'核对素材',conclusion:'整理图像与反例',status:'pending'}]};
 await api('/api/meeting-reviews/'+id,{action:'finalize_pre',draft,expectedUpdatedAt:meeting.updatedAt.toISOString()});
 let[pre]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId,id));const original=JSON.stringify(pre.snapshot);
 const frozen:any=pre.snapshot;assert.equal(frozen.generated.nonPromotions[0].rateComparison.n,9);assert.equal(frozen.generated.promotions[0].rateComparison.n,3,'本期同类确认值及一个去重后的历史样本');

 const pw=await import(new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);browser=await pw.chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:folder+'/video',size:{width:1440,height:1000}}});await context.addCookies(cookie.split('; ').map(v=>({name:v.slice(0,v.indexOf('=')),value:v.slice(v.indexOf('=')+1),url:baseURL})));
 const page=await context.newPage();await page.clock.install({time:new Date('2026-10-25T18:00:00+08:00')});page.setDefaultTimeout(20000);page.on('pageerror',(e:Error)=>errors.push(e.message));
 const nav=async(path:string)=>{await page.evaluate(()=>document.documentElement.dataset.unsaved='false').catch(()=>{});await page.goto(baseURL+path);await page.waitForLoadState('networkidle');await page.evaluate(()=>document.fonts.ready);};
 await nav('/business/meeting-review?meeting='+id);
 assert.equal(await page.locator('.weekly-frozen textarea').count(),0);assert.equal(await page.locator('.version-nav .meeting-pdf-archive').count(),0);
 assert.ok(await page.getByText('同类样本 9 份',{exact:true}).count()>0);assert.equal(await page.getByText(/较同类|同类均值/).count(),0);
 await page.getByRole('radio',{name:'编辑模式',exact:true}).check();
 const saveButton=page.getByRole('button',{name:'保存草稿',exact:true});
 assert.equal(await saveButton.isDisabled(),true);assert.equal(await page.getByRole('button',{name:'会前定稿 V1',exact:true}).isDisabled(),true);
 assert.equal(await page.getByRole('button',{name:'会后定稿 V1',exact:true}).isEnabled(),true,'会前维持原方案仍可转会后');
 await page.getByRole('button',{name:'修改核心结论',exact:true}).click();const core=page.getByRole('textbox',{name:'核心结论',exact:true}),originalCore=await core.inputValue();
 assert.equal(await saveButton.isDisabled(),true,'仅打开文本框不算修改');await core.fill('临时修改');await page.locator('.weekly-discussion-host[data-edit-lock=owned]').waitFor();assert.equal(await saveButton.isEnabled(),true);await core.fill(originalCore);assert.equal(await saveButton.isDisabled(),true,'改回原值不生成版本');
 const issueStatus=page.getByRole('combobox',{name:'事项1进度',exact:true});await issueStatus.selectOption('validating');assert.equal(await saveButton.isEnabled(),true);await issueStatus.selectOption('pending');assert.equal(await saveButton.isDisabled(),true);
 await page.getByRole('heading',{name:'下一步行动',exact:true}).click();
 await page.getByRole('button',{name:'修改核心结论',exact:true}).click();await page.getByRole('textbox',{name:'核心结论',exact:true}).fill('会中结论：实际开口稳定，优先改善留资转化。');await page.getByRole('heading',{name:'下一步行动',exact:true}).click();
 await page.getByRole('radio',{name:'只读模式',exact:true}).check();await respondToBusinessConfirm(page,false);assert.equal(await page.getByRole('radio',{name:'编辑模式',exact:true}).isChecked(),true);
 // 另存会前修订；缺省尚未决定的活动必须明确选择。
 for(const card of selected){const control=page.getByRole('combobox',{name:card.contentName+' 下一步状态',exact:true});if(await control.inputValue()==='')await control.selectOption('test_pending');}
 for(const width of [1920,1440,1280,1024]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${folder}/pre-edit-${width}.png`});await page.locator('[data-weekly-promotion]').first().scrollIntoViewIfNeeded();await page.screenshot({path:`${folder}/pre-cards-${width}.png`});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 await page.getByRole('button',{name:'会前定稿 V1',exact:true}).click();await respondToBusinessConfirm(page,true);await page.waitForURL(/version=1/);await page.waitForLoadState('networkidle');assert.equal(await page.locator('.weekly-frozen textarea').count(),0);
 [meeting]=await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,id));let[pre1]=await db.select().from(s.operationsReviewMeetingVersion).where(and(eq(s.operationsReviewMeetingVersion.meetingId,id),eq(s.operationsReviewMeetingVersion.versionNumber,1)));
 const values=discussionFromDraft(meeting.draftSnapshot);values.nonPromotionNotes={[frozen.generated.nonPromotions[0].key]:'讨论补充：关注阅读完整度与后续咨询。'};
 const payload={action:'finalize_version',sourceVersionId:pre1.id,expectedUpdatedAt:meeting.updatedAt.toISOString(),discussion:values};
 await api('/api/meeting-reviews/'+id,{...payload,discussion:{...values,promotionInputs:{...values.promotionInputs,[selected[0].key]:{...values.promotionInputs[selected[0].key],clickRate:99}}}},422);
 await db.update(s.operationsPromotionDailyMetric).set({spend:'999'}).where(eq(s.operationsPromotionDailyMetric.campaignId,selected[0].campaignId));
 const done=await api('/api/meeting-reviews/'+id,payload);assert.equal(done.versionNumber,2);assert.equal(done.pdfStatus,'ready',fixture.logs().slice(-2500));
 const[post]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,done.versionId));const snapshot:any=post.snapshot;await writeFile(folder+'/sample-snapshot.json',JSON.stringify(snapshot));assert.deepEqual(snapshot.generated.summary,frozen.generated.summary);assert.deepEqual(snapshot.generated.nonPromotions,frozen.generated.nonPromotions);assert.deepEqual(snapshot.generated.promotions,frozen.generated.promotions);
 assert.equal(JSON.stringify((await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,pre.id)))[0].snapshot),original);
 const[file]=await db.select().from(s.operationsMeetingAttachment).where(eq(s.operationsMeetingAttachment.meetingVersionId,post.id));await writeFile(folder+'/example-report.pdf',Buffer.from(file.base64,'base64'));assert.ok(file.byteLength<3145728);
 const repeat=await fetch(baseURL+`/api/meeting-versions/${post.id}/pdf`,{method:'POST',headers:{Cookie:cookie,Origin:baseURL}});assert.equal(repeat.status,200);assert.equal((await repeat.json()).id,file.id);
 assert.equal((await fetch(baseURL+`/api/meeting-versions/${post.id}/pdf`,{method:'POST',headers:{Cookie:cookie,Origin:'https://evil.test'}})).status,403);
 // 长内容使用单独隔离版本，验证打印完整性，不影响后续回溯场景。
 const stressId=await create(),stress=structuredClone(snapshot);stress.meeting.name='长内容打印验收';stress.draft.coreConclusion='长结论：'+('依据实际数据核对变化，保留完整观察与行动。'.repeat(100))+' END-CONCLUSION';stress.draft.promotionInputs[selected[0].key].currentSituation='长观察：'+('逐项核对素材、咨询与留资变化，记录阶段结果。'.repeat(100))+' END-OBSERVATION';stress.draft.issues[0].conclusion='长解决方案：'+('整理典型例题和反例，核对内容并跟进结果。'.repeat(70))+' END-SOLUTION';
 await db.delete(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId,stressId));const[stressVersion]=await db.insert(s.operationsReviewMeetingVersion).values({meetingId:stressId,versionNumber:0,snapshot:stress,changeSummary:'长内容隔离样例',finalizedByLabel:'fixture'}).returning();
 const stressResponse=await fetch(baseURL+`/api/meeting-versions/${stressVersion.id}/pdf`,{method:'POST',headers:{Cookie:cookie,Origin:baseURL}});assert.equal(stressResponse.status,200,fixture.logs().slice(-2500));const[stressPdf]=await db.select().from(s.operationsMeetingAttachment).where(eq(s.operationsMeetingAttachment.meetingVersionId,stressVersion.id));await writeFile(folder+'/long-report.pdf',Buffer.from(stressPdf.base64,'base64'));
 await nav('/business/meeting-review?meeting='+id+'&version=2');
 for(const width of [1920,1440,1280,1024]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${folder}/post-read-${width}.png`});await page.locator('[data-weekly-promotion]').first().scrollIntoViewIfNeeded();await page.screenshot({path:`${folder}/post-cards-${width}.png`});}
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:folder+'/post-full-1440.png',fullPage:true});await page.emulateMedia({media:'print'});assert.ok(await page.locator('.business-console-workspace').evaluate((n:Element)=>n.getBoundingClientRect().width/Number(getComputedStyle(document.body).zoom||1)>innerWidth*0.9),'打印移除侧栏后正文必须使用整张纸宽度');await page.pdf({path:folder+'/browser-print.pdf',format:'A4',landscape:true,printBackground:true,preferCSSPageSize:true});await page.emulateMedia({media:'screen'});
 await page.getByRole('radio',{name:'编辑模式',exact:true}).check();await page.screenshot({path:folder+'/post-edit-1440.png'});
 // V2 opens a V3 draft; save twice, then finalize the same V3 row.
 await page.getByRole('button',{name:'修改核心结论',exact:true}).click();await page.getByRole('textbox',{name:'核心结论',exact:true}).fill('V3 draft discussion');await page.getByRole('heading',{name:'下一步行动',exact:true}).click();
 await page.getByRole('button',{name:'保存草稿',exact:true}).click();
 await page.locator('[data-business-confirm][open]').waitFor();
 assert.equal(await page.locator('[data-confirm-cancel]').evaluate((n:Element)=>document.activeElement===n),true);
 for(const width of [1920,1440,1280,1024]){await page.setViewportSize({width,height:1000});await page.locator('[data-business-confirm]').evaluate((n:Element)=>Promise.all(n.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished)));await page.screenshot({path:`${folder}/new-draft-confirm-${width}.png`});}
 await respondToBusinessConfirm(page,false);assert.equal((await db.select().from(s.operationsReviewMeetingVersion).where(and(eq(s.operationsReviewMeetingVersion.meetingId,id),eq(s.operationsReviewMeetingVersion.versionNumber,3)))).length,0);
 assert.ok(await page.getByRole('button',{name:'修改核心结论',exact:true}).innerText().then((t:string)=>t.includes('V3 draft discussion')));
 await page.getByRole('button',{name:'保存草稿',exact:true}).click();await respondToBusinessConfirm(page,true);await page.waitForURL('**/business/meeting-review');
 let[draft3]=await db.select().from(s.operationsReviewMeetingVersion).where(and(eq(s.operationsReviewMeetingVersion.meetingId,id),eq(s.operationsReviewMeetingVersion.versionNumber,3)));
 assert.equal(draft3.lifecycleStatus,'draft');assert.equal((await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,id)))[0].currentVersionNumber,2);
 const draftPdf=await fetch(baseURL+`/api/meeting-versions/${draft3.id}/pdf`,{method:'POST',headers:{Cookie:cookie,Origin:baseURL}});assert.equal(draftPdf.status,422);
 await nav('/business/meeting-review?meeting='+id);assert.equal(await page.getByRole('radio',{name:'编辑模式',exact:true}).isChecked(),true);
 assert.equal(await page.getByRole('button',{name:'保存草稿',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'会后定稿 V3',exact:true}).isEnabled(),true);
 assert.equal(await page.getByRole('textbox',{name:'事项1问题',exact:true}).inputValue(),'核对素材');
 for(const width of [1920,1440,1280,1024]){
  await page.setViewportSize({width,height:1000});await page.locator('.weekly-support').scrollIntoViewIfNeeded();
  const alignment=await page.locator('.weekly-issues-editing').evaluate((table:HTMLElement)=>{const row=table.querySelector('tbody tr')!,cells=[...row.children] as HTMLElement[];return {headers:[...table.querySelectorAll('th')].map(n=>getComputedStyle(n).textAlign),midlines:cells.map(n=>{const c=n.querySelector('textarea,select,.weekly-issue-check,button');if(!c)return null;const r=c.getBoundingClientRect();return r.top+r.height/2;}).filter(n=>n!=null)};});
  assert.ok(alignment.headers.every((a:string)=>a==='center'));assert.ok(Math.max(...alignment.midlines)-Math.min(...alignment.midlines)<1);await page.screenshot({path:`${folder}/version-draft-issues-${width}.png`});
  await page.locator('[data-weekly-non]').first().scrollIntoViewIfNeeded();await page.screenshot({path:`${folder}/inline-delta-${width}.png`});
  const deltas=await page.locator('.weekly-rate-value:has(.weekly-rate-comparison)').evaluateAll((nodes:HTMLElement[])=>nodes.map(n=>{const value=n.querySelector('strong')!,delta=n.querySelector('.weekly-rate-comparison')!,v=value.getBoundingClientRect(),d=delta.getBoundingClientRect();return {sameLine:Math.abs(v.bottom-d.bottom)<8,color:getComputedStyle(delta).color,overflow:n.scrollWidth>n.clientWidth};}));assert.ok(deltas.length>0);assert.ok(deltas.every((d:any)=>d.sameLine&&!d.overflow));
 }
 await page.getByRole('textbox',{name:'事项1解决方案',exact:true}).fill('同版草稿补充方案');
 await page.getByRole('button',{name:'保存草稿',exact:true}).click();await page.waitForURL('**/business/meeting-review');
 assert.equal((await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,draft3.id)))[0].versionNumber,3);
 await page.setViewportSize({width:1440,height:1000});await nav('/business/meeting-review?meeting='+id);await page.getByRole('button',{name:'会后定稿 V3',exact:true}).click();await page.locator('[data-business-confirm][open]').waitFor();await page.locator('[data-business-confirm]').evaluate((n:Element)=>Promise.all(n.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished)));await page.screenshot({path:folder+'/finalize-confirm-1440.png'});await respondToBusinessConfirm(page,true);await page.waitForURL('**version=3',{waitUntil:'domcontentloaded'});assert.equal((await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,draft3.id)))[0].lifecycleStatus,'finalized');
 await page.getByRole('radio',{name:'编辑模式',exact:true}).check();assert.equal(await page.getByRole('button',{name:'会后定稿 V4',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'保存草稿',exact:true}).isDisabled(),true);
 for(const width of [1920,1440,1280,1024]){await page.setViewportSize({width,height:1000});await page.screenshot({path:`${folder}/unchanged-edit-${width}.png`});}
 await nav('/business/meeting-review?meeting='+id+'&version=0');assert.equal(await page.getByRole('radio',{name:'编辑模式',exact:true}).isDisabled(),true);assert.ok(await page.locator('.version-nav').evaluate((n:Element)=>Math.abs(n.getBoundingClientRect().right-n.querySelector('[data-meeting-mode]')!.getBoundingClientRect().right)<=1),'历史版模式切换同样靠右对齐');await page.screenshot({path:folder+'/historical-read-1440.png'});await page.getByRole('button',{name:'回溯到此版本',exact:true}).click();await respondToBusinessConfirm(page,false);
 [meeting]=await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,id));const restored=await api('/api/meeting-reviews/'+id,{action:'rollback_version',sourceVersionId:pre.id,expectedUpdatedAt:meeting.updatedAt.toISOString(),confirmed:true});assert.equal(restored.versionNumber,4);
 await nav('/business/meeting-review?meeting='+id+'&version=4&mode=edit');assert.equal(await page.getByRole('radio',{name:'编辑模式',exact:true}).isChecked(),true);await page.screenshot({path:folder+'/rollback-edit-1440.png'});
 await writeFile(clockFile,'2026-10-26T00:00:00+08:00');await page.clock.setSystemTime(new Date('2026-10-26T00:00:00+08:00'));await nav('/business/meeting-review?meeting='+id+'&version=4&mode=edit');for(const card of selected)assert.equal(await page.getByRole('combobox',{name:card.contentName+' 下一步状态',exact:true}).isDisabled(),true);await page.screenshot({path:folder+'/expired-edit-1440.png'});
 await page.getByRole('radio',{name:'只读模式',exact:true}).check();for(let retry=0;retry<50;retry++){if(!(await db.select().from(s.businessEditLease).where(eq(s.businessEditLease.resource,'meeting:'+id))).length)break;await new Promise(resolve=>setTimeout(resolve,100));}[meeting]=await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,id));await api('/api/meeting-reviews/'+id,{action:'rollback_version',sourceVersionId:pre.id,expectedUpdatedAt:meeting.updatedAt.toISOString(),confirmed:true},422);
 await nav('/business/meeting-review');assert.equal(await page.locator('.meeting-history-overview').getAttribute('open'),null);await page.screenshot({path:folder+'/overview-1440.png'});
 checks.push('四档桌面只读/编辑、pp与单处样本、无会议内PDF入口','V3草稿重复保存及同号定稿、草稿不生成PDF、事项真实中线与表头居中、旧版只读、退出取消保留输入、冻结指标不刷新','会后自动HTML PDF、幂等、同源保护、浏览器打印同款','回溯确认取消/执行、失效版本保留、恢复稿重新确认','生效日零点锁定安排和回溯，保留文字编辑');
 checks.push('切编辑/打开文本框不置脏，恢复文字和进度后按钮置灰；首次草稿确认默认继续编辑、取消无版本且保留输入，同版实际修改保存无重复弹窗，已存草稿直接同号定稿');
 assert.deepEqual(errors,[]);await context.close();await writeFile(folder+'/checks.json',JSON.stringify({checks,errors,baseURL},null,2));console.log(JSON.stringify({checks,folder}));
}catch(error){console.error(fixture.logs().slice(-5000));throw error;}finally{await browser?.close();await fixture.stop();}
