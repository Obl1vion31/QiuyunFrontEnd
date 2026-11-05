import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {seedPromotionChain} from './promotion-chain.fixture';
import {admin,employee} from './auth.fixture';
import {settleBusinessUI,respondToBusinessConfirm} from './business-confirm.helper';
import {promotionSnapshot} from '../src/db/promotion-timeline';
import * as s from '../src/db/schema';
const dir=process.env.PROMOTION_CHAIN_DIR??'.tools/test-artifacts/promotion-chain';await mkdir(dir+'/screenshots',{recursive:true});
const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-06T10:00:00+08:00');
const f=await startPostgresFixture({clockFile}),{db,baseURL}=f;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);let browser:any;const checks:string[]=[],images:string[]=[],errors:string[]=[];
async function cookies(actor:any){const r=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(actor)});assert.equal(r.status,200);return r.headers.getSetCookie().map(v=>{const [name,...rest]=v.split(';')[0].split('=');return {name,value:rest.join('='),url:baseURL};});}
async function shot(page:any,name:string,key?:any){await page.evaluate(()=>scrollTo(0,0));await settleBusinessUI(page);const file=dir+'/screenshots/'+name+'.png';await page.screenshot({path:file,fullPage:false});images.push(file);if(!await page.locator('dialog[open]').count()){const full=dir+'/screenshots/'+name+'-full.png';await page.screenshot({path:full,fullPage:true});images.push(full);}if(key){await key.screenshot({path:dir+'/screenshots/'+name+'-detail.png'});images.push(dir+'/screenshots/'+name+'-detail.png');}}
async function openMetric(page:any,c:any,index=0){
 await page.goto(baseURL+'/business/daily-promotion-review?view=history&from=2026-10-01&to=2026-11-05&q='+encodeURIComponent(c.post.version.contentName));await page.waitForLoadState('networkidle');
 await page.locator('[data-promotion-data="'+c.post.schedule.id+'"]>summary').click();
 await page.locator('[data-daily-record="'+c.metrics[index].id+'"]').click();await settleBusinessUI(page);
 return page.locator('[data-inspector] [data-history-status-edit]');
}
async function editStatus(page:any,details:any,target:string,reason:string){
 await details.locator('summary').click();const form=details.locator('form');
 await form.locator('[name=targetStatus]').selectOption(target);await form.locator('[name=reason]').fill(reason);return form;
}
const saveTimeline=(page:any,form:any)=>Promise.all([page.waitForResponse((r:any)=>r.url().endsWith('/api/promotion-timeline')&&r.request().method()==='POST'),form.locator('[type=submit]').click()]).then(([r])=>r);
try{
 const bossCookies=await cookies(admin),staffCookies=await cookies(employee);
 browser=await chromium.launch({headless:true});
 for(const width of [1440,1920,1024]){
  const c=await seedPromotionChain(db,'面试课 · 暂停后曾继续测试 · '+width);
  const context=await browser.newContext({viewport:{width,height:1000},...(width===1440?{recordVideo:{dir:dir+'/video',size:{width:1440,height:1000}}}:{reducedMotion:'reduce'})});await context.addCookies(bossCookies);
  const page=await context.newPage();page.on('pageerror',(e:Error)=>errors.push(e.message));
  const details=await openMetric(page,c);
  await shot(page,'admin-'+width+'-01-before',page.locator('[data-promotion-data="'+c.post.schedule.id+'"]'));
  const reason='核对后确认本轮测试已结束，后续继续测试的记录需归档重填';
  const form=await editStatus(page,details,'test_pending',reason),before=await promotionSnapshot(db,c.post.schedule.id);
  const r=await saveTimeline(page,form);assert.equal(r.status(),409);const preview=await r.json();assert.equal(preview.impact.dailyMetrics,5);assert.equal(preview.impact.from,'2026-10-30');
  const confirm=page.locator('[data-business-confirm][open]');await confirm.waitFor();await shot(page,'admin-'+width+'-02-impact',confirm);
  await respondToBusinessConfirm(page,false);assert.equal(await form.locator('[name=reason]').inputValue(),reason);assert.equal(await form.locator('[name=targetStatus]').inputValue(),'test_pending');assert.deepEqual(await promotionSnapshot(db,c.post.schedule.id),before);
  await shot(page,'admin-'+width+'-03-cancel-preserved',form);
  await saveTimeline(page,form);await confirm.waitFor();
  const done=page.waitForResponse((r:any)=>r.url().endsWith('/api/promotion-timeline')&&r.request().method()==='POST');
  await respondToBusinessConfirm(page,true);assert.equal((await done).status(),200);
  await page.waitForLoadState('networkidle');await page.waitForFunction((id:string)=>document.querySelectorAll('[data-promotion-data="'+id+'"] [data-daily-record]').length===1,c.post.schedule.id);
  await page.locator('[data-promotion-data="'+c.post.schedule.id+'"]').scrollIntoViewIfNeeded();await shot(page,'admin-'+width+'-04-after',page.locator('[data-promotion-data="'+c.post.schedule.id+'"]'));
  const after=await promotionSnapshot(db,c.post.schedule.id);assert.equal(after.metrics.length,1);assert.equal(after.metrics[0].spend,before.metrics[0].spend);
  assert((await page.locator('body').evaluate((el:HTMLElement)=>el.scrollWidth<=innerWidth+1)));
  checks.push(width+'：整段影响确认可读；取消保留选择与原因；确认后只保留当天指标，归档后续5天');
  await context.close();
 }
 // Staff-compatible correction: real inputs, effective labels and unchanged nonzero facts.
 const waiting=await seedPromotionChain(db,'面试课 · 后续仅等待 · 员工兼容更正','waiting');
 const staffContext=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await staffContext.addCookies(staffCookies);const staff=await staffContext.newPage();staff.on('pageerror',(e:Error)=>errors.push(e.message));
 const details=await openMetric(staff,waiting,0);await shot(staff,'staff-1440-01-waiting-before',staff.locator('[data-promotion-data="'+waiting.post.schedule.id+'"]'));
 const form=await editStatus(staff,details,'test_pending','原轮测试已结束，后面只等待决定');assert.equal((await saveTimeline(staff,form)).status(),200);
 await staff.waitForLoadState('networkidle');await staff.waitForFunction((id:string)=>[...document.querySelectorAll('[data-promotion-data="'+id+'"] .promotion-phase')].every(el=>el.textContent==='测试结束待定'),waiting.post.schedule.id);
 assert.equal((await promotionSnapshot(db,waiting.post.schedule.id)).metrics.length,3);
 await staff.locator('[data-daily-record="'+waiting.metrics[1].id+'"]').click();await settleBusinessUI(staff);
 const card=staff.locator('[data-inspector] [data-metric-card]');assert((await card.innerText()).includes('测试结束待定'));
 await shot(staff,'staff-1440-02-waiting-after',card);
 await card.locator('[data-edit-trigger]').click();const editor=staff.locator('[data-edit-dialog][open]');
 const options=await editor.locator('[name=reviewDecision] option').evaluateAll((nodes:HTMLOptionElement[])=>nodes.map(n=>n.value));assert.deepEqual(options,['wait_continue','start_scaling','test_discarded','restart_testing']);
 await editor.locator('[name=spend]').fill('66.50');
 await staff.route('**/api/promotion-daily/*',(route:any)=>route.abort('internetdisconnected'));
 await editor.locator('[type=submit]').click();await editor.locator('[data-edit-message]').filter({hasText:'无法连接'}).waitFor();assert.equal(await editor.locator('[name=spend]').inputValue(),'66.50');await shot(staff,'staff-1440-03-network-failure',editor);await staff.unroute('**/api/promotion-daily/*');
 const saved=staff.waitForResponse((r:any)=>r.url().includes('/api/promotion-daily/')&&r.request().method()==='PATCH');await editor.locator('[type=submit]').click();assert.equal((await saved).status(),200);await staff.waitForLoadState('networkidle');
 assert.equal((await db.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.id,waiting.metrics[1].id)))[0].spend,'66.50');
 checks.push('员工：兼容更正直接保存，表格和详情统一待定且3天指标全保留；断网输入保留，重试真实保存');
 await staffContext.close();
 // Full native editor shows selected old-round action versus explicit restart action.
 const paused=await seedPromotionChain(db,'面试课 · 选择原轮恢复或新轮复测','waiting'),pc=await browser.newContext({viewport:{width:1440,height:1000}});await pc.addCookies(bossCookies);const pp=await pc.newPage();await openMetric(pp,paused,1);await pp.locator('[data-inspector] [data-edit-trigger]').click();
 const pe=pp.locator('[data-edit-dialog][open]'),opts=await pe.locator('[name=reviewDecision] option').evaluateAll((nodes:HTMLOptionElement[])=>nodes.map(n=>n.value));assert.deepEqual(opts,['wait_continue','test_continue','start_scaling','test_discarded','restart_testing']);
 await pe.locator('[name=reviewDecision]').selectOption('test_continue');await shot(pp,'admin-1440-05-resume-old-round',pe);
 await pe.locator('[name=reviewDecision]').selectOption('restart_testing');await shot(pp,'admin-1440-06-restart-new-round',pe);
 checks.push('管理员：暂停5种选项、待定4种选项；旧轮恢复和新轮复测为明确独立操作');
 await pc.close();
 assert.deepEqual(errors,[]);await writeFile(dir+'/browser.json',JSON.stringify({passed:true,checks,images},null,2));console.log(checks.join('\n'));
}catch(e){console.error(f.logs().slice(-4000));throw e;}finally{await browser?.close();await f.stop();}
