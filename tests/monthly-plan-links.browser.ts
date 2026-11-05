import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {admin,employee} from './auth.fixture';
import {seedLinkPlan,seedLinkPost} from './monthly-plan-links.fixture';
import {settleBusinessUI,respondToBusinessConfirm} from './business-confirm.helper';
import * as s from '../src/db/schema';
const dir=process.env.MONTHLY_LINK_EVIDENCE_DIR||'.tools/test-artifacts/monthly-plan-linking';
await mkdir(dir+'/screenshots',{recursive:true});await mkdir(dir+'/videos',{recursive:true});
const clockFile=new URL('../'+dir+'/browser-clock.txt',import.meta.url).pathname;await writeFile(clockFile,'2026-11-05T12:00:00+08:00');
const fixture=await startPostgresFixture({clockFile}),{db,baseURL}=fixture;
let browser:any,page:any,context:any,bossContext:any;const checks:string[]=[],images:string[]=[],errors:string[]=[],requests:Array<{url:string;method:string}>=[];
const mark=(text:string)=>{checks.push(text);console.log('PASS '+text);};
async function shot(name:string){await page.mouse.move(0,0);await settleBusinessUI(page);const filename='screenshots/'+name+'.png';await page.screenshot({path:dir+'/'+filename,fullPage:false});images.push(filename);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' page overflow');}
async function confirm(accept:boolean){await respondToBusinessConfirm(page,accept);}
async function login(p:any,actor:any){await p.goto(baseURL+'/login');await p.getByLabel('账号或用户名',{exact:true}).fill(actor.username);await p.getByLabel('密码').fill(actor.password);await p.locator('[data-login-form] button[type=submit]').click();await p.waitForURL('**/business/**');}
async function permission(mode:string){const [u]=await db.select().from(s.authUser).where(eq(s.authUser.username,employee.username));await db.insert(s.operationsAccountPermission).values({userId:u.id,operation:'schedule.edit',mode:mode as any}).onConflictDoUpdate({target:[s.operationsAccountPermission.userId,s.operationsAccountPermission.operation],set:{mode:mode as any,updatedAt:new Date()}});}
async function openGroup(name:string){const button=page.locator('[data-monthly-link-group]').filter({has:page.locator('[data-group-name]',{hasText:name})});await button.click();await page.locator('.calendar-grid.monthly-link-selecting').waitFor();return button;}
const card=(id:string)=>page.locator('.calendar-item[data-inspect-id="'+id+'"]');
async function saveLinks(){await page.locator('[data-monthly-link-save]').click();await page.locator('[data-monthly-link-message][data-success]').waitFor();await page.locator('.calendar-grid.monthly-link-selecting').waitFor({state:'hidden'});}
try{
 const monthly=await seedLinkPlan(db,{groups:[{name:'TMUA 讲义',quantity:2,week:2},{name:'TMUA 期末内容',quantity:1,week:3},{name:'STEP 讲义',quantity:1,week:2,subjectId:'step'},{name:'月底补充',quantity:1,week:5}]});
 const a=await seedLinkPost(db,'TMUA 讲义第一篇：函数与证明','2026-11-09T10:00');
 const b=await seedLinkPost(db,'TMUA 讲义第二篇：数列与数学推理','2026-11-11T16:30');
 const cross=await seedLinkPost(db,'提前排好的 TMUA 讲义','2026-11-02T10:00');
 const other=await seedLinkPost(db,'STEP 讲义：不同学科','2026-11-10T11:00',{subjectId:'step'});
 await seedLinkPost(db,'备考资讯：不同帖子分类','2026-11-06T10:00',{categoryId:'exam-information'});
 const long=await seedLinkPost(db,'TMUA 超长讲义标题：不等式、函数图像、逻辑推理与多章节综合训练完整阅读入口验证','2026-11-19T10:00');
 await seedLinkPost(db,'月底讲义内容','2026-11-29T10:00');
 const december=await seedLinkPlan(db,{month:'2026-12',final:false});
 const playwright=await import(process.env.PLAYWRIGHT_MODULE||'../.tools/tooling/node_modules/playwright/index.mjs');browser=await playwright.chromium.launch({headless:true,args:['--no-sandbox']});
 context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:dir+'/videos',size:{width:1440,height:1000}}});
 await context.addInitScript("{const NativeDate=Date;class FixedDate extends NativeDate{constructor(...args){super(...(args.length?args:[new NativeDate('2026-11-05T12:00:00+08:00').getTime()]));}static now(){return new NativeDate('2026-11-05T12:00:00+08:00').getTime();}}window.Date=FixedDate;}");
 page=await context.newPage();page.on('pageerror',(e:any)=>errors.push(e.message));page.on('request',(r:any)=>requests.push({url:r.url(),method:r.method()}));
 await login(page,employee);await page.goto(baseURL+'/business/operations-schedule?month=2026-11');await settleBusinessUI(page);
 assert.equal(await page.locator('[data-monthly-week]').count(),5);assert.equal(await page.locator('[data-monthly-overall]').textContent(),'0/5 已关联');
 await shot('calendar-default-1440');
 const node=await card(a.schedule.id).elementHandle(),geometry=await page.locator('.calendar-grid').boundingBox();
 await openGroup('TMUA 讲义');await settleBusinessUI(page);
 const selectedGeometry=await page.locator('.calendar-grid').boundingBox();assert(Math.abs(geometry.y-selectedGeometry.y)<1,'enter selection keeps calendar top');assert(Math.abs(geometry.width-selectedGeometry.width)<1);
 assert.equal(await card(other.schedule.id).getAttribute('data-monthly-eligible'),'false');assert.equal(await card(a.schedule.id).getAttribute('data-monthly-eligible'),'true');
 await card(a.schedule.id).focus();await page.keyboard.press('Space');assert.equal(await card(a.schedule.id).getAttribute('aria-checked'),'true');assert.equal(await page.locator('[data-inspector].is-open').count(),0);
 await shot('calendar-selection-1440');const buttonStyle=await page.locator('[data-monthly-link-save]').evaluate((n:HTMLElement)=>({font:getComputedStyle(n).fontFamily,size:getComputedStyle(n).fontSize,height:n.getBoundingClientRect().height}));assert(buttonStyle.font.includes('MiSans'));assert.equal(buttonStyle.size,'14px');assert.equal(buttonStyle.height,40);
 const scroll=await page.evaluate(()=>scrollY);await page.locator('[data-monthly-link-cancel]').click();await confirm(false);
 assert.equal(await card(a.schedule.id).getAttribute('aria-checked'),'true');assert.equal(await page.evaluate(()=>scrollY),scroll);
 // 只注入网络失败；重试必须仍使用刚才的读取凭据与输入。
 const linkPath='**/api/monthly-plans/'+monthly.plan.id+'/links';
 await page.route(linkPath,(r:any)=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'隔离保存失败，请重试。'})}));
 await page.locator('[data-monthly-link-save]').click();await page.getByText('隔离保存失败，请重试。',{exact:true}).waitFor();assert.equal(await card(a.schedule.id).getAttribute('aria-checked'),'true');await shot('calendar-save-failure-1440');
 await page.unroute(linkPath);await saveLinks();assert.equal(await page.locator('[data-monthly-overall]').textContent(),'1/5 已关联');assert(await node.evaluate((n:any)=>n.isConnected));
 assert.equal((await db.select().from(s.operationsContentSchedule)).length,7);
 mark('月历原卡片／位置保留，键盘勾选、取消保留及503重试，部分关联不建帖');
 await openGroup('TMUA 讲义');await card(b.schedule.id).click();await card(cross.schedule.id).click();await page.getByText('已选满 2 个名额，请先取消一篇。',{exact:true}).waitFor();
 await saveLinks();assert.equal(await page.locator('[data-monthly-overall]').textContent(),'2/5 已关联');
 await page.locator('[data-monthly-completed]>summary').click();await openGroup('TMUA 讲义');await card(a.schedule.id).click();await page.locator('[data-monthly-link-reason]').fill('纠正计划对应关系');
 await page.locator('[data-monthly-link-save]').click();await confirm(false);assert.equal(await card(a.schedule.id).getAttribute('aria-checked'),'false');
 await page.locator('[data-monthly-link-save]').click();await confirm(true);await page.getByText('已保存关联，计划数量保持不变。',{exact:true}).waitFor();assert.equal(await page.locator('[data-monthly-overall]').textContent(),'1/5 已关联');
 mark('选满提示、第二次补齐、更正前确认及取消保留，数量始终不变');
 await card(b.schedule.id).click();await page.locator('[data-inspector].is-open').waitFor();await settleBusinessUI(page);await shot('calendar-inspector-1440');await page.locator('[data-inspector].is-open [data-close-inspector]').click();await page.locator('[data-inspector].is-open').waitFor({state:'hidden'});
 await openGroup('TMUA 期末内容');await card(cross.schedule.id).click();assert(await page.locator('[data-monthly-link-save]').isDisabled());await page.locator('[data-monthly-link-reason]').fill('使用提前排好的内容，不改原日期');await shot('calendar-cross-week-1440');await saveLinks();
 assert.equal((await db.select().from(s.operationsContentSchedule).where(eq(s.operationsContentSchedule.id,cross.schedule.id)))[0].plannedPublishAt.toISOString(),cross.schedule.plannedPublishAt.toISOString());
 mark('退出后恢复原Inspector，跨Week说明及原日期保留');
 for(const width of [1920,1440,1024,390,320]){
  await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));await shot('calendar-linked-'+width);
  await openGroup('TMUA 讲义');await shot('calendar-picking-'+width);
  await page.locator('[data-monthly-link-cancel]').click();await page.locator('.calendar-grid.monthly-link-selecting').waitFor({state:'hidden'});
 }
 await page.setViewportSize({width:1440,height:1000});
 await openGroup('TMUA 讲义');await card(a.schedule.id).click();await page.locator('[data-calendar-new="2026-11-14"]').click();await confirm(false);assert.equal(await card(a.schedule.id).getAttribute('aria-checked'),'true');
 await page.locator('[data-calendar-new="2026-11-14"]').click();await confirm(true);await page.locator('#schedule-form').waitFor({state:'visible'});
 assert.equal(await page.locator('#schedule-form [data-monthly-source]').inputValue(),monthly.items.find(i=>i.groupId===monthly.groups[0].id&&!i.scheduleId)!.id);
 await page.locator('#schedule-form [name=contentName]').fill('切换月份仍保留输入');await page.locator('#schedule-form [name=plannedPublishDate]').fill('2026-12-10');
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('[data-monthly-schedule-fields]')?.hidden===true);
 await page.locator('#schedule-form [name=plannedPublishDate]').fill('2026-11-14');await page.locator('#schedule-form [data-monthly-source]').waitFor({state:'visible'});assert.equal(await page.locator('#schedule-form [name=contentName]').inputValue(),'切换月份仍保留输入');
 await shot('calendar-new-source-1440');
 await page.locator('#schedule-form').evaluate((f:HTMLFormElement)=>f.closest('dialog')!.querySelector<HTMLButtonElement>('[data-close]')!.click());await confirm(true);
 mark('从勾选切换日期新建有未保存保护，原表单带来源；跨月补读保留输入');
 // 旧标签页先打开表单，随后执行月计划定稿。
 await page.goto(baseURL+'/business/operations-schedule?month=2026-12');await page.locator('[data-calendar-new="2026-12-10"]').click();await page.locator('#schedule-form [name=contentName]').fill('旧标签页预先填写的讲义');
 await page.locator('#schedule-form [name=subjectId]').selectOption('tmua');await page.locator('#schedule-form [name=categoryId]').selectOption('promotional-handout');
 await db.update(s.operationsMonthlyPlan).set({firstFinalizedAt:new Date('2026-11-05T04:00Z')}).where(eq(s.operationsMonthlyPlan.id,december.plan.id));
 const missing=page.waitForResponse((r:any)=>r.url().endsWith('/api/operations-content')&&r.request().method()==='POST');
 await page.locator('#schedule-form button[type=submit]').click();assert.equal((await missing).status(),422);
 await page.locator('#schedule-form [data-monthly-source]').waitFor({state:'visible'});assert.equal(await page.locator('#schedule-form [name=contentName]').inputValue(),'旧标签页预先填写的讲义');await shot('calendar-old-tab-source-1440');
 await page.locator('#schedule-form [data-monthly-source]').selectOption(december.items[0].id);await page.locator('#schedule-form [name=plannedPublishTime]').fill('10:00');const recoveredSave=page.waitForResponse((r:any)=>r.url().endsWith('/api/operations-content')&&r.request().method()==='POST');await page.locator('#schedule-form button[type=submit]').click();assert.equal((await recoveredSave).status(),201);await page.locator('#schedule-form').waitFor({state:'hidden'});
 mark('旧标签页遇定稿由服务端拦截，补出来源且保留原输入');
 await permission('review');await page.goto(baseURL+'/business/operations-schedule?month=2026-11');
 await openGroup('TMUA 讲义');await card(a.schedule.id).click();const pendingResponse=page.waitForResponse((r:any)=>r.url().endsWith('/links')&&r.request().method()==='POST');await page.locator('[data-monthly-link-save]').click();assert.equal((await pendingResponse).status(),202);await page.getByText('已提交管理员审核，名额已预留。',{exact:true}).waitFor();await shot('calendar-pending-employee-1440');
 bossContext=await browser.newContext({viewport:{width:1440,height:1000}});const bossPage=await bossContext.newPage();await login(bossPage,admin);
 await bossPage.goto(baseURL+'/business/operations-schedule?month=2026-11&status=approvals&display=ledger');await bossPage.locator('[data-approval-item]').first().click();await bossPage.locator('[data-schedule-approval-inspector].is-open').waitFor();
 await settleBusinessUI(bossPage);await bossPage.screenshot({path:dir+'/screenshots/calendar-approval-admin-1440.png'});images.push('screenshots/calendar-approval-admin-1440.png');
 assert(await bossPage.getByText('关联排期',{exact:true}).isVisible());const approvalResponse=bossPage.waitForResponse((r:any)=>r.url().includes('/api/business-change-proposals/')&&r.request().method()==='PATCH');await bossPage.getByRole('button',{name:'通过',exact:true}).click();const approval=await approvalResponse;assert.equal(approval.status(),200);assert.equal((await approval.json()).status,'approved');await bossPage.locator('[data-schedule-approval] output').filter({hasText:'已通过'}).waitFor();
 await page.reload();await settleBusinessUI(page);assert.equal(await page.locator('[data-monthly-overall]').textContent(),'3/5 已关联');
 mark('员工真实提交关联审批，管理员原Inspector查看差异并批准，计数仅通过后增加');
 await permission('direct');await page.reload();
 await page.locator('[data-monthly-completed]>summary').click();await openGroup('TMUA 讲义');await card(a.schedule.id).click();await page.locator('[data-monthly-link-reason]').fill('检查过期保存');
 await db.update(s.operationsContentVersion).set({contentName:'协作者刚保存的新标题',updatedAt:new Date('2026-11-05T04:01Z')}).where(eq(s.operationsContentVersion.id,a.version.id));
 await page.locator('[data-monthly-link-save]').click();await confirm(true);await page.locator('[data-business-confirm][open]').waitFor();assert.equal(await page.locator('[data-confirm-cancel]').isVisible(),false);await page.keyboard.press('Escape');assert(await page.locator('[data-business-confirm][open]').isVisible());await shot('calendar-stale-refresh-1440');await page.locator('[data-confirm-accept]').click();await page.waitForLoadState('networkidle');await page.locator('[data-monthly-plan-pool]').waitFor();
 mark('协作者保存后旧关联整批拒绝，只提供刷新，Esc与重试不能绕过');
 await page.emulateMedia({reducedMotion:'reduce'});await openGroup('STEP 讲义');await card(other.schedule.id).click();await shot('calendar-reduced-motion-1440');await page.locator('[data-monthly-link-cancel]').click();await confirm(true);
 assert.equal(requests.filter(r=>r.url.includes('/api/collaboration/')).length,0);
 const beforeIdle=requests.filter(r=>r.url.includes('/api/monthly-plans')).length;await page.waitForTimeout(5500);assert.equal(requests.filter(r=>r.url.includes('/api/monthly-plans')).length,beforeIdle);
 assert.equal(errors.length,0,errors.join('\n'));
 mark('减少动态效果、无协作请求与无月计划轮询，三个桌面宽度及手机有限回归');
 await db.update(s.operationsContentSchedule).set({plannedPublishAt:new Date('2026-12-10T02:00Z'),updatedAt:new Date('2026-11-05T04:02Z')}).where(eq(s.operationsContentSchedule.id,a.schedule.id));
 await page.reload();await page.locator('[data-monthly-completed]>summary').click();await openGroup('TMUA 讲义');assert.equal(await card(a.schedule.id).count(),0);assert(await page.locator('[data-monthly-link-clear-hidden]').isVisible());assert.equal(await card(b.schedule.id).getAttribute('aria-checked'),'true');
 await page.locator('[data-monthly-link-clear-hidden]').click();assert.equal(await card(b.schedule.id).getAttribute('aria-checked'),'true');assert(await page.locator('[data-monthly-link-clear-hidden]').isHidden());await page.locator('[data-monthly-link-reason]').fill('原帖移至下月，解除原月执行关系');await shot('calendar-hidden-association-1440');await page.locator('[data-monthly-link-save]').click();await confirm(true);await page.getByText('已保存关联，计划数量保持不变。',{exact:true}).waitFor();assert.equal(await page.locator('[data-monthly-overall]').textContent(),'2/5 已关联');
 mark('跨月隐藏旧帖可取消勾选；保留可见关联、帖子与原计划数量');
 await page.screenshot({path:dir+'/screenshots/calendar-final-full-1440.png',fullPage:true});images.push('screenshots/calendar-final-full-1440.png');
 await context.close();context=null;await writeFile(dir+'/browser.json',JSON.stringify({passed:true,checks,images,requests:requests.filter(r=>r.url.includes('/api/monthly-plans')),errors},null,2));
}catch(error){console.error(fixture.logs().slice(-5000));if(page)await page.screenshot({path:dir+'/failure.png',fullPage:true}).catch(()=>{});throw error;}finally{await context?.close();await bossContext?.close();await browser?.close();await fixture.stop();}
