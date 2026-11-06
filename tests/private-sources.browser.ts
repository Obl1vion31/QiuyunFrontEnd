import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {admin,employee} from './auth.fixture';
import {settleBusinessUI,respondToBusinessConfirm} from './business-confirm.helper';
import {seedPrivateSources,seedFrozenPrivateMeeting,octoberData} from './private-sources.fixture';
import * as s from '../src/db/schema';

const dir=process.env.PRIVATE_SOURCE_EVIDENCE_DIR??'.tools/test-artifacts/private-sources';
await mkdir(dir+'/screenshots',{recursive:true});await mkdir(dir+'/videos',{recursive:true});await mkdir(dir+'/pdf',{recursive:true});
const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-06T12:00:00+08:00');
const fixture=await startPostgresFixture({clockFile,entry:process.env.PRIVATE_SOURCE_ENTRY}),{db,baseURL}=fixture;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'/home/obl1vion/projects/qiuyunFrontend/.tools/tooling/node_modules/playwright/index.mjs');
let browser:any,context:any,page:any,cookie='';const checks:string[]=[],images:any[]=[],errors:string[]=[],chapters:any[]=[];let started=0;
const mark=(name:string)=>{checks.push(name);console.log('PASS '+name);};
async function login(actor:{username:string;password:string}=admin){const response=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(actor)});assert.equal(response.status,200);return response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');}
async function api(path:string,body?:unknown,expected=200,method='PATCH',actorCookie=cookie){const response=await fetch(baseURL+path,{method:body===undefined?'GET':method,headers:{Cookie:actorCookie,Origin:baseURL,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});const value=await response.json();assert.equal(response.status,expected,JSON.stringify({path,value}));return value;}
async function go(path:string){await page.goto(baseURL+path);await settleBusinessUI(page);for(const summary of await page.locator('.ps-disclosure>summary').all())await summary.click();}
async function screen(name:string,locator?:any,fullPage=true){
 await page.mouse.move(0,0);await settleBusinessUI(page);
 if(fullPage){
  // Enter display sections through real scrolling before stable evidence capture.
  for(const section of await page.locator('[data-chart-pending]').elementHandles()){await section.scrollIntoViewIfNeeded();await settleBusinessUI(page);}
  await page.evaluate(()=>scrollTo(0,0));await settleBusinessUI(page);
 }
 const path=`${dir}/screenshots/${name}.png`;
 const crop=locator?await locator.boundingBox():null;
 if(crop)await page.screenshot({path:path.replace('.png','-full.png'),fullPage:true});
 else await page.screenshot({path,fullPage});
 const geometry=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,font:getComputedStyle(document.querySelector('[data-private-panel]')??document.body).fontFamily}));
 assert(geometry.scrollWidth<=geometry.width+1,JSON.stringify({name,geometry}));images.push({name,path,...geometry,crop});
}
async function saveData(data:any,month='2026-10',actorCookie=cookie){return api('/api/monthly-private-data',{month,expectedRevision:-1,data},200,'PATCH',actorCookie);}
try{
 await seedPrivateSources(db);cookie=await login();const staff=await login(employee);
 const october=await seedFrozenPrivateMeeting(db,'2026-10','10月月例会 · 来源与成本');
 const legacy=await seedFrozenPrivateMeeting(db,'2026-07','7月月例会 · 原口径归档',true);
 const long=await seedFrozenPrivateMeeting(db,'2026-06','6月月例会 · 长金额核对');
 const frozenSnapshot=structuredClone(october.snapshot);
 await db.update(s.operationsMonthlyPlan).set({sealedVersionId:null,arrangementStatus:'editing'}).where(eq(s.operationsMonthlyPlan.id,october.plan.id));
 const base=await api('/api/monthly-operations?month=2026-08');assert.deepEqual(base.privateData.data.total,{added:4,consulted:4,converted:2});assert.deepEqual(base.privateData.totalCosts,{added:4750,consulted:4750,converted:9500});mark('19000元及4/4/2人次按总分子分母计算；159名自然来源不混入');
 const baseline=await api('/api/monthly-operations?month=2026-10');
 const naturalChange=structuredClone(octoberData);naturalChange.nonPromotion[1].added=999;await saveData(naturalChange);const after=await api('/api/monthly-operations?month=2026-10');assert.deepEqual(after.privateData.totalCosts,baseline.privateData.totalCosts);await saveData(octoberData);mark('更正自然来源人数不会改变推广成本');
 await api('/api/monthly-private-data',{month:'2026-10',expectedRevision:0,data:{total:{added:0,consulted:0,converted:0},rows:[],note:''}},409);mark('旧格式写入被拒绝，来源结构不被覆盖');
 await api('/api/monthly-private-data',{month:'2026-10',expectedRevision:0,data:{...octoberData,promotion:[...octoberData.promotion,octoberData.promotion[0]]}},422);
 await saveData(octoberData,'2026-10',staff);mark('员工可维护人数；重复推广行被拒绝');
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:dir+'/videos',size:{width:1440,height:1000}}});
 await context.addCookies(cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:baseURL};}));
 page=await context.newPage();page.on('pageerror',(error:any)=>errors.push(error.message));started=Date.now();
 const paintContext=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:dir+'/first-paint',size:{width:1440,height:1000}}});
 await paintContext.addCookies(cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:baseURL};}));
 const paintPage=await paintContext.newPage();const paintEvents:any[]=[];
 await paintPage.route(/\.(woff2?|ttf)(\?|$)/,async(route:any)=>{await new Promise(resolve=>setTimeout(resolve,1200));await route.continue();});
 const paintStart=Date.now();await paintPage.goto(baseURL+'/business/monthly-operations?month=2026-10',{waitUntil:'domcontentloaded'});paintEvents.push({state:'直接进入/冷字体',at:Date.now()-paintStart,fontStatus:await paintPage.evaluate(()=>document.fonts.status)});await settleBusinessUI(paintPage);await paintPage.screenshot({path:dir+'/screenshots/first-paint-cold-1440.png'});
 await paintPage.unroute(/\.(woff2?|ttf)(\?|$)/);const cdp=await paintContext.newCDPSession(paintPage);await Promise.all([paintPage.waitForNavigation({waitUntil:'domcontentloaded'}),cdp.send('Page.reload',{ignoreCache:true})]);paintEvents.push({state:'硬刷新/暖缓存',at:Date.now()-paintStart});await settleBusinessUI(paintPage);
 await paintPage.getByRole('link',{name:'排期管理',exact:true}).first().click();await paintPage.waitForURL('**/business/operations-schedule**');await paintPage.getByRole('link',{name:'月度运营',exact:true}).first().click();await paintPage.waitForURL('**/business/monthly-operations**');await settleBusinessUI(paintPage);paintEvents.push({state:'站内导航',at:Date.now()-paintStart});
 await paintPage.route('**/api/monthly-operations?*',async(route:any)=>{await new Promise(resolve=>setTimeout(resolve,1200));await route.continue();});const nextMonth=(await paintPage.locator('input[name="month"]').inputValue())==='2026-10'?'2026-11':'2026-10';const slowResponse=paintPage.waitForResponse('**/api/monthly-operations?*');await paintPage.locator('input[name="month"]').fill(nextMonth);await paintPage.waitForTimeout(600);await paintPage.screenshot({path:dir+'/screenshots/first-paint-slow-data-1440.png'});await slowResponse;await settleBusinessUI(paintPage);await paintPage.screenshot({path:dir+'/screenshots/first-paint-final-1440.png'});paintEvents.push({state:'慢数据切月完成',at:Date.now()-paintStart});
 await paintPage.emulateMedia({reducedMotion:'reduce'});await paintPage.reload();await settleBusinessUI(paintPage);await paintPage.getByRole('button',{name:'录入／更正',exact:true}).click();await settleBusinessUI(paintPage);await paintPage.keyboard.press('Escape');await paintPage.locator('#monthly-private-sheet').waitFor({state:'hidden'});await paintContext.close();await writeFile(dir+'/first-paint.json',JSON.stringify(paintEvents,null,2));mark('首屏单独录制冷字体进入、暖刷新、站内导航及慢数据；减少动态效果保持操作');

 for(const width of [1920,1440,1024]){
  await page.setViewportSize({width,height:1000});await go('/business/monthly-operations?month=2026-10');
  assert.equal(await page.locator('[data-source-key="tmua:course"]').count(),1);assert.match(await page.locator('[aria-label="非推广来源人数明细"]').innerText(),/159/);
  await screen('monthly-complete-'+width);await screen('monthly-private-'+width,page.locator('[data-private-panel]'));
  await page.getByRole('button',{name:'录入／更正',exact:true}).click();await settleBusinessUI(page);await screen('editor-promotion-'+width,undefined,false);
  await page.locator('[aria-label="非推广来源录入"]').scrollIntoViewIfNeeded();await screen('editor-organic-'+width,undefined,false);
  await page.locator('#monthly-private-sheet').getByRole('button',{name:'关闭',exact:true}).click();await page.locator('#monthly-private-sheet').waitFor({state:'hidden'});
  await go('/business/meeting-review?meeting='+october.meeting.id);await screen('meeting-current-'+width);await screen('meeting-core-'+width,page.locator('.monthly-core').first());await screen('meeting-sources-'+width,page.locator('.monthly-core .private-source-results'));
 }
 mark('1920/1440/1024月度运营、月会及两组录入实际渲染，无页面级溢出');
 await page.setViewportSize({width:1440,height:1000});await go('/business/monthly-operations?month=2026-10');
 chapters.push({name:'录入、未保存保护、保存失败与重试',startMs:Date.now()-started});
 await page.getByRole('button',{name:'录入／更正',exact:true}).click();const field=page.getByRole('spinbutton',{name:'TMUA·课程私域增加人数',exact:true});await field.fill('4');
 const cancel=respondToBusinessConfirm(page,false);await page.locator('#monthly-private-sheet').getByRole('button',{name:'关闭',exact:true}).click();await cancel;assert.equal(await field.inputValue(),'4');await screen('editor-unsaved-preserved-1440',undefined,false);
 await page.route('**/api/monthly-private-data',async(route:any)=>{if(route.request().method()==='PATCH')await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'保存服务暂时不可用，请重试。'})});else await route.continue();});
 await page.locator('#monthly-private-sheet').getByRole('button',{name:'保存',exact:true}).click();await page.getByRole('status').filter({hasText:'保存服务暂时不可用'}).waitFor();assert.equal(await field.inputValue(),'4');await screen('editor-save-failed-1440',undefined,false);await page.unroute('**/api/monthly-private-data');
 await page.locator('#monthly-private-sheet').getByRole('button',{name:'保存',exact:true}).click();await page.locator('#monthly-private-sheet').waitFor({state:'hidden'});assert.equal((await api('/api/monthly-operations?month=2026-10')).privateData.sourceData.promotion.find((row:any)=>row.subjectId==='tmua'&&row.demand==='course').added,4);
 await screen('monthly-after-save-1440',page.locator('[data-private-panel]'));mark('未保存取消保留输入；503失败可见且可重试；保存回显读取实际接口');
 const saveOpener=page.getByRole('button',{name:'录入／更正',exact:true});await saveOpener.focus();await page.keyboard.press('Enter');await page.locator('#monthly-private-sheet').waitFor({state:'visible'});await settleBusinessUI(page);
 assert(await page.evaluate(()=>!!document.activeElement?.closest('#monthly-private-sheet')));
 await page.keyboard.press('Tab');assert(await page.evaluate(()=>!!document.activeElement?.closest('#monthly-private-sheet')));
 await page.keyboard.press('Escape');await page.locator('#monthly-private-sheet').waitFor({state:'hidden'});assert(await saveOpener.evaluate((el:any)=>document.activeElement===el));
 await saveOpener.click();await field.fill('5');let sent=false;await page.route('**/api/monthly-private-data',async(route:any)=>{sent=true;await new Promise(resolve=>setTimeout(resolve,700));await route.continue();});
 await page.locator('#monthly-private-sheet').getByRole('button',{name:'保存',exact:true}).click();while(!sent)await page.waitForTimeout(20);await field.fill('6');await page.getByRole('status').filter({hasText:'还有新修改待保存'}).waitFor();assert.equal(await field.inputValue(),'6');await page.unroute('**/api/monthly-private-data');await page.locator('#monthly-private-sheet').getByRole('button',{name:'保存',exact:true}).click();await page.locator('#monthly-private-sheet').waitFor({state:'hidden'});await saveData(octoberData);mark('键盘开关、焦点返回；慢保存期间的新输入不会被成功回显清空');

 await page.getByRole('button',{name:'录入／更正',exact:true}).click();await page.getByRole('button',{name:'添加来源',exact:true}).click();const organicRows=page.locator('.ps-organic-editor');const newest=organicRows.last();await newest.getByRole('textbox').fill('新增来源 · 跨月讲义跟进');await newest.getByRole('spinbutton').nth(0).fill('2');await newest.getByRole('spinbutton').nth(1).fill('1');await newest.getByRole('spinbutton').nth(2).fill('0');await page.locator('#monthly-private-sheet textarea').fill('后续咨询与成交沿原来源登记。');await screen('editor-added-source-1440',undefined,false);
 await page.locator('#monthly-private-sheet').getByRole('button',{name:'保存',exact:true}).click();await page.locator('#monthly-private-sheet').waitFor({state:'hidden'});const saved=(await api('/api/monthly-operations?month=2026-10')).privateData.sourceData;const added=saved.nonPromotion.find((r:any)=>r.source.startsWith('新增来源'));assert(added);assert(await page.locator('.private-source-results .monthly-note').filter({hasText:'后续咨询与成交沿原来源登记。'}).isVisible());await page.getByRole('button',{name:'录入／更正',exact:true}).click();await page.getByRole('textbox',{name:'细分来源 '+added.id,exact:true}).fill('已更正来源 · 跨月讲义跟进');
 const remove=respondToBusinessConfirm(page,true);await page.getByRole('button',{name:'移除来源 已更正来源 · 跨月讲义跟进',exact:true}).click();await remove;await page.locator('#monthly-private-sheet').getByRole('button',{name:'保存',exact:true}).click();await page.locator('#monthly-private-sheet').waitFor({state:'hidden'});assert(!(await api('/api/monthly-operations?month=2026-10')).privateData.sourceData.nonPromotion.some((r:any)=>r.id===added.id));mark('来源添加、更正、移除与保存均走真实表单；稳定身份保留');
 chapters.push({name:'新旧口径与缺值状态',startMs:Date.now()-started});
 await saveData(octoberData);
 for(const [month,state]of [['2026-11','partial'],['2026-07','legacy'],['2026-06','long']] as const){await go('/business/monthly-operations?month='+month);await screen('monthly-'+state+'-1440');await screen('monthly-'+state+'-private-1440',page.locator('[data-private-panel]'));}
 for(const width of [1920,1024]){await page.setViewportSize({width,height:1000});await go('/business/monthly-operations?month=2026-06');await screen('monthly-long-'+width);const cells=await page.locator('.ps-value').evaluateAll((els:HTMLElement[])=>els.map(el=>({text:el.textContent,width:el.clientWidth,scroll:el.scrollWidth})));assert(cells.every((el:any)=>el.scroll<=el.width+1),JSON.stringify(cells));const scroller=page.locator('.ps-table-scroll').first();await scroller.evaluate((el:HTMLElement)=>el.scrollLeft=el.scrollWidth);await scroller.scrollIntoViewIfNeeded();await screen('monthly-long-right-'+width,undefined,false);}
 await page.setViewportSize({width:1440,height:1000});
 const partial=structuredClone(octoberData);partial.promotion[0].consulted=null;partial.promotion[0].converted=0;await saveData(partial);await go('/business/meeting-review?meeting='+october.meeting.id);await screen('meeting-partial-1440');await screen('meeting-partial-core-1440',page.locator('.monthly-core').first());
 await saveData(octoberData);await db.update(s.operationsMonthlyPlan).set({sealedVersionId:october.version.id,arrangementStatus:'confirmed'}).where(eq(s.operationsMonthlyPlan.id,october.plan.id));
 await saveData(partial);await go('/business/meeting-review?meeting='+october.meeting.id);await screen('meeting-sealed-1440');assert.deepEqual((await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,october.version.id)))[0].snapshot,frozenSnapshot);assert.match(await page.locator('.monthly-core').innerText(),/741.67/);await saveData(octoberData);mark('未封存会议读取最新来源；封存后同源补录不改变原快照');
 await go('/business/meeting-review?meeting='+legacy.meeting.id);await screen('meeting-legacy-1440');assert.equal(await page.locator('[data-private-format="sources"]').count(),0);mark('旧口径月会保持原阅读结构，不套用新来源成本');
 await go('/business/meeting-review?meeting='+long.meeting.id);await screen('meeting-long-1440');await page.getByRole('button',{name:'历史月份',exact:true}).click();const history=page.locator('#monthly-history-sheet');await history.locator('input[type="month"]').fill('2026-06');await history.locator('.mc-value').first().filter({hasText:'12,345,678.90'}).waitFor();await screen('meeting-history-long-1440',undefined,false);const overflowing=await history.locator('.mc-value').evaluateAll((els:HTMLElement[])=>els.filter(el=>el.scrollWidth>el.parentElement!.clientWidth+1).map(el=>el.textContent));assert.deepEqual(overflowing,[]);await history.getByRole('button',{name:'关闭历史月份',exact:true}).click();await history.waitFor({state:'hidden'});mark('历史仅保留六项结果和人数，窄抽屉长金额不拆行、不溢出');

 for(const [name,version]of [['meeting-sealed',october.version],['meeting-legacy',legacy.version],['meeting-long',long.version]] as const){const result=await api('/api/meeting-versions/'+version.id+'/pdf',{},200,'POST');assert.equal(result.status,'ready');const pdf=await fetch(baseURL+'/api/meeting-attachments/'+result.id,{headers:{Cookie:cookie}});assert.equal(pdf.status,200);await writeFile(`${dir}/pdf/${name}.pdf`,Buffer.from(await pdf.arrayBuffer()));}
 mark('正式服务端渲染器生成三份月会PDF，未使用页面截图替代');

 const staffContext=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});await staffContext.addCookies(staff.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:baseURL};}));const staffPage=await staffContext.newPage();await staffPage.goto(baseURL+'/business/monthly-operations?month=2026-10');await settleBusinessUI(staffPage);assert.equal(await staffPage.getByRole('button',{name:'费用归属',exact:true}).count(),0);assert.equal(await staffPage.getByRole('button',{name:'录入／更正',exact:true}).count(),1);await staffPage.screenshot({path:dir+'/screenshots/monthly-employee-1440.png',fullPage:true});await staffContext.close();mark('员工与管理员共享结果，费用归属入口仅管理员可见');
 await page.setViewportSize({width:390,height:844});await go('/business/monthly-operations?month=2026-10');await screen('monthly-mobile-390',undefined,false);await page.getByRole('button',{name:'录入／更正',exact:true}).click();await settleBusinessUI(page);await screen('editor-mobile-390',undefined,false);await page.locator('#monthly-private-sheet').getByRole('button',{name:'关闭',exact:true}).click();await page.locator('#monthly-private-sheet').waitFor({state:'hidden'});mark('390px仅核查页面级溢出、抽屉关闭和保存入口，无明显遮挡');
 assert.deepEqual(errors,[]);chapters.push({name:'结束',startMs:Date.now()-started});
 await writeFile(dir+'/checks.json',JSON.stringify({baseURL,fixture:'本机独立PostgreSQL，全部为隔离测试数据',checks,images,chapters,errors,meetings:{current:october.meeting.id,legacy:legacy.meeting.id,long:long.meeting.id}},null,2));
 await context.close();context=null;await browser.close();browser=null;
 console.log('PRIVATE_SOURCES_OK '+checks.length+' '+baseURL);
 if(process.env.PRIVATE_SOURCE_KEEP_SERVER==='1'){console.log('LOCAL_PREVIEW '+baseURL+'/business/monthly-operations?month=2026-10');await new Promise(()=>{});}
}catch(error){await writeFile(dir+'/failure.log',String(error)+'\n'+fixture.logs().slice(-18000));throw error;}
finally{if(context)await context.close();if(browser)await browser.close();await fixture.stop();}
