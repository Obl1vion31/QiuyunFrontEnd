import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startFixture,admin,employee} from './auth.fixture';
import {businessFetch} from './business-request.helper';
import {settleBusinessUI} from './business-confirm.helper';
import * as s from '../src/db/schema';
import {discussionFromDraft} from '../src/db/meeting-discussion-values';
const folder=process.env.NON_PLAN_EVIDENCE_DIR||'.tools/test-artifacts/nonpromotion-plans/evidence';await mkdir(folder+'/screenshots',{recursive:true});
const clockFile=new URL('../'+folder+'/clock.txt',import.meta.url).pathname;await writeFile(clockFile,'2026-11-24T12:00:00+08:00');
const fixture=await startFixture({clockFile}),{db,baseURL}=fixture;
const {chromium}=await import(new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href),browser=await chromium.launch({headless:true});
let cookie='',number=0;const errors:string[]=[],checks:string[]=[];
const date=(day:string)=>new Date(day+'T10:00:00+08:00');
async function seed(name:string,actual:string|null='2026-11-02',source?:any,promoted=false){
 const [content]=source?[source.content]:await db.insert(s.operationsContent).values({platformNoteId:(++number).toString(16).padStart(24,'0')}).returning();
 const [version]=await db.insert(s.operationsContentVersion).values({contentId:content.id,versionNumber:source?source.version.versionNumber+1:0,sourceVersionId:source?.version.id,workType:source?'revision':'new',contentName:name,subjectId:'tmua',categoryId:'temporary',projectDocUrl:'https://example.test/document'}).returning();
 const [schedule]=await db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:date(actual||'2026-11-02'),actualPublishAt:actual?date(actual):null,completionStatus:actual?'on_time':'pending',isPromoted:promoted,promotionStatus:promoted?'awaiting_promotion':'none'}).returning();return {content,version,schedule};
}
async function api(path:string,values?:Record<string,unknown>,method='POST',expected=200){
 const form=new FormData();for(const [key,value]of Object.entries(values??{}))form.set(key,String(value));
 const response=await businessFetch(baseURL+path,{method:values?method:'GET',headers:{Cookie:cookie,Origin:baseURL},body:values?form:undefined});const json=await response.json();assert.equal(response.status,expected,JSON.stringify({path,status:response.status,json}));return json;
}
async function plan(post:any,mode:string,extra:Record<string,unknown>={}){const view=await api('/api/non-promotion-checkpoints?scheduleId='+post.schedule.id);return api('/api/operations-content/'+post.schedule.id,{action:'reviewPlan',reviewMode:mode,expectedReviewRevision:view.plan?.revision??-1,...extra},'PATCH');}
async function record(post:any,checkpointType:string,through:string,extra:Record<string,unknown>={}){
 const model=await api('/api/non-promotion-reviews?view=pending'),item=model.tableRows.find((r:any)=>r.row.id===post.schedule.id&&r.checkpoint.type===checkpointType);
 assert(item,`可录节点 ${checkpointType}`);return api('/api/non-promotion-reviews',{scheduleId:post.schedule.id,checkpointType,recordedThrough:through,exposureCount:1000,readCount:123,clickRate:99,threeSecondReadRate:55,conclusion:'隔离真实录入：观察阅读效果',fingerprint:item.fingerprint,...extra},'POST',201);
}
async function meeting(start:string,end:string){
 const created=await api('/api/meeting-reviews',{meetingType:'weekly',periodStart:start,periodEnd:end,meetingAt:'2026-11-24T16:00',name:'隔离周例会 · 7天与15天同帖对照'},'POST',201);
 const material=(await api('/api/meeting-reviews/'+created.id+'/material')).material;
 const [row]=await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,created.id));
 const [version]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId,row.id));
 const draft={...row.draftSnapshot,candidatesConfirmed:true,materialFingerprint:material.fingerprint,nonPromotionSelections:material.nonPromotions.map((r:any)=>({scheduleId:r.scheduleId,checkpointType:r.checkpointType})),situation:'核对本期累计阅读数据。',strategy:'按相同截止节点对照变化。',coreConclusion:'保留有效内容，继续观察阅读质量。',nextAction:'按计划完成下一节点复盘。'};
 const response=await businessFetch(baseURL+'/api/meeting-reviews/'+row.id,{method:'PATCH',headers:{Cookie:cookie,Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify({action:'finalize_version_draft',stage:'pre',draftVersionId:version.id,expectedUpdatedAt:row.updatedAt.toISOString(),draft})});
 const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));
 const [frozen]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,result.versionId));
 await db.update(s.operationsReviewMeetingVersion).set({createdAt:new Date('2026-11-24T12:00:00+08:00')}).where(eq(s.operationsReviewMeetingVersion.id,frozen.id));
 return {id:row.id,version:frozen,material};
}
try{
 const login=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(admin)});assert.equal(login.status,200);cookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 const standard=await seed('常规内容：原帖与改版共用7天及15天复盘'),revision=await seed('改版V1不重开复盘', '2026-11-05',standard),instant=await seed('即时内容：两天观察与15天复盘',null),continuous=await seed('持续复盘帖：讲义与模考长期观察');
 await record(standard,'day_7','2026-11-09');await record(standard,'day_15','2026-11-17',{exposureCount:4000,readCount:800});
 await plan(continuous,'continuous');await api('/api/non-promotion-checkpoints',{action:'add',scope:'schedule',scheduleId:continuous.schedule.id,dueOn:'2026-11-03'});await api('/api/non-promotion-checkpoints',{action:'add',scope:'schedule',scheduleId:continuous.schedule.id,dueOn:'2026-11-07'});
 let data=await api('/api/non-promotion-checkpoints?scheduleId='+continuous.schedule.id);assert.equal(data.nodes.length,2);const custom=data.nodes[0];await record(continuous,'custom:'+custom.id,custom.dueOn,{exposureCount:0,readCount:0});
 await api('/api/non-promotion-checkpoints',{action:'reschedule',scope:'schedule',scheduleId:continuous.schedule.id,nodeId:data.nodes[1].id,expectedRevision:0,dueOn:'2026-11-08',reason:'隔离日期调整'});
 await api('/api/non-promotion-checkpoints',{action:'cancel',scope:'schedule',scheduleId:continuous.schedule.id,nodeId:data.nodes[1].id,expectedRevision:1,reason:'隔离取消'});
 const model=await api('/api/non-promotion-reviews?view=history&group=0');assert.equal(model.tableRows.filter((r:any)=>r.row.contentId===standard.content.id).length,2);assert(!model.tableRows.some((r:any)=>r.row.id===revision.schedule.id));assert.equal(model.tableRows.find((r:any)=>r.row.id===standard.schedule.id&&r.checkpoint.type==='day_7').metric.clickRate,'12.3000');assert.equal(model.tableRows.find((r:any)=>r.row.id===continuous.schedule.id).metric.clickRate,null);
 checks.push('原帖跨版本去重、标准和多次自定义节点、真实零及服务端自动计算、调整和取消');
 const context=await browser.newContext({locale:'zh-CN',reducedMotion:'reduce',recordVideo:{dir:folder+'/video-desktop',size:{width:1440,height:1000}}});await context.addCookies(cookie.split('; ').map(c=>({name:c.slice(0,c.indexOf('=')),value:c.slice(c.indexOf('=')+1),url:baseURL})));
 const page=await context.newPage();page.on('pageerror',(e:Error)=>errors.push(e.message));await page.clock.install({time:new Date('2026-11-24T12:00:00+08:00')});await page.clock.setFixedTime(new Date('2026-11-24T12:00:00+08:00'));
 await page.setViewportSize({width:1440,height:1000});await page.goto(baseURL+'/business/operations-schedule?month=2026-11&row='+instant.schedule.id);await page.locator('[data-inspector-publication]').click();
 const publication=page.locator('#publication-form');await publication.locator('[data-review-plan-fields][data-loaded=true]').waitFor();await publication.locator('[name=actualPublishDate]').fill('2026-11-02');await publication.locator('[name=actualPublishTime]').fill('10:00');await publication.locator('[name=publicationUrl]').fill('https://www.xiaohongshu.com/explore/'+instant.content.platformNoteId);
 await publication.locator('[name=reviewMode]').selectOption('instant');await publication.locator('[name=reviewDueOn]').fill('2026-11-03');await publication.locator('[name=reviewDay15]').check();assert.equal(await publication.locator('[name=reviewDay7]').isChecked(),false);assert.match(await publication.locator('[data-review-days]').innerText(),/2 天/);
 for(const width of [1920,1440,1024,390,320]){await page.setViewportSize({width,height:1000});await publication.locator('[data-review-plan-fields]').scrollIntoViewIfNeeded();await settleBusinessUI(page);await page.screenshot({path:`${folder}/screenshots/publication-instant-${width}.png`});assert(await publication.evaluate((n:HTMLElement)=>n.scrollWidth<=n.clientWidth+1));}
 await page.setViewportSize({width:1440,height:1000});await publication.getByRole('button',{name:'保存发布登记',exact:true}).click();await page.waitForLoadState('networkidle');await publication.waitFor({state:'hidden'});
 data=await api('/api/non-promotion-checkpoints?scheduleId='+instant.schedule.id);assert.equal(data.plan.mode,'instant');assert.equal(data.plan.day7,false);assert.equal(data.plan.day15,true);assert.equal(data.nodes.length,1);await record(instant,'custom:'+data.nodes[0].id,'2026-11-03');await record(instant,'day_15','2026-11-17',{exposureCount:2147483647,readCount:2147483647,threeSecondReadRate:100});
 checks.push('发布登记真实选择即时/可选15天并原子保存，关闭7天不阻塞15天');
 for(const width of [1920,1440,1024,390,320]){
  await page.setViewportSize({width,height:1000});await page.goto(baseURL+'/business/non-promotion-review?view=history&group=0');await settleBusinessUI(page);await page.screenshot({path:`${folder}/screenshots/non-promotion-history-${width}.png`});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert(await page.locator('.review-read-count').evaluateAll((cells:HTMLElement[])=>cells.every(cell=>{const value=cell.querySelector('strong')!.getBoundingClientRect(),bounds=cell.getBoundingClientRect();return value.left>=bounds.left-1&&value.right<=bounds.right+1;})),'最大合法阅读量保持完整');
  await page.locator(`[data-inspector-key="${standard.schedule.id}:day_7"] [data-inspector-trigger]`).first().click();await settleBusinessUI(page);const review=page.locator('[data-inspector] [data-review-form]');assert.equal(await review.locator('[name=clickRate]').getAttribute('readonly'),'');await review.locator('[name=exposureCount]').fill('2000');await review.locator('[name=readCount]').fill('250');assert.equal(await review.locator('[name=clickRate]').inputValue(),'12.50');await page.screenshot({path:`${folder}/screenshots/non-promotion-input-${width}.png`});
  // 本循环只调整视口观察同一份本地草稿；离开前恢复原值并清除脏标记。
  await review.locator('[name=exposureCount]').fill('1000');await review.locator('[name=readCount]').fill('123');await page.evaluate(()=>{document.querySelector('[data-inspector]')?.setAttribute('data-dirty','false');document.documentElement.dataset.unsaved='false';});
  await page.goto(baseURL+'/business/operations-schedule?month=2026-11&row='+continuous.schedule.id);await page.locator('[data-review-plan-panel]:not([hidden])').waitFor();await settleBusinessUI(page);await page.screenshot({path:`${folder}/screenshots/continuous-plan-${width}.png`});
 }
 for(const width of [1440,320]){await page.setViewportSize({width,height:1000});await page.goto(baseURL+'/business/non-promotion-review?view=history&group=0&row='+continuous.schedule.id+':custom:'+custom.id);await settleBusinessUI(page);assert.equal(await page.locator('[data-inspector] [name=clickRate]').inputValue(),'—');await page.screenshot({path:`${folder}/screenshots/zero-exposure-${width}.png`});}
 await page.goto('about:blank');
 const firstMeeting=await meeting('2026-11-08','2026-11-14'),firstSnapshot=JSON.stringify(firstMeeting.version.snapshot);
 assert.equal((firstMeeting.version.snapshot as any).generated.nonPromotions.find((r:any)=>r.scheduleId===standard.schedule.id&&r.checkpointType==='day_15').placeholder,'future');
 const later=await seed('长名称：从复杂条件到解题思路，按同帖节点比较阅读表现','2026-11-12');await record(later,'day_7','2026-11-19',{exposureCount:5000,readCount:0});
 for(const cutoff of ['2026-11-18','2026-11-20']){await api('/api/non-promotion-checkpoints',{action:'add',scope:'schedule',scheduleId:continuous.schedule.id,dueOn:cutoff});const view=await api('/api/non-promotion-checkpoints?scheduleId='+continuous.schedule.id);const node=view.nodes.find((n:any)=>n.dueOn===cutoff);await record(continuous,'custom:'+node.id,cutoff,{readCount:cutoff.endsWith('18')?300:600});}
 const secondMeeting=await meeting('2026-11-16','2026-11-22'),generated:any=(secondMeeting.version.snapshot as any).generated;
 assert.equal(generated.nonPromotions.filter((r:any)=>r.scheduleId===continuous.schedule.id&&!r.comparisonOnly).length,2);
 assert.ok(generated.nonPromotions.find((r:any)=>r.scheduleId===standard.schedule.id&&r.checkpointType==='day_7').previous.length);
 for(const item of [firstMeeting,secondMeeting])for(const width of [1920,1440,1024,390,320]){
  await page.setViewportSize({width,height:1000});await page.goto(baseURL+'/business/meeting-review?meeting='+item.id+'&version=0');await settleBusinessUI(page);
  const cards=page.locator('[data-weekly-non]');assert.equal(await cards.count(),new Set((item.version.snapshot as any).generated.nonPromotions.map((r:any)=>r.contentId)).size);
  await page.evaluate(()=>scrollTo(0,0));if(width<500){await page.locator(`[data-weekly-non="${standard.schedule.id}"]`).evaluate((n:HTMLElement)=>n.scrollIntoView({block:'start'}));await page.evaluate(()=>scrollBy(0,-80));}await page.screenshot({path:`${folder}/screenshots/weekly-${item===firstMeeting?'7day':'15day'}-${width}.png`,fullPage:width>=1024});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 }
 assert.equal(JSON.stringify((await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,firstMeeting.version.id)))[0].snapshot),firstSnapshot);
 const [ready]=await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,secondMeeting.id));
 const postResponse=await businessFetch(baseURL+'/api/meeting-reviews/'+ready.id,{method:'PATCH',headers:{Cookie:cookie,Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify({action:'finalize_version_draft',stage:'post',sourceVersionId:secondMeeting.version.id,expectedUpdatedAt:ready.updatedAt.toISOString(),discussion:discussionFromDraft(ready.draftSnapshot)})});const post=await postResponse.json();assert.equal(postResponse.status,200,JSON.stringify(post));assert.equal(post.pdfStatus,'ready',fixture.logs().slice(-3000));
 const attachment=(await db.select().from(s.operationsMeetingAttachment).where(eq(s.operationsMeetingAttachment.meetingVersionId,post.versionId)))[0];assert(attachment,'实际定稿生成PDF');await writeFile(folder+'/weekly-comparison.pdf',Buffer.from(attachment.base64,'base64'));
 await writeFile(folder+'/weekly-snapshot.json',JSON.stringify((await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,post.versionId)))[0].snapshot));
 checks.push('同帖7/15合卡、本次/往期/未来混排、多自定义节点、定稿冻结及实际PDF');
 await page.setViewportSize({width:1440,height:1000});await page.goto(baseURL+'/business/non-promotion-review?view=history&group=0&row='+standard.schedule.id+':day_7');await settleBusinessUI(page);
 const edit=page.locator('[data-inspector] [data-review-form]');await edit.locator('[name=readCount]').fill('124');
 await page.route('**/api/non-promotion-reviews',async(route:any)=>route.request().method()==='POST'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'隔离故障：请重试'})}):route.continue());
 await edit.locator('button[type=submit]').click();await edit.getByText('隔离故障：请重试',{exact:true}).waitFor();assert.equal(await edit.locator('[name=readCount]').inputValue(),'124');await page.screenshot({path:folder+'/screenshots/save-failure-1440.png'});
 await page.unroute('**/api/non-promotion-reviews');await edit.locator('button[type=submit]').click();await edit.getByText('已保存',{exact:true}).waitFor();assert.equal(await edit.locator('[name=clickRate]').inputValue(),'12.40');await page.screenshot({path:folder+'/screenshots/save-retry-1440.png'});
 checks.push('真实指标更正、失败保留与重试原位回显，无重复保存或假零');
 await context.close();
 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'zh-CN',recordVideo:{dir:folder+'/video-mobile',size:{width:390,height:844}}});await mobile.addCookies(cookie.split('; ').map(c=>({name:c.slice(0,c.indexOf('=')),value:c.slice(c.indexOf('=')+1),url:baseURL})));const phone=await mobile.newPage();await phone.clock.setFixedTime(new Date('2026-11-24T12:00:00+08:00'));
 await phone.goto(baseURL+'/business/meeting-review?meeting='+secondMeeting.id+'&version=0');await settleBusinessUI(phone);await phone.locator('[data-weekly-non]').first().scrollIntoViewIfNeeded();await phone.screenshot({path:folder+'/screenshots/weekly-touch-390.png'});await phone.waitForTimeout(400);await phone.locator('[data-weekly-non]').filter({hasText:continuous.version.contentName}).locator('summary').filter({hasText:'往期自定义'}).click();await phone.screenshot({path:folder+'/screenshots/weekly-expanded-390.png'});await phone.waitForTimeout(400);
 await phone.goto(baseURL+'/business/non-promotion-review?view=history&group=0&row='+continuous.schedule.id+':custom:'+custom.id);await settleBusinessUI(phone);const mobileForm=phone.locator('[data-inspector] [data-review-form]');await mobileForm.locator('[name=exposureCount]').fill('100');await mobileForm.locator('[name=readCount]').fill('2');assert.equal(await mobileForm.locator('[name=clickRate]').inputValue(),'2.00');await phone.waitForTimeout(400);await phone.screenshot({path:folder+'/screenshots/touch-input-390.png'});await mobileForm.locator('button[type=submit]').click();await mobileForm.getByText('已保存',{exact:true}).waitFor();await mobileForm.locator('button[type=submit]').scrollIntoViewIfNeeded();const saveBox=await mobileForm.locator('button[type=submit]').boundingBox(),bodyBox=await phone.locator('[data-inspector-body]').boundingBox();assert(saveBox&&bodyBox&&saveBox.y+saveBox.height<=bodyBox.y+bodyBox.height+1,'手机保存完整可达');await phone.waitForTimeout(400);await phone.screenshot({path:folder+'/screenshots/touch-save-390.png'});await mobile.close();
 const employeeLogin=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(employee)});const employeeCookie=employeeLogin.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 const employeeModel=await (await fetch(baseURL+'/api/non-promotion-reviews?view=history&group=0',{headers:{Cookie:employeeCookie}})).json();assert.equal(employeeModel.tableRows.length,(await api('/api/non-promotion-reviews?view=history&group=0')).tableRows.length);
 const employeeView=await browser.newContext({locale:'zh-CN',reducedMotion:'reduce'});await employeeView.addCookies(employeeCookie.split('; ').map(c=>({name:c.slice(0,c.indexOf('=')),value:c.slice(c.indexOf('=')+1),url:baseURL})));const staffPage=await employeeView.newPage();await staffPage.clock.setFixedTime(new Date('2026-11-24T12:00:00+08:00'));
 for(const width of [1920,1440,1024,390,320]){await staffPage.setViewportSize({width,height:1000});await staffPage.goto(baseURL+'/business/non-promotion-review?view=history&group=0');await settleBusinessUI(staffPage);await staffPage.screenshot({path:`${folder}/screenshots/employee-history-${width}.png`});}
 await employeeView.close();checks.push('管理员/员工同源数据，员工五档历史视图');
 assert.deepEqual(errors,[]);await writeFile(folder+'/checks.json',JSON.stringify({passed:true,checks,errors,source:'isolated PGlite'},null,2));console.log(JSON.stringify({passed:true,folder,checks}));
}catch(error){console.error(fixture.logs().slice(-4000));throw error;}finally{await browser.close();await fixture.stop();}
