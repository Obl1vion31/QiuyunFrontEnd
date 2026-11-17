/** 五组真实详情；使用实际发布包、隔离 PostgreSQL 和原保存接口。 */
import assert from 'node:assert/strict';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {notePost,noteRevision} from './note-identities.fixture';
import {seedLinkPost,seedLinkPlan} from './monthly-plan-links.fixture';
import {admin,employee} from './auth.fixture';
import {settleBusinessUI,respondToBusinessConfirm,openPostLookup} from './business-confirm.helper';
import {readVersionNotes} from '../src/db/note-identities';
import {noteIdOn} from '../src/db/note-identity-rules';
import * as s from '../src/db/schema';
const dir=process.env.INSPECTOR_ORG_DIR??'.tools/test-artifacts/inspector-organization';
await mkdir(dir+'/screenshots',{recursive:true});await mkdir(dir+'/video',{recursive:true});
const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-11T12:00:00+08:00');
const f=await startPostgresFixture({clockFile,entry:process.env.INSPECTOR_ORG_ENTRY}),{db,baseURL}=f;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);const browser=await chromium.launch({headless:true});
const checks:string[]=[],errors:string[]=[],shots:string[]=[],clips:Array<{name:string;from:number;to:number}>=[];
async function shot(page:any,name:string){
 await settleBusinessUI(page);await page.mouse.move(0,0);await page.screenshot({path:dir+'/screenshots/'+name+'.png'});
 const pane=page.locator('[data-inspector].is-open,[data-post-lookup][open]').first();if(await pane.count())await pane.screenshot({path:dir+'/screenshots/'+name+'-panel.png'});
 shots.push(name);
}
const bounds=(page:any)=>page.evaluate(()=>[...document.querySelectorAll('.business-toolbar,.business-sidebar,main.business-console-content')].map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width};}));
async function metadata(pane:any){const fold=pane.locator('.surface-resource-meta');if(await fold.count()&&await fold.getAttribute('open')===null)await fold.locator(':scope>summary').click();}
async function openPromotion(page:any,metric:string){
 await page.goto(baseURL+'/business/daily-promotion-review?view=history&mode=day&from=2026-10-29&to=2026-11-03');
 const row=page.locator('[data-inspector-key="'+metric+'"]').first();
 for(const parent of await row.locator('xpath=ancestor::details').all())if(await parent.getAttribute('open')===null)await parent.locator(':scope>summary').click();
 await row.scrollIntoViewIfNeeded();await settleBusinessUI(page);const before=await bounds(page);await row.click();const pane=page.locator('[data-promotion-inspector].is-open');await pane.waitFor();await settleBusinessUI(page);
 if(page.viewportSize().width>900)assert.deepEqual(await bounds(page),before);await metadata(pane);return pane;
}
async function saveCorrection(page:any,form:any,accept=true){await form.locator('[type=submit]').click();await respondToBusinessConfirm(page,accept);}
try{
 await seedLinkPlan(db);
 const source=await notePost(db,'面试课成功案例 · 资料与推广记录'),revision=await noteRevision(db,source,{name:'面试课成功案例 · 重新整理讲义 V1'});
 await db.update(s.operationsContent).set({platformNoteId:'a'.repeat(24)}).where(eq(s.operationsContent.id,source.post.content.id));
 await db.update(s.operationsContentSchedule).set({executionHistory:[{at:'2026-10-25T12:30:00.000Z',actor:'运营同事',reason:'首轮排期填写',before:null,after:{plannedAt:'2026-10-29T02:00:00.000Z',name:'面试课成功案例 · 资料与推广记录',subjectName:'面试课',categoryName:'成功案例',operationType:'promotion_only',projectDocUrl:'https://example.test/documents/tmua-note-identity'}}]}).where(eq(s.operationsContentSchedule.id,source.post.schedule.id));
 const non=await seedLinkPost(db,'TMUA 考试信息 · 日期、考试范围与备考资料','2026-10-20T10:00',{categoryId:'innovation'});
 await db.update(s.operationsContent).set({platformNoteId:'b'.repeat(24)}).where(eq(s.operationsContent.id,non.content.id));
 await db.update(s.operationsContentSchedule).set({actualPublishAt:new Date('2026-10-20T02:00:00Z'),completionStatus:'on_time',publicationUrl:'https://www.xiaohongshu.com/explore/'+'b'.repeat(24)}).where(eq(s.operationsContentSchedule.id,non.schedule.id));
 const [metric]=await db.insert(s.operationsContentPerformanceMetric).values({scheduleId:non.schedule.id,checkpointType:'day_7',recordedThrough:'2026-10-27',exposureCount:10000,readCount:1200,clickRate:'12',threeSecondReadRate:'68.5'}).returning();
 await db.insert(s.operationsNonPromotionReview).values({scheduleId:non.schedule.id,metricId:metric.id,checkpointType:'day_7',actualPublishAtSnapshot:new Date('2026-10-20T02:00:00Z'),subjectIdSnapshot:'tmua',subjectNameSnapshot:'TMUA',categoryIdSnapshot:'innovation',categoryNameSnapshot:'创新帖',contentNameSnapshot:non.version.contentName,exposureCountSnapshot:10000,readCountSnapshot:1200,clickRateSnapshot:'12',threeSecondReadRateSnapshot:'68.5',cohortSnapshot:{},reviewedByLabel:'隔离验收'});
 const beforeMetrics=await db.select().from(s.operationsPromotionDailyMetric),beforeSchedule=await db.select().from(s.operationsContentSchedule);
 let annualId='';
 for(const[role,actor]of[['admin',admin],['employee',employee]] as const){
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',...(role==='admin'?{recordVideo:{dir:dir+'/video',size:{width:1440,height:1000}}}:{})});
  await context.addInitScript({content:'window.__name = value => value;'});
  const login=await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:actor});assert.equal(login.status(),200);
  if(role==='admin'){
   const res=await context.request.post(baseURL+'/api/operations-annual-plans',{headers:{Origin:baseURL},data:{year:2026,sectionKey:'subject:tmua',sectionLabel:'TMUA 细致规划',subjectId:'tmua',rowName:'TMUA 小班课和一对一',categoryId:'small-class-or-tutoring',isActive:true,sortOrder:0,note:null,links:[],blocks:[{startSlot:5,endSlot:17,note:'针对 10 月 TMUA 考试（每月至多两篇）',promotionRanges:[{startSlot:5,endSlot:17}],sortOrder:0},{startSlot:20,endSlot:23,note:'针对次年 1 月 TMUA 考试（每月至多两篇）',promotionRanges:[{startSlot:20,endSlot:23}],sortOrder:10}]}});
   assert.equal(res.status(),201,await res.text());annualId=(await res.json()).id;
  }
  const page=await context.newPage(),videoZero=Date.now();let clipFrom=(Date.now()-videoZero)/1000;
  await page.clock.setFixedTime(new Date('2026-11-11T12:00:00+08:00'));page.on('pageerror',(error:Error)=>errors.push(error.message));
  let pane=await openPromotion(page,source.metrics[2].id);
  assert.equal((await pane.boundingBox()).width,338);assert.equal(await pane.locator('.note-id-correction').count(),0);assert.equal(await pane.locator('[data-current-note-id]').textContent(),role==='admin'?'a'.repeat(24):'c'.repeat(24));
  await shot(page,role+'-promotion-view-1440');
  await pane.locator('[data-note-edit]').click();let form=pane.locator('[data-note-identity-form]');
  assert.equal(await form.locator('[name=scope]:checked').inputValue(),'from_date');
  const corrected=role==='admin'?'c'.repeat(24):'d'.repeat(24);
  await form.locator('[name=platformNoteId]').fill(corrected);await shot(page,role+'-promotion-edit-1440');
  await form.locator('[data-note-cancel]').click();await respondToBusinessConfirm(page,false);assert.equal(await form.locator('[name=platformNoteId]').inputValue(),corrected);
  await saveCorrection(page,form,false);assert.equal(await form.locator('[name=platformNoteId]').inputValue(),corrected);
  let fail=true;await page.route('**/api/operations-content/'+source.post.content.id+'/platform-note-id',async(route:any)=>{if(fail&&route.request().method()==='POST'){fail=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'更正未保存，当前输入已保留，请重试。'})});}await route.continue();});
  await saveCorrection(page,form);await form.locator('output').filter({hasText:'输入已保留'}).waitFor();assert.equal(await form.locator('[name=platformNoteId]').inputValue(),corrected);
  await saveCorrection(page,form);await page.waitForFunction((value:string)=>document.querySelector('[data-current-note-id]')?.textContent===value,corrected);
  assert(await pane.locator('[data-note-edit]').isVisible());assert(await pane.locator('[data-note-identity-form]').isHidden());await shot(page,role+'-promotion-saved-1440');
  const periods=(await readVersionNotes(db,[source.post.version.id])).get(source.post.version.id)!.periods;
  assert.equal(noteIdOn(periods,'2026-10-30'),'a'.repeat(24));assert.equal(noteIdOn(periods,'2026-11-03'),corrected);
  checks.push(role+'：推广就地更正、取消保留、503保留重试、原日期生效范围及保存后回到查看');
  if(role==='admin')clips.push({name:'promotion-inline',from:clipFrom,to:(Date.now()-videoZero)/1000});
  await page.keyboard.press('Escape');await pane.waitFor({state:'hidden'});
  await page.goto(baseURL+'/business/non-promotion-review?view=history&mode=standard&group=0&row='+non.schedule.id+':day_7');
  pane=page.locator('[data-inspector].is-open');await pane.waitFor();await metadata(pane);
  assert(await pane.locator('[data-review-form]').isHidden());assert(await pane.locator('[data-review-result]').isVisible());assert.equal(await pane.locator('[data-review-value=readCount]').textContent(),'1,200');
  await shot(page,role+'-nonpromotion-view-1440');await pane.locator('[data-note-edit]').click();const correction=pane.locator('[data-id-correction]');
  assert.equal(await correction.locator('[name=scope]').count(),0);assert((await correction.textContent())!.includes('全部版本与复盘'));
  await correction.locator('[name=platformNoteId]').fill((role==='admin'?'e':'f').repeat(24));await shot(page,role+'-nonpromotion-id-edit-1440');
  await correction.locator('[data-note-cancel]').click();await respondToBusinessConfirm(page,true);assert(await correction.isHidden());
  await pane.locator('[data-note-edit]').click();let idForm=pane.locator('[data-id-correction]');
  const sharedId=(role==='admin'?'e':'f').repeat(24);await idForm.locator('[name=platformNoteId]').fill(sharedId);
  if(role==='admin'){
    let readFailure=true;await page.route('**/business/non-promotion-review?*',async(route:any)=>{if(readFailure&&route.request().resourceType()==='fetch'){readFailure=false;return route.fulfill({status:503,body:'unavailable'});}await route.continue();});
    await saveCorrection(page,idForm);await idForm.locator('output').filter({hasText:'保存已成功'}).waitFor();assert.equal(await idForm.locator('[name=platformNoteId]').inputValue(),sharedId);
    await page.unroute('**/business/non-promotion-review?*');await idForm.locator('[type=submit]').click();
  }else await saveCorrection(page,idForm);
  await page.waitForFunction((value:string)=>document.querySelector('[data-inspector] [data-current-note-id]')?.textContent===value,sharedId);
  assert.equal((await db.select().from(s.operationsContent).where(eq(s.operationsContent.id,non.content.id)))[0].platformNoteId,sharedId);
  clipFrom=(Date.now()-videoZero)/1000;await pane.locator('[data-review-edit]').click();form=pane.locator('[data-review-form]');await form.locator('[name=readCount]').fill('1234');
  await pane.locator('[data-close-inspector]').click();await respondToBusinessConfirm(page,false);assert.equal(await form.locator('[name=readCount]').inputValue(),'1234');
  await form.locator('[data-review-cancel]').click();await respondToBusinessConfirm(page,true);assert(await form.isHidden());
  await pane.locator('[data-review-edit]').click();form=pane.locator('[data-review-form]');assert.equal(await form.locator('[name=readCount]').inputValue(),'1200');
  await form.locator('[name=conclusion]').fill(role+'：复盘结果保存与展示核对');
  const sent=page.waitForResponse((res:any)=>res.url().endsWith('/api/non-promotion-reviews')&&res.request().method()==='POST');
  await form.locator('[type=submit]').click();assert.equal((await sent).status(),201);await pane.locator('[data-review-result] output').waitFor();
  assert((await pane.locator('[data-review-value=conclusion]').textContent())!.includes(role));assert(await pane.locator('[data-review-form]').isHidden());await shot(page,role+'-nonpromotion-saved-1440');
  checks.push(role+'：非推广原共享ID提示、已复盘查看／编辑、取消还原、关闭保护、真实保存与局部回显');
  if(role==='admin')clips.push({name:'nonpromotion-edit',from:clipFrom,to:(Date.now()-videoZero)/1000});
  await page.keyboard.press('Escape');await pane.waitFor({state:'hidden'});
  await page.goto(baseURL+'/business/non-promotion-review?view=pending&row='+non.schedule.id+':day_15');pane=page.locator('[data-inspector].is-open');await pane.waitFor();
  assert(await pane.locator('[data-review-form]').isVisible());assert.equal(await pane.locator('[data-review-result]').count(),0);await shot(page,role+'-nonpromotion-pending-1440');await page.keyboard.press('Escape');await pane.waitFor({state:'hidden'});
  await page.goto(baseURL+'/business/operations-schedule?month=2026-10&row='+source.post.schedule.id);
  const schedule=page.locator('#schedule-panel[open]');await schedule.waitFor();await page.locator('[data-schedule-workflow][data-ready=true]').waitFor({state:'attached'});await settleBusinessUI(page);
  const timeline=page.locator('[data-schedule-workflow-history] [data-business-history-timeline]');await timeline.waitFor();
  const ids=await timeline.locator('[data-history-event]').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>node.dataset.historyEvent));
  assert.equal(ids.length,new Set(ids).size);assert(await timeline.locator('input[value=promotion]').count());assert.equal(await page.locator('[data-promotion-state-history] [data-business-history]').count(),0);
  await page.locator('[data-inspector-path]').scrollIntoViewIfNeeded();await shot(page,role+'-schedule-history-1440');
  await timeline.locator('input[value=promotion]').check();assert.notEqual(await schedule.locator('[data-inspector]').getAttribute('data-dirty'),'true');await shot(page,role+'-schedule-promotion-filter-1440');
  await schedule.locator('[data-close-inspector]').click();await schedule.waitFor({state:'hidden'});
  await page.goto(baseURL+'/business/annual-plan?year=2026&row='+annualId);pane=page.locator('[data-inspector].is-open');await pane.waitFor();await settleBusinessUI(page);
  assert.equal(await pane.locator('[data-block-list] .block-detail').count(),2);assert.equal(await pane.locator('[data-block-list]').getByText('TMUA 小班课和一对一',{exact:true}).count(),0);assert.equal(await pane.locator('[data-annual-support]').getAttribute('open'),null);assert.equal(await pane.locator('[data-edit-row]').isVisible(),true,'沿用当前员工与管理员均可编辑年度规划的权限');
  await shot(page,role+'-annual-view-1440');await pane.locator('[data-load-history]').click();await pane.locator('[data-history-list] article').first().waitFor();await pane.locator('[data-history-list] article button').first().click();await pane.locator('.snapshot-view').waitFor();await shot(page,role+'-annual-history-1440');
  await page.keyboard.press('Escape');await pane.waitFor({state:'hidden'});
  let lookupReads=0;const countLookup=(request:any)=>{if(request.url().includes('/api/content-search?id='))lookupReads++;};page.on('request',countLookup);
  const legacyLookup=await (await context.request.get(baseURL+'/api/content-search?id='+source.post.schedule.id)).json();
  assert(legacyLookup.history.every((event:any)=>typeof event.beforeLabel==='string'&&typeof event.afterLabel==='string'&&!!event.createdAt),'旧标签页查帖历史字段继续兼容');
  clipFrom=(Date.now()-videoZero)/1000;await openPostLookup(page);await page.locator('[data-post-lookup] [name=q]').fill('面试课成功案例');await page.locator('[data-post-lookup] button[type=submit]').click();await page.locator('[data-post-id="'+source.post.schedule.id+'"]').click();
  const lookup=page.locator('[data-lookup-detail]');await lookup.locator('.lookup-versions button').first().waitFor();assert.equal(await lookup.locator('.lookup-versions button').count(),2);assert.equal(await lookup.locator('h3').filter({hasText:'业务历史'}).count(),0);
  assert.equal(await lookup.locator('.lookup-versions [aria-current=true]').evaluate((el:HTMLElement)=>getComputedStyle(el).opacity),'1','当前版本保持清晰选中，不套用禁用淡化');
  await shot(page,role+'-lookup-view-1440');await lookup.locator('.lookup-versions button').filter({hasText:'V1'}).click();await lookup.locator('.lookup-identity h3').filter({hasText:'V1'}).waitFor();assert((await lookup.locator('.lookup-identity').textContent())!.includes('重新整理讲义'));
  await lookup.locator('.lookup-versions button').filter({hasText:'V0'}).click();await lookup.locator('.lookup-identity h3').filter({hasText:'V0'}).waitFor();
  assert.equal(lookupReads,3,'每次进入或切换版本各读取一次，不新增轮询');page.off('request',countLookup);
  await lookup.locator('[data-business-history-timeline]').scrollIntoViewIfNeeded();await shot(page,role+'-lookup-history-1440');
  await page.locator('[data-lookup-back]').click();assert(await page.locator('[data-post-id="'+source.post.schedule.id+'"]').isVisible());await page.locator('[data-lookup-close]').click();
  if(role==='admin')clips.push({name:'lookup-versions',from:clipFrom,to:(Date.now()-videoZero)/1000});
  checks.push(role+'：同源历史去重与推广筛选不置脏；年度时间块／空资料／版本内容；助手真实切版本及返回结果');
  if(role==='admin'){
   for(const width of [1920,1024]){
    await page.setViewportSize({width,height:1000});pane=await openPromotion(page,source.metrics[2].id);assert.equal((await pane.boundingBox()).width,width>1240?338:380);await pane.locator('[data-note-edit]').click();await shot(page,'promotion-edit-'+width);await page.keyboard.press('Escape');await pane.waitFor({state:'hidden'});
    await page.goto(baseURL+'/business/non-promotion-review?view=history&mode=standard&group=0&row='+non.schedule.id+':day_7');pane=page.locator('[data-inspector].is-open');await pane.waitFor();await metadata(pane);await shot(page,'nonpromotion-view-'+width);await page.keyboard.press('Escape');await pane.waitFor({state:'hidden'});
    await page.goto(baseURL+'/business/annual-plan?year=2026&row='+annualId);pane=page.locator('[data-inspector].is-open');await pane.waitFor();await shot(page,'annual-view-'+width);await page.keyboard.press('Escape');await pane.waitFor({state:'hidden'});
    await page.goto(baseURL+'/business/operations-schedule?month=2026-10&row='+source.post.schedule.id);await page.locator('[data-schedule-workflow][data-ready=true]').waitFor({state:'attached'});await page.locator('[data-inspector-path]').scrollIntoViewIfNeeded();await shot(page,'schedule-history-'+width);await page.locator('[data-close-inspector]').click();await schedule.waitFor({state:'hidden'});
    await openPostLookup(page);await page.locator('[data-post-lookup] [name=q]').fill('面试课成功案例');await page.locator('[data-post-lookup] button[type=submit]').click();await page.locator('[data-post-id="'+source.post.schedule.id+'"]').click();await lookup.locator('.lookup-versions button').first().waitFor();await shot(page,'lookup-view-'+width);await page.locator('[data-lookup-close]').click();
   }
   await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:844});pane=await openPromotion(page,source.metrics[2].id);assert(await pane.locator('[data-close-inspector]').isVisible());assert((await pane.boundingBox()).width<=390);await page.keyboard.press('Escape');await pane.waitFor({state:'hidden'});
  }
  const video=page.video();await context.close();if(video)await copyFile(await video.path(),dir+'/video/inspector-steps.webm');
 }
 assert.deepEqual(await db.select().from(s.operationsPromotionDailyMetric),beforeMetrics);
 const afterSchedule=await db.select().from(s.operationsContentSchedule),structure=(rows:typeof afterSchedule)=>rows.map(({executionHistory,...row})=>row).sort((a,b)=>a.id.localeCompare(b.id));
 assert.deepEqual(structure(afterSchedule),structure(beforeSchedule));
 for(const old of beforeSchedule){const current=afterSchedule.find(row=>row.id===old.id)!;assert.deepEqual(current.executionHistory.slice(0,old.executionHistory.length),old.executionHistory);if(old.id!==non.schedule.id)assert.deepEqual(current.executionHistory,old.executionHistory);}
 assert.deepEqual(errors,[]);checks.push('推广原指标及排期结构逐字段不变，原历史保留，非推广ID更正仅按原规则追加更正记录；桌面三档、原窄宽度、背景不伸缩、手机关闭入口与减少动态效果');
 await writeFile(dir+'/result.json',JSON.stringify({checks,errors,shots,clips,baseURL},null,2));console.log(JSON.stringify({checks,shots:shots.length}));
}finally{await browser.close();await f.stop();}
