import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {admin} from './auth.fixture';
import {versionDraftPayload} from './meeting-write.helper';
import {respondToBusinessConfirm} from './business-confirm.helper';
import * as s from '../src/db/schema';
const folder=process.env.MEETING_AUTO_RATE_DIR??'.tools/test-artifacts/meeting-auto-rate';await mkdir(folder,{recursive:true});
const clock=new URL('../'+folder+'/clock.txt',import.meta.url).pathname;await writeFile(clock,'2026-10-25T10:00:00Z');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');process.env.MEETING_CHROMIUM_PATH=chromium.executablePath();
const f=await startPostgresFixture({entry:'.tools/serve-vercel.mjs',clockFile:clock}),{db,baseURL:base}=f;
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:folder+'/video',size:{width:1440,height:1000}}}),page=await context.newPage(),checks:string[]=[],errors:string[]=[];
let cookie='',meetingId='';
async function api(path:string,body?:any,status=200){const r=await fetch(base+path,{method:body?'PATCH':'GET',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},body:body?JSON.stringify(await versionDraftPayload(db,path,{...body,expectedUpdatedAt:(await meeting()).updatedAt.toISOString()})):undefined}),v=await r.json();assert.equal(r.status,status,JSON.stringify(v));return v;}
async function meeting(){return(await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,meetingId)))[0];}
async function create(){const form=new FormData();for(const[k,v]of Object.entries({meetingType:'weekly',meetingAt:'2026-10-25T18:00',periodStart:'2026-10-21',periodEnd:'2026-10-22'}))form.set(k,v);const r=await fetch(base+'/api/meeting-reviews',{method:'POST',headers:{Cookie:cookie,Origin:base},body:form});assert.equal(r.status,201);return(await r.json()).id;}
async function seed(name:string,counts:Array<[number|null,number|null]>,zero=false){
 const [content]=await db.insert(s.operationsContent).values({platformNoteId:randomUUID().replaceAll('-','').slice(0,24)}).returning();
 const [version]=await db.insert(s.operationsContentVersion).values({contentId:content.id,contentName:name,versionNumber:0,workType:'new',subjectId:'tmua',categoryId:'temporary'}).returning();
 const [schedule]=await db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,isPromoted:true,promotionStatus:'scaling',completionStatus:'on_time',plannedPublishAt:new Date('2026-10-21T02:00Z'),actualPublishAt:new Date('2026-10-21T02:00Z')}).returning();
 const [campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:schedule.id,startedOn:'2026-10-21',dailyReviewEnabledOn:'2026-10-21',initialStage:'scaling',currentStage:'scaling',currentStatus:'scaling'}).returning();
 await db.insert(s.operationsPromotionStage).values({campaignId:campaign.id,stageType:'scaling',startedOn:'2026-10-21'});
 const metrics=await db.insert(s.operationsPromotionDailyMetric).values(counts.map(([impressionCount,clickCount],i)=>({campaignId:campaign.id,metricDate:'2026-10-'+(21+i),dailyStatus:'active',actualStatusSnapshot:'scaling',stageTypeSnapshot:'scaling',sourceStageStartedOn:'2026-10-21',spend:zero?'0':'25',platformOpenCount:0,platformLeadCount:0,actualOpenCount:zero?0:2,actualLeadCount:zero?0:1,impressionCount,clickCount,reviewDecision:'scaling_continue'}))).returning();
 return {name,content,version,schedule,campaign,metrics,key:campaign.id+':scaling:2026-10-21'};
}
async function settle(){await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(350);}
const card=(key:string)=>page.locator('[data-weekly-promotion="'+key+'"]');
try{
 await context.addInitScript({content:'window.__name = value => value;'});page.on('pageerror',(e:Error)=>errors.push(e.message));
 const login=await fetch(base+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(admin)});assert.equal(login.status,200);cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');await context.addCookies(cookie.split('; ').map(c=>({name:c.slice(0,c.indexOf('=')),value:c.slice(c.indexOf('=')+1),url:base})));
 const automatic=await seed('完整数据 · 自动点击率',[[100,10],[900,9]]),fillLater=await seed('补齐数据 · 恢复自动',[[100,5],[null,null]]),manual=await seed('特殊缺失 · 保留手填',[[100,5],[null,null]]),zero=await seed('零曝光 · 无需编造',[[0,0],[0,0]]),noRange=await seed('全零记录 · 无有效区间',[[null,null],[null,null]],true);
 const campaignsBefore=await db.select().from(s.operationsPromotionCampaign);
 meetingId=await create();const material=(await api('/api/meeting-reviews/'+meetingId+'/material')).material;
 assert.equal(material.promotions.length,5);assert.equal(material.pending.length,0);
 let draft={...(await meeting()).draftSnapshot,workflowVersion:7 as const,candidatesConfirmed:true,promotionSelections:material.promotions.map((r:any)=>r.key),materialFingerprint:material.fingerprint,situation:'实际人数继续人工核对',strategy:'保持人工策略',coreConclusion:'本次验证自动点击率',nextAction:'继续观察',promotionInputs:Object.fromEntries(material.promotions.map((r:any)=>[r.key,{clickRate:r.key===automatic.key?99:null,recordedThrough:'',currentSituation:'观察保留',activeAction:'行动保留',clickRateBasis:{mode:'unavailable',impressionCount:0,clickCount:0,missingDates:[]}}]))};
 await api('/api/meeting-reviews/'+meetingId,{action:'save',draft});
 let stored=(await meeting()).draftSnapshot;
 assert.equal(stored.promotionInputs[automatic.key].clickRate,1.9);assert.equal(stored.promotionInputs[automatic.key].clickRateBasis?.mode,'auto');assert.equal(stored.promotionInputs[manual.key].clickRateBasis?.mode,'manual');
 await api('/api/meeting-reviews/'+meetingId,{action:'finalize_pre',draft:stored},422);
 checks.push('服务端拒绝伪造99%及unavailable来源，依当前材料计算1.90%；缺数手填未完成不能定稿，草稿允许保存');
 await page.goto(base+'/business/meeting-review?meeting='+meetingId);await page.locator('[data-report-v4]').waitFor();await settle();
 assert.equal(await card(automatic.key).getByRole('spinbutton').count(),0);assert.equal(await card(automatic.key).locator('.weekly-promotion-rate>strong').textContent(),'1.90%');assert.equal(await card(zero.key).getByRole('spinbutton').count(),0);assert.equal(await card(zero.key).locator('.weekly-promotion-rate>strong').textContent(),'—');assert.equal(await card(noRange.key).getByRole('spinbutton').count(),0);
 await card(manual.key).getByRole('button',{name:'点击率计算依据',exact:true}).hover();await card(manual.key).getByRole('region',{name:'点击率计算依据'}).waitFor({state:'visible'});assert.match(await card(manual.key).getByRole('region',{name:'点击率计算依据'}).innerText(),/2026-10-22/);
 await settle();await page.screenshot({path:folder+'/manual-help-1440.png'});await page.mouse.move(30,30);const help=card(manual.key).getByRole('button',{name:'点击率计算依据',exact:true});await help.focus();await card(manual.key).getByRole('region',{name:'点击率计算依据'}).waitFor({state:'visible'});await page.keyboard.press('Escape');await card(manual.key).getByRole('region',{name:'点击率计算依据'}).waitFor({state:'hidden'});
 for(const width of [1920,1440,1024]){
  await page.setViewportSize({width,height:1000});await card(automatic.key).scrollIntoViewIfNeeded();await settle();await page.screenshot({path:folder+'/cards-'+width+'.png'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const font=await card(automatic.key).locator('.weekly-promotion-rate>strong').evaluate((n:HTMLElement)=>getComputedStyle(n).fontFamily);assert(font.includes('MiSans'));
  const alignment=await card(automatic.key).locator('.weekly-promotion-metrics').evaluate((group:HTMLElement)=>[...group.children].slice(2).map(item=>{const r=item.querySelector('strong')!.getBoundingClientRect();return r.top+r.height/2;}));assert(Math.max(...alignment)-Math.min(...alignment)<1,'点击率与同排留资成本数值共用基线');
  if(width===1920){for(const [key,name]of [[automatic.key,'automatic'],[manual.key,'manual']]){await card(key).evaluate((node:HTMLElement)=>node.scrollIntoView({block:'center'}));await settle();await card(key).screenshot({path:folder+'/'+name+'-card-1920.png'});}}
 }
 await page.setViewportSize({width:1440,height:1000});
 await card(fillLater.key).getByRole('spinbutton').fill('4.62');await card(fillLater.key).getByRole('textbox',{name:fillLater.name+' 观察',exact:true}).fill('人工观察不能被刷新覆盖');await card(fillLater.key).getByRole('button',{name:'确认',exact:true}).click();await card(fillLater.key).getByRole('button',{name:'修改',exact:true}).waitFor();
 await card(manual.key).getByRole('spinbutton').fill('7.25');
 await db.update(s.operationsPromotionDailyMetric).set({impressionCount:150,clickCount:3,updatedAt:new Date('2026-10-25T09:00Z')}).where(eq(s.operationsPromotionDailyMetric.id,fillLater.metrics[1].id));
 await page.locator('.weekly-meeting-settings>summary').click();await page.getByRole('button',{name:'刷新数据',exact:true}).click();await page.locator('.weekly-report-actions output').filter({hasText:'数据已刷新'}).waitFor();
 assert.equal(await card(fillLater.key).getByRole('spinbutton').count(),0);assert.equal(await card(fillLater.key).locator('.weekly-promotion-rate>strong').textContent(),'3.20%');assert.match(await card(fillLater.key).innerText(),/人工观察不能被刷新覆盖/);assert.equal(await card(manual.key).getByRole('spinbutton').inputValue(),'7.25');
 await card(manual.key).getByRole('button',{name:'确认',exact:true}).click();await card(manual.key).getByRole('button',{name:'修改',exact:true}).waitFor();
 checks.push('自动字段只读、特殊手填日期可悬停查看；补齐数据刷新恢复3.20%，观察、另一卡手填和策略保留');
 await page.getByRole('button',{name:'会前定稿 V0',exact:true}).click();await respondToBusinessConfirm(page,true);await page.waitForURL('**version=0');await settle();await page.screenshot({path:folder+'/frozen-web-1440.png',fullPage:true});
 const [pre]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId,meetingId)),snapshot:any=pre.snapshot;
 assert.equal(snapshot.draft.promotionInputs[automatic.key].clickRate,1.9);assert.equal(snapshot.draft.promotionInputs[manual.key].clickRate,7.25);assert.deepEqual(snapshot.draft.promotionInputs[manual.key].clickRateBasis.missingDates,['2026-10-22']);assert.equal(snapshot.draft.promotionInputs[zero.key].clickRate,null);assert.equal(snapshot.draft.promotionInputs[fillLater.key].currentSituation,'人工观察不能被刷新覆盖');
 assert.deepEqual(await db.select().from(s.operationsPromotionCampaign),campaignsBefore);
 // PDF调用真实应用渲染器；仅构造一份与会前已冻结材料相同的会后夹具，不重复测试决定执行流程。
 const postSnapshot=structuredClone(snapshot);postSnapshot.finalizationStage='post';postSnapshot.draft.finalizationStage='post';
 const [post]=await db.insert(s.operationsReviewMeetingVersion).values({meetingId,versionNumber:1,snapshot:postSnapshot,changeSummary:'隔离PDF事实一致性',finalizedByLabel:'fixture'}).returning();
 const pdf=await fetch(base+'/api/meeting-versions/'+post.id+'/pdf',{method:'POST',headers:{Cookie:cookie,Origin:base}});assert.equal(pdf.status,200,f.logs().slice(-1800));
 const [attachment]=await db.select().from(s.operationsMeetingAttachment).where(eq(s.operationsMeetingAttachment.meetingVersionId,post.id));await writeFile(folder+'/automatic-and-manual.pdf',Buffer.from(attachment.base64,'base64'));await writeFile(folder+'/snapshot.json',JSON.stringify(postSnapshot));
 const frozen=JSON.stringify(snapshot),legacy=structuredClone(postSnapshot);for(const v of Object.values(legacy.draft.promotionInputs) as any[])delete v.clickRateBasis;legacy.draft.promotionInputs[automatic.key].clickRate=6.66;
 const [oldMeeting]=await db.insert(s.operationsReviewMeeting).values({name:'旧冻结版本保持原点击率',meetingType:'weekly',periodStart:'2026-10-21',periodEnd:'2026-10-22',meetingAt:new Date('2026-10-24T10:00Z'),status:'completed',currentVersionNumber:0,createdByLabel:'fixture'}).returning();legacy.meeting.id=oldMeeting.id;legacy.meeting.name=oldMeeting.name;
 const [old]=await db.insert(s.operationsReviewMeetingVersion).values({meetingId:oldMeeting.id,versionNumber:0,snapshot:legacy,changeSummary:'旧版隔离夹具',finalizedByLabel:'fixture'}).returning();
 await db.update(s.operationsPromotionDailyMetric).set({impressionCount:1,clickCount:1}).where(eq(s.operationsPromotionDailyMetric.id,automatic.metrics[0].id));
 await page.reload();assert.equal(await card(automatic.key).locator('.weekly-promotion-rate>strong').textContent(),'1.90%');assert.equal(JSON.stringify((await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,pre.id)))[0].snapshot),frozen);
 await page.goto(base+'/business/meeting-review?meeting='+oldMeeting.id+'&version=0');assert.equal(await card(automatic.key).locator('.weekly-promotion-rate>strong').textContent(),'6.66%');await settle();await page.screenshot({path:folder+'/legacy-frozen-1440.png'});
 assert.deepEqual((await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,old.id)))[0].snapshot,legacy);
 const cached=await fetch(base+'/api/meeting-versions/'+post.id+'/pdf',{method:'POST',headers:{Cookie:cookie,Origin:base}});assert.equal(cached.status,200);assert.equal((await cached.json()).id,attachment.id);assert.equal((await db.select().from(s.operationsMeetingAttachment).where(eq(s.operationsMeetingAttachment.id,attachment.id)))[0].base64,attachment.base64);
 checks.push('真实定稿冻结自动值、手填值和依据，不写推广策略；原始事实后更正不会改新旧冻结版本，旧6.66%保持，既有PDF字节缓存保留');
 await page.setViewportSize({width:390,height:844});await settle();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:folder+'/limited-390.png',fullPage:true});
 assert.deepEqual(errors,[]);await writeFile(folder+'/result.json',JSON.stringify({passed:true,checks,errors},null,2));console.log(checks.join('\n'));
}catch(e){await page.screenshot({path:folder+'/failure.png',fullPage:true}).catch(()=>{});console.error(f.logs().slice(-2000));throw e;}finally{await context.close();await browser.close();await f.stop();}
