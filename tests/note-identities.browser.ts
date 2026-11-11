import assert from 'node:assert/strict';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {notePost,noteRevision} from './note-identities.fixture';
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
async function shot(page:any,name:string){await settleBusinessUI(page);if(name.includes('history')&&!name.includes('confirm'))await page.locator('[data-note-identity-form]').scrollIntoViewIfNeeded();await page.mouse.move(0,0);await page.screenshot({path:dir+'/screenshots/'+name+'.png'});screenshots.push(name);}
async function openHistory(page:any,metricId:string){
 await page.goto(baseURL+'/business/daily-promotion-review?view=history&mode=day&from=2026-10-29&to=2026-11-03');
 const row=page.locator('[data-inspector-key="'+metricId+'"]').first();
 for(const ancestor of await row.locator('xpath=ancestor::details').all())if(await ancestor.getAttribute('open')===null)await ancestor.locator(':scope>summary').click();
 await row.click();await page.locator('[data-promotion-inspector].is-open').waitFor();
 await page.locator('[data-promotion-inspector] .note-id-correction>summary').click();
 await page.locator('[data-note-identity-form] [name=platformNoteId]').waitFor();await settleBusinessUI(page);
}
async function submitCorrection(page:any,accept:boolean){await page.locator('[data-note-identity-form] [type=submit]').click();await respondToBusinessConfirm(page,accept);}
try{
 let index=0,videoSource:any;
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
  await page.locator('[data-note-identity-form] [name=scope][value=version]').check();await page.locator('[data-note-identity-form] [name=platformNoteId]').fill(all);
  await page.locator('[data-note-identity-form] [type=submit]').click();await page.locator('[data-business-confirm][open]').waitFor();await shot(page,role+'-history-all-confirm-1440');await respondToBusinessConfirm(page,true);
  await page.waitForFunction((value:string)=>document.querySelector('[data-current-note-id]')?.textContent===value,all);await shot(page,role+'-history-all-saved-1440');
  await page.locator('[data-close-inspector]').click();await page.locator('[data-promotion-inspector]').waitFor({state:'hidden'});assert.equal(await page.locator('[data-business-confirm][open]').count(),0);
  await page.goto(baseURL+'/business/operations-schedule?month=2026-10&row='+revision.schedule.id);await page.locator('#schedule-panel[open][data-view=detail]').waitFor();await page.locator('[data-inspector-publication]').click();
  const pub=page.locator('#publication-form');await fillBusinessDateTime(pub,'actualPublishAt','2026-10-31T10:00');await pub.locator('[name=publicationUrl]').fill('https://www.xiaohongshu.com/explore/'+fresh);
  await page.locator('[data-publication-delay-days][data-ready=true]').waitFor({state:'attached'});await pub.locator('[name=noteIdMode][value=inherit]').waitFor({state:'visible'});assert.equal(await pub.locator('[name=noteIdMode]:checked').count(),0);assert((await pub.locator('[name=noteIdMode][value=new]').boundingBox()).width<=18);
  assert((await pub.locator('[data-note-inherit-value]').textContent())!.includes(all));await pub.locator('[name=noteIdMode][value=inherit]').check();await shot(page,role+'-publication-inherit-1440');
  await pub.locator('[name=noteIdMode][value=new]').check();await pub.locator('[name=platformNoteId]').fill(fresh);await shot(page,role+'-publication-new-1440');
  await page.setViewportSize({width:1024,height:1000});await shot(page,role+'-publication-new-1024');assert(await pub.locator('[name=platformNoteId]').isVisible());
  await page.setViewportSize({width:390,height:844});assert(await pub.locator('header [data-close-publication]').isVisible());assert((await pub.boundingBox()).width<=390);await page.setViewportSize({width:1440,height:1000});
  let pubFail=true;await page.route('**/api/operations-content/'+revision.schedule.id+'/publication',async(route:any)=>{if(pubFail){pubFail=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'发布登记未保存，当前输入已保留。'})});}await route.continue();});
  await pub.locator('[type=submit]').click();await page.waitForFunction(()=>document.querySelector('[data-publication-message]')?.textContent?.includes('输入已保留'));assert.equal(await pub.locator('[name=platformNoteId]').inputValue(),fresh);assert.equal(await pub.locator('[name=noteIdMode]:checked').inputValue(),'new');await shot(page,role+'-publication-failure-1440');
  if(role==='admin')await pub.locator('[name=noteIdMode][value=inherit]').check();
  const sent=page.waitForResponse((r:any)=>r.url().endsWith('/publication')&&r.request().method()==='PATCH'&&r.status()===200);await pub.locator('[type=submit]').click();await sent;await page.locator('#schedule-panel[data-view=detail]').waitFor();await settleBusinessUI(page);await shot(page,role+'-publication-saved-1440');
  assert.equal(noteIdOn((await readVersionNotes(db,[revision.version.id])).get(revision.version.id)!.periods,'2026-10-31'),role==='admin'?all:fresh);
  assert.equal(noteIdOn((await readVersionNotes(db,[source.post.version.id])).get(source.post.version.id)!.periods,'2026-10-29'),all);
  checks.push(role+'：历史两种范围、取消与失败保留、原位保存；推广改帖必选和新填／继承发布，1440与1024；390仅关闭及溢出');
  if(role==='admin')videoSource=source;await context.close();
 }
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:dir+'/video',size:{width:1440,height:1000}}});await login(context,admin);const page=await context.newPage();
 await openHistory(page,videoSource.metrics[2].id);await page.locator('[data-note-identity-form] [name=platformNoteId]').fill('9'.repeat(24));await submitCorrection(page,false);await page.locator('[data-note-identity-form] [name=scope][value=version]').check();await submitCorrection(page,true);await page.waitForFunction(()=>document.querySelector('[data-current-note-id]')?.textContent==='9'.repeat(24));await settleBusinessUI(page);const video=page.video();await context.close();await copyFile(await video.path(),dir+'/history-operation.webm');
 assert.deepEqual(errors,[]);await writeFile(dir+'/browser.json',JSON.stringify({passed:true,checks,screenshots,errors,productionWrites:false},null,2));for(const c of checks)console.log('PASS '+c);
}finally{await browser.close();await f.stop();}
