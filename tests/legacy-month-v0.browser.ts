import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {seedLinkPlan,seedLinkPost} from './monthly-plan-links.fixture';
import {admin,employee} from './auth.fixture';
import {readArrangement} from '../src/db/monthly-arrangement';
import {fillBusinessDateTime} from './business-datetime.helper';
import {settleBusinessUI} from './business-confirm.helper';
import * as s from '../src/db/schema';
const dir=process.env.LEGACY_V0_DIR??'.tools/test-artifacts/legacy-month-v0';await mkdir(dir+'/screenshots',{recursive:true});
const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-09T12:00:00+08:00');
const f=await startPostgresFixture({clockFile,entry:process.env.LEGACY_V0_ENTRY}),{db,baseURL}=f;
let browser:any;const checks:string[]=[],errors:string[]=[];
try{
 await seedLinkPlan(db);
 const posts:Array<Awaited<ReturnType<typeof seedLinkPost>>>=[];for(const name of ['管理员历史已发','员工历史已发','已派生历史版本','历史未发']){
  const post=await seedLinkPost(db,name,'2026-10-17T16:00');
  if(name!=='历史未发')await db.update(s.operationsContentSchedule).set({actualPublishAt:new Date('2026-10-17T08:00Z')}).where(eq(s.operationsContentSchedule.id,post.schedule.id));
  posts.push(post);
 }
 const plansBefore=await db.select().from(s.operationsMonthlyPlan),versionsBefore=await db.select().from(s.operationsContentVersion);
 const legacy=await readArrangement(db,'2026-10');assert.equal(legacy.stage,'confirmed');assert.equal(legacy.legacyV0,true);assert.equal(legacy.planId,null);assert.equal(legacy.rows.length,4);assert.equal(legacy.history.length,0);
 assert.equal((await readArrangement(db,'2026-11')).stage,'editing');assert.equal((await readArrangement(db,'2026-12')).stage,'closed');assert.deepEqual(await db.select().from(s.operationsMonthlyPlan),plansBefore);assert.deepEqual(await db.select().from(s.operationsContentVersion),versionsBefore);
 const login=async(account:any)=>{const response=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(account)});assert.equal(response.status,200);return response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');};
 const boss=await login(admin),staff=await login(employee);
 const revise=async(post:typeof posts[number],cookie:string,extra:Record<string,string>={})=>{const form=new FormData();for(const [key,value]of Object.entries({sourceScheduleId:post.schedule.id,contentName:'历史改帖隔离样本',revisionSummary:'补充内容说明',subjectId:'tmua',categoryId:'promotional-handout',plannedPublishAt:'2026-11-14T10:00',promotionStatus:'none',...extra}))form.set(key,value);return fetch(baseURL+'/api/operations-content/versions/'+post.version.id+'/revisions',{method:'POST',headers:{Origin:baseURL,Cookie:cookie,Accept:'application/json'},body:form});};
 const withoutReason=await revise(posts[0],boss);assert.equal(withoutReason.status,422);assert.equal((await withoutReason.json()).code,'SCHEDULE_REASON_REQUIRED');
 const future=await revise(posts[0],boss,{plannedPublishAt:'2026-12-14T10:00',changeReason:'隔离目标月核对'});assert.equal(future.status,422);assert.equal((await future.json()).code,'MONTHLY_PREPLAN_REQUIRED');
 const unpublished=await revise(posts[3],staff,{changeReason:'隔离未发布核对'});assert.equal(unpublished.status,422);assert.equal((await unpublished.json()).code,'SOURCE_NOT_PUBLISHED');
 const child=await revise(posts[2],boss,{changeReason:'历史已发派生新版'});assert.equal(child.status,201,await child.clone().text());assert.equal((await child.json()).version,1);
 assert.equal((await revise(posts[2],boss,{changeReason:'不能从旧版重复派生'})).status,409);
 checks.push('历史月份只读兼容V0，不补造计划/确认/版本；11月原流程及12月门禁保持；V0调整原因、未发布与旧版本限制保持');
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);browser=await chromium.launch({headless:true});
 for(const [index,account]of [admin,employee].entries()){
  const role=index?'employee':'admin',context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'}),page=await context.newPage();page.on('pageerror',(error:Error)=>errors.push(error.message));await page.clock.setFixedTime(new Date('2026-11-09T12:00:00+08:00'));
  await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:account});
  const url=baseURL+'/business/operations-schedule?month=2026-10';await page.goto(url);await settleBusinessUI(page);
  await page.getByRole('heading',{name:'历史月排期 V0',exact:true}).waitFor();assert.equal(await page.locator('[data-arrangement-form]').count(),0);assert.equal(await page.locator('[data-arrangement-stage]').getAttribute('data-arrangement-stage'),'confirmed');
  await page.screenshot({path:dir+'/screenshots/'+role+'-legacy-1440.png',fullPage:true});
  await page.locator('button[data-inspect-id="'+posts[index].schedule.id+'"]').first().click();const button=page.locator('[data-inspector-revise]');await button.waitFor({state:'visible'});assert(await button.isEnabled());
  await button.click();const form=page.locator('#schedule-form');await form.waitFor({state:'visible'});await form.locator('[name=revisionSummary]').fill('历史版本补充题目说明');await fillBusinessDateTime(form,'plannedPublishAt','2026-11-14T10:00');
  await form.locator('[type=submit]').click();await form.locator('[name=changeReason]').waitFor({state:'visible'});await settleBusinessUI(page);await page.screenshot({path:dir+'/screenshots/'+role+'-reason-1440.png',fullPage:true});
  await form.locator('[name=changeReason]').fill('根据本月运营安排调整历史内容');const saved=page.waitForResponse((response:any)=>response.url().includes('/revisions')&&response.request().method()==='POST');await form.locator('[type=submit]').click();const response=await saved;assert.equal(response.status(),201,await response.text());await form.waitFor({state:'hidden'});await settleBusinessUI(page);await page.screenshot({path:dir+'/screenshots/'+role+'-created-1440.png',fullPage:true});
  const versions=await db.select().from(s.operationsContentVersion).where(eq(s.operationsContentVersion.contentId,posts[index].content.id));assert.deepEqual(versions.map(row=>row.versionNumber).sort(),[0,1]);
  await page.goto(url);await page.locator('button[data-inspect-id="'+posts[2].schedule.id+'"]').first().click();await settleBusinessUI(page);assert.equal(await page.locator('[data-inspector-revise]').isVisible(),false);
  if(!index){await page.keyboard.press('Escape');await page.locator('#schedule-panel').waitFor({state:'hidden'});for(const width of [1024,390]){await page.setViewportSize({width,height:1000});await settleBusinessUI(page);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:dir+'/screenshots/admin-legacy-'+width+'.png',fullPage:true});}}
  await context.close();checks.push(role+'：刷新历史月→开启改帖→填写新日期→补原因→实际创建V1；旧版入口规则保持');
 }
 assert.deepEqual(errors,[]);assert.deepEqual(await db.select().from(s.operationsMonthlyPlan),plansBefore);
 await writeFile(dir+'/result.json',JSON.stringify({passed:true,checks,errors,desktop:[1440,1024],limitedTouch:[390],dataSource:'真实隔离PostgreSQL与虚构帖子，实际目标运行包',productionWrites:false},null,2));console.log(JSON.stringify({passed:true,checks}));
}catch(error){console.error(f.logs());if(browser)for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:dir+'/failure.png',fullPage:true}).catch(()=>{});throw error;}
finally{await browser?.close();await f.stop();}
