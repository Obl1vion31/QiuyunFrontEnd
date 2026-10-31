/** 真实例会列表、版本来源和PDF操作；业务写入只在隔离PGlite。 */
import assert from 'node:assert/strict';
import {mkdir,writeFile,rename} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startFixture,admin,employee} from './auth.fixture';
import * as s from '../src/db/schema';
import {settleBusinessUI,respondToBusinessConfirm} from './business-confirm.helper';

const folder=process.env.MEETING_LEDGER_DIR||'.tools/test-artifacts/meeting-list';
await mkdir(folder,{recursive:true});
const fixture=await startFixture(),{db,baseURL}=fixture;
let browser:any,context:any;
const checks:string[]=[],measurements:any[]=[],errors:string[]=[];
const draft={schemaVersion:4 as const,workflowVersion:7 as const,finalizationStage:'post' as const,coreConclusion:'本期素材完成验证，下一轮关注咨询质量。',nextAction:'核对后续排期与素材。',promotionInputs:{},issues:[],nonPromotionSelections:[]};
async function seed(name:string,stage='post',pdfStatus:string|null='ready',manual=0,generated=true){
 const number=stage==='draft'?0:3;
 const [meeting]=await db.insert(s.operationsReviewMeeting).values({name,periodStart:'2026-10-16',periodEnd:'2026-10-24',meetingAt:new Date('2026-10-25T16:00:00+08:00'),status:stage==='draft'?'draft':'completed',currentVersionNumber:number,draftSnapshot:{...draft,finalizationStage:stage==='post'?'post':'pre'},createdByLabel:'虚构验收'}).returning();
 const [version]=await db.insert(s.operationsReviewMeetingVersion).values({meetingId:meeting.id,versionNumber:number,lifecycleStatus:stage==='draft'?'draft':'finalized',snapshot:{schemaVersion:4,workflowVersion:7,meeting:{id:meeting.id,name,periodStart:meeting.periodStart,periodEnd:meeting.periodEnd},finalizationStage:stage==='post'?'post':'pre',draft,generated:{summary:{posts:0,spend:0},promotions:[],nonPromotions:[]}},createdAt:new Date('2026-10-25T18:00:00+08:00'),changeSummary:'已核对本期结论，保留后续执行安排。',pdfStatus,finalizedByLabel:'虚构验收'}).returning();
 const sources=[...(generated?['generated']:[]),...Array.from({length:manual},()=> 'manual')];
 if(sources.length)await db.insert(s.operationsMeetingAttachment).values(sources.map((source,index)=>({meetingId:meeting.id,meetingVersionId:version.id,source,name:source==='generated'?'会后报告.pdf':`补充资料：长名称与下一轮执行安排-${index}.pdf`,mimeType:'application/pdf',byteLength:12,base64:Buffer.from('%PDF-fixture').toString('base64'),createdByLabel:'虚构验收'})));
 return {meeting,version};
}
try{
 const primary=await seed('2026.10.16—10.24 周度业务复盘');
 const {chromium}=await import(new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);
 browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});
 assert.equal((await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:admin})).status(),200);
 const page=await context.newPage();await page.addInitScript(()=>{(window as any).__name=(v:unknown)=>v;});page.setDefaultTimeout(20000);page.on('pageerror',(e:Error)=>errors.push(e.message));
 const rowFor=(id:string)=>page.locator(`[data-meeting-list] [data-meeting-id="${id}"]`);
 const nav=async()=>{await page.goto(baseURL+'/business/meeting-review');await page.waitForLoadState('networkidle');await settleBusinessUI(page);};
 const shot=async(name:string)=>{await settleBusinessUI(page);await page.screenshot({path:`${folder}/${name}.png`});};
 for(const width of [1920,1440,1024,390,320]){
  await page.setViewportSize({width,height:1000});await nav();const row=rowFor(primary.meeting.id);
  assert.match(await row.innerText(),/会议 2026-10-25 16:00/);assert.match(await row.innerText(),/2026-10-16 至 2026-10-24/);assert.match(await row.innerText(),/2026年10月 · 第3周/);
  assert.equal(await row.getByRole('button',{name:'重新生成',exact:true}).isVisible(),false);
  const geometry=await row.evaluate((node:HTMLElement)=>{const host=node.closest('main')!,section=node.closest('section')!,title=node.querySelector('.meeting-name')!,actions=node.querySelector('.meeting-record__actions')!;const r=node.getBoundingClientRect(),h=host.getBoundingClientRect(),s=section.getBoundingClientRect(),t=title.getBoundingClientRect(),a=actions.getBoundingClientRect(),head=section.querySelector('h2')!.getBoundingClientRect();const style=getComputedStyle(host);return {height:r.height,scroll:node.scrollWidth,client:node.clientWidth,left:s.left-h.left-parseFloat(style.paddingLeft),right:h.right-s.right-parseFloat(style.paddingRight),anchor:Math.abs(t.left-head.left),actionsBelow:a.top>=t.bottom,actionRight:a.right,rowRight:r.right,font:getComputedStyle(title).fontSize};});measurements.push({width,...geometry});
  assert.ok(geometry.scroll<=geometry.client+1);assert.ok(Math.abs(geometry.left)<=1&&Math.abs(geometry.right)<=1);assert.ok(geometry.anchor<=1);assert.equal(geometry.font,'15px');if(width<=1024)assert.equal(geometry.actionsBelow,true);assert.ok(geometry.actionRight<=geometry.rowRight+1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await shot('single-'+width);
  const before=await row.boundingBox(),more=row.getByRole('button',{name:'更多 ⋯',exact:true});await more.click();const menu=page.getByRole('group',{name:'PDF维护操作'});await menu.waitFor({state:'visible'});
  const box=await menu.boundingBox();assert.ok(box.x>=11&&box.x+box.width<=width-11&&box.width<=177);await shot('more-'+width);assert.deepEqual(await row.boundingBox(),before);
  await more.press('Tab');assert.equal(await menu.getByRole('button',{name:'重新生成',exact:true}).evaluate((n:HTMLElement)=>n===document.activeElement),true);await page.keyboard.press('Escape');assert.equal(await menu.isVisible(),false);assert.equal(await more.evaluate((n:HTMLElement)=>n===document.activeElement),true);await more.click();await page.locator('section.meeting-records h2').click();assert.equal(await menu.isVisible(),false);
 }
 const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const {root}=await cdp.send('DOM.getDocument');const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'[data-meeting-list] .meeting-name'});const fonts=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});assert.ok(fonts.fonts.some((f:any)=>f.isCustomFont&&f.familyName==='MiSans VF'));await cdp.detach();
 checks.push('五档单条列表与菜单：公共边界、文字起点、完整时间、手机重排、键盘返回及实际MiSans');
 const long=await seed('长标题：从完整条件、图像与反例理解复杂业务问题，并保留跨周期结论和执行记录，供团队会议核对','post','ready',2);
 const pre=await seed('下一轮课程素材与排期核对','pre',null,0,false);
 const failed=await seed('测试预算复盘与后续安排','post','failed',0,false);
 const busy=await seed('面试课阶段总结','post','pending',0,false);
 const initial=await seed('下月素材与课程推广准备','draft',null,0,false);
 const [revision]=await db.insert(s.operationsReviewMeetingVersion).values({meetingId:primary.meeting.id,versionNumber:4,createdAt:new Date('2026-10-26T12:00:00+08:00'),lifecycleStatus:'draft',sourceVersionId:primary.version.id,snapshot:{...primary.version.snapshot,finalizationStage:'post'},changeSummary:'待核对的会后修订草稿',finalizedByLabel:'虚构验收'}).returning();
 const [invalid]=await db.insert(s.operationsReviewMeetingVersion).values({meetingId:primary.meeting.id,versionNumber:2,createdAt:new Date('2026-10-25T17:00:00+08:00'),lifecycleStatus:'finalized',invalidatedAt:new Date(),snapshot:{...primary.version.snapshot,finalizationStage:'pre'},changeSummary:'已回溯的历史结论，仅供查阅。',finalizedByLabel:'虚构验收'}).returning();
 for(const width of [1920,1440,1024,390,320]){
  await page.setViewportSize({width,height:1000});await nav();const row=rowFor(primary.meeting.id);
  assert.match(await row.locator('.meeting-name').innerText(),/V4/);assert.match(await row.innerText(),/会后草稿/);assert.equal(await row.getByRole('link',{name:'继续草稿',exact:true}).getAttribute('href'),`?meeting=${primary.meeting.id}&version=4`);
  assert.match(await row.getByRole('link',{name:/查看 PDF/}).innerText(),/V3/);assert.equal(await rowFor(pre.meeting.id).getByRole('link',{name:'进入讨论',exact:true}).count(),1);assert.equal(await rowFor(busy.meeting.id).getByRole('button',{name:'生成／检查PDF',exact:true}).count(),1);
  await shot('mixed-'+width);await rowFor(long.meeting.id).scrollIntoViewIfNeeded();await shot('long-'+width);
  await rowFor(long.meeting.id).getByRole('button',{name:'查看手动附件'}).click();const attachments=page.getByRole('region',{name:'手动附件',exact:true});await attachments.waitFor({state:'visible'});const box=await attachments.boundingBox();assert.ok(box.x>=11&&box.x+box.width<=width-11);await shot('attachments-'+width);await page.keyboard.press('Escape');
  await rowFor(initial.meeting.id).scrollIntoViewIfNeeded();await rowFor(initial.meeting.id).getByRole('button',{name:'更多 ⋯'}).click();await shot('draft-'+width);await page.keyboard.press('Escape');
  const overview=page.locator('.meeting-history-overview');assert.equal(await overview.getAttribute('open'),null);await overview.locator(':scope>summary').click();const history=page.locator(`[data-history-meeting="${primary.meeting.id}"]`);assert.equal(await history.getAttribute('open'),null);await history.locator(':scope>summary').click();await history.scrollIntoViewIfNeeded();await shot('history-'+width);assert.equal(await history.getByText('已回溯失效',{exact:true}).count(),1);assert.ok(await history.getByRole('link',{name:'V2 · 会前',exact:true}).getAttribute('href'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 }
 checks.push('五档混合状态：长标题、初始草稿、V4草稿/V3PDF、会前讨论、历史与失效只读、手动附件');
 const staff=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});assert.equal((await staff.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:employee})).status(),200);const staffPage=await staff.newPage();await staffPage.goto(baseURL+'/business/meeting-review');await settleBusinessUI(staffPage);assert.equal(await staffPage.locator('[data-delete-one]:visible').count(),0);await staffPage.screenshot({path:folder+'/employee-1440.png'});await staffPage.setViewportSize({width:320,height:1000});await staffPage.locator(`[data-meeting-list] [data-meeting-id="${initial.meeting.id}"]`).scrollIntoViewIfNeeded();assert.equal(await staffPage.locator(`[data-meeting-list] [data-meeting-id="${initial.meeting.id}"] .meeting-record__actions`).count(),0);await staffPage.screenshot({path:folder+'/employee-320.png'});await staff.close();
 await page.setViewportSize({width:1440,height:1000});await nav();await rowFor(primary.meeting.id).getByRole('link',{name:'继续草稿',exact:true}).click();await page.locator('.version-nav>strong').filter({hasText:'V4'}).waitFor();await page.getByRole('link',{name:'返回例会总览',exact:true}).click();await rowFor(pre.meeting.id).getByRole('link',{name:'进入讨论',exact:true}).click();await page.locator('.version-nav>strong').filter({hasText:'V3'}).waitFor();await page.getByRole('link',{name:'返回例会总览',exact:true}).click();const initialRow=rowFor(initial.meeting.id);await initialRow.getByRole('button',{name:'更多 ⋯'}).click();let confirm=respondToBusinessConfirm(page);await initialRow.getByRole('button',{name:'删除草稿',exact:true}).click();await confirm;assert.equal(await initialRow.count(),1);await shot('delete-cancel-1440');
 if(!await initialRow.getByRole('button',{name:'删除草稿',exact:true}).isVisible())await initialRow.getByRole('button',{name:'更多 ⋯'}).click();confirm=respondToBusinessConfirm(page,true);await initialRow.getByRole('button',{name:'删除草稿',exact:true}).click();await confirm;await initialRow.waitFor({state:'detached'});assert.equal((await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,initial.meeting.id))).length,0);
 checks.push('管理员删除取消/真实删除原位更新，员工无删除入口');
 const retryCases=[failed];
 for(const width of [1440,390]){
  const retryCase=width===1440?failed:await seed('手机端PDF失败与重试','post','failed',0,false);if(width!==1440)retryCases.push(retryCase);
  const video=await browser.newContext({viewport:{width,height:1000},locale:'zh-CN',hasTouch:width===390,isMobile:width===390,recordVideo:{dir:folder+'/video',size:{width,height:1000}}});await video.addCookies(await context.cookies());const vp=await video.newPage();vp.setDefaultTimeout(30000);vp.on('pageerror',(e:Error)=>errors.push(e.message));
  await vp.route('**/fonts/business.js',async(route:any)=>{await new Promise(r=>setTimeout(r,800));await route.continue();});await vp.goto(baseURL+'/business/meeting-review');await settleBusinessUI(vp);await vp.reload();await settleBusinessUI(vp);
  const vr=vp.locator(`[data-meeting-list] [data-meeting-id="${primary.meeting.id}"]`);if(width===390)await vr.getByRole('button',{name:'更多 ⋯'}).tap();else await vr.getByRole('button',{name:'更多 ⋯'}).click();await settleBusinessUI(vp);await vp.screenshot({path:folder+`/interaction-menu-${width}.png`});await vp.keyboard.press('Tab');await vp.keyboard.press('Escape');
  const target=vp.locator(`[data-meeting-list] [data-meeting-id="${retryCase.meeting.id}"]`),endpoint=`**/api/meeting-versions/${retryCase.version.id}/pdf`;let release!:()=>void,reached!:()=>void;const started=new Promise<void>(r=>reached=r);
  await vp.route(endpoint,async(route:any)=>{await new Promise<void>(r=>{release=r;reached();});await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'生成失败：网络暂不可用，请稍后重试；当前会议与已有文件继续保留。'})});});
  await target.getByRole('button',{name:'重试PDF',exact:true}).click();await started;await target.getByText('正在生成PDF…',{exact:true}).waitFor();await vp.screenshot({path:folder+`/busy-${width}.png`});release();await target.getByText(/^生成失败：/).waitFor();await settleBusinessUI(vp);await vp.screenshot({path:folder+`/error-${width}.png`});assert.equal(await vp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await vp.unroute(endpoint);const response=vp.waitForResponse((r:any)=>r.url().endsWith(`/api/meeting-versions/${retryCase.version.id}/pdf`)&&r.request().method()==='POST');await target.getByRole('button',{name:'重试PDF',exact:true}).click();assert.equal((await response).status(),200);await target.getByRole('link',{name:/查看 PDF/}).waitFor();await vp.screenshot({path:folder+`/retry-success-${width}.png`});
  await target.getByRole('button',{name:'更多 ⋯'}).click();const chooser=vp.waitForEvent('filechooser');await target.getByRole('button',{name:'上传PDF',exact:true}).click();await(await chooser).setFiles({name:'补充执行计划.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-fixture-upload')});await target.getByRole('button',{name:'查看手动附件'}).waitFor();await target.getByRole('button',{name:'查看手动附件'}).click();await vp.getByRole('region',{name:'手动附件'}).waitFor({state:'visible'});await vp.screenshot({path:folder+`/upload-success-${width}.png`});await vp.keyboard.press('Escape');
  await vp.close();await rename(await vp.video().path(),folder+`/video/interaction-${width}.webm`);await video.close();
 }
 checks.push('桌面/手机冷启动与刷新、菜单键盘、故障注入、真实PDF重试及真实手动附件上传录像');
 for(const item of retryCases){const files=await db.select().from(s.operationsMeetingAttachment).where(eq(s.operationsMeetingAttachment.meetingVersionId,item.version.id));assert.equal(files.filter(f=>f.source==='generated').length,1);assert.equal(files.filter(f=>f.source==='manual').length,1);}
 assert.equal((await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,revision.id)))[0].lifecycleStatus,'draft');assert.ok((await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,invalid.id)))[0].invalidatedAt);
 assert.deepEqual(errors,[]);await writeFile(folder+'/result.json',JSON.stringify({passed:true,checks,measurements,fonts:fonts.fonts,errors},null,2));console.log(JSON.stringify({passed:true,checks,folder}));
}catch(error){console.error(fixture.logs().slice(-2200));throw error;}finally{await context?.close();await browser?.close();await fixture.stop();}
