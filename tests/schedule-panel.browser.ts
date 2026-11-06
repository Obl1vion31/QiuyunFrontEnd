import assert from 'node:assert/strict';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {prepareMonthlyArrangement} from './monthly-arrangement.fixture';
import {seedLinkPost} from './monthly-plan-links.fixture';
import {admin,employee} from './auth.fixture';
import {settleBusinessUI,respondToBusinessConfirm} from './business-confirm.helper';
import {fillBusinessDateTime} from './business-datetime.helper';
import * as s from '../src/db/schema';
const dir=process.env.SCHEDULE_PANEL_DIR??'.tools/test-artifacts/schedule-panel';
await mkdir(dir+'/screenshots',{recursive:true});await mkdir(dir+'/video',{recursive:true});
const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-06T12:00:00+08:00');
const f=await startPostgresFixture({clockFile,entry:process.env.SCHEDULE_PANEL_ENTRY}),{db,baseURL}=f;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);let browser:any,p:any,c:any;const errors:string[]=[],checks:string[]=[],images:string[]=[];
async function login(context:any,actor:any){const r=await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:actor});assert.equal(r.status(),200);return(await context.cookies()).map((v:any)=>v.name+'='+v.value).join('; ');}
async function shot(name:string){await settleBusinessUI(p);await p.mouse.move(0,0);await p.screenshot({path:dir+'/screenshots/'+name+'.png'});images.push(name);}
async function detail(id:string){await p.locator('[data-inspect-id="'+id+'"]').click();await p.locator('#schedule-panel[open][data-view=detail]').waitFor();await settleBusinessUI(p);}
async function save(form:string,path:string){const r=p.waitForResponse((r:any)=>r.url().endsWith(path)&&['PATCH','POST'].includes(r.request().method()));await p.locator(form+' [type=submit]').click();return await r;}
try{
 browser=await chromium.launch({headless:true});c=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:dir+'/video',size:{width:1440,height:1000}}});
 const cookie=await login(c,admin);await prepareMonthlyArrangement(db,baseURL,cookie);
 const waiting=await seedLinkPost(db,'未发布 · 函数图像讲义','2026-11-10T10:00');
 const sent=await seedLinkPost(db,'已发布 · 数列与推理讲义','2026-11-05T10:00');
 await db.update(s.operationsContentVersion).set({projectDocUrl:'https://example.test/documents/brief'}).where(eq(s.operationsContentVersion.id,sent.version.id));
 await db.update(s.operationsContentSchedule).set({actualPublishAt:new Date('2026-11-05T02:00Z'),publicationUrl:'https://www.xiaohongshu.com/explore/0123456789abcdef01234567',completionStatus:'on_time'}).where(eq(s.operationsContentSchedule.id,sent.schedule.id));
 p=await c.newPage();p.on('pageerror',(e:any)=>errors.push(e.message));let navigations=0,mutations=0,written=0;p.on('request',(r:any)=>{if(['POST','PATCH','DELETE'].includes(r.method())&&r.url().includes('/api/operations-content'))mutations++;if(r.isNavigationRequest()&&r.frame()===p.mainFrame())navigations++;});
 await p.goto(baseURL+'/business/operations-schedule?month=2026-11');await settleBusinessUI(p);
 const calendar=await p.locator('.calendar').boundingBox();await p.locator('[data-arrangement-form] [name=reason]').fill('整月说明草稿：保留，不提交核对');
 const oldDraft=await p.locator('[data-arrangement-form]').elementHandle();
 await detail(waiting.schedule.id);assert.equal(await p.locator('[data-inspector-revise]').isVisible(),false);assert.equal(await p.locator('dialog[open]').count(),1);
 const after=await p.locator('.calendar').boundingBox();assert.equal(after.width,calendar.width);assert.equal(after.x,calendar.x);await shot('unpublished-detail-1440');
 await p.locator('[data-inspector-edit]').click();await p.locator('#schedule-panel[data-view=form]').waitFor();assert.equal(await p.locator('dialog[open]').count(),1);await shot('edit-1440');
 await p.locator('#schedule-form [data-close]').filter({hasText:'取消'}).click();await p.locator('#schedule-panel[data-view=detail]').waitFor();await p.locator('[data-close-inspector]').click();await p.locator('#schedule-panel').waitFor({state:'hidden'});
 await detail(waiting.schedule.id);
 for(const action of ['[data-inspector-edit]','[data-inspector-publication]']){
  await p.locator(action).click();await p.locator('#schedule-panel:not([data-view=detail])').waitFor();
  await p.locator('#schedule-panel [data-panel-view]:not([hidden]) header button').last().click();await p.locator('#schedule-panel').waitFor({state:'hidden'});
  await detail(waiting.schedule.id);
 }
 await p.locator('[data-close-inspector]').click();await p.locator('#schedule-panel').waitFor({state:'hidden'});
 checks.push('详情不挤压月历；未发布隐藏改帖；原位编辑/取消，只有一个dialog');
 await detail(waiting.schedule.id);await p.locator('[data-inspector-publication]').click();await p.locator('#schedule-panel[data-view=publication]').waitFor();
 await fillBusinessDateTime(p,'actualPublishAt','2026-11-10T10:00');await p.locator('#publicationUrl').fill('https://www.xiaohongshu.com/explore/0123456789abcdef01234567');await p.locator('#publicationProjectDocUrl').fill('https://example.test/documents/new');
 await p.waitForFunction(()=>document.querySelector('[data-publication-delay-days]')?.getAttribute('data-ready')==='true');
 await shot('publication-1440');const navBefore=navigations;assert.equal((await save('#publication-form','/api/operations-content/'+waiting.schedule.id+'/publication')).status(),200);
 await p.waitForFunction(()=>document.querySelector('#schedule-panel[data-view=detail] .schedule-workflow-panel')?.getAttribute('data-ready')==='true');await p.locator('.schedule-save-result').getByText('已保存',{exact:true}).waitFor();
 assert.equal(navigations,navBefore);assert(await p.locator('[data-inspector-revise]').isVisible());assert.equal(await p.locator('[data-arrangement-form] [name=reason]').inputValue(),'整月说明草稿：保留，不提交核对');assert(await oldDraft.evaluate((e:any)=>e.isConnected));
 await shot('publication-saved-1440');checks.push('真实未来发布保存回详情、出现改帖；无页面导航、整月草稿DOM和输入保留');
 await p.locator('[data-inspector-edit]').click();await p.locator('#contentName').fill('已修改 · 函数图像与推理完整讲义');
 assert.equal((await save('#schedule-form','/api/operations-content/'+waiting.schedule.id)).status(),200);await p.locator('#schedule-panel[data-view=detail]').waitFor();await p.getByRole('heading',{name:'已修改 · 函数图像与推理完整讲义',exact:true}).waitFor();assert.equal(navigations,navBefore);
 await p.locator('[data-inspector-edit]').click();await p.locator('#contentName').fill('断网仍保留的内容');
 await p.route('**/api/operations-content/'+waiting.schedule.id,(r:any)=>r.request().method()==='PATCH'?r.abort('internetdisconnected'):r.continue());
 await p.locator('#schedule-form [type=submit]').click();await p.locator('#schedule-form .form-message').filter({hasText:'无法连接'}).waitFor();assert.equal(await p.locator('#contentName').inputValue(),'断网仍保留的内容');await shot('failure-preserved-1440');await p.unroute('**/api/operations-content/'+waiting.schedule.id);
 await p.locator('#schedule-form [data-close]').filter({hasText:'取消'}).click();await respondToBusinessConfirm(p,false);assert.equal(await p.locator('#contentName').inputValue(),'断网仍保留的内容');
 await p.locator('#schedule-form [data-close]').filter({hasText:'取消'}).click();await respondToBusinessConfirm(p,true);await p.locator('#schedule-panel[data-view=detail]').waitFor();
 checks.push('真实修改后局部回显；断网保留输入；取消未保存确认可继续填写');
 await p.locator('[data-inspector-revise]').click();await p.locator('#revisionSummary').fill('调整例题顺序与结尾引导，改善阅读');
 await fillBusinessDateTime(p,'plannedPublishAt','2026-11-12T10:00');
 const revised=await save('#schedule-form','/api/operations-content/versions/'+waiting.version.id+'/revisions');assert.equal(revised.status(),201);const newId=(await revised.json()).id;
 await p.locator('#schedule-panel[data-view=detail] [data-inspector-version]').filter({hasText:'V1'}).waitFor();assert.equal(await p.locator('[data-inspector]').getAttribute('data-selected-id'),newId);assert.equal(await p.locator('[data-inspector-revise]').isVisible(),false);await shot('revision-saved-1440');assert.equal(navigations,navBefore);
 await p.locator('[data-close-inspector]').click();await p.locator('#schedule-panel').waitFor({state:'hidden'});await detail(sent.schedule.id);
 await p.locator('[data-inspector-edit]').click();await p.locator('#contentName').fill('保存成功后读取失败的测试标题');
 let failRead=true;await p.route('**/business/operations-schedule?**',(r:any)=>failRead&&r.request().resourceType()==='fetch'?r.fulfill({status:503,body:'test read failed'}):r.continue());
 assert.equal((await save('#schedule-form','/api/operations-content/'+sent.schedule.id)).status(),200);
 await p.locator('.schedule-save-result').filter({hasText:'已保存，展示更新失败'}).waitFor();assert(await p.locator('#schedule-form [type=submit]').isDisabled());await shot('saved-read-failure-1440');
 written=mutations;failRead=false;await p.getByRole('button',{name:'重试读取',exact:true}).click();await p.locator('#schedule-panel[data-view=detail]').waitFor();await p.getByRole('heading',{name:'保存成功后读取失败的测试标题',exact:true}).waitFor();assert.equal(mutations,written,'重读不重复提交');failRead=true;await p.locator('[data-inspector-edit]').click();await p.locator('#contentName').fill('读取失败关闭后仍可核对新选择');
 assert.equal((await save('#schedule-form','/api/operations-content/'+sent.schedule.id)).status(),200);
 await p.locator('.schedule-save-result').filter({hasText:'已保存，展示更新失败'}).waitFor();
 await p.locator('#schedule-form header button').last().click();await p.locator('#schedule-panel').waitFor({state:'hidden'});
 await detail(waiting.schedule.id);written=mutations;failRead=false;await p.getByRole('button',{name:'重试读取',exact:true}).click();
 await p.locator('.schedule-save-result').getByText('已保存',{exact:true}).waitFor();assert.equal(await p.locator('[data-inspector]').getAttribute('data-selected-id'),waiting.schedule.id,'重读不会回到先前帖子');
 await p.unroute('**/business/operations-schedule?**');
 await p.locator('[data-close-inspector]').click();await p.locator('#schedule-panel').waitFor({state:'hidden'});await detail(sent.schedule.id);
 await p.locator('[data-inspector-edit]').click();await p.locator('#contentName').fill('慢同步期间切换详情仍保留新选择');
 await p.route('**/business/operations-schedule?**',async(r:any)=>{if(r.request().resourceType()==='fetch')await new Promise(resolve=>setTimeout(resolve,1600));await r.continue();});
 assert.equal((await save('#schedule-form','/api/operations-content/'+sent.schedule.id)).status(),200);
 await p.locator('#schedule-form header button').last().click();await p.locator('#schedule-panel').waitFor({state:'hidden'});
 await detail(waiting.schedule.id);await p.waitForTimeout(1800);assert.equal(await p.locator('[data-inspector]').getAttribute('data-selected-id'),waiting.schedule.id);await p.unroute('**/business/operations-schedule?**');
 checks.push('已发布才可真实创建V1；新未发V1隐藏改帖；写入成功后读取失败只重试读取');
 await p.locator('[data-close-inspector]').click();await p.locator('#schedule-panel').waitFor({state:'hidden'});const video=p.video();await c.close();c=null;await copyFile(await video.path(),dir+'/video/admin-1440.webm');
 for(const role of ['admin','employee'])for(const width of [1920,1440,1024]){
  const cc=await browser.newContext({viewport:{width,height:1000},locale:'zh-CN'});await login(cc,role==='admin'?admin:employee);p=await cc.newPage();p.on('pageerror',(e:any)=>errors.push(e.message));await p.goto(baseURL+'/business/operations-schedule?month=2026-11');await settleBusinessUI(p);await detail(sent.schedule.id);const headings=await p.locator('.schedule-detail-section>h3').evaluateAll((nodes:HTMLElement[])=>nodes.map(n=>{const s=getComputedStyle(n);return[s.fontSize,s.lineHeight,s.fontWeight,s.color].join('|')}));assert(headings.length>=3);assert.equal(new Set(headings).size,1,'同级区块标题一致');
 await shot(role+'-detail-'+width);await p.locator('[data-inspector-edit]').click();await p.locator('#schedule-panel[data-view=form]').waitFor();await shot(role+'-edit-'+width);await p.locator('#schedule-form [data-close]').filter({hasText:'取消'}).click();await p.locator('#schedule-panel[data-view=detail]').waitFor();await p.keyboard.press('Escape');await p.locator('#schedule-panel').waitFor({state:'hidden'});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await cc.close();
 }
 assert.deepEqual(errors,[]);await writeFile(dir+'/result.json',JSON.stringify({passed:true,checks,images,errors},null,2));console.log(checks.join('\n'));
}catch(error){console.error(f.logs().slice(-2000));if(p&&!p.isClosed())await p.screenshot({path:dir+'/failure.png'}).catch(()=>{});throw error;}finally{await c?.close();await browser?.close();await f.stop();}
