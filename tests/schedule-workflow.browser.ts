/** 隔离 HTTP 与浏览器验收；只连接 auth.fixture 的内存 PostgreSQL。 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { startFixture, admin, employee } from './auth.fixture';
import * as schema from '../src/db/schema';

const fixture = await startFixture(); const { db, baseURL } = fixture;
let browser: { close: () => Promise<void> } | undefined;
const form = (fields: Record<string,string>) => { const result = new FormData(); Object.entries(fields).forEach(([key,value])=>result.set(key,value)); return result; };
const inputTime = (date: Date) => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date).replace(' ','T');
const now = new Date(Math.floor(Date.now()/60000)*60000); const hours = (value: number) => new Date(now.getTime()+value*3600000);
async function login(account: typeof admin | typeof employee) {
  const response=await fetch(`${baseURL}/api/auth/sign-in/username`,{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(account)});
  assert.equal(response.status,200); return response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
}
async function request(path:string,method:string,cookie:string,fields?:Record<string,string>,expected=200) {
  const response=await fetch(baseURL+path,{method,headers:{Origin:baseURL,Cookie:cookie,Accept:'application/json'},body:fields?form(fields):undefined});
  const body=await response.json();assert.equal(response.status,expected,`${path}: ${JSON.stringify(body)}`);return body;
}
try {
  const employeeCookie=await login(employee); const adminCookie=await login(admin);
  const defaults={contentName:'虚构延期验收帖',subjectId:'tmua',categoryId:'temporary',plannedPublishAt:inputTime(hours(-34)),projectDocUrl:'',promotionStatus:'none'};
  async function create(overrides:Record<string,string>={}) { const fields={...defaults,...overrides}; const created=await request('/api/operations-content','POST',employeeCookie,fields,201);return {id:created.id as string,fields}; }
  const delayed=await create();
  const notifications=await request('/api/business-notifications','GET',employeeCookie);assert.equal(notifications.overdue,1);
  await request(`/api/operations-content/${delayed.id}`,'PATCH',employeeCookie,{...delayed.fields,plannedPublishAt:inputTime(hours(24)),role:'admin'},403);
  const actual=inputTime(hours(-2));
  await request(`/api/operations-content/${delayed.id}/publication`,'PATCH',employeeCookie,{plannedPublishAt:actual,actualPublishAt:actual,projectDocUrl:'https://fictional.example.test/delayed'},422);
  const before=(await db.select().from(schema.operationsContentSchedule).where(eq(schema.operationsContentSchedule.id,delayed.id)))[0];assert.equal(before.actualPublishAt,null);
  const preview=await request(`/api/operations-content/${delayed.id}/workflow?actual=${encodeURIComponent(actual)}`,'GET',employeeCookie);assert.equal(preview.days.length,2);
  await request(`/api/operations-content/${delayed.id}/delay-reasons`,'POST',employeeCookie,{planRevision:'0',dayNumber:'99',responsibility:'self',reason:'尚未到期'},409);
  const dailyReasons=preview.days.map((day:any)=>({planRevision:day.planRevision,dayNumber:day.dayNumber,responsibility:'self',reason:`虚构第${day.dayNumber}天：正在修改`,expectedUpdatedAt:null}));
  await request(`/api/operations-content/${delayed.id}/publication`,'PATCH',employeeCookie,{plannedPublishAt:actual,actualPublishAt:actual,projectDocUrl:'https://fictional.example.test/delayed',dailyReasons:JSON.stringify(dailyReasons)});
  assert.equal((await request('/api/business-notifications','GET',employeeCookie)).overdue,0);
  const workflow=await request(`/api/operations-content/${delayed.id}/workflow`,'GET',employeeCookie);assert.ok(workflow.days.every((day:any)=>day.saved?.reason));
  assert.equal(workflow.schedule.completionStatus,'delayed','客户端伪造的应发时间不改变延期判定');
  await request(`/api/operations-content/${delayed.id}`,'DELETE',adminCookie,undefined,409);

  const approval=await create({contentName:'虚构审批验收帖',plannedPublishAt:inputTime(hours(-60))});
  const application=await request(`/api/operations-content/${approval.id}/change-requests`,'POST',employeeCookie,{expectedPlanRevision:'0',plannedPublishAt:inputTime(hours(48)),reason:'需求端延期'},201);
  await request(`/api/operations-content/${approval.id}/change-requests`,'POST',employeeCookie,{expectedPlanRevision:'0',plannedPublishAt:inputTime(hours(72)),reason:'重复申请'},409);
  await request(`/api/operations-content/${approval.id}/change-requests/${application.id}`,'PATCH',employeeCookie,{action:'approve'},403);
  const decisions=await Promise.all([0,1].map(()=>fetch(`${baseURL}/api/operations-content/${approval.id}/change-requests/${application.id}`,{method:'PATCH',headers:{Origin:baseURL,Cookie:adminCookie},body:form({action:'approve'})})));
  assert.deepEqual(decisions.map(response=>response.status).sort(),[200,409]);
  const approved=await request(`/api/operations-content/${approval.id}/workflow`,'GET',employeeCookie);assert.equal(approved.overdueDays,0);assert.equal(approved.history.length,1);assert.ok(approved.days.some((day:any)=>!day.saved));
  const temporary=await create({subjectId:'temporary',categoryId:'temporary',contentName:'临时学科临时帖',plannedPublishAt:inputTime(hours(24))});
  assert.ok(temporary.id);
  const pending=await create({contentName:'虚构待填理由帖子',plannedPublishAt:inputTime(hours(-10))});

  async function published(name:string,subjectId='tmua',categoryId='innovation') {
    const row=await create({contentName:name,subjectId,categoryId,plannedPublishAt:inputTime(hours(-24*23))});
    await request(`/api/operations-content/${row.id}/publication`,'PATCH',employeeCookie,{actualPublishAt:row.fields.plannedPublishAt,projectDocUrl:`https://fictional.example.test/${row.id}`});return row;
  }
  const skipped=await published('虚构可跳过帖');
  const skipInput={scheduleId:skipped.id,checkpointType:'day_7',action:'skip',reason:'平台数据无法获取',expectedEventId:''};
  await request('/api/non-promotion-checkpoints','POST',employeeCookie,skipInput);
  const skippedEvents=await db.select().from(schema.operationsNonPromotionCheckpointEvent).where(eq(schema.operationsNonPromotionCheckpointEvent.scheduleId,skipped.id));
  assert.equal(skippedEvents.length,1);assert.equal((await db.select().from(schema.operationsContentPerformanceMetric)).length,0);
  // 模拟导入的原始指标尚未形成复盘；跳过后也不能进入同类样本。
  await db.insert(schema.operationsContentPerformanceMetric).values({scheduleId:skipped.id,checkpointType:'day_7',recordedThrough:inputTime(hours(-24*16)).slice(0,10),clickRate:'95',threeSecondReadRate:'95'});
  await request('/api/non-promotion-reviews','POST',employeeCookie,{scheduleId:skipped.id,checkpointType:'day_7',recordedThrough:inputTime(hours(-24*16)).slice(0,10),clickRate:'10',threeSecondReadRate:'20',conclusion:'',platformNoteId:'1'.repeat(24)},409);
  const meeting=await request('/api/meeting-reviews','POST',employeeCookie,{name:'虚构复盘会',periodStart:inputTime(hours(-24*25)).slice(0,10),periodEnd:inputTime(now).slice(0,10),meetingAt:now.toISOString()},201);
  const invalidMeeting=await fetch(`${baseURL}/api/meeting-reviews/${meeting.id}`,{method:'PATCH',headers:{Origin:baseURL,Cookie:employeeCookie,'Content-Type':'application/json'},body:JSON.stringify({action:'finalize',draft:{schemaVersion:2,coreConclusion:'',nextAction:'',promotionInputs:{},issues:[],nonPromotionSelections:[{scheduleId:skipped.id,checkpointType:'day_7'}]}})});assert.equal(invalidMeeting.status,409);
  const restoredWithReview=await published('虚构已完成二轮帖','step','non-promotional-handout');
  await request('/api/non-promotion-checkpoints','POST',employeeCookie,{...skipInput,scheduleId:restoredWithReview.id});
  await request('/api/non-promotion-reviews','POST',employeeCookie,{scheduleId:restoredWithReview.id,checkpointType:'day_15',recordedThrough:inputTime(hours(-24*8)).slice(0,10),clickRate:'50',threeSecondReadRate:'60',conclusion:'',platformNoteId:'7'.repeat(24)},201);
  const [restoreEvent]=await db.select().from(schema.operationsNonPromotionCheckpointEvent).where(eq(schema.operationsNonPromotionCheckpointEvent.scheduleId,restoredWithReview.id));
  await request('/api/non-promotion-checkpoints','POST',employeeCookie,{...skipInput,scheduleId:restoredWithReview.id,action:'restore',reason:'首轮数据恢复',expectedEventId:restoreEvent.id});
  assert.equal((await db.select().from(schema.operationsNonPromotionReview).where(eq(schema.operationsNonPromotionReview.scheduleId,restoredWithReview.id)))[0].checkpointType,'day_15');
  const peerA=await published('虚构同类帖子 A');const peerB=await published('虚构同类帖子 B');const promotedPeer=await published('虚构转推广帖子');
  for(const [index,row] of [peerA,peerB,promotedPeer].entries()) {
    await request('/api/non-promotion-reviews','POST',employeeCookie,{scheduleId:row.id,checkpointType:'day_7',recordedThrough:inputTime(hours(-24*16)).slice(0,10),clickRate:String([10,30,90][index]),threeSecondReadRate:'40',conclusion:'',platformNoteId:(index+2).toString().repeat(24)},201);
  }
  await request(`/api/operations-content/${promotedPeer.id}`,'PATCH',employeeCookie,{...promotedPeer.fields,isPromoted:'on'});
  await request('/api/non-promotion-reviews','POST',employeeCookie,{scheduleId:peerA.id,checkpointType:'day_7',recordedThrough:inputTime(hours(-24*16)).slice(0,10),clickRate:'10',threeSecondReadRate:'40',conclusion:'更正时无需再填ID'},201);
  const [review]=await db.select().from(schema.operationsNonPromotionReview).where(eq(schema.operationsNonPromotionReview.scheduleId,peerA.id));assert.equal((review.cohortSnapshot.clickRate as any).mean,20);assert.equal((review.cohortSnapshot.clickRate as any).count,2);
  const promotionDate=inputTime(hours(-24)).slice(0,10);
  await request('/api/promotion-awaiting','POST',employeeCookie,{scheduleId:promotedPeer.id,reviewDate:promotionDate,action:'start_testing'},201);
  const [campaign]=await db.select().from(schema.operationsPromotionCampaign).where(eq(schema.operationsPromotionCampaign.scheduleId,promotedPeer.id));
  await request('/api/promotion-daily','POST',employeeCookie,{campaignId:campaign.id,metricDate:promotionDate,dailyStatus:'active',stageTypeSnapshot:'testing',spend:'20',platformOpenCount:'2',actualOpenCount:'1',platformLeadCount:'1',actualLeadCount:'1',reviewDecision:'test_continue'},201);
  console.log('通过：HTTP 改期权限与并发审批、伪造应发防绕过、实发原子理由、临时分类、跳过节点及同类基准。');

  const playwright=await import(process.env.PLAYWRIGHT_MODULE||new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);
  const launched=await playwright.chromium.launch({headless:true});browser=launched;await mkdir('.tools/test-artifacts',{recursive:true});
  const errors:string[]=[];
  async function contextFor(cookie:string,width=1440) {
    const context=await launched.newContext({viewport:{width,height:900},...(width<900?{isMobile:true,hasTouch:true}:{})});
    await context.addCookies(cookie.split('; ').map(pair=>({name:pair.slice(0,pair.indexOf('=')),value:pair.slice(pair.indexOf('=')+1),url:baseURL})));
    const page=await context.newPage();page.on('pageerror',(error:Error)=>errors.push(error.message));page.on('dialog',(dialog:any)=>dialog.accept());return {context,page};
  }
  const {context,page}=await contextFor(employeeCookie);
  await page.goto(`${baseURL}/business/operations-schedule?status=overdue&row=${pending.id}`);
  await page.locator('[data-schedule-workflow] .workflow-form').first().waitFor();
  assert.equal(await page.locator('[data-schedule-count=overdue]').textContent(),'1');
  const reasonForm=page.locator('[data-schedule-workflow] .workflow-reason form').first();await reasonForm.locator('select').selectOption('self');await reasonForm.locator('textarea').fill('浏览器填写今日正在修改中');await reasonForm.locator('button[type=submit]').click();
  await page.locator('[data-schedule-workflow]').getByText('自身原因：浏览器填写今日正在修改中').waitFor({state:'attached'});
  assert.equal(await page.locator('[data-schedule-count=overdue]').textContent(),'1','填完理由仍保留延期提示');
  await page.locator('[data-schedule-workflow] summary').filter({hasText:'申请调整排期'}).click();
  const applicationForm=page.locator('[data-schedule-workflow] form').filter({has:page.locator('[name=plannedPublishAt]')});
  await applicationForm.locator('[name=plannedPublishAt]').fill(inputTime(hours(36)));await applicationForm.locator('textarea').fill('浏览器改期申请');await applicationForm.locator('button[type=submit]').click();
  await page.waitForLoadState('networkidle');await page.locator('[data-schedule-workflow]').getByText(/待审批/).waitFor();
  await page.screenshot({path:'.tools/test-artifacts/schedule-workflow-desktop.png',fullPage:true});
  await page.goto(`${baseURL}/business/non-promotion-review?view=history&subject=tmua&category=innovation`);
  assert.equal(await page.locator('.review-row[data-row-href]').count(),2);
  assert.match(await page.locator('.metric-cell').first().getAttribute('title')||'',/20.00% · n=2/);
  await page.locator('.review-row[data-row-href]').first().click();await page.locator('[data-inspector]').waitFor();assert.equal(new URL(page.url()).searchParams.get('category'),'innovation');
  await page.keyboard.press('Escape');await page.waitForURL((url:URL)=>!url.searchParams.has('row'));assert.equal(new URL(page.url()).searchParams.get('subject'),'tmua');
  await page.locator('[data-module-href="/business/operations-schedule"]').click();await page.waitForURL('**/operations-schedule*');
  await page.locator('[data-module-href="/business/non-promotion-review"]').click();await page.waitForURL('**/non-promotion-review*');
  await page.locator('[name=subject]').selectOption('step');await page.waitForURL((url:URL)=>url.searchParams.get('subject')==='step');assert.equal(await page.locator('[name=category]').inputValue(),'');
  await page.goto(`${baseURL}/business/non-promotion-review?view=pending&subject=tmua&category=innovation&row=${skipped.id}:day_15`);
  await page.locator('[data-inspector]').waitFor();assert.match(await page.locator('[data-inspector]>header').innerText(),/二轮/);
  await page.locator('.checkpoint-action summary').click();await page.locator('[data-checkpoint-form] textarea').fill('二轮数据也无法获取');await page.locator('[data-checkpoint-form] button').click();await page.waitForURL('**view=skipped**');
  await page.goto(`${baseURL}/business/non-promotion-review?view=skipped&subject=tmua&category=innovation&row=${skipped.id}:day_7`);
  await page.locator('[data-checkpoint-form] textarea').fill('平台数据恢复');await page.locator('[data-checkpoint-form] button').click();await page.waitForURL('**view=pending**');
  await page.screenshot({path:'.tools/test-artifacts/non-promotion-workflow-desktop.png',fullPage:true});
  const browserPublication=await create({contentName:'虚构浏览器实发帖'});
  await page.goto(`${baseURL}/business/operations-schedule?status=overdue&row=${browserPublication.id}`);await page.locator('[data-schedule-workflow] .workflow-form').first().waitFor();
  await page.locator('[data-inspector-publication]').click();await page.locator('#publication-dialog[open]').waitFor();
  await page.locator('#publicationActualPublishAt').fill(actual);await page.locator('#publicationProjectDocUrl').fill('https://fictional.example.test/browser-publication');
  await page.waitForFunction(()=>document.querySelector('[data-publication-delay-days]')?.getAttribute('data-ready')==='true');
  assert.equal(await page.locator('[data-delay-day]').count(),2);
  for(const index of [0,1]){const day=page.locator('[data-delay-day]').nth(index);await day.locator('select').selectOption(index?'requester':'self');await day.locator('textarea').fill(`浏览器第${index+1}天原因`);}
  await page.screenshot({path:'.tools/test-artifacts/publication-workflow-desktop.png',fullPage:true});
  const publicationResponse=page.waitForResponse((response:any)=>response.url().endsWith(`/api/operations-content/${browserPublication.id}/publication`)&&response.request().method()==='PATCH');
  await page.locator('#publication-form button[type=submit]').click();assert.equal((await publicationResponse).status(),200);
  await page.goto(`${baseURL}/business/daily-promotion-review`);await page.locator('.lifecycle-card').waitFor();
  assert.equal(await page.locator('.lifecycle-card>header a').evaluate((node:HTMLElement)=>getComputedStyle(node).display),'flex');
  await page.screenshot({path:'.tools/test-artifacts/daily-promotion-workflow-desktop.png',fullPage:true});await context.close();
  for(const width of [390,320]) {
    const {context:mobile,page:phone}=await contextFor(employeeCookie,width);
    await phone.goto(`${baseURL}/business/non-promotion-review?subject=tmua&category=innovation&row=${skipped.id}:day_7`);await phone.locator('[data-inspector]').waitFor();
    assert.ok(await phone.locator('[data-inspector]').evaluate((node:HTMLElement)=>node.getBoundingClientRect().width<=innerWidth));
    await phone.screenshot({path:`.tools/test-artifacts/non-promotion-workflow-${width}.png`,fullPage:true});
    await phone.goto(`${baseURL}/business/operations-schedule?status=reasons&row=${approval.id}`);await phone.locator('[data-schedule-workflow] .workflow-reason').first().waitFor();
    await phone.screenshot({path:`.tools/test-artifacts/schedule-workflow-${width}.png`,fullPage:true});await mobile.close();
  }
  const {context:adminContext,page:adminPage}=await contextFor(adminCookie);await adminPage.goto(`${baseURL}/business/operations-schedule?status=approvals&row=${pending.id}`);
  await adminPage.locator('[data-schedule-workflow]').getByRole('button',{name:'同意调整排期'}).waitFor();await adminPage.locator('[data-schedule-workflow]').getByRole('button',{name:'同意调整排期'}).click();await adminPage.waitForLoadState('networkidle');
  assert.equal((await request('/api/business-notifications','GET',adminCookie)).pendingApprovals,0);await adminContext.close();
  assert.deepEqual(errors,[]);console.log('通过：桌面与手机的逐日理由、申请审批、跨页初始化、分类筛选、节点跳过与恢复。');
} catch(error) { console.error(fixture.logs());throw error; }
finally { await browser?.close();await fixture.stop(); }
