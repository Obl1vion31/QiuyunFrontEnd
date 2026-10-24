/** 只在隔离库中验收范围、快照、例会引用与员工权限。 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { startFixture, employee, admin } from './auth.fixture';
import * as schema from '../src/db/schema';
import { nextDateKey, previousDateKey, shanghaiDateKey } from '../src/db/promotion-rules.mjs';
import {respondToBusinessConfirm} from './business-confirm.helper';
const fixture=await startFixture();const {db,baseURL}=fixture;let browser:any;
try {
 const today=shanghaiDateKey(new Date()),yesterday=previousDateKey(today),earlier=previousDateKey(yesterday);
 const login=async(account:any)=>{const r=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(account)});assert.equal(r.status,200);return r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};
 const employeeCookie=await login(employee),adminCookie=await login(admin);
 const call=async(path:string,method='GET',body?:any,status=200,cookie=employeeCookie)=>{const r=await fetch(baseURL+path,{method,headers:{Origin:baseURL,Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const result=await r.json();assert.equal(r.status,status,JSON.stringify(result));return result};
 const seed=async(name:string,stage='testing',terminal=false,promoted=true)=>{
  const [content]=await db.insert(schema.operationsContent).values({platformNoteId:randomUUID().replaceAll('-','').slice(0,24)}).returning();
  const [version]=await db.insert(schema.operationsContentVersion).values({contentId:content.id,versionNumber:0,workType:'new',contentName:name,subjectId:'tmua',categoryId:'temporary',projectDocUrl:'https://fictional.example.test/post'}).returning();
  const [schedule]=await db.insert(schema.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:new Date(`${earlier}T10:00:00+08:00`),actualPublishAt:new Date(`${earlier}T10:00:00+08:00`),completionStatus:'on_time',isPromoted:promoted,promotionStatus:promoted?(terminal?'test_discarded':stage):'none'}).returning();
  if(!promoted)return{schedule,campaign:null!};
  const [campaign]=await db.insert(schema.operationsPromotionCampaign).values({scheduleId:schedule.id,startedOn:earlier,initialStage:stage,currentStage:terminal?null:stage,currentStatus:terminal?'test_discarded':stage,endedOn:terminal?yesterday:null}).returning();
  await db.insert(schema.operationsPromotionStage).values({campaignId:campaign.id,stageType:stage,startedOn:earlier,endedOn:terminal?yesterday:null,outcome:terminal?'test_discarded':null});
  for(const date of [earlier,yesterday])await db.insert(schema.operationsPromotionDailyMetric).values({campaignId:campaign.id,metricDate:date,dailyStatus:'active',stageTypeSnapshot:stage,spend:'12.00',platformOpenCount:4,actualOpenCount:2,platformLeadCount:2,actualLeadCount:1,reviewDecision:terminal&&date===yesterday?'test_discarded':stage==='testing'?'test_continue':'scaling_continue'});
  return{schedule,campaign};
 };
 const running=await seed('虚构待定交互帖');await seed('虚构阶段测试帖','testing',true);await seed('虚构阶段放量帖','scaling');
 const nonPromo=await seed('虚构非推广待补帖','testing',false,false);await db.update(schema.operationsContentSchedule).set({actualPublishAt:new Date('2026-08-01T12:00:00+08:00')}).where(eq(schema.operationsContentSchedule.id,nonPromo.schedule.id));
 const rangeInput={campaignId:running.campaign.id,requestKey:randomUUID(),startedOn:today,endedOn:today,stageType:'testing',reason:'虚构临时等待'};
 const range=await call('/api/promotion-wait-ranges','POST',rangeInput,201);assert.equal((await call('/api/promotion-wait-ranges','POST',rangeInput,201)).id,range.id);
 await call(`/api/promotion-wait-ranges/${range.id}`,'PATCH',{...rangeInput,expectedRevision:0,nextDecision:'test_continue',nextEffectiveOn:nextDateKey(today)});
 await call(`/api/promotion-wait-ranges/${range.id}`,'PATCH',{...rangeInput,expectedRevision:0},409);
 const future=await seed('虚构未来安排帖');await call('/api/promotion-wait-ranges','POST',{...rangeInput,campaignId:future.campaign.id,requestKey:randomUUID(),startedOn:nextDateKey(today),endedOn:nextDateKey(nextDateKey(today))},201);
 const historicalPost=await seed('虚构历史保护帖');const historical={...rangeInput,campaignId:historicalPost.campaign.id,requestKey:randomUUID(),startedOn:earlier,endedOn:earlier,nextDecision:'test_continue',nextEffectiveOn:yesterday};await call('/api/promotion-wait-ranges','POST',historical,403);const historicalPreview=await call('/api/promotion-wait-ranges','POST',historical,409,adminCookie);assert.equal(historicalPreview.confirmationRequired,true);assert.equal(historicalPreview.impact.dailyMetrics,1);
 const snapshotInput={requestKey:randomUUID(),periodStart:yesterday,periodEnd:yesterday,name:'虚构任意区间快照'};
 const saved=await call('/api/promotion-stage-reviews','POST',snapshotInput,201);assert.equal(saved.versionNumber,0);
 const v0=(await db.select().from(schema.operationsPromotionStageReviewVersion).where(eq(schema.operationsPromotionStageReviewVersion.id,saved.snapshotId)))[0];
 const meetingForm=new FormData();for(const[k,v]of Object.entries({name:'虚构五部分例会',periodStart:earlier,periodEnd:yesterday,meetingAt:new Date().toISOString()}))meetingForm.set(k,v);
 const meetingResponse=await fetch(baseURL+'/api/meeting-reviews',{method:'POST',headers:{Origin:baseURL,Cookie:employeeCookie},body:meetingForm});assert.equal(meetingResponse.status,201);const meeting=await meetingResponse.json();
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO6kAAAAASUVORK5CYII=','base64');
 const upload=async(bytes:Uint8Array,type='image/png',cookie=employeeCookie)=>{const form=new FormData();form.set('meetingId',meeting.id);form.set('image',new File([bytes],'虚构图片.png',{type}));return fetch(baseURL+'/api/meeting-attachments',{method:'POST',headers:{Origin:baseURL,Cookie:cookie},body:form})};
 const uploaded=await upload(png);assert.equal(uploaded.status,201);const image=await uploaded.json();
 assert.equal((await fetch(baseURL+`/api/meeting-attachments/${image.id}`)).status,401);
 const imageResponse=await fetch(baseURL+`/api/meeting-attachments/${image.id}`,{headers:{Cookie:employeeCookie}});assert.equal(imageResponse.status,200);assert.equal(imageResponse.headers.get('content-type'),'image/png');assert.ok(imageResponse.headers.get('cache-control')?.includes('private'));assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()),png);
 assert.equal((await upload(Buffer.from('<svg></svg>'),'image/svg+xml')).status,422);assert.equal((await upload(new Uint8Array(3145729))).status,413);
 const draft={schemaVersion:3,coreConclusion:'虚构结论',nextAction:'虚构下一步',situation:'虚构本周情况',strategy:'虚构策略',promotionInputs:{},issues:[{problem:'虚构遗留事项',conclusion:'虚构进展',status:'validating'}],nonPromotionSelections:[{scheduleId:nonPromo.schedule.id,checkpointType:'day_7'}],promotionSnapshotIds:[saved.snapshotId],temporaryNotes:'虚构临时事项',temporaryLinks:[{label:'虚构文档',url:'https://fictional.example.test/document'}],attachmentIds:[image.id]};
 // 显式构造旧 v3 草稿以验证兼容编辑；新建会议的 v4 路径由 meeting-weekly.browser 覆盖。
 await db.update(schema.operationsReviewMeeting).set({draftSnapshot:draft as any}).where(eq(schema.operationsReviewMeeting.id,meeting.id));
 await call(`/api/meeting-reviews/${meeting.id}`,'PATCH',{action:'save',draft});
 const playwright=await import(process.env.PLAYWRIGHT_MODULE||new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);browser=await playwright.chromium.launch({headless:true});await mkdir('.tools/test-artifacts',{recursive:true});const errors:string[]=[];
 for(const width of [1440,390,320]){
  const context=await browser.newContext({viewport:{width,height:1000},...(width<900?{isMobile:true,hasTouch:true}:{})});await context.addCookies(employeeCookie.split('; ').map(c=>({name:c.slice(0,c.indexOf('=')),value:c.slice(c.indexOf('=')+1),url:baseURL})));const page=await context.newPage();page.on('pageerror',(e:Error)=>errors.push(e.message));
  await page.goto(baseURL+'/business/daily-promotion-review');await page.getByRole('heading',{name:'每日复盘',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const frame=await page.locator('.workspace').boundingBox(),toolbar=await page.locator('.business-toolbar').boundingBox();
  await page.goto(baseURL+`/business/daily-promotion-review?view=stage&review=${saved.id}&snapshot=${saved.snapshotId}`);await page.waitForLoadState('networkidle');await page.locator('[data-promotion-snapshot]').waitFor();assert.ok((await page.locator('[data-promotion-snapshot]').textContent()).includes('虚构阶段测试帖'));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);

  const afterFrame=await page.locator('.workspace').boundingBox(),afterToolbar=await page.locator('.business-toolbar').boundingBox();assert.equal(frame.x,afterFrame.x);assert.equal(toolbar.height,afterToolbar.height);
  await page.screenshot({path:`.tools/test-artifacts/stage-review-${width}.png`,fullPage:true});
  await page.goto(baseURL+`/business/meeting-review?meeting=${meeting.id}`);await page.locator('[data-report]').waitFor();for(const label of ['本周动向','推广阶段复盘快照','非推广复盘快照','临时事项快照','本周结论与事项进展'])assert.ok(await page.getByRole('heading',{name:label,exact:true}).isVisible());assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`.tools/test-artifacts/meeting-review-${width}.png`,fullPage:true});
  if(width===390){await page.locator('textarea[name=temporaryNotes]').fill('虚构手机编辑');await page.locator('[data-save]').last().click();await page.getByText('草稿已保存',{exact:true}).waitFor();page.on('dialog',(dialog:any)=>{errors.push('出现原生弹框：'+dialog.type());void dialog.dismiss();});{const answer=respondToBusinessConfirm(page);await page.locator('[data-finalize]').click();await answer;}assert.equal(await page.locator('textarea[name=temporaryNotes]').inputValue(),'虚构手机编辑');
   await page.route(`**/api/meeting-reviews/${meeting.id}`,async(route:any)=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'虚构定稿失败，输入保留'})}));{const answer=respondToBusinessConfirm(page,true);await page.locator('[data-finalize]').click();await answer;}await page.locator('[data-output]').getByText('虚构定稿失败，输入保留',{exact:true}).waitFor();assert.equal(await page.locator('textarea[name=temporaryNotes]').inputValue(),'虚构手机编辑');await page.unroute(`**/api/meeting-reviews/${meeting.id}`);
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);
 const finalized=await call(`/api/meeting-reviews/${meeting.id}`,'PATCH',{action:'finalize',draft,generated:{activity:[{contentName:'伪造内容不应写入'}]}});assert.equal(finalized.versionNumber,0);
 const [meetingV0]=await db.select().from(schema.operationsReviewMeetingVersion).where(eq(schema.operationsReviewMeetingVersion.meetingId,meeting.id));assert.ok(!JSON.stringify(meetingV0.snapshot).includes('伪造内容不应写入'));assert.deepEqual((meetingV0.snapshot as any).generated.promotionSnapshots[0].snapshot,v0.snapshot);assert.equal((meetingV0.snapshot as any).generated.nonPromotions[0].review,null);
 await call(`/api/promotion-stage-reviews/${saved.id}`,'PATCH',{...snapshotInput,expectedVersion:0});await call(`/api/promotion-stage-reviews/${saved.id}`,'PATCH',{...snapshotInput,expectedVersion:0},409);
 assert.deepEqual((await db.select().from(schema.operationsReviewMeetingVersion).where(eq(schema.operationsReviewMeetingVersion.id,meetingV0.id)))[0].snapshot,meetingV0.snapshot);
 const finalContext=await browser.newContext({viewport:{width:390,height:900}});await finalContext.addCookies(employeeCookie.split('; ').map(c=>({name:c.slice(0,c.indexOf('=')),value:c.slice(c.indexOf('=')+1),url:baseURL})));const finalPage=await finalContext.newPage();await finalPage.goto(baseURL+`/business/meeting-review?meeting=${meeting.id}`);await finalPage.locator('[data-meeting-snapshot]').waitFor();assert.equal(await finalPage.locator('[data-report]').count(),0);assert.ok((await finalPage.locator('[data-meeting-snapshot]').textContent()).includes('指标待补'));await finalContext.close();
 await writeFile('.tools/review-browser-result.json',JSON.stringify({passed:true,widths:[1440,390,320],errors,roles:['employee','admin'],snapshotImmutable:true,authenticatedImages:true},null,2));
 console.log('通过：区间与次日计划、未来安排、员工权限、阶段快照版本、服务端例会事实、私有图片、1440/390/320px及跨页壳层。');
}catch(error){console.error(fixture.logs());throw error}finally{await browser?.close();await fixture.stop()}
