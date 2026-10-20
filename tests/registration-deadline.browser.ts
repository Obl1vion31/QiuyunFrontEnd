import {respondToBusinessConfirm} from './business-confirm.helper';
/** 登记催办、审批边界与长详情滚动；所有写入仅使用隔离 PGlite。 */
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startFixture,admin,employee} from './auth.fixture';
import * as schema from '../src/db/schema';
import {fillBusinessDateTime} from './business-datetime.helper';
const fixture=await startFixture(),{db,baseURL}=fixture;let browser:any;
const now=new Date(Math.floor(Date.now()/60000)*60000),at=(hours:number)=>new Date(now.getTime()+hours*3600000);
const inputTime=(date:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date).replace(' ','T');
const form=(values:Record<string,string>)=>{const data=new FormData();for(const [key,value] of Object.entries(values))data.set(key,value);return data;};
async function login(account:typeof employee|typeof admin){const r=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(account)});assert.equal(r.status,200);return r.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');}
async function seed(name:string,hours:number,registered=false,threshold=2){
 const [content]=await db.insert(schema.operationsContent).values({}).returning();
 const [version]=await db.insert(schema.operationsContentVersion).values({contentId:content.id,versionNumber:0,workType:'new',contentName:name,subjectId:'tmua',categoryId:'temporary',projectDocUrl:'https://fictional.example.test/doc'}).returning();
 return (await db.insert(schema.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:at(hours),actualPublishAt:registered?at(hours+4):null,delayThresholdHours:threshold,completionStatus:registered?'on_time':'pending'}).returning())[0];
}
try{
 const cookie=await login(employee);
 const call=async(path:string,method='GET',values?:Record<string,string>)=>fetch(baseURL+path,{method,headers:{Cookie:cookie,Origin:baseURL,Accept:'application/json'},body:values?form(values):undefined});
 const early=await seed('虚构门槛前改期',-1);
 const edit={contentName:'虚构门槛前改期',subjectId:'tmua',categoryId:'temporary',promotionStatus:'none',projectDocUrl:'https://fictional.example.test/doc',plannedPublishAt:inputTime(at(24)),expectedPlanRevision:'0',planChangeReason:'提前调整'};
 assert.equal((await call(`/api/operations-content/${early.id}`,'PATCH',edit)).status,200);
 const race=await seed('虚构门槛后改期',-1);
 assert.equal((await (await call(`/api/operations-content/${race.id}/workflow`)).json()).requiresPlanApproval,false);
 await db.update(schema.operationsContentSchedule).set({plannedPublishAt:at(-3)}).where(eq(schema.operationsContentSchedule.id,race.id));
 const response=await call(`/api/operations-content/${race.id}`,'PATCH',edit);assert.equal(response.status,202);assert.equal((await response.json()).status,'pending_approval');
 const history=await seed('虚构历史四小时按新口径延期',-40,true,8);
 const hw=await (await call(`/api/operations-content/${history.id}/workflow`)).json();assert.equal(hw.days.length,1);
 const notes=await (await call('/api/business-notifications')).json();assert.ok(notes.missingRegistrationIds.includes(race.id));assert.ok(!notes.missingReasonIds.includes(race.id));
 const playwright=await import(process.env.PLAYWRIGHT_MODULE||new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);
 browser=await playwright.chromium.launch({headless:true});await mkdir('.tools/test-artifacts',{recursive:true});const errors:string[]=[];
 for(const width of [1440,390,320]){
  const long=await seed(`虚构长详情 ${width}`,-100);
  await db.insert(schema.operationsScheduleDelayReason).values({scheduleId:long.id,planRevision:0,dayNumber:1,dueAt:at(-98),responsibility:'self',reason:'已填的历史原因',changedByLabel:'虚构员工'});
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  await context.addCookies(cookie.split('; ').map(pair=>({name:pair.slice(0,pair.indexOf('=')),value:pair.slice(pair.indexOf('=')+1),url:baseURL})));
  const page=await context.newPage();page.on('pageerror',(error:Error)=>errors.push(error.message));
  await page.goto(baseURL+`/business/operations-schedule?row=${long.id}`);
  const inspector=page.locator('[data-inspector]'),body=inspector.locator(':scope>[data-inspector-body]');
  await page.locator('[data-schedule-workflow][data-ready=true]').waitFor();
  assert.match(await inspector.locator('[data-inspector-completion]').innerText(),/尚未登记/);
  assert.equal(await page.locator('[data-schedule-workflow-history]>details').first().evaluate((node:HTMLDetailsElement)=>node.open),false,'已填历史默认折叠');
  const pending=page.locator('.workflow-pending-reasons>.workflow-reason');assert.equal(await pending.count(),4);
  assert.deepEqual(await pending.evaluateAll((nodes:HTMLDetailsElement[])=>nodes.map(node=>node.open)),[true,false,false,false]);
  await page.screenshot({path:`.tools/test-artifacts/registration-overview-${width}.png`});
  assert.match(await inspector.locator(':scope>header').innerText(),new RegExp(`虚构长详情 ${width}`),'滚动时保留当前帖子的身份');
  assert.equal(((await inspector.innerText()).match(/尚未登记/g)??[]).length,1,'面板不重复堆叠登记状态');
  const first=pending.first(),last=pending.last();await first.locator('input[type=radio][value=self]').check();await first.locator('textarea').fill('第一条实际原因');
  await last.locator('summary').click();await last.locator('input[type=radio][value=external]').check();await last.locator('textarea').fill('另一日未保存输入');
  const key=await last.getAttribute('data-delay-key');await first.locator('button[type=submit]').click();
  await page.locator('[data-schedule-workflow-history]').getByText('自身原因：第一条实际原因',{exact:true}).waitFor({state:'attached'});
  assert.equal(await page.locator(`[data-delay-key="${key}"] textarea`).inputValue(),'另一日未保存输入','保存另一日不会丢失其他草稿');
  assert.equal(await inspector.getAttribute('data-dirty'),'true');
  const geometry=()=>inspector.evaluate((node:HTMLElement)=>({header:node.querySelector(':scope>header')!.getBoundingClientRect().toJSON(),footer:node.querySelector(':scope>footer')!.getBoundingClientRect().toJSON()}));
  const before=await geometry();assert.ok(before.footer.bottom<=900&&before.header.top>=0,'头部与操作区始终在视口内');await body.evaluate((node:HTMLElement)=>node.scrollTop=node.scrollHeight);assert.deepEqual(await geometry(),before,'正文滚动不移动头尾');
  const scrolls=await inspector.evaluate((node:HTMLElement)=>[node,...node.querySelectorAll<HTMLElement>('*')].filter(item=>['auto','scroll'].includes(getComputedStyle(item).overflowY)&&item.scrollHeight>item.clientHeight+1&&item.tagName!=='TEXTAREA').map(item=>item.hasAttribute('data-inspector-body')?'body':item.className));
  assert.deepEqual(scrolls,['body'],'详情只有一条正文滚动轨道');
  const scrollY=await page.evaluate(()=>window.scrollY);const rect=await body.boundingBox();await page.mouse.move(rect!.x+rect!.width/2,rect!.y+rect!.height/2);await page.mouse.wheel(0,1000);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.scrollY),scrollY,'滚到底不带动背景');
  if(width<900)assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).overflowY),'hidden');
  const controls=await inspector.locator('.business-inspector-actions button').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>({size:getComputedStyle(node).fontSize,height:node.getBoundingClientRect().height,font:getComputedStyle(node).fontFamily})));assert.ok(controls.every((item:any)=>item.size==='14px'&&item.height===40&&item.font.includes('system-ui')),JSON.stringify(controls));
  await page.screenshot({path:`.tools/test-artifacts/registration-inspector-${width}.png`});
  {const answered=respondToBusinessConfirm(page);await page.keyboard.press('Escape');await answered;}assert.equal(await inspector.isVisible(),true,'未保存关闭保护保留');
  {const answered=respondToBusinessConfirm(page,true);await page.keyboard.press('Escape');await answered;}await inspector.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.scrollY),scrollY);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).overflowY),'visible');
  await context.close();
 }
 // 超时改期与名称修改必须整笔待审核，原记录保持不变。
 const sheetRace=await seed('虚构门槛后改期',-3);
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});await context.addCookies(cookie.split('; ').map(pair=>({name:pair.slice(0,pair.indexOf('=')),value:pair.slice(pair.indexOf('=')+1),url:baseURL})));
 const page=await context.newPage();page.on('pageerror',(error:Error)=>errors.push(error.message));await page.goto(baseURL+`/business/operations-schedule?row=${sheetRace.id}`);await page.locator('[data-inspector-edit]').click();
 await fillBusinessDateTime(page,'plannedPublishAt',inputTime(at(36)));await page.locator('[name=planChangeReason]').fill('超时后需求调整');await page.locator('#contentName').fill('虚构改期同时更新名称');
 const applied=page.waitForResponse((response:any)=>response.url().endsWith(`/api/operations-content/${sheetRace.id}`)&&response.request().method()==='PATCH');await page.locator('#schedule-form button[type=submit]').click();assert.equal((await applied).status(),202);await page.waitForLoadState('networkidle');
 const w=await (await call(`/api/operations-content/${sheetRace.id}/workflow`)).json();assert.equal(w.schedule.plannedPublishAt,at(-3).toISOString());
 const version=(await db.select().from(schema.operationsContentVersion).where(eq(schema.operationsContentVersion.id,sheetRace.contentVersionId)))[0];assert.equal(version.contentName,'虚构门槛后改期');await context.close();
 assert.deepEqual(errors,[]);console.log('通过：2小时催登记与审批边界、历史口径、待办/历史分层、长详情单滚动、头尾稳定、草稿保护及桌面/手机。');
}catch(error){console.error(fixture.logs());throw error;}finally{await browser?.close();await fixture.stop();}
