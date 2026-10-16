/** 预约／实发的真实 HTTP、权限、并发与共享 UI；仅写隔离数据库。 */
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {startFixture,admin,employee} from './auth.fixture';
import * as schema from '../src/db/schema';
const fixture=await startFixture(),{db,baseURL}=fixture;let browser:any;
const time=(date:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date).replace(' ','T');
const now=new Date(Math.floor(Date.now()/60000)*60000),past=time(new Date(now.getTime()-3600000)),future=time(new Date(now.getTime()+3*3600000));
const link='https://www.xiaohongshu.com/explore/'+'c'.repeat(24);
const form=(input:Record<string,string>)=>{const data=new FormData();for(const [key,value]of Object.entries(input))data.set(key,value);return data;};
async function login(account:typeof admin|typeof employee){const r=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(account)});assert.equal(r.status,200);return r.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')}
async function call(path:string,method:string,cookie:string,input?:Record<string,string>,expected=200){const r=await fetch(baseURL+path,{method,headers:{Origin:baseURL,Cookie:cookie,Accept:'application/json'},body:input?form(input):undefined});const data=await r.json();assert.equal(r.status,expected,`${path}: ${JSON.stringify(data)}`);return data;}
try{
 const staff=await login(employee),boss=await login(admin);
 async function create(name:string){const result=await call('/api/operations-content','POST',staff,{contentName:name,subjectId:'tmua',categoryId:'temporary',plannedPublishAt:future,projectDocUrl:'',promotionStatus:'none'},201);return result.id as string;}
 const id=await create('虚构预约与审核帖');const endpoint=`/api/operations-content/${id}`;
 const booking={scheduledPublishAt:future,requestKey:randomUUID(),expectedPlanRevision:'0',expectedPublicationRevision:'0'};
 const reservation=await call(endpoint+'/publication-reservations','POST',staff,booking,201);
 assert.equal(reservation.status,'pending');assert.equal((await call(endpoint+'/publication-reservations','POST',staff,booking,201)).id,reservation.id);
 await call(endpoint+'/publication-reservations/'+reservation.id,'PATCH',staff,{action:'approve',expectedPlanRevision:'0',expectedPublicationRevision:'1'},403);
 const approvals=await Promise.all([0,1].map(()=>fetch(baseURL+endpoint+'/publication-reservations/'+reservation.id,{method:'PATCH',headers:{Origin:baseURL,Cookie:boss},body:form({action:'approve',expectedPlanRevision:'0',expectedPublicationRevision:'1'})})));
 assert.deepEqual(approvals.map(r=>r.status).sort(),[200,409]);
 await db.update(schema.operationsPublicationReservation).set({scheduledPublishAt:new Date(now.getTime()-60000)}).where(eq(schema.operationsPublicationReservation.id,reservation.id));
 let w=await call(endpoint+'/workflow','GET',staff);assert.equal(w.publicationState,'needs_confirmation');assert.equal(w.schedule.actualPublishAt,null);
 const notices=await call('/api/business-notifications','GET',staff);assert.ok(notices.publicationDueIds.includes(id));
 assert.equal((await db.select().from(schema.operationsPromotionCampaign)).length,0);
 const sent={actualPublishAt:past,projectDocUrl:'https://fictional.example.test/project',publicationUrl:link,expectedPlanRevision:'0',expectedPublicationRevision:'2'};
 await call(endpoint+'/publication','PATCH',staff,{...sent,publicationUrl:''},422);
 await call(endpoint+'/publication','PATCH',staff,{...sent,actualPublishAt:future},422);
 const anonymous=await fetch(baseURL+endpoint+'/publication-reservations');assert.equal(anonymous.status,401);
 const csrf=await fetch(baseURL+endpoint+'/publication-reservations',{method:'POST',headers:{Cookie:staff,Origin:'https://foreign.example.test'},body:form(booking)});assert.equal(csrf.status,403);
 const playwright=await import(process.env.PLAYWRIGHT_MODULE||new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);browser=await playwright.chromium.launch({headless:true});await mkdir('.tools/test-artifacts',{recursive:true});
 const errors:string[]=[];
 async function pageFor(cookie:string,width:number){const context=await browser.newContext({viewport:{width,height:900},locale:'zh-CN',reducedMotion:'reduce'});await context.addCookies(cookie.split('; ').map(pair=>({name:pair.slice(0,pair.indexOf('=')),value:pair.slice(pair.indexOf('=')+1),url:baseURL})));const page=await context.newPage();page.on('pageerror',(error:Error)=>errors.push(error.message));return {context,page};}
 const {context,page}=await pageFor(staff,1440);
 await page.goto(baseURL+`/business/operations-schedule?status=publication_due&row=${id}`);await page.locator('[data-schedule-workflow]').getByText('预约时间已到，请补充小红书帖子链接并确认实际发送时间。').waitFor();
 await page.locator('[data-inspector-publication]').click();await page.locator('#publication-dialog[open]').waitFor();assert.equal(await page.locator('#publicationMode').inputValue(),'sent');
 await page.locator('#publicationActualPublishAt').fill(past);await page.locator('#publicationUrl').fill(link);await page.locator('#publicationProjectDocUrl').fill('https://fictional.example.test/project');
 await page.waitForFunction(()=>document.querySelector('[data-publication-delay-days]')?.getAttribute('data-ready')==='true');
 const response=page.waitForResponse((r:any)=>r.url().endsWith(endpoint+'/publication')&&r.request().method()==='PATCH');await page.locator('#publication-form button[type=submit]').click();assert.equal((await response).status(),200);await page.waitForLoadState('networkidle');
 w=await call(endpoint+'/workflow','GET',staff);assert.equal(w.publicationReservations[0].status,'fulfilled');assert.equal(w.schedule.publicationUrl,link);assert.equal(w.schedule.actualPublishAt,new Date(past+':00+08:00').toISOString());
 await call(endpoint+'/publication','PATCH',staff,{...sent,expectedPublicationRevision:'3',actualPublishAt:time(new Date(now.getTime()-1800000)),correctionReason:'员工尝试回改时间'},403);
 await page.goto(baseURL+`/business/operations-schedule?row=${id}`);await page.locator('[data-schedule-workflow] summary').first().waitFor();await page.locator('[data-inspector-publication]').click();assert.equal(await page.locator('#publicationActualPublishAt').isDisabled(),true);assert.equal(await page.locator('[data-correction-toggle]').isVisible(),false);
 await page.screenshot({path:'.tools/test-artifacts/publication-sent-employee.png'});await page.locator('[data-close-publication]').first().click();await context.close();
 // 预约只填写时间即可提交；两种模式切换不丢输入，提交失败也保留时间。
 for(const width of [1440,390,320]){
  const {context,page}=await pageFor(staff,width),newId=await create(`虚构预约界面 ${width}`);await page.goto(baseURL+`/business/operations-schedule?row=${newId}`);await page.locator('[data-inspector-publication]').click();await page.locator('#publicationMode').selectOption('scheduled');await page.locator('#scheduledPublishAt').fill(future);
  assert.equal(await page.locator('#publicationUrl').isVisible(),false);assert.equal(await page.locator('#publicationActualPublishAt').isDisabled(),true);
  await page.locator('#publicationMode').selectOption('sent');await page.locator('#publicationMode').selectOption('scheduled');assert.equal(await page.locator('#scheduledPublishAt').inputValue(),future);
  page.once('dialog',(dialog:any)=>dialog.dismiss());await page.locator('[data-close-publication]').first().click();assert.equal(await page.locator('#publication-dialog').evaluate((node:HTMLDialogElement)=>node.open),true);
  await page.route('**/publication-reservations',(route:any)=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'虚构连接失败'})}));await page.locator('#publication-form button[type=submit]').click();await page.locator('[data-publication-message]').getByText('虚构连接失败').waitFor();assert.equal(await page.locator('#scheduledPublishAt').inputValue(),future);await page.unroute('**/publication-reservations');
  await page.screenshot({path:`.tools/test-artifacts/publication-reservation-${width}.png`});const saved=page.waitForResponse((r:any)=>r.url().endsWith(`/api/operations-content/${newId}/publication-reservations`)&&r.request().method()==='POST');await page.locator('#publication-form button[type=submit]').click();assert.equal((await saved).status(),201);await page.waitForLoadState('networkidle');
  const workflow=await call(`/api/operations-content/${newId}/workflow`,'GET',staff);assert.equal(workflow.publicationState,'awaiting_approval');assert.equal(workflow.schedule.actualPublishAt,null);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await context.close();
 }
 const {context:adminContext,page:adminPage}=await pageFor(boss,1440);await adminPage.goto(baseURL+`/business/operations-schedule?row=${id}`);await adminPage.locator('[data-inspector-publication]').click();await adminPage.locator('[name=correctTime]').check();await adminPage.locator('#publicationActualPublishAt').fill(time(new Date(now.getTime()-1800000)));await adminPage.locator('#publicationCorrectionReason').fill('核对帖子后由管理员更正');await adminPage.waitForFunction(()=>document.querySelector('[data-publication-delay-days]')?.getAttribute('data-ready')==='true');
 const corrected=adminPage.waitForResponse((r:any)=>r.url().endsWith(endpoint+'/publication')&&r.request().method()==='PATCH');await adminPage.locator('#publication-form button[type=submit]').click();assert.equal((await corrected).status(),200);await adminPage.waitForLoadState('networkidle');
 w=await call(endpoint+'/workflow','GET',staff);assert.equal(w.publicationHistory.length,2);assert.equal(w.publicationHistory[0].reason,'核对帖子后由管理员更正');await adminContext.close();
 assert.deepEqual(errors,[]);console.log('通过：员工预约／审核、并发与权限、到点待确认、实发证据、管理员更正及 1440／390／320px 共享发布面板。');
}catch(error){console.error(fixture.logs().slice(-5000));throw error}finally{await browser?.close();await fixture.stop()}
