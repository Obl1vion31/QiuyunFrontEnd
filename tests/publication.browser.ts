/** 发布登记、历史空值与月历交互；业务写入仅使用隔离数据库。 */
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startFixture,admin,employee} from './auth.fixture';
import * as schema from '../src/db/schema';
const fixture=await startFixture(),{db,baseURL}=fixture;let browser:any;
const time=(date:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date).replace(' ','T');
const now=new Date(Math.floor(Date.now()/60000)*60000),future=time(new Date(now.getTime()+3*3600000)),month=time(now).slice(0,7);
const link='https://xhslink.cn/o/4KuczULK8Ja',share=`2026TMUA超完整超全解析来啦！！🤩 所有时区的考试全... ${link} 快戳【小红书】瞧瞧这篇笔记！`;
const form=(input:Record<string,string>)=>{const data=new FormData();for(const [key,value]of Object.entries(input))data.set(key,value);return data;};
async function login(account:typeof admin|typeof employee){const r=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(account)});assert.equal(r.status,200);return r.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')}
async function call(path:string,method:string,cookie:string,input?:Record<string,string>,expected=200){const r=await fetch(baseURL+path,{method,headers:{Origin:baseURL,Cookie:cookie,Accept:'application/json'},body:input?form(input):undefined});const data=await r.json();assert.equal(r.status,expected,`${path}: ${JSON.stringify(data)}`);return data;}
try{
 const staff=await login(employee),boss=await login(admin);
 async function create(name:string){return (await call('/api/operations-content','POST',staff,{contentName:name,subjectId:'tmua',categoryId:'temporary',plannedPublishAt:future,projectDocUrl:'',promotionStatus:'none'},201)).id as string;}
 const cases:Array<{id:string;state:string;promoted:boolean;name:string}>=[];
 for(const promoted of [false,true])for(const state of ['on_time','delayed','pending']){
  const planned=new Date(`${month}-${String(cases.length<3?5:5+cases.length).padStart(2,'0')}T10:00:00+08:00`);
  const name=cases.length===0?'虚构短标题':`虚构月历 ${promoted?'推广':'非推广'} ${state} `+'用于检查长名称单行省略和详情全文保留'.repeat(4);
  const [content]=await db.insert(schema.operationsContent).values({}).returning();
  const [version]=await db.insert(schema.operationsContentVersion).values({contentId:content.id,versionNumber:0,workType:'new',contentName:name,subjectId:'tmua',categoryId:'temporary',projectDocUrl:'https://fictional.example.test/doc'}).returning();
  const [schedule]=await db.insert(schema.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:planned,actualPublishAt:state==='pending'?null:new Date(planned.getTime()+(state==='delayed'?9:1)*3600000),completionStatus:state,isPromoted:promoted,promotionStatus:promoted?(state==='pending'?'pending':'awaiting_promotion'):'none'}).returning();
  cases.push({id:schedule.id,state,promoted,name});
 }
 const id=await create('虚构未来发布'),endpoint=`/api/operations-content/${id}`;
 const sent={actualPublishAt:future,publicationUrl:share,projectDocUrl:'https://fictional.example.test/project',expectedPlanRevision:'0',expectedPublicationRevision:'0'};
 await call(endpoint+'/publication','PATCH',staff,{...sent,publicationUrl:''},422);
 await call(endpoint+'/publication','PATCH',staff,{...sent,publicationUrl:'https://xhslink.cn.evil.test/o/abc'},422);
 await call(endpoint+'/workflow?actual='+encodeURIComponent(future),'GET',staff);
 await call(endpoint+'/publication','PATCH',staff,sent);
 let w=await call(endpoint+'/workflow','GET',staff);assert.equal(w.publicationState,'published');assert.equal(w.schedule.publicationUrl,link);assert.equal(w.schedule.actualPublishAt,new Date(future+':00+08:00').toISOString());assert.equal(w.publicationReservations.length,0);
 await call(endpoint+'/publication','PATCH',staff,{...sent,expectedPublicationRevision:'1',actualPublishAt:time(new Date(now.getTime()+7200000)),correctionReason:'员工回改'},403);
 const races=await Promise.all(['abc','def'].map(key=>fetch(baseURL+endpoint+'/publication',{method:'PATCH',headers:{Origin:baseURL,Cookie:staff},body:form({...sent,expectedPublicationRevision:'1',publicationUrl:'https://xhslink.com/o/'+key})})));
 assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);
 for(const cookie of [staff,boss]){
  await call(endpoint+'/publication-reservations','POST',cookie,{},410);
  await call(endpoint+'/publication-reservations/00000000-0000-0000-0000-000000000000','PATCH',cookie,{action:'approve'},410);
 }
 const notices=await call('/api/business-notifications','GET',staff);assert.equal(notices.reservationApprovals,0);assert.equal(notices.publicationDue,0);
 assert.equal((await fetch(baseURL+endpoint+'/publication',{method:'PATCH',headers:{Origin:baseURL}})).status,401);
 assert.equal((await fetch(baseURL+endpoint+'/publication',{method:'PATCH',headers:{Cookie:staff,Origin:'https://foreign.example.test'}})).status,403);
 const playwright=await import(process.env.PLAYWRIGHT_MODULE||new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);browser=await playwright.chromium.launch({headless:true});await mkdir('.tools/test-artifacts',{recursive:true});
 const errors:string[]=[];
 async function pageFor(cookie:string,width:number){const context=await browser.newContext({viewport:{width,height:1000},locale:'zh-CN',reducedMotion:'reduce'});await context.addCookies(cookie.split('; ').map(pair=>({name:pair.slice(0,pair.indexOf('=')),value:pair.slice(pair.indexOf('=')+1),url:baseURL})));const page=await context.newPage();page.on('pageerror',(error:Error)=>errors.push(error.message));return {context,page};}
 for(const width of [1440,390,320]){
  const {context,page}=await pageFor(staff,width);
  await page.goto(baseURL+'/business/operations-schedule');await page.locator('.calendar').waitFor();assert.equal(await page.locator('table').count(),0);assert.equal(await page.locator('#publicationMode').count(),0);
  assert.equal(await page.getByText('预约待审',{exact:true}).count(),0);assert.equal(await page.getByText('到点待确认',{exact:true}).count(),0);
  for(const item of cases){
   const row=page.locator(`[data-inspect-id="${item.id}"]`);assert.match(await row.getAttribute('class'),new RegExp('publish-'+item.state));assert.equal(await row.locator('.promotion-identity').innerText(),item.promoted?'推广':'非推广');
   assert.ok((await row.getAttribute('aria-label')).includes(item.name));assert.ok((await row.getAttribute('title')).includes(item.name));
   assert.equal(await row.locator('small').count(),0);assert.equal(await row.locator(':scope > span').count(),2);
   const box=await row.locator('.calendar-item-name').evaluate((node:HTMLElement)=>({height:node.getBoundingClientRect().height,lineHeight:parseFloat(getComputedStyle(node).lineHeight),clipped:node.scrollWidth>node.clientWidth,ellipsis:getComputedStyle(node).textOverflow}));
   assert.ok(box.height<=box.lineHeight+1,'标题保持单行');if(item.name.length>30){assert.equal(box.clipped,true);assert.equal(box.ellipsis,'ellipsis');}
   assert.ok((await row.boundingBox()).height<=60,'两行卡片保持紧凑');
  }
  assert.equal(await page.locator(`[data-calendar-day="${month}-05"] .calendar-item`).count(),3);
  const colors=await page.locator('.calendar-item').evaluateAll((rows:HTMLElement[])=>Object.fromEntries(['on_time','delayed','pending'].map(key=>[key,getComputedStyle(rows.find(row=>row.classList.contains('publish-'+key))!).backgroundColor])));
  assert.equal(new Set(Object.values(colors)).size,3);await page.screenshot({path:`.tools/test-artifacts/compact-calendar-${width}.png`,fullPage:true});
  if(width===1440){await page.locator(`[data-calendar-new="${month}-19"]`).focus();await page.keyboard.press('Enter');await page.locator('#schedule-dialog[open]').waitFor();assert.equal(await page.locator('#plannedPublishDate').inputValue(),month+'-19');await page.locator('[data-close]').first().click();}
  const blank=page.locator(`[data-calendar-day="${month}-01"]`);await blank.click({position:{x:6,y:6}});await page.locator('#schedule-dialog[open]').waitFor();assert.equal(await page.locator('#plannedPublishDate').inputValue(),month+'-01');await page.locator('[data-close]').first().click();
  await page.locator('[data-calendar-new]').filter({hasText:'20'}).click();await page.locator('#schedule-dialog[open]').waitFor();assert.equal(await page.locator('#plannedPublishDate').inputValue(),month+'-20');assert.equal(await page.locator('#plannedPublishTime').inputValue(),'');
  await page.locator('#contentName').fill(`虚构日历新建 ${width}`);await page.locator('#subjectId').selectOption('tmua');await page.locator('#categoryId').selectOption('temporary');await page.locator('#plannedPublishTime').fill('12:00');
  const reloaded=page.waitForEvent('framenavigated',(frame:any)=>frame===page.mainFrame());
  const created=page.waitForResponse((r:any)=>r.url().endsWith('/api/operations-content')&&r.request().method()==='POST');await page.locator('#schedule-form button[type=submit]').click();assert.equal((await created).status(),201);await reloaded;await page.waitForLoadState('networkidle');
  const [createdRow]=await db.select({id:schema.operationsContentSchedule.id}).from(schema.operationsContentSchedule).innerJoin(schema.operationsContentVersion,eq(schema.operationsContentVersion.id,schema.operationsContentSchedule.contentVersionId)).where(eq(schema.operationsContentVersion.contentName,`虚构日历新建 ${width}`));const createdId=createdRow.id;
  const fresh=await call(`/api/operations-content/${createdId}/workflow`,'GET',staff);assert.equal(fresh.schedule.plannedPublishAt,new Date(month+'-20T12:00:00+08:00').toISOString());
  // 点击已有条目只打开详情；旧帖子链接区域和表单留空。
  assert.equal(await page.locator('#schedule-dialog').evaluate((node:HTMLDialogElement)=>node.open),false,'新建保存后对话框已关闭');
  await page.locator(`[data-inspect-id="${cases[0].id}"]`).click();await page.locator('[data-inspector].is-open').waitFor();assert.equal(await page.locator('#schedule-dialog').evaluate((node:HTMLDialogElement)=>node.open),false);
  assert.equal(await page.locator('[data-inspector-name]').innerText(),cases[0].name);
  assert.equal(await page.locator('.calendar-item-name').evaluateAll((nodes:HTMLElement[])=>nodes.every(node=>node.getBoundingClientRect().height<=parseFloat(getComputedStyle(node).lineHeight)+1)),true,'详情打开后标题仍单行');
  assert.equal(await page.locator('[data-inspector-post]').innerText(),'');assert.equal(await page.locator('[data-inspector-post]').getAttribute('href'),null);
  const sheetGeometry=(selector:string)=>page.locator(selector).evaluate((node:HTMLElement)=>{
   const header=node.querySelector('.dialog-head')!,body=node.querySelector('.sheet-body')!,footer=node.querySelector('.dialog-actions')!;
   const rects=[node,header,footer].map(element=>{const rect=element.getBoundingClientRect();return [rect.x,rect.y,rect.width,rect.height]});
   return {rects,color:getComputedStyle(header).backgroundColor,scrolling:getComputedStyle(body).overflowY};
  });
  await page.locator('[data-inspector-edit]').click();await page.locator('#schedule-dialog[open]').waitFor();
  const editGeometry=await sheetGeometry('#schedule-dialog');assert.equal(editGeometry.scrolling,'auto');assert.equal(editGeometry.color,'rgba(16, 36, 62, 0.94)');
  const fieldBoxes=await page.locator('#schedule-dialog').evaluate((node:HTMLElement)=>Object.fromEntries(['contentName','subjectId','categoryId','plannedPublishDate','plannedPublishTime','projectDocUrl'].map(id=>{const input=node.querySelector('#'+id)!;const rect=input.getBoundingClientRect();return [id,{x:rect.x,y:rect.y,width:rect.width,height:rect.height}]})));
  assert.equal(fieldBoxes.contentName.width,fieldBoxes.projectDocUrl.width);
  assert.equal(fieldBoxes.subjectId.y,fieldBoxes.categoryId.y);assert.equal(fieldBoxes.subjectId.width,fieldBoxes.categoryId.width);
  assert.equal(fieldBoxes.plannedPublishDate.y,fieldBoxes.plannedPublishTime.y);assert.equal(fieldBoxes.plannedPublishDate.width,fieldBoxes.plannedPublishTime.width);
  assert.ok(fieldBoxes.plannedPublishDate.y>fieldBoxes.subjectId.y);assert.ok(fieldBoxes.projectDocUrl.y>fieldBoxes.plannedPublishDate.y);
  assert.ok(Object.values(fieldBoxes).every((box:any)=>box.height===40),'表单输入规格一致 '+JSON.stringify(fieldBoxes));
  assert.equal(await page.locator('#schedule-dialog [role=group] input[type=checkbox]').count(),2);
  await page.locator('#schedule-dialog .sheet-body').evaluate((node:HTMLElement)=>{node.scrollTop=node.scrollHeight;});
  assert.deepEqual((await sheetGeometry('#schedule-dialog')).rects,editGeometry.rects,'编辑表单滚动不移动头部或操作区');
  await page.screenshot({path:`.tools/test-artifacts/control-sheet-edit-${width}.png`});
  await page.locator('[data-close]').first().click();
  await page.locator('[data-inspector-publication]').click();await page.locator('#publication-dialog[open]').waitFor();assert.equal(await page.locator('#publicationUrl').inputValue(),'');assert.equal(await page.locator('#publicationUrl').getAttribute('required'),null);assert.equal(await page.locator('#publicationActualPublishAt').isDisabled(),true);
  assert.deepEqual(await sheetGeometry('#publication-dialog'),editGeometry,'编辑排期与发布登记共用抽屉、头部和底部几何');
  await page.locator('#publicationUrl').evaluate((node:HTMLElement)=>{node.style.minHeight='1100px';});await page.locator('#publication-dialog .sheet-body').evaluate((node:HTMLElement)=>{node.scrollTop=node.scrollHeight;});
  assert.deepEqual(await sheetGeometry('#publication-dialog'),editGeometry,'长表单操作区始终固定在底部');await page.locator('#publicationUrl').evaluate((node:HTMLElement)=>node.style.minHeight='');
  await page.screenshot({path:`.tools/test-artifacts/control-sheet-publication-${width}.png`});
  assert.doesNotMatch(await page.locator('#publication-dialog').innerText(),/初始化|豁免|补链|缺少链接/);await page.locator('[data-close-publication]').first().click();await page.keyboard.press('Escape');
  // 月历筛选保持月历并真正筛选；台账和月份切换仍可用。
  await page.locator('[aria-label="排期状态视角"] a').filter({hasText:'已发布'}).click();await page.waitForURL(/status=published/);await page.waitForFunction(()=>!document.querySelector('.calendar-item.publish-pending'));assert.equal(await page.locator('.calendar').count(),1);assert.equal(await page.locator('.calendar-item.publish-pending').count(),0);
  await page.locator('[aria-label="排期状态视角"] a').filter({hasText:'待发布'}).click();await page.waitForURL(/status=pending/);await page.waitForFunction(()=>!document.querySelector('.calendar-item.publish-on_time,.calendar-item.publish-delayed'));assert.equal(await page.locator('.calendar-item.publish-on_time,.calendar-item.publish-delayed').count(),0);
  await page.goto(baseURL+'/business/operations-schedule?display=ledger');assert.equal(await page.locator('table').count(),1);
  const newId=await create(`虚构分享登记 ${width}`);await page.goto(baseURL+`/business/operations-schedule?row=${newId}`);await page.locator('[data-inspector-publication]').click();await page.locator('#publicationActualPublishAt').fill(future);await page.locator('#publicationUrl').fill(share);await page.locator('#publicationProjectDocUrl').fill('https://fictional.example.test/project');await page.locator('[data-publication-link-preview]').getByText('已识别：'+link).waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-publication-delay-days]')?.getAttribute('data-ready')==='true');
  page.once('dialog',(dialog:any)=>dialog.dismiss());await page.keyboard.press('Escape');assert.equal(await page.locator('#publication-dialog').evaluate((node:HTMLDialogElement)=>node.open),true);
  await page.route(`**/api/operations-content/${newId}/publication`,(route:any)=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'虚构连接失败'})}));await page.locator('#publication-form button[type=submit]').click();await page.locator('[data-publication-message]').getByText('虚构连接失败').waitFor();assert.equal(await page.locator('#publicationUrl').inputValue(),share);assert.equal(await page.locator('#publicationActualPublishAt').inputValue(),future);await page.unroute(`**/api/operations-content/${newId}/publication`);
  await page.screenshot({path:`.tools/test-artifacts/unified-publication-${width}.png`});
  const saved=page.waitForResponse((r:any)=>r.url().endsWith(`/api/operations-content/${newId}/publication`)&&r.request().method()==='PATCH');await page.locator('#publication-form button[type=submit]').click();assert.equal((await saved).status(),200);await page.waitForLoadState('networkidle');
  w=await call(`/api/operations-content/${newId}/workflow`,'GET',staff);assert.equal(w.schedule.publicationUrl,link);assert.equal(w.publicationState,'published');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.goto(baseURL+`/business/operations-schedule?row=${cases[3].id}`);await page.locator('[data-inspector-edit]').click();await page.locator('#schedule-dialog[open]').waitFor();
  assert.equal(await page.locator('#schedule-form [name=isPromoted]').isChecked(),true);assert.equal(await page.locator('[data-promotion-preview]').isVisible(),true,'独立的当前推广阶段仍然可见');
  await page.locator('[data-close]').first().click();
  await context.close();
 }
 const {context:adminContext,page:adminPage}=await pageFor(boss,1440);
 await adminPage.goto(baseURL+`/business/operations-schedule?row=${id}`);await adminPage.locator('[data-inspector-publication]').click();assert.equal(await adminPage.locator('#publicationActualPublishAt').isDisabled(),true);
 await adminPage.locator('[name=correctTime]').check();assert.equal(await adminPage.locator('#publicationActualPublishAt').isDisabled(),false);await adminPage.locator('#publicationActualPublishAt').fill(time(new Date(now.getTime()+7200000)));await adminPage.locator('#publicationCorrectionReason').fill('核对平台后更正发布时间');
 await adminPage.waitForFunction(()=>document.querySelector('[data-publication-delay-days]')?.getAttribute('data-ready')==='true');
 const corrected=adminPage.waitForResponse((r:any)=>r.url().endsWith(endpoint+'/publication')&&r.request().method()==='PATCH');await adminPage.locator('#publication-form button[type=submit]').click();assert.equal((await corrected).status(),200);
 w=await call(endpoint+'/workflow','GET',staff);assert.equal(w.publicationHistory[0].reason,'核对平台后更正发布时间');await adminContext.close();
 assert.deepEqual(errors,[]);console.log('通过：统一未来发布、完整分享文案、旧链接留空、旧预约停用、权限及并发与管理员更正；1440／390／320px 默认月历、双色状态、筛选、日期新建、未保存与失败保护。');
}catch(error){console.error(fixture.logs().slice(-4000));throw error}finally{await browser?.close();await fixture.stop()}
