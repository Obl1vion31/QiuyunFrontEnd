/** 真实11月4/5/6日事实今天都更新过，主表仍只保留6日；不改原行。 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {seedLinkPost} from './monthly-plan-links.fixture';
import {admin,employee} from './auth.fixture';
import {settleBusinessUI} from './business-confirm.helper';
import {promotionSnapshot,timelineFingerprint} from '../src/db/promotion-timeline';
import * as s from '../src/db/schema';
const dir=process.env.PROMOTION_LATEST_DIR??'.tools/test-artifacts/promotion-latest',baseline=process.env.PROMOTION_LATEST_BASELINE==='1';
await mkdir(dir+'/screenshots',{recursive:true});const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-07T12:00:00+08:00');
const fixture=await startPostgresFixture({clockFile,entry:process.env.PROMOTION_LATEST_ENTRY}),{db,baseURL}=fixture;
let browser:any;const contexts:any[]=[],errors:string[]=[],checks:string[]=[];
try{
 const pw=await import(process.env.PLAYWRIGHT_MODULE!);browser=await pw.chromium.launch({headless:true});
 async function seed(name:string,days:string[],ended=false){
  const post=await seedLinkPost(db,name,days[0]+'T10:00',{subjectId:'interview',categoryId:'promotional-handout'});
  await db.update(s.operationsContent).set({platformNoteId:randomUUID().replaceAll('-','').slice(0,24)}).where(eq(s.operationsContent.id,post.content.id));
  await db.update(s.operationsContentSchedule).set({isPromoted:true,promotionStatus:ended?'test_discarded':'testing',actualPublishAt:new Date(days[0]+'T02:00Z'),completionStatus:'on_time'}).where(eq(s.operationsContentSchedule.id,post.schedule.id));
  const [campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:post.schedule.id,startedOn:days[0],dailyReviewEnabledOn:days[0],initialStage:'testing',currentStage:ended?null:'testing',currentStatus:ended?'test_discarded':'testing',endedOn:ended?days.at(-1):null}).returning();
  await db.insert(s.operationsPromotionStage).values({campaignId:campaign.id,stageType:'testing',startedOn:days[0],endedOn:ended?days.at(-1):null,outcome:ended?'test_discarded':null});
  const metrics=await db.insert(s.operationsPromotionDailyMetric).values(days.map((metricDate,index)=>({campaignId:campaign.id,metricDate,dailyStatus:'active',actualStatusSnapshot:'testing',stageTypeSnapshot:'testing',sourceStageStartedOn:days[0],spend:String(40+index*30),platformOpenCount:5,actualOpenCount:2,platformLeadCount:3,actualLeadCount:1,reviewDecision:ended?'test_discarded':'test_continue',updatedAt:new Date('2026-11-07T01:00Z')}))).returning();
  return {post,campaign,metrics};
 }
 const current=await seed('面试课推广讲义帖 · 连续三日已保存',['2026-11-04','2026-11-05','2026-11-06']);await seed('TMUA · 5日已结束的旧推广',['2026-11-05'],true);
 const main='[data-review-container=ready] [data-review-record]';
 const shot=async(page:any,name:string)=>{await settleBusinessUI(page);await page.screenshot({path:dir+'/screenshots/'+name+'.png',fullPage:true});};
 async function makeContext(actor:any,record=false){const context=await browser.newContext({viewport:{width:1920,height:1000},locale:'zh-CN',...(record?{recordVideo:{dir:dir+'/video',size:{width:1920,height:1000}}}:{})});contexts.push(context);assert.equal((await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:actor})).status(),200);const page=await context.newPage();page.on('pageerror',(e:Error)=>errors.push(e.message));return {context,page};}
 const {context,page}=await makeContext(admin,!baseline);const go=async()=>{await page.goto(baseURL+'/business/daily-promotion-review');await settleBusinessUI(page);};
 if(!baseline)await page.route('**/fonts/business.js',async(route:any)=>{await new Promise(resolve=>setTimeout(resolve,650));await route.continue();});
 await go();await page.unroute('**/fonts/business.js');
 const dates=()=>page.locator(main).evaluateAll((nodes:HTMLElement[])=>nodes.map(n=>n.dataset.reviewDate));
 const currentRow=page.locator(`[data-review-record][data-review-date="2026-11-06"]`);
 const geometry=await currentRow.evaluate((node:HTMLElement)=>{const r=node.getBoundingClientRect();return {height:r.height,fields:[...node.querySelectorAll<HTMLElement>('.review-number input,[data-toggle-day-state],.review-decision select')].map(field=>{const f=field.getBoundingClientRect(),style=getComputedStyle(field);return {x:f.x-r.x,y:f.y-r.y,width:f.width,height:f.height,font:style.font};})};});
 await writeFile(dir+'/row-geometry.json',JSON.stringify(geometry,null,2));
 if(baseline){assert.deepEqual(await dates(),['2026-11-04','2026-11-05','2026-11-05','2026-11-06']);await shot(page,'before-older-days-1920');}
 else{
  assert.deepEqual(await dates(),['2026-11-06']);assert.match(await page.locator('[data-promotion-saved-count]').innerText(),/已保存 1 项/);assert.match(await page.locator('[data-promotion-pending-count]').innerText(),/^0 /);
  if(process.env.PROMOTION_LATEST_COMPARE){const prior=JSON.parse(await readFile(process.env.PROMOTION_LATEST_COMPARE,'utf8'));for(const field of prior.fields){delete field.background;delete field.border;field.font=field.font.replace(/ \/ [\d.]+px/,'');}assert.deepEqual(geometry,prior,'仅移除旧行，6日原行尺寸、字段相对位置和字体不变');}
  await shot(page,'admin-latest-1920');await page.reload();await settleBusinessUI(page);assert.deepEqual(await dates(),['2026-11-06']);await shot(page,'refresh-latest-1920');
  const button=currentRow.getByRole('button',{name:'继续编辑',exact:true});await button.press('Enter');await currentRow.locator('[name=spend]').fill('150');await shot(page,'editing-latest-1920');await currentRow.locator('[data-save-saved]').click();await currentRow.locator('[name=spend][value="150.00"]').waitFor();assert.deepEqual(await dates(),['2026-11-06']);
  const cookie=(await context.cookies()).map((c:any)=>c.name+'='+c.value).join('; '),old=current.metrics[0];
  const revise=async(workspace:boolean)=>{const form=new FormData();for(const [key,value]of Object.entries({...old,spend:75,dayStatus:'testing',changeDayStatus:true,dailyWorkspace:workspace,requestKey:randomUUID(),fingerprint:timelineFingerprint(await promotionSnapshot(db,current.post.schedule.id))}))if(value!=null)form.set(key,String(value));return fetch(baseURL+'/api/promotion-daily/'+old.id,{method:'PATCH',headers:{Origin:baseURL,Cookie:cookie,Accept:'application/json'},body:form});};
  assert.equal((await revise(true)).status,422,'旧日不再从每日工作区双日期更正');assert.equal((await revise(false)).status,200,'历史入口仍能更正旧日指标');await go();assert.deepEqual(await dates(),['2026-11-06']);await shot(page,'old-edit-stays-history-1920');
  await page.getByRole('link',{name:'历史总览',exact:true}).first().click();await page.waitForURL(/view=history/);const history=page.locator(`[data-promotion-data="${current.post.schedule.id}"]`);await history.locator('summary').first().click();await history.locator(`[data-daily-record="${old.id}"]`).waitFor();await shot(page,'older-days-history-1920');await page.getByRole('link',{name:'每日复盘',exact:true}).first().click();await page.waitForURL((url:URL)=>url.searchParams.get('view')!=='history');await settleBusinessUI(page);assert.deepEqual(await dates(),['2026-11-06']);await shot(page,'navigation-latest-1920');
  const staff=await makeContext(employee);for(const [p,role]of [[page,'admin'],[staff.page,'employee']] as const)for(const width of [1440,1024]){await p.setViewportSize({width,height:1000});await p.goto(baseURL+'/business/daily-promotion-review');await settleBusinessUI(p);assert.deepEqual(await p.locator(main).evaluateAll((nodes:HTMLElement[])=>nodes.map(n=>n.dataset.reviewDate)),['2026-11-06']);await shot(p,role+'-latest-'+width);}
  await staff.page.setViewportSize({width:1920,height:1000});await staff.page.reload();await shot(staff.page,'employee-latest-1920');
  await page.setViewportSize({width:390,height:844});await go();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await shot(page,'mobile-obvious-390');
  await writeFile(clockFile,'2026-11-08T00:00:01+08:00');await page.setViewportSize({width:1920,height:1000});await go();assert.equal(await page.locator('[data-saved-review]').count(),0);assert.deepEqual(await dates(),['2026-11-07']);await shot(page,'midnight-next-day-1920');
  checks.push('11月4/5/6日今天均更新过，主表仅6日；旧终态5日不回流','原行几何、字体与基线相同；0待填、保存、刷新和站内往返保留6日','旧日工作区更正422，历史更正成功也不回主表；原事实在历史可读','双角色三档桌面、390有限检查、跨上海午夜只开放7日');assert.deepEqual(errors,[]);
 }
 await writeFile(dir+'/checks.json',JSON.stringify({baseline,checks,errors,dates:'固定2026-11-07；仅隔离PostgreSQL虚构样本'},null,2));console.log(baseline?'Baseline older-day retention reproduced':'Latest-only review checks passed');
}finally{for(const context of contexts)await context.close();await browser?.close();await fixture.stop();}
