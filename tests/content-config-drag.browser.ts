import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {admin,employee} from './auth.fixture';
import {seedPrivateSources} from './private-sources.fixture';
import {readMonthlyWorkspace} from '../src/db/monthly-workspace';
import {settleBusinessUI,respondToBusinessConfirm} from './business-confirm.helper';
import * as s from '../src/db/schema';

const dir=process.env.CONFIG_DRAG_DIR??'.tools/test-artifacts/content-config-drag';
for(const sub of ['screenshots','video'])await mkdir(dir+'/'+sub,{recursive:true});
const fixture=await startPostgresFixture({entry:process.env.CONFIG_DRAG_ENTRY}),{db,baseURL}=fixture;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);
let browser:any,page:any;const images:string[]=[],checks:string[]=[],errors:string[]=[],geometry:any[]=[];
function mark(label:string){checks.push(label);console.log('PASS '+label);}
async function api(context:any,data?:any){const response=data?await context.request.patch(baseURL+'/api/business-settings/content-config',{headers:{Origin:baseURL},data}):await context.request.get(baseURL+'/api/business-settings/content-config');assert.equal(response.status(),200,await response.text());return response.json();}
async function current(context:any,id='tmua'){return (await api(context)).configurations.find((c:any)=>c.subjectId===id);}
const list=(kind:string)=>page.locator(`[data-config-list="${kind}"]`);
async function ids(kind:string){return list(kind).locator('tbody [data-config-row]').evaluateAll((els:HTMLElement[])=>els.map(e=>e.dataset.configRow));}
async function shot(name:string,fullPage=false){if(fullPage)await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await settleBusinessUI(page);await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));const path=dir+'/screenshots/'+name+'.png';await page.screenshot({path,fullPage});images.push(path);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' page overflow');}
async function ready(){await page.waitForSelector('astro-island[component-url*="BusinessContentConfiguration"]:not([ssr])');await settleBusinessUI(page);}
async function keyboardStart(kind:string,id:string){const handle=list(kind).locator(`[data-sort-handle="${id}"]`);await handle.focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowDown');return handle;}
async function finishKeyboard(){const saved=page.waitForResponse((r:any)=>r.url().includes('/api/business-settings/content-config')&&r.request().method()==='PATCH');await page.keyboard.press('Space');const r=await saved;await settleBusinessUI(page);return r;}
async function dragStart(kind:string,id:string){const handle=list(kind).locator(`[data-sort-handle="${id}"]`);await handle.scrollIntoViewIfNeeded();await handle.evaluate((el:HTMLElement)=>{const r=el.getBoundingClientRect();if(r.top<100||r.bottom>innerHeight-60)el.scrollIntoView({block:'center',behavior:'instant'});});const box=await handle.boundingBox();assert(box);const x=box.x+box.width/2,y=box.y+box.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+8,{steps:4});await page.locator('.content-config-drag-overlay').waitFor();return {x,y};}
async function drop(){const response=page.waitForResponse((r:any)=>r.url().includes('/api/business-settings/content-config')&&r.request().method()==='PATCH');await page.mouse.up();const r=await response;await settleBusinessUI(page);assert.equal(r.status(),200,await r.text());}

try {
 await seedPrivateSources(db);const before=await readMonthlyWorkspace(db,{month:'2026-10',subject:'',category:''});
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:dir+'/video',size:{width:1440,height:1000}}});
 const signed=await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:admin});assert.equal(signed.status(),200);
 page=await context.newPage();page.on('pageerror',(e:Error)=>errors.push(e.message));
 await page.route('**/fonts/business.js',async(route:any)=>{await new Promise(r=>setTimeout(r,650));await route.continue();});
 await page.goto(baseURL+'/business/settings?view=business');await ready();await page.unroute('**/fonts/business.js');await page.getByLabel('配置学科').selectOption('tmua');
 assert.equal(await list('promotion').locator('thead th').count(),5);assert.equal(await list('non-promotion').locator('thead th').count(),4);
 assert.equal(await list('non-promotion').getByText('待归类',{exact:true}).count(),0);assert.equal(await list('non-promotion').getByText('推广用途',{exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:/^(上移|下移)/}).count(),0);
 for(const width of [1920,1440,1024]){
  await page.setViewportSize({width,height:1000});await shot('admin-'+width+'-types',true);
  geometry.push(await page.evaluate(()=>({width:innerWidth,main:(()=>{const b=document.querySelector('main.business-console-content')!.getBoundingClientRect();return {left:b.left,right:b.right};})(),tables:[...document.querySelectorAll('.content-config-table')].map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right};})})));
 }
 await page.setViewportSize({width:1440,height:1000});
 const first=(await ids('promotion'))[0],second=(await ids('promotion'))[1],originalNon=await ids('non-promotion');
 const baseline=await current(context),oldSecond=await list('promotion').locator(`[data-config-row="${second}"]`).boundingBox();
 await list('promotion').locator(`[data-sort-handle="${first}"]`).click();assert.equal(await page.locator('.content-config-drag-overlay').count(),0);assert.equal((await current(context)).revision,baseline.revision);
 const {x}=await dragStart('promotion',first),target=await list('promotion').locator('tbody [data-config-row]').nth(2).boundingBox();assert(target&&oldSecond);
 await page.mouse.move(x,target.y+target.height/2-16,{steps:18});await page.waitForTimeout(220);
 assert.equal(await list('promotion').locator('.is-placeholder').count(),1);assert.equal(await page.locator('.content-config-drag-overlay').count(),1);
 assert(await page.locator('.content-config-tabs input:disabled').evaluateAll((nodes:HTMLElement[])=>nodes.every(n=>getComputedStyle(n).opacity==='0')),'禁用分段控件不能露出原生圆圈');
 const newSecond=await list('promotion').locator(`[data-config-row="${second}"]`).boundingBox();assert(newSecond!.y<oldSecond.y-20,'相邻行应向上让位');
 const gap=await list('promotion').locator('.is-placeholder').boundingBox();assert(gap&&Math.abs(gap.height-target.height)<2);
 await shot('admin-1440-drag-gap');await drop();
 const reordered=await current(context);assert.equal(reordered.revision,baseline.revision+1);assert.deepEqual(await ids('non-promotion'),originalNon);assert.equal((await ids('promotion'))[2],first);
 assert.deepEqual(reordered.config.types.map((t:any)=>({...t})).sort((a:any,b:any)=>a.id.localeCompare(b.id)),baseline.config.types.map((t:any)=>({...t})).sort((a:any,b:any)=>a.id.localeCompare(b.id)));
 mark('鼠标手柄排序、相邻行让位、占位等高、松手只写一次且另一组及用途原值保持');

 await page.reload();await ready();assert.equal((await ids('promotion'))[2],first);
 const cancelBefore=await current(context),cancelIds=await ids('promotion'),cancelId=cancelIds[0];
 const focus=await keyboardStart('promotion',cancelId);await page.keyboard.press('Escape');assert.deepEqual(await ids('promotion'),cancelIds);assert.equal((await current(context)).revision,cancelBefore.revision);assert(await focus.evaluate((e:HTMLElement)=>e===document.activeElement));
 await keyboardStart('promotion',cancelId);assert.equal((await finishKeyboard()).status(),200);assert.equal((await ids('promotion'))[1],cancelId);assert(await focus.evaluate((e:HTMLElement)=>e===document.activeElement));
 mark('硬刷新首次操作、键盘抓取／移动／保存及Esc取消均保持焦点和业务顺序');

 const nonFirst=(await ids('non-promotion'))[0],drag=await dragStart('non-promotion',nonFirst),startScroll=await page.evaluate(()=>scrollY);
 await page.mouse.move(drag.x,975,{steps:20});await page.waitForTimeout(1600);assert((await page.evaluate(()=>scrollY))>startScroll+50,'拖至底部应自动滚动');
 await shot('admin-1440-drag-autoscroll');await drop();assert.equal((await ids('non-promotion')).at(-1),nonFirst);
 mark('长列表底部自动滚动与组内边界，非推广排序可持久保存');

 await page.evaluate(()=>scrollTo(0,0));await page.getByLabel('推广用途',{exact:true}).check();
 for(const width of [1920,1440,1024]){await page.setViewportSize({width,height:1000});await shot('admin-'+width+'-purposes');}
 await page.setViewportSize({width:1440,height:1000});
 const purposeIds=await ids('purposes');await keyboardStart('purposes',purposeIds[0]);assert.equal((await finishKeyboard()).status(),200);assert.equal((await ids('purposes'))[1],purposeIds[0]);
 await page.route('**/api/business-settings/content-config',async(route:any)=>{if(route.request().method()==='PATCH'){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'连接失败，请重试。'})});await page.unroute('**/api/business-settings/content-config');}else await route.continue();});
 const serverOrder=(await current(context)).config.purposes.map((p:any)=>p.id),failureId=(await ids('purposes'))[0];await keyboardStart('purposes',failureId);assert.equal((await finishKeyboard()).status(),503);
 const failedOrder=await ids('purposes');assert.notDeepEqual(failedOrder,serverOrder);assert.deepEqual((await current(context)).config.purposes.map((p:any)=>p.id),serverOrder);
 await shot('admin-1440-sort-retry');const keep=respondToBusinessConfirm(page,false);await page.locator('.settings-views').getByRole('link',{name:'使用说明',exact:true}).click();await keep;assert(page.url().includes('view=business'));assert.deepEqual(await ids('purposes'),failedOrder);
 const retried=page.waitForResponse((r:any)=>r.url().includes('/api/business-settings/content-config')&&r.request().method()==='PATCH');await page.getByRole('button',{name:'重试保存顺序',exact:true}).click();assert.equal((await retried).status(),200);await settleBusinessUI(page);assert.deepEqual((await current(context)).config.purposes.map((p:any)=>p.id),failedOrder);
 const concurrent=await current(context);await api(context,{subjectId:'tmua',expectedRevision:concurrent.revision,config:concurrent.config});
 await keyboardStart('purposes',(await ids('purposes'))[0]);assert.equal((await finishKeyboard()).status(),409);const conflictIds=await ids('purposes');
 await shot('admin-1440-sort-conflict');let confirm=respondToBusinessConfirm(page,false);await page.getByRole('button',{name:'载入最新配置',exact:true}).click();await confirm;assert.deepEqual(await ids('purposes'),conflictIds);
 confirm=respondToBusinessConfirm(page,true);await page.getByRole('button',{name:'载入最新配置',exact:true}).click();await confirm;await page.locator('.content-config-feedback').filter({hasText:'已载入'}).waitFor();assert.deepEqual(await ids('purposes'),concurrent.config.purposes.map((p:any)=>p.id));
 mark('用途复用手柄排序，网络失败保留预览并可重试；并发409可取消载入或确认恢复最新顺序');

 await page.getByLabel('帖子类型',{exact:true}).check();const dialog=page.locator('#content-config-dialog');
 await page.getByRole('button',{name:'新增帖子类型',exact:true}).click();assert.equal(await dialog.getByLabel('推广用途',{exact:true}).count(),0);
 const longName='出分后分数线解读、成绩复核与录取要求说明，以及后续备考资料和课程安排的综合通知';
 await dialog.getByLabel('名称',{exact:true}).fill(longName);await dialog.getByLabel('默认运营类型').selectOption('promotion_only');await dialog.getByLabel('推广用途',{exact:true}).selectOption('course');await shot('admin-1440-promotion-editor');
 await dialog.getByLabel('默认运营类型').selectOption('non_promotion_instant');assert.equal(await dialog.getByLabel('推广用途',{exact:true}).count(),0);await shot('admin-1440-nonpromotion-editor');
 await dialog.getByRole('button',{name:'保存',exact:true}).click();await dialog.waitFor({state:'hidden'});const added=(await current(context)).config.types.find((t:any)=>t.name===longName);assert.equal(added.purposeId,null);assert.equal(await list('non-promotion').getByRole('rowheader',{name:added.name}).count(),1);
 await page.setViewportSize({width:1024,height:1000});await dragStart('non-promotion',added.id);const tall=await list('non-promotion').locator('.is-placeholder').boundingBox(),floating=await page.locator('.content-config-drag-overlay').boundingBox();assert(tall&&floating&&Math.abs(tall.height-floating.height)<2);await shot('admin-1024-long-title-drag');await page.keyboard.press('Escape');await page.mouse.up();await page.setViewportSize({width:1440,height:1000});
 const hiddenBefore=(await current(context)).config.types.find((t:any)=>t.id==='non-promotional-handout');assert.equal(hiddenBefore.purposeId,'handout');
 await list('non-promotion').locator('[data-config-row="non-promotional-handout"]').getByRole('button',{name:'编辑',exact:true}).click();assert.equal(await dialog.getByLabel('推广用途',{exact:true}).count(),0);await dialog.getByLabel('名称',{exact:true}).fill('非推广讲义资料');await dialog.getByRole('button',{name:'保存',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal((await current(context)).config.types.find((t:any)=>t.id==='non-promotional-handout').purposeId,'handout');
 await list('promotion').locator('[data-config-row="small-class-or-tutoring"]').getByRole('button',{name:'编辑',exact:true}).click();await dialog.getByLabel('默认运营类型').selectOption('non_promotion_standard');await dialog.getByRole('button',{name:'保存',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(await list('non-promotion').locator('[data-config-row="small-class-or-tutoring"]').count(),1);
 const after=await readMonthlyWorkspace(db,{month:'2026-10',subject:'',category:''});assert.equal(after.spend.spend,before.spend.spend);assert.deepEqual(after.privateData.data,before.privateData.data);
 await shot('admin-1440-type-group-changed',true);
 mark('默认运营方式自动分组；非推广不显示或要求用途，新建无用途；已有费用映射及真实推广统计不改写');

 await page.emulateMedia({reducedMotion:'reduce'});const reduceId=(await ids('promotion'))[0];await dragStart('promotion',reduceId);const reduceTarget=await list('promotion').locator('tbody [data-config-row]').last().boundingBox();assert(reduceTarget);await page.mouse.move(x,Math.min(900,reduceTarget.y+reduceTarget.height/2),{steps:5});
 assert.equal(await list('promotion').evaluate((n:HTMLElement)=>n.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0);await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await page.locator('.content-config-drag-overlay').count(),0);assert.equal(await page.evaluate(()=>document.body.classList.contains('content-config-sorting')),false);
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await shot('admin-1440-reduced-motion');
 await page.getByLabel('配置学科').selectOption('step');assert.equal(await list('promotion').getByRole('rowheader',{name:'小班课和一对一',exact:true}).count(),1);
 const step=await current(context,'step');step.config.types.forEach((t:any)=>t.defaultOperationType='non_promotion_standard');await api(context,{subjectId:'step',expectedRevision:step.revision,config:step.config});await page.reload();await ready();await page.getByLabel('配置学科').selectOption('step');await list('promotion').getByText('暂无推广类型',{exact:true}).waitFor();await shot('admin-1440-empty-group',true);
 for(const width of [390,320]){await page.setViewportSize({width,height:844});await shot('admin-'+width+'-limited-overflow');}
 mark('减少动态效果保留排序反馈，Esc清理拖动；空分组与手机明显溢出检查通过');

 await page.setViewportSize({width:1440,height:1000});await page.goto(baseURL+'/business/settings?view=guide');await page.locator('.settings-views').getByRole('link',{name:'业务配置',exact:true}).click();await ready();await page.getByLabel('配置学科').selectOption('tmua');await shot('admin-1440-navigation-types',true);
 const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const doc=await cdp.send('DOM.getDocument'),node=await cdp.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'[data-config-list=promotion] tbody th'}),fonts=await cdp.send('CSS.getPlatformFontsForNode',{nodeId:node.nodeId});assert(fonts.fonts.some((f:any)=>f.isCustomFont&&f.glyphCount>0));
 const employeeContext=await browser.newContext();const login=await employeeContext.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:employee});assert.equal(login.status(),200);
 for(const path of ['/business/settings?view=business','/api/business-settings/content-config'])assert.equal((await employeeContext.request.get(baseURL+path)).status(),403);
 assert.equal((await employeeContext.request.patch(baseURL+'/api/business-settings/content-config',{headers:{Origin:baseURL},data:{}})).status(),403);await employeeContext.close();
 const records=await db.select().from(s.operationsContentConfig).where(eq(s.operationsContentConfig.subjectId,'tmua'));assert(records[0].history.every(e=>e.actor==='test_admin'));
 mark('站内导航后操作、实际自托管字体、按学科隔离、修改人历史及员工管理403保持');
 const video=page.video();await context.close();await video.saveAs(dir+'/video/admin-config.webm');assert.deepEqual(errors,[]);
 await writeFile(dir+'/result.json',JSON.stringify({passed:true,checks,images,geometry,fonts:fonts.fonts,errors,source:process.env.CONFIG_DRAG_ENTRY??'Node build',dataSource:'isolated PostgreSQL',productionBusinessWrites:false},null,2));
 console.log('CONFIG_DRAG_PASSED '+checks.length+' groups '+images.length+' images');
} catch(error){if(page)await page.screenshot({path:dir+'/failure.png',fullPage:true}).catch(()=>{});console.error(fixture.logs().slice(-1800));throw error;}
finally{await browser?.close();await fixture.stop();}
