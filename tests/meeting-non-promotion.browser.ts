import {versionDraftPayload} from './meeting-write.helper';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {startFixture,employee} from './auth.fixture';
import {respondToBusinessConfirm} from './business-confirm.helper';
import * as s from '../src/db/schema';
const folder=process.env.MEETING_NON_EVIDENCE_DIR||'.tools/test-artifacts/meeting-non';await mkdir(folder,{recursive:true});
const clockFile=new URL('../.tools/test-artifacts/meeting-non-clock.txt',import.meta.url).pathname;await writeFile(clockFile,'2026-10-24T18:00:00+08:00');
const fixture=await startFixture({clockFile}),{db,baseURL}=fixture;let browser:any;
const checks:string[]=[],errors:string[]=[];
try{
 async function seed(name:string,day:string,links=true){
  const [content]=await db.insert(s.operationsContent).values({platformNoteId:randomUUID().replaceAll('-','').slice(0,24)}).returning();
  const [version]=await db.insert(s.operationsContentVersion).values({contentId:content.id,contentName:name,versionNumber:0,workType:'new',subjectId:'tmua',categoryId:'temporary',projectDocUrl:links?'https://example.test/doc/'+content.id:null}).returning();
  const [schedule]=await db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,isPromoted:false,promotionStatus:'none',completionStatus:'on_time',plannedPublishAt:new Date(day+'T23:30:00+08:00'),actualPublishAt:new Date(day+'T23:30:00+08:00'),publicationUrl:links?'https://www.xiaohongshu.com/explore/'+content.platformNoteId:null}).returning();return {content,version,schedule};
 }
 const first=await seed('TMUA 拉群内容复盘','2026-10-14'),second=await seed('长标题：从考试讨论到学习方法，检查首轮与二轮数据的衔接','2026-10-07'),completed=await seed('已完成的非推广复盘','2026-10-13'),missing=await seed('未登记关联资料的帖子','2026-10-15',false);
 await db.insert(s.operationsContentPerformanceMetric).values({scheduleId:completed.schedule.id,checkpointType:'day_7',recordedThrough:'2026-10-20',clickRate:'7',threeSecondReadRate:'40'});
 const promotion=await seed('面试课程测试','2026-10-21');await db.update(s.operationsContentSchedule).set({isPromoted:true,promotionStatus:'testing'}).where(eq(s.operationsContentSchedule.id,promotion.schedule.id));
 const [campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:promotion.schedule.id,startedOn:'2026-10-21',dailyReviewEnabledOn:'2026-10-21',initialStage:'testing',currentStage:'testing',currentStatus:'testing'}).returning();
 await db.insert(s.operationsPromotionStage).values({campaignId:campaign.id,startedOn:'2026-10-21',stageType:'testing'});
 await db.insert(s.operationsPromotionDailyMetric).values({campaignId:campaign.id,metricDate:'2026-10-22',dailyStatus:'active',actualStatusSnapshot:'testing',stageTypeSnapshot:'testing',recordKind:'regular',sourceStageStartedOn:'2026-10-21',spend:'100',platformOpenCount:10,actualOpenCount:5,platformLeadCount:4,actualLeadCount:2,reviewDecision:'test_pending'});
 const login=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(employee)});assert.equal(login.status,200);const cookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 const form=new FormData();for(const [k,v]of Object.entries({meetingType:'weekly',periodStart:'2026-10-17',periodEnd:'2026-10-22',meetingAt:'2026-10-24T23:00'}))form.set(k,v);
 const created=await fetch(baseURL+'/api/meeting-reviews',{method:'POST',headers:{Origin:baseURL,Cookie:cookie},body:form});assert.equal(created.status,201);const {id}=await created.json();
 const playwright=await import(new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);browser=await playwright.chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:folder+'/video',size:{width:1440,height:1000}}});
 await context.addCookies(cookie.split('; ').map(c=>({name:c.slice(0,c.indexOf('=')),value:c.slice(c.indexOf('=')+1),url:baseURL})));
 await context.route('https://example.test/**',(route:any)=>route.fulfill({contentType:'text/html',body:'<h1>隔离项目文档</h1>'}));
 const page=await context.newPage();page.setDefaultTimeout(18000);page.on('pageerror',(e:Error)=>errors.push(e.message));
 const nav=async(path:string)=>{await page.evaluate(()=>document.documentElement.dataset.unsaved='false').catch(()=>{});await page.goto(baseURL+path);await page.waitForLoadState('networkidle');await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(450);};
 const card=(post:typeof first,checkpoint='day_7')=>page.locator(`[data-weekly-non="${post.schedule.id}"][data-weekly-checkpoint="${checkpoint}"]`);
 await nav('/business/meeting-review?meeting='+id);
 assert.equal(await page.locator('.weekly-table input[type=checkbox]').count(),1);
 await page.getByText('非推广帖应全部补齐，或明确不复盘',{exact:false}).waitFor();await page.getByText('本期待处理 4 项',{exact:true}).waitFor();
 await page.getByRole('button',{name:'全选推广帖',exact:true}).click();await page.getByText('已选推广帖 1 项',{exact:true}).waitFor();
 await page.screenshot({path:folder+'/candidates-1440.png'});
 await page.getByRole('button',{name:'确认纳入',exact:true}).click();await card(first).waitFor();assert.equal(await page.locator('#weekly-non .weekly-card-grid').count(),1);assert.equal(await page.locator('[data-weekly-non]').count(),5);
 assert.equal(await card(first).getByLabel('数据截止日',{exact:true}).inputValue(),'2026-10-21');assert.equal(await card(second).getByLabel('数据截止日',{exact:true}).inputValue(),'2026-10-14');assert.equal(await card(second,'day_15').getByLabel('数据截止日',{exact:true}).inputValue(),'2026-10-22');
 await card(first).locator('header small').filter({hasText:'发布于 2026-10-14'}).waitFor();
 const computed=await card(first).getByLabel('数据截止日',{exact:true}).evaluate((el:HTMLElement)=>{const style=getComputedStyle(el);return {fontFamily:style.fontFamily,fontSize:style.fontSize,height:el.getBoundingClientRect().height};});assert.match(computed.fontFamily,/MiSans/);assert.equal(computed.fontSize,'14px');assert.equal(computed.height,40);
 for(const width of [1920,1440,1280,1024]){
  await page.setViewportSize({width,height:1000});await page.locator('#weekly-non').evaluate((el:HTMLElement)=>scrollTo(0,el.getBoundingClientRect().top+scrollY-100));await page.waitForTimeout(180);
  const dimensions=await page.locator('[data-weekly-non]').evaluateAll((nodes:Element[])=>nodes.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,h:r.height};}));
  assert.ok(Math.abs(dimensions[0].h-dimensions[1].h)<1);assert.equal(dimensions[0].y,dimensions[width>=1280?2:1].y);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.screenshot({path:folder+'/non-cards-'+width+'.png'});
 }
 await page.setViewportSize({width:1440,height:1000});await card(first).evaluate((el:HTMLElement)=>scrollTo(0,el.getBoundingClientRect().top+scrollY-150));
 await card(first).getByLabel('点击率（%）',{exact:true}).fill('8');await card(first).getByLabel('3 秒阅读率（%）',{exact:true}).fill('42');
 const info=card(first).getByRole('button',{name:'查看TMUA 拉群内容复盘相关资料',exact:true});
 const measure=()=>card(first).evaluate((el:HTMLElement)=>({scrollY,card:el.getBoundingClientRect().toJSON()}));const before=await measure();
 await info.hover();await card(first).locator(':popover-open').waitFor();assert.deepEqual(await measure(),before);
 await info.click();await page.mouse.move(310,95);await page.waitForTimeout(250);assert.equal(await card(first).locator(':popover-open').count(),1);
 const popup=card(first).locator(':popover-open');assert.equal(await popup.getByRole('link',{name:'项目文档 ↗',exact:true}).getAttribute('href'),first.version.projectDocUrl);
 assert.equal(await popup.getByRole('link',{name:'小红书帖子 ↗',exact:true}).getAttribute('href'),first.schedule.publicationUrl);
 await page.screenshot({path:folder+'/references-1440.png'});
 const opened=context.waitForEvent('page');await popup.getByRole('link',{name:'项目文档 ↗',exact:true}).click();const doc=await opened;await doc.waitForLoadState();assert.equal(doc.url(),first.version.projectDocUrl);await doc.close();assert.equal(await card(first).getByLabel('点击率（%）',{exact:true}).inputValue(),'8');
 await page.keyboard.press('Escape');assert.equal(await card(first).locator(':popover-open').count(),0);assert.equal(await info.evaluate((el:HTMLElement)=>el===document.activeElement),true);
 await info.focus();await page.keyboard.press('Enter');await popup.waitFor();await page.mouse.click(310,95);assert.equal(await card(first).locator(':popover-open').count(),0);
 await card(missing).getByRole('button',{name:'查看未登记关联资料的帖子相关资料',exact:true}).click();await card(missing).getByText('项目文档 · 未登记',{exact:true}).waitFor();await page.keyboard.press('Escape');
 checks.push('仅推广可勾选和全选；非推广必处理提示与数量；全部本期已录数据保留；统一紧凑三列卡片与7/15天默认日期');
 checks.push('资料悬停预览、点击保持、键盘与外点关闭；链接对应且新标签保留输入；缺失不生成空链接；开关不跳动');
 await card(first).getByLabel('数据截止日',{exact:true}).fill('2026-10-22');await card(first).getByLabel('结论',{exact:true}).fill('隔离验收：手动截止日保留');
 await page.getByRole('button',{name:'保存草稿',exact:true}).click();await page.waitForURL('**/business/meeting-review');await nav('/business/meeting-review?meeting='+id);assert.equal(await card(first).getByLabel('数据截止日',{exact:true}).inputValue(),'2026-10-22');
 let [record]=await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,id));
 const blocked=await fetch(baseURL+'/api/meeting-reviews/'+id,{method:'PATCH',headers:{Cookie:cookie,Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(await versionDraftPayload(db,'/api/meeting-reviews/'+id,{action:'finalize_pre',expectedUpdatedAt:record.updatedAt.toISOString(),draft:{...record.draftSnapshot,promotionSelections:[],nonPromotionSelections:[],nonPromotionInputs:{},candidatesConfirmed:true,situation:'已核对',strategy:'推进',coreConclusion:'观察'}}))});
 assert.equal(blocked.status,422);assert.match((await blocked.json()).message,/非推广数据/);
 let response=page.waitForResponse((r:any)=>r.url().endsWith('/api/non-promotion-reviews')&&r.request().method()==='POST');await card(first).getByRole('button',{name:'确认',exact:true}).click();assert.equal((await response).status(),201);await card(first).getByRole('button',{name:'修改',exact:true}).waitFor();assert.equal(await card(first).count(),1);assert.ok(await card(completed).count());
 for(const [post,checkpoint]of [[second,'day_7'],[second,'day_15'],[missing,'day_7']] as const){const c=card(post,checkpoint);await c.locator('select').selectOption('skip');await c.getByLabel('不复盘理由',{exact:true}).fill('隔离验收：明确不复盘');response=page.waitForResponse((r:any)=>r.url().endsWith('/api/non-promotion-checkpoints')&&r.request().method()==='POST');await c.getByRole('button',{name:'确认',exact:true}).click();assert.equal((await response).status(),200);await page.waitForTimeout(350);}
 for(const label of ['衡量情况','本期具体动作','核心结论'])await page.getByRole('textbox',{name:label,exact:true}).fill('隔离验收：'+label);
 const promoted=page.locator('[data-weekly-promotion]').first();await promoted.locator('input[type=number]').fill('0');await promoted.getByRole('button',{name:'确认',exact:true}).click();await promoted.getByRole('button',{name:'修改',exact:true}).waitFor();
 response=page.waitForResponse((r:any)=>r.url().endsWith('/api/meeting-reviews/'+id)&&r.request().method()==='PATCH');await page.getByRole('button',{name:'会前定稿 V0',exact:true}).click();await respondToBusinessConfirm(page,true);assert.equal((await response).status(),200);await page.waitForURL('**version=0');
 const [frozen]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId,id));const snapshot=JSON.stringify(frozen.snapshot);assert.equal(snapshot.includes('https://example.test'),false);assert.equal((frozen.snapshot as any).generated.nonPromotions.filter((r:any)=>!r.comparisonOnly).length,2);
 await db.update(s.operationsContentVersion).set({projectDocUrl:'https://example.test/corrected'}).where(eq(s.operationsContentVersion.id,first.version.id));await nav('/business/meeting-review?meeting='+id+'&version=0');await card(first).getByRole('button',{name:'查看TMUA 拉群内容复盘相关资料',exact:true}).click();assert.equal(await card(first).getByRole('link',{name:'项目文档 ↗',exact:true}).getAttribute('href'),'https://example.test/corrected');assert.equal(JSON.stringify((await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,frozen.id)))[0].snapshot),snapshot);await page.screenshot({path:folder+'/frozen-references-1440.png'});
 checks.push('草稿已填日期保留；全量非推广门槛不可通过清空选择绕过；完成和不复盘后可定稿；冻结不变且资料实时读取');
 assert.deepEqual(errors,[]);await context.close();const video=await page.video().path();await writeFile(folder+'/checks.json',JSON.stringify({checks,errors,computed,video,scope:'真实组件、隔离PGlite和虚构业务数据；1920/1440/1280/1024px'},null,2));console.log(JSON.stringify({checks,folder}));
}catch(error){console.error(fixture.logs());throw error;}finally{await browser?.close();await fixture.stop();}
