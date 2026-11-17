import assert from 'node:assert/strict';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {notePost,noteRevision} from './note-identities.fixture';
import {seedLinkPlan,seedLinkPost} from './monthly-plan-links.fixture';
import {readVersionNotes} from '../src/db/note-identities';
import {noteIdOn} from '../src/db/note-identity-rules';
import {admin,employee} from './auth.fixture';
import {settleBusinessUI,respondToBusinessConfirm} from './business-confirm.helper';
import {fillBusinessDateTime} from './business-datetime.helper';
import * as s from '../src/db/schema';
const dir=process.env.NOTE_ID_DIR??'.tools/test-artifacts/note-identities';await mkdir(dir+'/screenshots',{recursive:true});await mkdir(dir+'/video',{recursive:true});
const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-11T12:00:00+08:00');
const f=await startPostgresFixture({clockFile,entry:process.env.NOTE_ID_ENTRY}),{db,baseURL}=f;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);const browser=await chromium.launch({headless:true});const errors:string[]=[],checks:string[]=[],screenshots:string[]=[];
async function login(context:any,actor:any){const r=await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:actor});assert.equal(r.status(),200);}
async function shot(page:any,name:string){await settleBusinessUI(page);if(name.includes('history')&&!name.includes('confirm'))await page.locator('[data-note-identity]').scrollIntoViewIfNeeded();await page.mouse.move(0,0);await page.screenshot({path:dir+'/screenshots/'+name+'.png'});screenshots.push(name);}
async function openHistory(page:any,metricId:string){
 await page.goto(baseURL+'/business/daily-promotion-review?view=history&mode=day&from=2026-10-29&to=2026-11-03');
 const row=page.locator('[data-inspector-key="'+metricId+'"]').first();
 for(const ancestor of await row.locator('xpath=ancestor::details').all())if(await ancestor.getAttribute('open')===null)await ancestor.locator(':scope>summary').click();
 await row.click();await page.locator('[data-promotion-inspector].is-open').waitFor();
 await page.locator('[data-promotion-inspector] .surface-resource-meta>summary').click();await page.locator('[data-promotion-inspector] [data-note-edit]').click();
 await page.locator('[data-note-identity-form] [name=platformNoteId]').waitFor();await settleBusinessUI(page);
}
async function submitCorrection(page:any,accept:boolean){await page.locator('[data-note-identity-form] [type=submit]').click();await respondToBusinessConfirm(page,accept);}
try{
 await seedLinkPlan(db);
 let index=0;
 for(const[role,actor]of[['admin',admin],['employee',employee]] as const){
  const source=await notePost(db,'面试课成功案例 · 笔记 ID 核对'),revision=await noteRevision(db,source,{name:'面试课成功案例 · 改帖 V1'}),initial=String(++index).repeat(24),corrected=String(index+2).repeat(24),all=String(index+4).repeat(24),fresh=String(index+6).repeat(24);
  await db.update(s.operationsContent).set({platformNoteId:initial}).where(eq(s.operationsContent.id,source.post.content.id));
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});await login(context,actor);const page=await context.newPage();page.on('pageerror',(e:any)=>errors.push(e.message));
  await openHistory(page,source.metrics[2].id);const form=page.locator('[data-note-identity-form]');assert.equal(await form.locator('[name=scope]:checked').inputValue(),'from_date');
  await form.locator('[name=platformNoteId]').fill(corrected);const beforeY=await page.evaluate(()=>scrollY);
  await submitCorrection(page,false);assert.equal(await form.locator('[name=platformNoteId]').inputValue(),corrected);assert.equal(await page.evaluate(()=>scrollY),beforeY);
  let fail=true;await page.route('**/api/operations-content/'+source.post.content.id+'/platform-note-id',async(route:any)=>{if(fail&&route.request().method()==='POST'){fail=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'保存失败，当前输入已保留，请重试。'})});}await route.continue();});
  await submitCorrection(page,true);await page.waitForFunction(()=>document.querySelector('[data-note-identity-message]')?.textContent?.includes('输入已保留'));
  assert.equal(await form.locator('[name=platformNoteId]').inputValue(),corrected);await shot(page,role+'-history-failure-1440');
  const saved=page.waitForResponse((r:any)=>r.url().endsWith('/platform-note-id')&&r.request().method()==='POST'&&r.status()===200);await submitCorrection(page,true);await saved;
  await page.waitForFunction((value:string)=>document.querySelector('[data-current-note-id]')?.textContent===value,corrected);assert.equal(await page.evaluate(()=>scrollY),beforeY);await shot(page,role+'-history-from-date-1440');
  const periods=(await readVersionNotes(db,[source.post.version.id])).get(source.post.version.id)!.periods;assert.equal(noteIdOn(periods,'2026-10-30'),initial);assert.equal(noteIdOn(periods,'2026-11-03'),corrected);
  await page.locator('[data-note-edit]').click();await page.locator('[data-note-identity-form] [name=scope][value=version]').check();await page.locator('[data-note-identity-form] [name=platformNoteId]').fill(all);
  await page.locator('[data-note-identity-form] [type=submit]').click();await page.locator('[data-business-confirm][open]').waitFor();await shot(page,role+'-history-all-confirm-1440');await respondToBusinessConfirm(page,true);
  await page.waitForFunction((value:string)=>document.querySelector('[data-current-note-id]')?.textContent===value,all);await shot(page,role+'-history-all-saved-1440');
  await page.locator('[data-close-inspector]').click();await page.locator('[data-promotion-inspector]').waitFor({state:'hidden'});assert.equal(await page.locator('[data-business-confirm][open]').count(),0);
  await page.goto(baseURL+'/business/operations-schedule?month=2026-10&row='+revision.schedule.id);await page.locator('#schedule-panel[open][data-view=detail]').waitFor();await page.locator('[data-inspector-publication]').click();
  const pub=page.locator('#publication-form');await fillBusinessDateTime(pub,'actualPublishAt','2026-10-31T10:00');await pub.locator('[name=publicationUrl]').fill('https://www.xiaohongshu.com/explore/'+fresh);
  await page.locator('[data-publication-delay-days][data-ready=true]').waitFor({state:'attached'});await pub.locator('[name=noteIdMode][value=inherit]').waitFor({state:'visible'});assert.equal(await pub.locator('[name=noteIdMode]:checked').count(),0);assert((await pub.locator('[name=noteIdMode][value=new]').boundingBox()).width<=18);
  assert((await pub.locator('[data-note-inherit-value]').textContent())!.includes(all));await pub.locator('[name=noteIdMode][value=inherit]').check();await shot(page,role+'-publication-inherit-1440');
  await pub.locator('[name=noteIdMode][value=new]').check();assert.equal(await pub.locator('[name=platformNoteId]').count(),0);assert(await pub.locator('[data-note-new-help]').isVisible());assert(await pub.locator('[data-note-inherit-value]').isHidden());assert(await pub.locator('[data-publication-review-plan]').isHidden());await shot(page,role+'-publication-new-1440');
  await page.setViewportSize({width:1024,height:1000});await shot(page,role+'-publication-new-1024');assert(await pub.locator('[data-note-new-help]').isVisible());
  await page.setViewportSize({width:390,height:844});assert(await pub.locator('header [data-close-publication]').isVisible());assert((await pub.boundingBox()).width<=390);await page.setViewportSize({width:1440,height:1000});
  let pubFail=true;await page.route('**/api/operations-content/'+revision.schedule.id+'/publication',async(route:any)=>{if(pubFail){pubFail=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'发布登记未保存，当前输入已保留。'})});}await route.continue();});
  await pub.locator('[type=submit]').click();await page.waitForFunction(()=>document.querySelector('[data-publication-message]')?.textContent?.includes('输入已保留'));assert.equal(await pub.locator('[name=publicationUrl]').inputValue(),'https://www.xiaohongshu.com/explore/'+fresh);assert.equal(await pub.locator('[name=noteIdMode]:checked').inputValue(),'new');await shot(page,role+'-publication-failure-1440');
  if(role==='admin')await pub.locator('[name=noteIdMode][value=inherit]').check();
  const sent=page.waitForResponse((r:any)=>r.url().endsWith('/publication')&&r.request().method()==='PATCH'&&r.status()===200);await pub.locator('[type=submit]').click();await sent;await page.locator('#schedule-panel[data-view=detail]').waitFor();await settleBusinessUI(page);await shot(page,role+'-publication-saved-1440');
  assert.equal(noteIdOn((await readVersionNotes(db,[revision.version.id])).get(revision.version.id)!.periods,'2026-10-31'),role==='admin'?all:null);
  assert.equal(noteIdOn((await readVersionNotes(db,[source.post.version.id])).get(source.post.version.id)!.periods,'2026-10-29'),all);
  if(role==='employee'){
   await db.insert(s.operationsPromotionCampaign).values({scheduleId:revision.schedule.id,startedOn:'2026-11-10',dailyReviewEnabledOn:'2026-11-10',initialStage:'testing',currentStage:'testing',currentStatus:'testing'});
   await page.goto(baseURL+'/business/daily-promotion-review');const daily=page.locator(`[data-metric-form][data-schedule-id="${revision.schedule.id}"]`);await daily.waitFor();
   assert.equal(await daily.locator('[name=platformNoteId]').inputValue(),'');for(const name of ['spend','platformOpenCount','actualOpenCount','platformLeadCount','actualLeadCount'])await daily.locator(`[name=${name}]`).fill(name==='spend'?'12.50':'1');await daily.locator('[name=reviewDecision]').selectOption('test_continue');await daily.locator('[type=submit]').click();
   const note=page.getByRole('form',{name:'补填笔记 ID'});await note.waitFor();await note.locator('[name=noteId]').fill(fresh);await note.locator('[type=submit]').click();assert.equal(await daily.locator('[name=platformNoteId]').inputValue(),fresh);assert.equal(noteIdOn((await readVersionNotes(db,[revision.version.id])).get(revision.version.id)!.periods,'2026-11-10'),null);
   const saved=page.waitForResponse((r:any)=>r.url().endsWith('/api/promotion-daily')&&r.request().method()==='POST');await daily.locator('[type=submit]').click();const dailyResult=await saved;assert.equal(dailyResult.status(),201,await dailyResult.text());await page.locator(`[data-saved-review][data-schedule-id="${revision.schedule.id}"]`).waitFor();assert.equal(noteIdOn((await readVersionNotes(db,[revision.version.id])).get(revision.version.id)!.periods,'2026-11-10'),fresh);assert.equal(noteIdOn((await readVersionNotes(db,[source.post.version.id])).get(source.post.version.id)!.periods,'2026-11-10'),all);
   checks.push('员工从无ID发布进入首次复盘，补填仅随复盘保存落库，新旧版本独立');
  }
  const typedTargets:Array<{type:string;row:Awaited<ReturnType<typeof seedLinkPost>>}>=[];
  for(const type of ['promotion_only','promotion_then_continuous','non_promotion_standard','non_promotion_instant'] as const){
   const labels={promotion_only:'纯推广',promotion_then_continuous:'推广后持续复盘',non_promotion_standard:'非推广常规',non_promotion_instant:'非推广即时'},typed=await seedLinkPost(db,'发布登记 · '+labels[type],'2026-11-17T18:00');
   await db.update(s.operationsContent).set({operationType:type}).where(eq(s.operationsContent.id,typed.content.id));await db.update(s.operationsContentSchedule).set({isPromoted:type.startsWith('promotion'),promotionStatus:type.startsWith('promotion')?'pending':'none',finalReviewOn:type==='promotion_then_continuous'?'2026-11-30':null}).where(eq(s.operationsContentSchedule.id,typed.schedule.id));
   if(type==='non_promotion_instant')await db.insert(s.operationsNonPromotionReviewPlan).values({contentId:typed.content.id,anchorScheduleId:typed.schedule.id,mode:'instant',day7:false,day15:false,draftDueOn:'2026-11-19'});
   typedTargets.push({type,row:typed});
  }
  await page.goto(baseURL+'/business/operations-schedule?month=2026-11');
  for(const {type,row:typed} of typedTargets){
   await page.locator(`[data-inspect-id="${typed.schedule.id}"]`).first().click();await page.locator('#schedule-panel[data-view=detail]').waitFor();await page.locator('[data-inspector-publication]').click();await pub.locator('[data-review-plan-fields][data-loaded=true]').waitFor({state:'attached'});
   await fillBusinessDateTime(pub,'actualPublishAt','2026-11-17T18:00');await pub.locator('[name=publicationUrl]').fill('https://xhslink.com/o/registration-test');await pub.locator('[name=projectDocUrl]').fill('https://example.test/documents/registration');
   if(type==='non_promotion_instant'){
    assert(await pub.locator('[name=reviewDueOn]').isVisible());assert.equal(await pub.locator('[data-review-days]').textContent(),'含发布当天，共 3 天');assert.notEqual(await pub.locator('[data-review-days]').evaluate((el:HTMLElement)=>getComputedStyle(el).color),'rgb(161, 59, 40)');await pub.locator('[name=reviewDueOn]').fill('2026-11-20');assert.equal(await pub.locator('[data-review-days]').textContent(),'含发布当天，共 4 天');await pub.locator('[name=reviewDueOn]').fill('2026-11-19');
    await shot(page,role+'-instant-three-days-1440');await page.setViewportSize({width:1024,height:1000});await shot(page,role+'-instant-three-days-1024');await page.setViewportSize({width:1440,height:1000});
    const sent=page.waitForResponse((r:any)=>r.url().includes(typed.schedule.id+'/publication')&&r.request().method()==='PATCH');await pub.locator('[type=submit]').click();const result=await sent;assert.equal(result.status(),200,await result.text());await page.locator('#schedule-panel[data-view=detail]').waitFor();const nodes=await db.select().from(s.operationsNonPromotionCustomCheckpoint).where(eq(s.operationsNonPromotionCustomCheckpoint.contentId,typed.content.id));assert.equal(nodes.length,1);assert.equal(nodes[0].dueOn,'2026-11-19');
   }else{
    assert(await pub.locator('[data-publication-review-plan]').isHidden());assert(await pub.locator('[name=reviewDueOn]').isDisabled());const names=await pub.evaluate((form:HTMLFormElement)=>[...new FormData(form).keys()]);assert(!names.includes('reviewDueOn'));assert(!names.includes('reviewMode'));if(type==='promotion_only')await shot(page,role+'-pure-promotion-no-deadline-1440');
    await pub.locator('footer [data-close-publication]').click();await respondToBusinessConfirm(page,true);await page.locator('#schedule-panel[data-view=detail]').waitFor();
   }
   await page.locator('[data-close-inspector]').click();await page.locator('#schedule-panel').waitFor({state:'hidden'});
  }
  const pure=typedTargets[0].row;let delayed=true;await page.route('**/api/non-promotion-checkpoints?*',async(route:any)=>{if(delayed&&new URL(route.request().url()).searchParams.get('scheduleId')===pure.schedule.id){delayed=false;await new Promise(resolve=>setTimeout(resolve,900));}try{await route.continue();}catch{}});
  await page.locator(`[data-inspect-id="${pure.schedule.id}"]`).first().click();await page.locator('#schedule-panel[data-view=detail]').waitFor();await page.locator('[data-inspector-publication]').click();await pub.locator('footer [data-close-publication]').click();await page.locator('#schedule-panel[data-view=detail]').waitFor();await page.locator('[data-inspector-publication]').click();await pub.locator('[data-review-plan-fields][data-loaded=true]').waitFor({state:'attached'});await page.waitForTimeout(1000);assert(await pub.locator('[data-publication-review-plan]').isHidden());assert(await pub.locator('[name=reviewDueOn]').isDisabled());await page.unroute('**/api/non-promotion-checkpoints?*');
  checks.push(role+'：四种运营类型输入后显隐和提交范围正确；即时11月17—19日共3天，可真实保存，1440与1024；390仅关闭及溢出');
  await context.close();
 }
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:dir+'/video',size:{width:1440,height:1000}}});await login(context,admin);const page=await context.newPage();
 const demoSource=await notePost(db,'面试课成功案例 · 发布登记演示'),demo=await noteRevision(db,demoSource);await page.goto(baseURL+'/business/operations-schedule?month=2026-10&row='+demo.schedule.id);await page.locator('#schedule-panel[data-view=detail]').waitFor();await page.locator('[data-inspector-publication]').click();await fillBusinessDateTime(page.locator('#publication-form'),'actualPublishAt','2026-10-31T10:00');await page.locator('[data-publication-note-identity]:not([disabled])').waitFor();await page.locator('[name=noteIdMode][value=inherit]').check();await settleBusinessUI(page);await page.waitForTimeout(600);await page.locator('[name=noteIdMode][value=new]').check();await settleBusinessUI(page);await page.waitForTimeout(800);const video=page.video();await context.close();await copyFile(await video.path(),dir+'/publication-operation.webm');
 assert.deepEqual(errors,[]);await writeFile(dir+'/browser.json',JSON.stringify({passed:true,checks,screenshots,errors,productionWrites:false},null,2));for(const c of checks)console.log('PASS '+c);
}finally{await browser.close();await f.stop();}
