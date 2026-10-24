/** 定稿阅读结构、标题资料与冻结边界；仅使用隔离数据库。 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {startFixture,employee} from './auth.fixture';
import {addDays} from '../src/db/stage-review-rules.mjs';
import * as s from '../src/db/schema';
const folder=process.env.MEETING_PRESENTATION_DIR||'.tools/test-artifacts/meeting-presentation';
await mkdir(folder,{recursive:true});
const clockFile=new URL('../'+folder+'/clock.txt',import.meta.url).pathname;
await writeFile(clockFile,'2026-10-24T18:00:00+08:00');
const fixture=await startFixture({clockFile}),{db,baseURL}=fixture;
let browser:any;const checks:string[]=[],errors:string[]=[],geometry:any[]=[];
try{
 async function seed(name:string,day:string,promoted=false,source?:any,links=true){
  const content=source?.content||(await db.insert(s.operationsContent).values({platformNoteId:randomUUID().replaceAll('-','').slice(0,24)}).returning())[0];
  const [version]=await db.insert(s.operationsContentVersion).values({contentId:content.id,contentName:name,versionNumber:source?1:0,workType:source?'revision':'new',sourceVersionId:source?.version.id,revisionSummary:source?'补充图像与反例':null,subjectId:'tmua',categoryId:'temporary',projectDocUrl:links?'https://example.test/doc/'+randomUUID():null}).returning();
  const [schedule]=await db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,isPromoted:promoted,promotionStatus:promoted?'testing':'none',completionStatus:'on_time',plannedPublishAt:new Date(day+'T18:00:00+08:00'),actualPublishAt:new Date(day+'T18:00:00+08:00'),publicationUrl:links?'https://www.xiaohongshu.com/explore/'+content.platformNoteId:null}).returning();
  if(promoted){
   const [campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:schedule.id,startedOn:day,dailyReviewEnabledOn:day,initialStage:'testing',currentStage:'testing',currentStatus:'testing'}).returning();
   await db.insert(s.operationsPromotionStage).values({campaignId:campaign.id,startedOn:day,stageType:'testing'});
   await db.insert(s.operationsPromotionDailyMetric).values({campaignId:campaign.id,metricDate:addDays(day,1),dailyStatus:'active',actualStatusSnapshot:'testing',stageTypeSnapshot:'testing',recordKind:'regular',sourceStageStartedOn:day,spend:'120',platformOpenCount:10,actualOpenCount:4,platformLeadCount:3,actualLeadCount:2,reviewDecision:'test_continue'});
  }else await db.insert(s.operationsContentPerformanceMetric).values({scheduleId:schedule.id,checkpointType:'day_7',recordedThrough:addDays(day,7),clickRate:'7.25',threeSecondReadRate:'42.50'});
  return {content,version,schedule};
 }
 const old=await seed('函数图像与逻辑推理','2026-10-05',true);
 const posts=[await seed('函数图像与逻辑推理','2026-10-21',true,old),await seed('从长条件到关键结论：如何用图像、反例和逻辑关系建立完整的数学入学考试解题过程','2026-10-21',true),await seed('数列与递推关系','2026-10-21',true,undefined,false),await seed('充分条件与必要条件','2026-10-21',true)];
 await seed('本期未选入的推广阶段','2026-10-21',true);
 const non=[await seed('首轮复盘：把例题转化为方法','2026-10-14'),await seed('完整论证与常见误区','2026-10-14'),await seed('尚未登记项目资料的复盘','2026-10-14',false,undefined,false)];
 const login=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(employee)});assert.equal(login.status,200);
 const cookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 const api=async(path:string,values?:any)=>{const res=await fetch(baseURL+path,{method:values?'PATCH':'GET',headers:{Origin:baseURL,Cookie:cookie,'Content-Type':'application/json'},body:values?JSON.stringify(values):undefined});const json=await res.json();assert.ok(res.ok,JSON.stringify(json));return json;};
 async function create(type='weekly',from='2026-10-17',to='2026-10-22'){
  const f=new FormData();for(const [k,v]of Object.entries({meetingType:type,meetingAt:'2026-10-24T18:00',periodStart:from,periodEnd:to}))f.set(k,v);
  const res=await fetch(baseURL+'/api/meeting-reviews',{method:'POST',headers:{Origin:baseURL,Cookie:cookie},body:f});assert.equal(res.status,201);return(await res.json()).id;
 }
 const id=await create(),material=(await api('/api/meeting-reviews/'+id+'/material')).material;
 const selected=material.promotions.filter((r:any)=>posts.some(p=>p.schedule.id===r.scheduleId));assert.equal(selected.length,4);
 assert.equal(material.summary.posts,5);assert.equal(material.summary.spend,600);
 let [record]=await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,id));
 const longObservation='观察：核心开口稳定，需结合实际留资继续判断。\n完整记录长条件、图像与反例的阅读表现，不因展示截断原始结论。';
 const draft={...record.draftSnapshot,workflowVersion:5,candidatesConfirmed:true,materialFingerprint:material.fingerprint,promotionSelections:selected.map((r:any)=>r.key),nonPromotionSelections:[],promotionInputs:Object.fromEntries(selected.map((r:any,i:number)=>[r.key,{clickRate:i?7.25:0,recordedThrough:'2026-10-22',currentSituation:i===1?longObservation:'开口成本稳定，继续核对留资质量。',activeAction:'保留主内容，补充关键条件的表达。',confirmed:true}])),promotionDecisions:{[selected[0].campaignId]:'test_paused'},situation:'结合实际开口与留资核对投放效果，不用点击率替代最终结果。',strategy:'补充图像与反例，持续跟进有效咨询。',coreConclusion:'本期先稳定有效开口，再核对留资质量。\n已完成内容保留，下一轮集中验证关键条件的表达。',nextAction:'核对下一轮素材；按会后确定的安排执行。',issues:[{problem:'确认后续素材中的关键条件',conclusion:'整理反例与图像对照后复查',status:'pending'}]};
 await api('/api/meeting-reviews/'+id,{action:'save',draft,expectedUpdatedAt:record.updatedAt.toISOString()});
 const pw=await import(new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);browser=await pw.chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:folder+'/video',size:{width:1440,height:1000}}});
 await context.addCookies(cookie.split('; ').map(c=>({name:c.slice(0,c.indexOf('=')),value:c.slice(c.indexOf('=')+1),url:baseURL})));
 await context.route('https://example.test/**',(r:any)=>r.fulfill({contentType:'text/html',body:'<h1>隔离项目资料</h1>'}));
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',(e:Error)=>errors.push(e.message));
 const nav=async(path:string)=>{await page.evaluate(()=>document.documentElement.dataset.unsaved='false').catch(()=>{});await page.goto(baseURL+path);await page.waitForLoadState('networkidle');await page.evaluate(()=>document.fonts.ready);};
 const card=(post:typeof posts[number])=>page.locator(`[data-weekly-promotion^="${selected.find((r:any)=>r.scheduleId===post.schedule.id).campaignId}:"]`);
 const shot=async(name:string)=>{await page.screenshot({path:folder+'/'+name+'.png',fullPage:false});};
 const scrollToCard=async(c:any)=>{await c.evaluate((n:HTMLElement)=>scrollTo(0,n.getBoundingClientRect().top+scrollY-110));};
 async function infoCheck(c:any,expected:string|null){
  const button=c.locator('.weekly-card-title .weekly-detail-trigger'),panel=c.locator('.weekly-card-reference .weekly-detail-popover');
  assert.equal(await button.count(),1,'资料入口在标题内');
  const measure=()=>c.evaluate((n:HTMLElement)=>({scrollY,rect:n.getBoundingClientRect().toJSON()}));const before=await measure();
  await button.hover();await panel.waitFor({state:'visible'});assert.deepEqual(await measure(),before);
  const box=await panel.boundingBox(),bounds=await c.boundingBox();assert.ok(box.x>=bounds.x+8&&box.x+box.width<=bounds.x+bounds.width-8,'资料气泡在所属卡片范围内，不盖住左侧导航');
  if(expected)assert.equal(await panel.getByRole('link',{name:'项目文档 ↗',exact:true}).getAttribute('href'),expected);else await panel.getByText('项目文档 · 未登记',{exact:true}).waitFor();
  await button.click();await page.mouse.move(250,90);await page.waitForTimeout(220);assert.equal(await panel.isVisible(),true);
  await page.keyboard.press('Escape');assert.equal(await panel.isVisible(),false);assert.deepEqual(await measure(),before);
  await button.focus();await page.keyboard.press('Enter');await panel.waitFor();await page.mouse.click(250,90);assert.equal(await panel.isVisible(),false);
 }
 await nav('/business/meeting-review?meeting='+id);
 assert.equal(await page.locator('.weekly-results').count(),0);assert.equal(await page.locator('#weekly-promotion').count(),1);assert.equal(await page.getByRole('button',{name:'保存草稿',exact:true}).count(),1);
 await scrollToCard(card(posts[0]));await infoCheck(card(posts[0]),posts[0].version.projectDocUrl);
 await card(posts[0]).getByRole('button',{name:'修改',exact:true}).click();await card(posts[0]).locator('textarea').first().fill('保留尚未保存的观察');await infoCheck(card(posts[0]),posts[0].version.projectDocUrl);assert.equal(await card(posts[0]).locator('textarea').first().inputValue(),'保留尚未保存的观察');await shot('draft-1440');
 checks.push('草稿仍按日期、推广、非推广、结论、事项填写；标题资料悬停/点击/键盘/外点不跳动且保留输入');
 [record]=await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,id));
 await api('/api/meeting-reviews/'+id,{action:'finalize_pre',draft:record.draftSnapshot,expectedUpdatedAt:record.updatedAt.toISOString()});
 const [pre]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId,id));const beforeSnapshot=JSON.stringify(pre.snapshot);
 assert.equal((await db.select().from(s.operationsReviewActionItem)).length,0);
 await nav('/business/meeting-review?meeting='+id+'&version=0');
 assert.equal(await page.locator('.weekly-frozen input,.weekly-frozen textarea,.weekly-frozen select').count(),0);
 assert.deepEqual(await page.locator('.weekly-frozen>section[aria-label]').evaluateAll((nodes:HTMLElement[])=>nodes.map(n=>n.getAttribute('aria-label'))),['本期结果','推广帖阶段复盘','非推广帖复盘','补充分析与事项']);
 assert.match(await page.locator('.weekly-summary').innerText(),/¥600.00/);assert.match(await card(posts[0]).innerText(),/拟议安排 · 尚未生效/);
 assert.equal(await page.locator('.weekly-card-writing p').filter({hasText:longObservation}).innerText(),longObservation);
 for(const width of [1920,1440,1280,1024]){
  await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));await shot('pre-overview-'+width);
  await scrollToCard(card(posts[0]));
  const boxes=await page.locator('[data-weekly-promotion]').evaluateAll((nodes:HTMLElement[])=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,h:r.height};}));
  const count=width===1024?2:3;assert.equal(boxes[0].y,boxes[count-1].y);assert.ok(Math.abs(boxes[0].h-boxes[count-1].h)<1);assert.ok(boxes[count].y>boxes[0].y);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  geometry.push({width,boxes});await shot('pre-cards-'+width);
 }
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:folder+'/pre-full-1440.png',fullPage:true});
 await scrollToCard(card(posts[0]));await infoCheck(card(posts[0]),posts[0].version.projectDocUrl);await infoCheck(card(posts[2]),null);
 const nonCard=page.locator(`[data-weekly-non="${non[0].schedule.id}"]`);await scrollToCard(nonCard);await infoCheck(nonCard,non[0].version.projectDocUrl);await shot('pre-non-1440');
 const referenceBefore=await api('/api/meeting-reviews/'+id+'/material');
 await db.update(s.operationsContentVersion).set({projectDocUrl:'https://example.test/corrected-promotion'}).where(eq(s.operationsContentVersion.id,posts[0].version.id));
 await db.update(s.operationsContentVersion).set({projectDocUrl:'https://example.test/corrected-non'}).where(eq(s.operationsContentVersion.id,non[0].version.id));
 const referenceAfter=await api('/api/meeting-reviews/'+id+'/material');assert.equal(referenceBefore.material.fingerprint,referenceAfter.material.fingerprint);assert.equal(referenceAfter.postReferences[posts[0].schedule.id].projectDocUrl,'https://example.test/corrected-promotion');
 await nav('/business/meeting-review?meeting='+id+'&version=0');await scrollToCard(card(posts[0]));await infoCheck(card(posts[0]),'https://example.test/corrected-promotion');
 assert.equal(JSON.stringify((await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,pre.id)))[0].snapshot),beforeSnapshot);
 checks.push('四档桌面三列/两列同行等高；定稿无表单、长观察完整；汇总包含未选入阶段的真实跑量；历史内容保留；两类资料实时读取且快照/指纹不变');
 [record]=await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,id));
 await api('/api/meeting-reviews/'+id,{action:'finalize_post',draft:record.draftSnapshot,expectedUpdatedAt:record.updatedAt.toISOString()});
 await writeFile(clockFile,'2026-10-27T18:00:00+08:00');await nav('/business/meeting-review?meeting='+id+'&version=1');
 assert.match(await card(posts[0]).innerText(),/已定安排/);assert.match(await card(posts[0]).innerText(),/2026-10-25/);assert.doesNotMatch(await card(posts[0]).innerText(),/2026-10-28/);
 assert.match(await page.locator('.weekly-next-action').innerText(),/2026-10-25/);assert.equal((await db.select().from(s.operationsReviewActionItem)).length,1);
 await shot('post-overview-1440');await scrollToCard(card(posts[0]));await shot('post-cards-1440');await card(posts[0]).locator('.weekly-card-reference button').hover();await shot('post-references-1440');await page.keyboard.press('Escape');
 const monthly=await create('monthly','2026-09-01','2026-09-30');const monthMaterial=(await api('/api/meeting-reviews/'+monthly+'/material')).material;
 let [month]=await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,monthly));
 await api('/api/meeting-reviews/'+monthly,{action:'finalize_pre',draft:{...month.draftSnapshot,issues:[],candidatesConfirmed:true,materialFingerprint:monthMaterial.fingerprint,situation:'本期无实际跑量',strategy:'准备后续素材',coreConclusion:'等待实际结果后再作判断。'},expectedUpdatedAt:month.updatedAt.toISOString()});
 await nav('/business/meeting-review?meeting='+monthly+'&version=0');await page.getByText('本期无跟进事项',{exact:true}).waitFor();await page.getByText('本次未选推广阶段',{exact:true}).waitFor();await shot('monthly-empty-1440');
 checks.push('会前不执行事项；会后追加V1并执行；跨日查看保持冻结生效日；月例会及无卡片/无事项有明确空态');
 assert.deepEqual(errors,[]);await context.close();await writeFile(folder+'/checks.json',JSON.stringify({checks,errors,geometry},null,2));console.log(JSON.stringify({checks,folder}));
}catch(e){console.error(fixture.logs().slice(-2500));throw e;}finally{await browser?.close();await fixture.stop();}
