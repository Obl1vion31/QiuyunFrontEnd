/** 第八版正式组件验收。所有业务事实只写入 auth.fixture 的隔离 PGlite。 */
import assert from 'node:assert/strict';
import {copyFile,mkdir, writeFile} from 'node:fs/promises';
import {and, eq} from 'drizzle-orm';
import {startFixture, admin} from './auth.fixture';
import * as s from '../src/db/schema';
import {nextDateKey,previousDateKey} from '../src/db/promotion-rules.mjs';
import {respondToBusinessConfirm} from './business-confirm.helper';

const folder=process.env.REVIEW_V8_OUTPUT||'.tools/test-artifacts/review-v8';
await mkdir(folder,{recursive:true});
const today='2026-10-21', yesterday=previousDateKey(today), before=previousDateKey(yesterday), older=previousDateKey(before);
const clockFile=new URL('../'+folder+'/server-clock.txt',import.meta.url).pathname;
await writeFile(clockFile,today+'T12:00:00+08:00');
const fixture=await startFixture({clockFile});
let browser:any, page:any, context:any;
const errors:string[]=[], checks:string[]=[], geometry:unknown[]=[];
type Post={post:typeof s.operationsContentSchedule.$inferSelect;content:typeof s.operationsContent.$inferSelect;version:typeof s.operationsContentVersion.$inferSelect;campaign:typeof s.operationsPromotionCampaign.$inferSelect|null};
let sequence=1;

async function seed(name:string,options:{subject?:string;category?:string;promoted?:boolean;startedOn?:string;noteId?:string|null;version?:number;initialStage?:'testing'|'scaling'}={}):Promise<Post>{
 const subject=options.subject??'interview',category=options.category??'interview-course',promoted=options.promoted??true,startedOn=options.startedOn??today,initialStage=options.initialStage??'testing';
 const [content]=await fixture.db.insert(s.operationsContent).values({platformNoteId:options.noteId===undefined?(sequence++).toString(16).padStart(24,'a'):options.noteId}).returning();
 const [version]=await fixture.db.insert(s.operationsContentVersion).values({contentId:content.id,versionNumber:options.version??1,workType:'new',contentName:name,subjectId:subject,categoryId:category,projectDocUrl:'https://example.com/fictional-review-document'}).returning();
 const [post]=await fixture.db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:new Date(older+'T10:00:00+08:00'),actualPublishAt:new Date(older+'T10:00:00+08:00'),completionStatus:'on_time',isPromoted:promoted,promotionStatus:promoted?initialStage:'none'}).returning();
 if(!promoted)return {post,content,version,campaign:null};
 const [campaign]=await fixture.db.insert(s.operationsPromotionCampaign).values({scheduleId:post.id,startedOn,initialStage,currentStage:initialStage,currentStatus:initialStage,dailyReviewEnabledOn:older}).returning();
 await fixture.db.insert(s.operationsPromotionStage).values({campaignId:campaign.id,stageType:initialStage,startedOn});
 return {post,content,version,campaign};
}

const fields=['spend','platformOpenCount','actualOpenCount','platformLeadCount','actualLeadCount'] as const;
async function fill(form:any,values:Record<string,string>={spend:'200',platformOpenCount:'20',actualOpenCount:'10',platformLeadCount:'8',actualLeadCount:'5'}){
 for(const [name,value] of Object.entries(values))await form.locator(`[name=${name}]`).fill(value);
}
async function settle(){await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(100);}
async function capture(name:string,fullPage=true){if(fullPage)await page.evaluate(()=>scrollTo(0,0));await settle();await page.screenshot({path:`${folder}/${name}.png`,fullPage});if(fullPage&&page.viewportSize().width<900)await page.screenshot({path:`${folder}/${name}-viewport.png`,fullPage:false});}
async function navigate(url:string){await page.goto(url);await page.locator('main').waitFor();await page.waitForLoadState('networkidle');await settle();}
async function assertNoOverflow(){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`页面横向溢出：${page.url()}`);}
function record(item:Post,date=yesterday){return page.locator(`[data-review-record][data-review-post="${item.post.id}"][data-review-date="${date}"]`);}
function metric(item:Post,date=yesterday){return record(item,date).locator('[data-metric-form]');}
async function getCount(){return Number(await page.locator('[data-promotion-pending-body]').getAttribute('data-due-count'));}
async function cleanForNavigation(){
 // 场景截图中的未提交示例输入有意丢弃；不伪装成保存成功。
 await page.evaluate(()=>{document.documentElement.dataset.unsaved='false';document.querySelectorAll<HTMLElement>('[data-dirty=true]').forEach(node=>node.dataset.dirty='false');});
}
async function snapshotGeometry(width:number,label:string){
 const measured=await page.evaluate(()=>{
  const pick=(selector:string)=>[...document.querySelectorAll<HTMLElement>(selector)].map(node=>{const b=node.getBoundingClientRect(),c=getComputedStyle(node);return{selector,key:node.dataset.reviewRecord??node.dataset.lifecycleSchedule??node.getAttribute('name'),text:node.innerText?.slice(0,100),x:b.x,y:b.y,width:b.width,height:b.height,font:c.fontFamily,size:c.fontSize,weight:c.fontWeight,padding:c.padding,gap:c.columnGap};});
  return {viewport:innerWidth,document:document.documentElement.scrollWidth,nodes:[...pick('[data-lifecycle-schedule]'),...pick('[data-review-record]'),...pick('[data-metric-form] input[type=number]'),...pick('[data-day-status]')]};
 });
 geometry.push({width,label,...measured});
}
async function installFacts(item:Post,state:'testing'|'scaling'|'test_pending'|'test_paused'|'scaling_paused'){
 const id=item.campaign!.id,initial=state==='scaling_paused'?'scaling':'testing';
 await fixture.db.delete(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.campaignId,id));
 await fixture.db.delete(s.operationsPromotionDayDecision).where(eq(s.operationsPromotionDayDecision.campaignId,id));
 await fixture.db.delete(s.operationsPromotionStage).where(eq(s.operationsPromotionStage.campaignId,id));
 if(state==='testing'){
  await fixture.db.update(s.operationsPromotionCampaign).set({startedOn:yesterday,initialStage:'testing',currentStatus:'testing',currentStage:'testing',endedOn:null}).where(eq(s.operationsPromotionCampaign.id,id));
  await fixture.db.insert(s.operationsPromotionStage).values({campaignId:id,stageType:'testing',startedOn:yesterday});
 }else{
  const waiting=state!=='scaling',target=state==='scaling'?'test_pending':state;
  await fixture.db.update(s.operationsPromotionCampaign).set({startedOn:older,initialStage:initial,currentStatus:state,currentStage:state==='scaling'||state==='scaling_paused'?'scaling':'testing',endedOn:null}).where(eq(s.operationsPromotionCampaign.id,id));
  await fixture.db.insert(s.operationsPromotionStage).values({campaignId:id,stageType:initial,startedOn:older,endedOn:older,outcome:'paused'});
  await fixture.db.insert(s.operationsPromotionDayDecision).values({campaignId:id,businessDate:before,stageType:initial,actualStatus:target,reason:'虚构验收：已记录的真实业务状态变更'});
  const firstDecision=target==='test_pending'?'test_pending':target==='test_paused'?'test_pause':'scaling_pause';
  await fixture.db.insert(s.operationsPromotionDailyMetric).values({campaignId:id,metricDate:older,dailyStatus:'active',actualStatusSnapshot:initial,stageTypeSnapshot:initial,sourceStageStartedOn:older,spend:'200',platformOpenCount:20,actualOpenCount:10,platformLeadCount:8,actualLeadCount:5,reviewDecision:firstDecision});
  await fixture.db.insert(s.operationsPromotionDailyMetric).values({campaignId:id,metricDate:before,dailyStatus:'waiting_action',actualStatusSnapshot:target,stageTypeSnapshot:initial,sourceStageStartedOn:older,spend:waiting?'0':'360',platformOpenCount:waiting?0:30,actualOpenCount:waiting?0:18,platformLeadCount:waiting?0:10,actualLeadCount:waiting?0:6,reviewDecision:waiting?'wait_continue':'start_scaling'});
  if(state==='scaling'){
   await fixture.db.insert(s.operationsPromotionDayDecision).values({campaignId:id,businessDate:yesterday,stageType:'scaling',actualStatus:'scaling',reason:'虚构验收：测试确认后开始放量'});
   await fixture.db.insert(s.operationsPromotionStage).values({campaignId:id,stageType:'scaling',startedOn:yesterday});
  }
 }
 await fixture.db.update(s.operationsContentSchedule).set({promotionStatus:state}).where(eq(s.operationsContentSchedule.id,item.post.id));
}
async function eliminate(item:Post,date:string){
 const id=item.campaign!.id;
 await fixture.db.update(s.operationsPromotionCampaign).set({currentStage:null,currentStatus:'test_discarded',endedOn:date}).where(eq(s.operationsPromotionCampaign.id,id));
 await fixture.db.update(s.operationsPromotionStage).set({endedOn:date,outcome:'test_discarded'}).where(eq(s.operationsPromotionStage.campaignId,id));
 await fixture.db.update(s.operationsContentSchedule).set({promotionStatus:'test_discarded'}).where(eq(s.operationsContentSchedule.id,item.post.id));
 await fixture.db.insert(s.operationsPromotionDailyMetric).values({campaignId:id,metricDate:date,dailyStatus:'active',actualStatusSnapshot:'testing',stageTypeSnapshot:'testing',sourceStageStartedOn:item.campaign!.startedOn,spend:'100',platformOpenCount:10,actualOpenCount:5,platformLeadCount:4,actualLeadCount:2,reviewDecision:'test_discarded'});
}

try{
 const posts:Post[]=[];
 for(const [name,subject,category]of [['面试课第二轮-1','interview','interview-course'],['STEP 讲义-3','step','promotional-handout'],['TMUA 解析待定','tmua','first-analysis-series'],['TMUA 1 对 1','tmua','small-class-or-tutoring'],['面试课第二轮-2','interview','interview-course']])posts.push(await seed(name,{subject,category}));
 const categorySeeds=[['step','innovation'],['tmua','innovation'],['tmua','first-analysis-series'],['interview','interview-course'],['interview','innovation']];
 for(const [index,[subject,category]]of categorySeeds.entries())for(let n=0;n<2;n++){
  const item=await seed(`虚构${subject==='interview'?'面试课':subject.toUpperCase()}内容-${index+1}-${n+1}`,{subject,category,promoted:false});
  for(const [round,type]of ['day_7','day_15'].entries()){
   if(n===1&&round===1&&index===1)continue;
   const click=8.75+index+n+round*.8,read=34.25+index+n+round*1.3;
   const [fact]=await fixture.db.insert(s.operationsContentPerformanceMetric).values({scheduleId:item.post.id,checkpointType:type,recordedThrough:yesterday,clickRate:String(click),threeSecondReadRate:String(read)}).returning();
   await fixture.db.insert(s.operationsNonPromotionReview).values({scheduleId:item.post.id,metricId:fact.id,checkpointType:type,actualPublishAtSnapshot:item.post.actualPublishAt!,subjectIdSnapshot:subject,subjectNameSnapshot:subject,categoryIdSnapshot:category,categoryNameSnapshot:category,contentNameSnapshot:item.version.contentName,clickRateSnapshot:String(click),threeSecondReadRateSnapshot:String(read),reviewedByLabel:admin.username,reviewedAt:new Date(today+'T12:00:00+08:00'),conclusion:'虚构视觉验收记录',cohortSnapshot:{}});
  }
 }
 const login=await fetch(fixture.baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:fixture.baseURL,'Content-Type':'application/json'},body:JSON.stringify(admin)});assert.equal(login.status,200);
 const pw=await import(process.env.PLAYWRIGHT_MODULE||new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);
 browser=await pw.chromium.launch({headless:true});
 context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',recordVideo:{dir:folder+'/video',size:{width:1440,height:1000}}});
 await context.addInitScript(()=>{(window as any).__name=(value:unknown)=>value;});
 await context.addCookies(login.headers.getSetCookie().map(cookie=>{const pair=cookie.split(';')[0];return{name:pair.slice(0,pair.indexOf('=')),value:pair.slice(pair.indexOf('=')+1),url:fixture.baseURL};}));
 page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',(error:Error)=>errors.push(error.message));
 page.on('dialog',async(dialog:any)=>{assert.equal(dialog.type(),'beforeunload','业务确认必须使用公共异步确认框');await dialog.accept();});
 const daily=fixture.baseURL+'/business/daily-promotion-review',non=fixture.baseURL+'/business/non-promotion-review?view=history';

 // 五篇均从今天开始测试；明天才开放，只计可操作行而非所有日期。
 await navigate(daily);assert.equal(await page.locator('[data-lifecycle-schedule]').count(),5);assert.equal(await getCount(),0);assert.equal(await page.locator('#daily-table [data-metric-form]').count(),0);
 assert.match(await page.locator('[data-review-empty]').innerText(),/今日暂无待填写复盘/);
 const upcoming=page.locator('[data-review-section=upcoming]');assert.equal(await upcoming.getAttribute('open'),null);assert.match(await upcoming.locator('summary').innerText(),/5/);
 assert.ok((await page.locator('[data-lifecycle-schedule]').first().boundingBox())!.y<(await page.locator('#daily-table').boundingBox())!.y,'生命周期必须在待办上方');
 for(const width of [1440,1920]){
  await page.setViewportSize({width,height:1000});await capture(`promotion-empty-${width}`);await assertNoOverflow();await snapshotGeometry(width,'empty');
  const rows=page.locator('[data-lifecycle-schedule]'),first=(await rows.first().boundingBox())!,last=(await rows.last().boundingBox())!;assert.ok(last.y+last.height-first.y<=340,'五条生命周期常规行应紧凑排列');assert.ok((await page.locator('.calendar-section').boundingBox())!.height<=400,'五条常规概览连区标题不得超过400px');const anchors=await rows.evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>['header','.promotion-stage-overview','.lifecycle-overview-totals','.promotion-current-state','.lifecycle-expand'].map(selector=>node.querySelector(selector)!.getBoundingClientRect().x)));for(let column=0;column<5;column++)assert.ok(Math.max(...anchors.map((row:number[])=>row[column]))-Math.min(...anchors.map((row:number[])=>row[column]))<=1,'概览五列锚点应逐行稳定');
 }
 checks.push('five-testing-empty, overview-above-todo, upcoming-collapsed, count-actionable-only');

 // 昨天的五条直接录入，无展开填写和重复标题层。
 for(const post of posts)await installFacts(post,'testing');
 await page.setViewportSize({width:1440,height:1000});await navigate(daily);assert.equal(await getCount(),5);assert.equal(await page.locator('#daily-table [data-metric-form]').count(),5);
 const active=metric(posts[0]);assert.equal(await active.locator('input[type=number]').count(),5);await fill(active);await active.locator('[name=reviewDecision]').selectOption('test_continue');
 assert.match(await active.locator('[data-open-cost]').innerText(),/20\.00/);assert.match(await active.locator('[data-lead-cost]').innerText(),/40\.00/);
 await capture('promotion-ready-1440');

 // 1440物理像素、125%桌面缩放的等效CSS视口；保持真实控件与内部横滚。
 const zoomContext=await browser.newContext({viewport:{width:1152,height:800},deviceScaleFactor:1.25,reducedMotion:'reduce'});await zoomContext.addInitScript(()=>{(window as any).__name=(value:unknown)=>value;});await zoomContext.addCookies(await context.cookies());const zoomPage=await zoomContext.newPage();await zoomPage.goto(daily);await zoomPage.waitForLoadState('networkidle');await zoomPage.evaluate(()=>document.fonts.ready);const zoomForm=zoomPage.locator('[data-metric-form]').first();await fill(zoomForm);await zoomForm.locator('[name=reviewDecision]').selectOption('test_continue');assert.equal(await zoomPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await zoomPage.evaluate(()=>scrollTo(0,0));await zoomPage.waitForTimeout(100);await zoomPage.screenshot({path:folder+'/promotion-zoom125-equivalent-1440.png',fullPage:true});await zoomContext.close();checks.push('desktop-125percent-equivalent-CSSviewport1152-DPR1.25-local-table-scroll');

 // 成本缺数据或分母为零时为 —，保存前概览汇总不变。
 await active.locator('[name=actualOpenCount]').fill('0');assert.equal(await active.locator('[data-open-cost]').innerText(),'—');await active.locator('[name=actualOpenCount]').fill('10');
 const beforeTotals=await page.locator(`[data-lifecycle-schedule="${posts[0].post.id}"]`).innerText();assert.doesNotMatch(beforeTotals,/¥200/);

 // 气泡固定该行日期；修改当前状态不提前改写行上原状态，不包含自身。
 await active.locator('[data-toggle-day-state]').click();const bubble=page.locator('[data-day-state-form]:visible');await bubble.waitFor();assert.equal(await bubble.locator('input[type=date]').count(),0);
 const stateOptions=await bubble.locator('select[name=targetStatus] option').evaluateAll((options:HTMLOptionElement[])=>options.map(option=>({value:option.value,label:option.textContent})));assert.equal(stateOptions.filter((option:{value:string})=>option.value==='testing').length,0);assert.equal(stateOptions.filter((option:{label:string})=>/继续测试/.test(option.label)).length,0);assert.equal(stateOptions.filter((option:{value:string})=>option.value).length,4);
 await bubble.locator('[name=targetStatus]').selectOption('test_pending');await bubble.locator('[name=reason]').fill('虚构验收：已测试完毕，等待放量结论');
 assert.match(await active.locator('[data-day-status]').innerText(),/测试中/);await capture('promotion-state-popover-1440',false);
 {const answer=respondToBusinessConfirm(page);await page.keyboard.press('Escape');await answer;}assert.equal(await bubble.count(),1);assert.equal(await bubble.locator('[name=reason]').inputValue(),'虚构验收：已测试完毕，等待放量结论');{const answer=respondToBusinessConfirm(page,true);await page.keyboard.press('Escape');await answer;}assert.equal(await bubble.count(),0);assert.equal(await active.locator('[name=spend]').inputValue(),'200');
 await cleanForNavigation();

 // 真实已发生节点和非投放状态；原阶段累计包含待定跑量。
 const states=['testing','scaling','test_pending','test_paused','scaling_paused'] as const;
 for(const [index,post]of posts.entries())await installFacts(post,states[index]);
 await navigate(daily);assert.equal(await getCount(),5);assert.match(await page.locator(`[data-lifecycle-schedule="${posts[1].post.id}"]`).innerText(),/560\.00/);
 const pending=metric(posts[2]),paused=metric(posts[3]);
 for(const form of [pending,paused])for(const name of fields)assert.equal(await form.locator(`[name=${name}]`).inputValue(),'0',`暂停／待定新草稿 ${name} 应默认0`);
 // 已输入值在气泡展开、关闭和局部状态操作期间保持，不被默认零重置。
 await paused.locator('[name=spend]').fill('72.50');await paused.locator('[data-toggle-day-state]').click();await page.keyboard.press('Escape');assert.equal(await paused.locator('[name=spend]').inputValue(),'72.50');
 await paused.locator('[name=spend]').fill('0');
 for(const width of [1920,1440,1280,1024,736,390,320]){
  await page.setViewportSize({width,height:width<500?844:1000});await page.evaluate(()=>scrollTo(0,0));await capture(`promotion-mixed-${width}`);await assertNoOverflow();await snapshotGeometry(width,'mixed');
 }
 await page.setViewportSize({width:1440,height:1000});
 // 大金额、数量的真实输入宽度；不修改统计口径。
 await fill(metric(posts[0]),{spend:'1234567.89',platformOpenCount:'123456',actualOpenCount:'123456',platformLeadCount:'123456',actualLeadCount:'123456'});await capture('promotion-large-values-1440');const numberWidths=await metric(posts[0]).locator('input[type=number]').evaluateAll((inputs:HTMLInputElement[])=>{const ctx=document.createElement('canvas').getContext('2d')!;return inputs.map(input=>{const css=getComputedStyle(input);ctx.font=css.font;return{name:input.name,needed:ctx.measureText(input.value).width+parseFloat(css.paddingLeft)+parseFloat(css.paddingRight)+parseFloat(css.borderLeftWidth)+parseFloat(css.borderRightWidth),actual:input.getBoundingClientRect().width};});});assert.ok(numberWidths.every((input:{needed:number;actual:number})=>input.needed<=input.actual+1),JSON.stringify(numberWidths));await cleanForNavigation();

 // 只选次日安排即可保存待定零事实；保存后队列和数量一致，其他草稿保留。
 await metric(posts[0]).locator('[name=spend]').fill('111.23');
 await pending.locator('[name=reviewDecision]').selectOption('wait_continue');
 const saveZero=page.waitForResponse((response:any)=>response.url().endsWith('/api/promotion-daily')&&response.request().method()==='POST');await pending.locator('[type=submit]').click();const zeroResponse=await saveZero;assert.ok([200,201].includes(zeroResponse.status()),await zeroResponse.text());
 await record(posts[2]).waitFor({state:'detached'});assert.equal(await getCount(),4);assert.equal(await metric(posts[0]).locator('[name=spend]').inputValue(),'111.23');
 await page.waitForLoadState('networkidle');const [zeroFact]=await fixture.db.select().from(s.operationsPromotionDailyMetric).where(and(eq(s.operationsPromotionDailyMetric.campaignId,posts[2].campaign!.id),eq(s.operationsPromotionDailyMetric.metricDate,yesterday)));
 assert.equal(Number(zeroFact.spend),0);assert.equal(zeroFact.actualStatusSnapshot,'test_pending');
 // 暂停期实际跑量必须保留数字并进入原测试阶段。
 await fill(paused,{spend:'72.50',platformOpenCount:'10',actualOpenCount:'5',platformLeadCount:'4',actualLeadCount:'2'});await paused.locator('[name=reviewDecision]').selectOption('wait_continue');
 const saveTraffic=page.waitForResponse((response:any)=>response.url().endsWith('/api/promotion-daily')&&response.request().method()==='POST');await paused.locator('[type=submit]').click();const trafficResponse=await saveTraffic;assert.ok([200,201].includes(trafficResponse.status()),await trafficResponse.text());await record(posts[3]).waitFor({state:'detached'});
 await page.waitForLoadState('networkidle');const [traffic]=await fixture.db.select().from(s.operationsPromotionDailyMetric).where(and(eq(s.operationsPromotionDailyMetric.campaignId,posts[3].campaign!.id),eq(s.operationsPromotionDailyMetric.metricDate,yesterday)));
 assert.equal(Number(traffic.spend),72.5);assert.equal(traffic.sourceStageStartedOn,older);assert.equal(traffic.actualStatusSnapshot,'test_paused');assert.equal(await getCount(),3);
 checks.push('direct-inline-input, readonly-costs, state-popover-fixed-date, legal-successors, pending-new-zero, pending-zero-save, paused-traffic, original-stage-attribution, queue-refresh-preserves-other-drafts');
 await cleanForNavigation();

 // 保存状态气泡保留原输入和仍合法的次日选择，回执使用实际保存结果。
 await navigate(daily);const stateForm=metric(posts[0]);await fill(stateForm);await stateForm.locator('[name=reviewDecision]').selectOption('start_scaling');await stateForm.locator('[data-toggle-day-state]').click();const statusPopup=page.locator('[data-day-state-form]:visible');await statusPopup.locator('[name=targetStatus]').selectOption('test_pending');await statusPopup.locator('[name=reason]').fill('虚构验收：测试结束等待结论');const savedState=page.waitForResponse((response:any)=>response.url().endsWith('/api/promotion-timeline')&&response.request().method()==='POST');await statusPopup.locator('[type=submit]').click();const stateResponse=await savedState;assert.equal(stateResponse.status(),200,await stateResponse.text());
 await page.waitForTimeout(120);assert.equal(await metric(posts[0]).locator('[name=spend]').inputValue(),'200');assert.equal(await metric(posts[0]).locator('[name=reviewDecision]').inputValue(),'start_scaling');await capture('promotion-state-saved-1440',false);await page.keyboard.press('Escape');assert.equal(await page.locator('[data-day-state-form]:visible').count(),0,'状态保存后Esc仍应关闭气泡');await cleanForNavigation();

 // 首次 ID 使用轻量补填；资料只读查看，不建立第二份指标表单。
 await page.waitForLoadState('networkidle');const missing=await seed('虚构首次补 ID 帖',{startedOn:yesterday,noteId:null});
 await navigate(daily);const missingForm=metric(missing);await fill(missingForm,{spend:'240',platformOpenCount:'24',actualOpenCount:'12',platformLeadCount:'6',actualLeadCount:'3'});await missingForm.locator('[name=reviewDecision]').selectOption('test_continue');await missingForm.locator('[type=submit]').click();
 const noteBubble=page.locator('.review-note-bubble');await noteBubble.waitFor();assert.equal(await page.locator('[data-promotion-inspector].is-open').count(),0);await noteBubble.locator('input').fill('b'.repeat(24));await capture('promotion-missing-id-popover-1440',false);await noteBubble.getByRole('button',{name:'确认 ID'}).click();await noteBubble.waitFor({state:'detached'});
 await missingForm.locator('[data-reference-trigger]').click();const references=missingForm.locator('[data-popover-panel]');await references.waitFor({state:'visible'});assert.equal(await references.locator('[data-reference-note-id]').innerText(),'b'.repeat(24));assert.equal(await references.locator('input,select,textarea,form').count(),0);assert.equal(await page.locator('[data-promotion-inspector].is-open').count(),0);await page.keyboard.press('Escape');assert.equal(await missingForm.locator('[name=spend]').inputValue(),'240');assert.equal(await missingForm.locator('[name=platformNoteId]').inputValue(),'b'.repeat(24));
 const saveID=page.waitForResponse((response:any)=>response.url().endsWith('/api/promotion-daily')&&response.request().method()==='POST');await missingForm.locator('[type=submit]').click();const idResponse=await saveID;assert.ok([200,201].includes(idResponse.status()),await idResponse.text());await record(missing).waitFor({state:'detached'});
 await page.waitForLoadState('networkidle');const [identified]=await fixture.db.select().from(s.operationsContent).where(eq(s.operationsContent.id,missing.content.id));assert.equal(identified.platformNoteId,'b'.repeat(24));checks.push('missing-ID-popover, read-only-references-without-mirror, existing-inputs-preserved, atomic-ID-and-fact-save');

 // 服务端与浏览器一同跨上海午夜，原输入节点保留，日期重新分组且不越序。
 const tomorrow=nextDateKey(today);await writeFile(clockFile,today+'T23:59:50+08:00');await page.clock.install({time:new Date(today+'T23:59:50+08:00')});await navigate(daily);
 const midnight=metric(posts[1]);await midnight.locator('[name=spend]').fill('888.25');await midnight.locator('[name=spend]').focus();
 await page.evaluate((scheduleId:string)=>{(window as any).__v8MidnightHost=document.querySelector('[data-promotion-pending-body]');(window as any).__v8MidnightInput=document.querySelector(`[data-metric-form][data-schedule-id="${scheduleId}"] [name=spend]`);},posts[1].post.id);
 const countBeforeMidnight=await getCount();await writeFile(clockFile,tomorrow+'T00:00:00+08:00');await page.clock.setFixedTime(new Date(tomorrow+'T00:00:00+08:00'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await record(posts[1],tomorrow).waitFor({state:'attached'});
 assert.equal(await getCount(),countBeforeMidnight+3,'已完成前日的三帖在午夜新增可填写日期');assert.equal(await midnight.locator('[name=spend]').inputValue(),'888.25');assert.equal(await page.evaluate(()=>(window as any).__v8MidnightHost===document.querySelector('[data-promotion-pending-body]')&&(window as any).__v8MidnightInput.isConnected&&(window as any).__v8MidnightInput===document.activeElement),true,'午夜刷新保留节点、输入及焦点');assert.equal(await record(posts[1],today).locator('[data-metric-form]').count(),0,'前日未完成不能越序填写今日');
 await fill(midnight,{spend:'888.25',platformOpenCount:'20',actualOpenCount:'10',platformLeadCount:'8',actualLeadCount:'4'});await midnight.locator('[name=reviewDecision]').selectOption('scaling_continue');const midnightSave=page.waitForResponse((response:any)=>response.url().endsWith('/api/promotion-daily')&&response.request().method()==='POST');await midnight.locator('[type=submit]').click();assert.ok([200,201].includes((await midnightSave).status()));await metric(posts[1],today).waitFor({state:'attached'});await capture('promotion-midnight-opened-1440');
 await cleanForNavigation();await writeFile(clockFile,today+'T12:00:00+08:00');await page.clock.setFixedTime(new Date(today+'T12:00:00+08:00'));await page.clock.resume();checks.push('Shanghai-midnight-opens, keyed-node-input-focus-preserved, no-out-of-order-fill');

 // 同一笔记有两个已测试淘汰版本，补录必须明确活动和业务日。
 await page.waitForLoadState('networkidle');const residualSource=await seed('虚构残留源 V1',{startedOn:older,noteId:'c'.repeat(24)});await eliminate(residualSource,older);
 const [residualVersion]=await fixture.db.insert(s.operationsContentVersion).values({contentId:residualSource.content.id,versionNumber:2,workType:'update',contentName:'虚构残留源 V2',subjectId:'interview',categoryId:'interview-course',projectDocUrl:'https://example.com/fictional-residual-document'}).returning();
 const [residualPost]=await fixture.db.insert(s.operationsContentSchedule).values({contentVersionId:residualVersion.id,plannedPublishAt:new Date(before+'T10:00:00+08:00'),actualPublishAt:new Date(before+'T10:00:00+08:00'),completionStatus:'on_time',isPromoted:true,promotionStatus:'testing'}).returning();
 const [residualCampaign]=await fixture.db.insert(s.operationsPromotionCampaign).values({scheduleId:residualPost.id,startedOn:before,initialStage:'testing',currentStage:'testing',currentStatus:'testing',dailyReviewEnabledOn:older}).returning();await fixture.db.insert(s.operationsPromotionStage).values({campaignId:residualCampaign.id,stageType:'testing',startedOn:before});
 await eliminate({post:residualPost,version:residualVersion,content:residualSource.content,campaign:residualCampaign},before);
 await navigate(daily);await page.locator('[data-residual-trigger]').click();const residualEditor=page.locator('[data-residual-editor]'),residualSearch=residualEditor.locator('[data-residual-search]');await residualSearch.locator('[name=noteId]').fill('c'.repeat(24));await residualSearch.locator('[type=submit]').click();const candidates=residualEditor.locator('[data-residual-candidates]');await candidates.waitFor();assert.equal(await candidates.locator('[name=campaignId] option').count(),3);assert.equal(await candidates.locator('[name=campaignId]').inputValue(),'');
 await candidates.locator('[name=campaignId]').selectOption(residualSource.campaign!.id);await candidates.locator('[name=metricDate]').fill(yesterday);await candidates.locator('[type=submit]').click();const residualForm=residualEditor.locator('[data-residual-form]');await residualForm.waitFor();assert.match(await residualForm.innerText(),/淘汰后残留/);assert.equal(await residualForm.locator('[name=reviewDecision]:visible,select[name=reviewDecision], [data-review-decision]').count(),0);await fill(residualForm,{spend:'80',platformOpenCount:'8',actualOpenCount:'4',platformLeadCount:'4',actualLeadCount:'2'});await capture('promotion-residual-1440');
 const residualSaved=page.waitForResponse((response:any)=>response.url().endsWith('/api/promotion-daily')&&response.request().method()==='POST');await residualForm.locator('[type=submit]').click();const residualResponse=await residualSaved;assert.ok([200,201].includes(residualResponse.status()),await residualResponse.text());await residualForm.locator('[type=submit][disabled]').waitFor({state:'attached'});await residualForm.getByText('补录已完成',{exact:true}).waitFor();
 await page.waitForLoadState('networkidle');const [residualFact]=await fixture.db.select().from(s.operationsPromotionDailyMetric).where(and(eq(s.operationsPromotionDailyMetric.campaignId,residualSource.campaign!.id),eq(s.operationsPromotionDailyMetric.metricDate,yesterday))),[stillEnded]=await fixture.db.select().from(s.operationsPromotionCampaign).where(eq(s.operationsPromotionCampaign.id,residualSource.campaign!.id));assert.equal(residualFact.recordKind,'test_residual');assert.equal(residualFact.sourceStageStartedOn,older);assert.equal(stillEnded.currentStatus,'test_discarded');assert.equal(stillEnded.endedOn,older);
 const duplicate=await page.evaluate(async({campaignId,metricDate}:{campaignId:string;metricDate:string})=>{const data=new FormData();for(const [key,value]of Object.entries({campaignId,metricDate,recordKind:'test_residual',dailyStatus:'waiting_action',stageTypeSnapshot:'testing',reviewDecision:'test_discarded',spend:'80',platformOpenCount:'8',actualOpenCount:'4',platformLeadCount:'4',actualLeadCount:'2'}))data.set(key,value);return (await fetch('/api/promotion-daily',{method:'POST',body:data})).status;},{campaignId:residualSource.campaign!.id,metricDate:yesterday});assert.equal(duplicate,409,'重复活动日期必须拒绝');checks.push('residual-search-by-ID, explicit-version-campaign-date, terminal-no-next-action, residual-source-stage, no-resurrection, duplicate-date-rejected');


 // 原本未填写的测试草稿首次变暂停时初始化零；终态当日仍可保存真实五项数据。
 await page.waitForLoadState('networkidle');const zeroTransition=await seed('虚构暂停默认零',{startedOn:yesterday});
 await navigate(daily);let transitionForm=metric(zeroTransition);for(const name of fields)assert.equal(await transitionForm.locator(`[name=${name}]`).inputValue(),'');
 await transitionForm.locator('[data-toggle-day-state]').click();let transitionBubble=page.locator('[data-day-state-form]:visible');await transitionBubble.locator('[name=targetStatus]').selectOption('test_paused');await transitionBubble.locator('[name=reason]').fill('虚构验收：未填写前暂停测试');
 let transitionSaved=page.waitForResponse((r:any)=>r.url().endsWith('/api/promotion-timeline')&&r.request().method()==='POST');await transitionBubble.locator('[type=submit]').click();assert.equal((await transitionSaved).status(),200);await transitionForm.locator('[data-day-status]').filter({hasText:'测试暂停'}).waitFor();
 for(const name of fields)assert.equal(await transitionForm.locator(`[name=${name}]`).inputValue(),'0');await page.keyboard.press('Escape');await transitionForm.locator('[name=reviewDecision]').selectOption('wait_continue');let transitionFact=page.waitForResponse((r:any)=>r.url().endsWith('/api/promotion-daily')&&r.request().method()==='POST');await transitionForm.locator('[type=submit]').click();assert.ok([200,201].includes((await transitionFact).status()));await record(zeroTransition).waitFor({state:'detached'});await cleanForNavigation();
 await page.waitForLoadState('networkidle');const terminalDay=await seed('虚构当日测试淘汰',{startedOn:yesterday});
 await navigate(daily);transitionForm=metric(terminalDay);await fill(transitionForm);await transitionForm.locator('[data-toggle-day-state]').click();transitionBubble=page.locator('[data-day-state-form]:visible');await transitionBubble.locator('[name=targetStatus]').selectOption('test_discarded');await transitionBubble.locator('[name=reason]').fill('虚构验收：当日淘汰，保留已跑量数据');
 transitionSaved=page.waitForResponse((r:any)=>r.url().endsWith('/api/promotion-timeline')&&r.request().method()==='POST');await transitionBubble.locator('[type=submit]').click();assert.equal((await transitionSaved).status(),200);await transitionForm.locator('[data-day-status]').filter({hasText:'测试淘汰'}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('[data-day-state-form]:visible').count(),0,'终态保存后Esc关闭');
 assert.equal(await transitionForm.locator('[name=spend]').inputValue(),'200');assert.equal(await transitionForm.locator('select[name=reviewDecision]').count(),0);assert.equal(await transitionForm.locator('[name=reviewDecision]').inputValue(),'test_discarded');assert.equal(await transitionForm.locator('[data-toggle-day-state]').isEnabled(),true);await capture('promotion-terminal-day-1440');
 transitionFact=page.waitForResponse((r:any)=>r.url().endsWith('/api/promotion-daily')&&r.request().method()==='POST');await transitionForm.locator('[type=submit]').click();const terminalResponse=await transitionFact;assert.ok([200,201].includes(terminalResponse.status()),await terminalResponse.text());await record(terminalDay).waitFor({state:'detached'});await page.waitForLoadState('networkidle');
 const [terminalFact]=await fixture.db.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.campaignId,terminalDay.campaign!.id));assert.equal(terminalFact.actualStatusSnapshot,'test_discarded');assert.equal(Number(terminalFact.spend),200);checks.push('untouched-testing-draft-to-paused-zero-only, terminal-actual-day-preserves-and-saves-real-metrics-without-next');


 // 相同请求并发提交只产生一条日度事实，重试返回同一记录。
 await page.waitForLoadState('networkidle');const concurrent=await seed('虚构并发校验帖',{startedOn:yesterday});
 const concurrentResults=await page.evaluate(async({campaignId,date}:{campaignId:string;date:string})=>{
  const requestKey=crypto.randomUUID(),send=async()=>{const data=new FormData();for(const [key,value]of Object.entries({campaignId,metricDate:date,dailyStatus:'active',stageTypeSnapshot:'testing',actualStatusSnapshot:'testing',recordKind:'regular',spend:'20',platformOpenCount:'4',actualOpenCount:'2',platformLeadCount:'2',actualLeadCount:'1',reviewDecision:'test_continue',requestKey}))data.set(key,value);const response=await fetch('/api/promotion-daily',{method:'POST',body:data});return{status:response.status,...await response.json()};};
  return Promise.all([send(),send()]);
 },{campaignId:concurrent.campaign!.id,date:yesterday});assert.deepEqual(concurrentResults.map((result:any)=>result.status),[201,201]);assert.equal(concurrentResults[0].id,concurrentResults[1].id);
 await page.waitForLoadState('networkidle');const concurrentFacts=await fixture.db.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.campaignId,concurrent.campaign!.id));assert.equal(concurrentFacts.length,1);checks.push('concurrent-request-key-retry-produces-one-fact');

 // 非推广分类是单层六列，两轮上下排列；切换保留真实明细节点。
 await navigate(non);assert.equal(await page.getByText('分类均值查看',{exact:true}).count(),1);assert.equal(await page.getByText('历史数据总览',{exact:true}).count(),1);assert.equal(await page.locator('select[name=checkpoint]').count(),0);assert.equal(await page.locator('.category-group-head>span').count(),6,'汇总表头保持单层六列');
 const category=page.locator('[data-category-group="tmua:innovation"]');assert.match(await category.locator('[data-category-count=day_7]').innerText(),/2/);assert.match(await category.locator('[data-category-count=day_15]').innerText(),/1/);
 await capture('nonpromotion-summary-1440');await category.locator('summary').first().click();assert.equal(await category.locator('[data-row-href]').count(),3);await page.evaluate(()=>{(window as any).__v8OriginalRecord=document.querySelector('[data-category-group="tmua:innovation"] [data-row-href]');});await capture('nonpromotion-details-1440');
 await page.locator('[data-review-display] input[value="0"]').check();assert.equal(await page.evaluate(()=>(window as any).__v8OriginalRecord.isConnected),true);assert.equal(await page.locator('[data-review-body] [data-row-href]').count(),19);await capture('nonpromotion-history-1440');
 await page.locator('[data-review-display] input[value="1"]').check();assert.equal(await page.evaluate(()=>(window as any).__v8OriginalRecord===document.querySelector('[data-category-group="tmua:innovation"] [data-row-href]')),true);
 for(const width of [1920,1280,1024,736,390,320]){await page.setViewportSize({width,height:width<500?844:1000});await navigate(non);await capture(`nonpromotion-summary-${width}`);await assertNoOverflow();}
 checks.push('nonpromotion-six-column-summary, stacked-rounds, full-category-label, local-view-keeps-real-record-nodes');

 // 真实计算字体和 CDP 实际字形来源。
 await page.setViewportSize({width:1440,height:1000});await navigate(daily);
 const fonts=await page.locator('button,input,select,textarea,.business-sidebar__nav a,.promotion-summary').evaluateAll((nodes:HTMLElement[])=>nodes.filter(node=>node.getBoundingClientRect().width>0).map(node=>{const css=getComputedStyle(node);return{tag:node.tagName,class:node.className,font:css.fontFamily,size:css.fontSize,weight:css.fontWeight};}));assert.ok(fonts.every((font:{font:string})=>font.font.includes('MiSans')),JSON.stringify(fonts.filter((font:{font:string})=>!font.font.includes('MiSans'))));
 const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const root=await cdp.send('DOM.getDocument'),target=await cdp.send('DOM.querySelector',{nodeId:root.root.nodeId,selector:'.business-sidebar__nav a.active strong'});let platformFonts:any=null;if(target.nodeId)platformFonts=await cdp.send('CSS.getPlatformFontsForNode',{nodeId:target.nodeId});assert.ok(platformFonts?.fonts.some((font:{familyName:string;glyphCount:number})=>/MiSans/i.test(font.familyName)&&font.glyphCount>0),JSON.stringify(platformFonts));await writeFile(folder+'/fonts.json',JSON.stringify({computed:fonts,platform:platformFonts},null,2));await cdp.detach();

 // 读取反馈属于目标 Inspector；快读不闪，慢读单处显示，原入口文字和尺寸不变。
 const schedule=fixture.baseURL+'/business/operations-schedule?month='+older.slice(0,7),workflowPath=`/api/operations-content/${posts[0].post.id}/workflow`;
 const workflowResponse=await context.request.get(fixture.baseURL+workflowPath);assert.equal(workflowResponse.status(),200);const workflowBody=await workflowResponse.text();
 for(const delay of [100,450,800]){
  await navigate(schedule);await page.route('**'+workflowPath,async(route:any)=>{await new Promise(resolve=>setTimeout(resolve,delay));try{await route.fulfill({status:200,contentType:'application/json',body:workflowBody});}catch{}});
  const source=page.locator(`[data-inspect-id="${posts[0].post.id}"]`).first(),originalText=await source.innerText();await source.click();const readPane=page.locator('[data-inspector].is-open');await readPane.waitFor();let loadingBox:any=null;
  if(delay===800){await page.waitForTimeout(550);assert.equal(await readPane.locator('[data-business-read-loading]').count(),1);assert.equal(await source.innerText(),originalText);loadingBox=await source.boundingBox();await capture('shared-slow-read-1440',false);}
  else{await page.waitForTimeout(delay===450?350:40);assert.equal(await readPane.locator('[data-business-read-loading]').count(),0);}
  await readPane.locator('[data-schedule-workflow][data-ready=true]').waitFor({state:'attached'});assert.equal(await readPane.locator('[data-business-read-loading]').count(),0);if(loadingBox){const loadedBox=await source.boundingBox();assert.ok(Math.abs(loadedBox!.width-loadingBox.width)<=1&&Math.abs(loadedBox!.height-loadingBox.height)<=1,'同一已打开 Inspector 中读取反馈不改变来源卡片几何');}await page.keyboard.press('Escape');await readPane.waitFor({state:'hidden'});await page.unroute('**'+workflowPath);
 }
 // 关闭中的请求不能在关闭后留下加载状态。
 await navigate(schedule);await page.route('**'+workflowPath,async(route:any)=>{await new Promise(resolve=>setTimeout(resolve,900));try{await route.fulfill({status:200,contentType:'application/json',body:workflowBody});}catch{}});await page.locator(`[data-inspect-id="${posts[0].post.id}"]`).first().click();await page.locator('[data-inspector].is-open').waitFor();await page.waitForTimeout(550);await page.keyboard.press('Escape');await page.locator('[data-inspector]').waitFor({state:'hidden'});await page.waitForTimeout(400);assert.equal(await page.locator('[data-business-read-loading]').count(),0);await page.unroute('**'+workflowPath);
 // Toolbar 导航同样使用顶部进度，和侧栏导航共用入口。
 await navigate(daily);await page.route('**/business/daily-promotion-review?view=history',async(route:any)=>{const response=await route.fetch();await new Promise(resolve=>setTimeout(resolve,700));try{await route.fulfill({response});}catch{}});await page.locator('[data-promotion-toolbar] a[href="?view=history"]').click();await page.waitForTimeout(220);assert.equal(await page.locator('.business-console-progress.is-visible').count(),1);await capture('shared-navigation-progress-1440',false);await page.waitForURL(/view=history/);await page.waitForLoadState('networkidle');assert.equal(await page.locator('.business-console-progress.is-visible').count(),0);await page.unroute('**/business/daily-promotion-review?view=history');checks.push('100-and-450ms-quiet, 800ms-single-target-status, source-unchanged, close-cleans-read, toolbar-shared-navigation-progress');

 // 可见进入约600ms，减少动态效果无动画；本地输入和展开不重播。
 await page.emulateMedia({reducedMotion:'no-preference'});await navigate(non);
 await page.addInitScript(()=>{const original=Element.prototype.animate;(window as any).__v8Animations=[];Element.prototype.animate=function(...args:any[]){const animation=original.apply(this,args as any);(window as any).__v8Animations.push({target:this,animation,created:performance.now()});return animation;};});
 await page.goto(daily,{waitUntil:'domcontentloaded'});await page.locator('[data-lifecycle-schedule]').first().waitFor();await page.waitForTimeout(700);await capture('promotion-entry-complete-1440',false);
 const animationCounts=await page.evaluate(()=>({count:((window as any).__v8Animations??[]).filter((entry:any)=>entry.target.closest?.('.promotion-stage-nodes')).length,entries:((window as any).__v8Animations??[]).map((entry:any)=>({target:entry.target.className,timing:entry.animation.effect?.getTiming()}))}));
 // 保留正式动画对象并定位其时间，只用于补充逐帧证据；自然播放保留在录像中。
 for(const time of [0,120,300,480,650]){
  await page.evaluate((time:number)=>{for(const entry of ((window as any).__v8Animations??[]))if(entry.target.closest?.('.promotion-stage-nodes')){entry.animation.pause();entry.animation.currentTime=time;}},time);
  await page.screenshot({path:`${folder}/trajectory-${String(time).padStart(3,'0')}ms.png`,fullPage:false});
 }
 const overview=page.locator('[data-lifecycle-schedule]').first();await overview.locator('.lifecycle-expand').click();await page.waitForTimeout(250);await overview.locator('.lifecycle-expand').click();await page.waitForTimeout(250);const afterLocal=await page.evaluate(()=>((window as any).__v8Animations??[]).filter((entry:any)=>entry.target.closest?.('.promotion-stage-nodes')).length);assert.equal(afterLocal,animationCounts.count,'详情展开不能重播阶段入场');
 await page.emulateMedia({reducedMotion:'reduce'});await navigate(non);await navigate(daily);const reduced=await page.evaluate(()=>document.getAnimations().filter(animation=>(animation.effect as KeyframeEffect|null)?.target instanceof Element&&((animation.effect as KeyframeEffect).target as Element).closest('.promotion-stage-nodes')).length);assert.equal(reduced,0);await capture('promotion-reduced-motion-1440',false);await writeFile(folder+'/motion.json',JSON.stringify({entry:animationCounts,reducedAnimations:reduced},null,2));
 // 短录像只包含正式页的真实切入与详情操作，便于直接审阅动效。
 const motionContext=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'no-preference',recordVideo:{dir:folder+'/trajectory-video',size:{width:1440,height:1000}}});await motionContext.addCookies(await context.cookies());const motionPage=await motionContext.newPage();await motionPage.goto(non);await motionPage.evaluate(()=>document.fonts.ready);await motionPage.waitForTimeout(250);await motionPage.locator('[data-module-href="/business/daily-promotion-review"]').click();await motionPage.waitForURL('**/business/daily-promotion-review');await motionPage.waitForTimeout(850);const animatedDetail=motionPage.locator(`[data-lifecycle-schedule="${posts[1].post.id}"] .lifecycle-expand`);await animatedDetail.click();await motionPage.waitForTimeout(300);await animatedDetail.click();await motionPage.waitForTimeout(300);await motionPage.locator('[data-module-href="/business/non-promotion-review"]').click();await motionPage.waitForURL('**/business/non-promotion-review**');await motionPage.waitForTimeout(150);await motionPage.locator('[data-module-href="/business/daily-promotion-review"]').click();await motionPage.waitForURL('**/business/daily-promotion-review');await motionPage.waitForTimeout(850);const video=motionPage.video();await motionPage.close();await motionContext.close();if(video)await copyFile(await video.path(),folder+'/trajectory-entry.webm');
 checks.push('MiSans-computed-and-platform-fonts, trajectory-entry, local-no-replay, reduced-motion');

 // 旧团队暂停接口保持退役，不因新增单帖状态重新开放。
 for(const [path,method]of [['/api/promotion-pauses','POST'],['/api/promotion-pauses','GET'],['/api/promotion-pauses/retired','PATCH']])assert.equal(await page.evaluate(async([path,method]:string[])=>(await fetch(path,{method})).status,[path,method]),410);
 assert.deepEqual(errors,[]);await writeFile(folder+'/geometry.json',JSON.stringify(geometry,null,2));await writeFile(folder+'/results.json',JSON.stringify({source:'official components + isolated PGlite fictional facts',date:today,viewports:[1920,1440,1280,1024,736,390,320],checks,errors},null,2));console.log('review-v8 browser passed');
}catch(error){
 if(page){try{await page.screenshot({path:folder+'/failure.png',fullPage:true});}catch{}}
 await writeFile(folder+'/failure.json',JSON.stringify({error:String(error),checks,logs:fixture.logs()},null,2));throw error;
}finally{await context?.close();await browser?.close();await fixture.stop();}
