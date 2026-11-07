import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {admin,employee} from './auth.fixture';
import {seedPrivateSources,seedFrozenPrivateMeeting} from './private-sources.fixture';
import {seedHistoricalDay} from './promotion-day.fixture';
import {seedLinkPost} from './monthly-plan-links.fixture';
import {settleBusinessUI,respondToBusinessConfirm} from './business-confirm.helper';
import {readNonPromotionFingerprint} from '../src/db/non-promotion-record';
import * as s from '../src/db/schema';

const dir=process.env.PARITY_DIR??'.tools/test-artifacts/business-edit-parity';
for(const sub of ['screenshots','video','pdf'])await mkdir(dir+'/'+sub,{recursive:true});
const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-06T12:00:00+08:00');
const f=await startPostgresFixture({clockFile,entry:process.env.PARITY_ENTRY}),{db,baseURL}=f;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);
let browser:any,debug:any;const checks:string[]=[],images:string[]=[],geometry:any[]=[],errors:string[]=[];
const mark=(text:string)=>{checks.push(text);console.log('PASS '+text);};
async function login(context:any,actor:any){const r=await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:actor});assert.equal(r.status(),200,await r.text());}
async function api(context:any,path:string,data?:any,method='PATCH',status=200,form=false){
 const r=data===undefined?await context.request.get(baseURL+path):await context.request.fetch(baseURL+path,{method,headers:{Origin:baseURL,...(form?{}:{'Content-Type':'application/json'})},...(form?{form:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,String(v)]))}:{data})});
 const text=await r.text();assert.equal(r.status(),status,path+' '+text);try{return JSON.parse(text);}catch{return text;}
}
async function shot(page:any,name:string,fullPage=false){
 await settleBusinessUI(page);const path=dir+'/screenshots/'+name+'.png';await page.screenshot({path,fullPage});images.push(path);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' page overflow');
}
async function go(page:any,path:string){await page.goto(baseURL+path);await settleBusinessUI(page);}
try {
 await seedPrivateSources(db);const frozen=await seedFrozenPrivateMeeting(db,'2026-10','2026.10 月度业务复盘');
 const normal=await seedLinkPost(db,'非推广数据更正验收','2026-10-29T10:00',{categoryId:'temporary'});
 const noteId='a'.repeat(24);await db.update(s.operationsContent).set({platformNoteId:noteId}).where(eq(s.operationsContent.id,normal.content.id));
 await db.update(s.operationsContentSchedule).set({actualPublishAt:new Date('2026-10-29T02:00Z'),completionStatus:'on_time'}).where(eq(s.operationsContentSchedule.id,normal.schedule.id));
 await db.insert(s.operationsNonPromotionReviewPlan).values({contentId:normal.content.id,anchorScheduleId:normal.schedule.id,mode:'standard',day7:true,day15:true});
 browser=await chromium.launch({headless:true});
 const boss=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:dir+'/video',size:{width:1440,height:1000}}});
 await login(boss,admin);await api(boss,'/api/meeting-versions/'+frozen.version.id+'/pdf',{},'POST');const [originalPDF]=await db.select().from(s.operationsMeetingAttachment).where(eq(s.operationsMeetingAttachment.meetingVersionId,frozen.version.id));assert(originalPDF);await writeFile(dir+'/pdf/original.pdf',Buffer.from(originalPDF.base64,'base64'));const page=await boss.newPage();debug=page;page.on('pageerror',(e:Error)=>errors.push(e.message));
 await go(page,'/business/settings?view=business');await page.waitForSelector('astro-island[component-url*="BusinessContentConfiguration"]:not([ssr])');
 await page.getByLabel('配置学科').selectOption('tmua');
 for(const width of [1920,1440,1024]){await page.setViewportSize({width,height:1000});await shot(page,'admin-'+width+'-types');}
 await page.setViewportSize({width:1440,height:1000});
 const row=page.locator('.content-config-table tbody tr').filter({hasText:'小班课和一对一'});await row.getByRole('button',{name:'编辑',exact:true}).click();
 const dialog=page.locator('#content-config-dialog');await dialog.getByLabel('名称',{exact:true}).fill('TMUA 专题课程');
 await page.route('**/api/business-settings/content-config',async(route:any)=>{if(route.request().method()==='PATCH'){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'连接失败，请重试。'})});await page.unroute('**/api/business-settings/content-config');}else await route.continue();});
 await dialog.getByRole('button',{name:'保存',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'连接失败'}).waitFor();assert.equal(await dialog.getByLabel('名称',{exact:true}).inputValue(),'TMUA 专题课程');await shot(page,'admin-1440-config-retry');
 await dialog.getByRole('button',{name:'保存',exact:true}).click();await dialog.waitFor({state:'hidden'});assert(await page.getByRole('rowheader',{name:'TMUA 专题课程',exact:true}).count());
 await page.getByLabel('推广用途',{exact:true}).check();await page.getByRole('button',{name:'新增推广用途',exact:true}).click();await dialog.getByLabel('名称',{exact:true}).fill('专题活动');await dialog.getByRole('button',{name:'保存',exact:true}).click();await dialog.waitFor({state:'hidden'});
 for(const width of [1920,1440,1024]){await page.setViewportSize({width,height:1000});await shot(page,'admin-'+width+'-purposes');}
 await page.setViewportSize({width:1440,height:1000});await page.getByLabel('帖子类型',{exact:true}).check();
 await page.locator('.content-config-table tbody tr').filter({hasText:'TMUA 专题课程'}).getByRole('button',{name:'编辑',exact:true}).click();
 await dialog.getByLabel('推广用途',{exact:true}).selectOption({label:'专题活动'});await dialog.getByLabel('默认运营类型').selectOption('non_promotion_instant');await shot(page,'admin-1440-edit-type');
 await dialog.getByRole('button',{name:'保存',exact:true}).click();await dialog.waitFor({state:'hidden'});
 const catalog=await api(boss,'/api/business-settings/content-config'),tmua=catalog.configurations.find((c:any)=>c.subjectId==='tmua'),step=catalog.configurations.find((c:any)=>c.subjectId==='step');
 assert.equal(step.config.types.find((t:any)=>t.id==='small-class-or-tutoring').name,'小班课和一对一');
 await page.getByRole('button',{name:'拖动TMUA 专题课程排序',exact:true}).focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowDown');await page.keyboard.press('Space');await page.locator('.content-config-feedback').filter({hasText:'已保存'}).waitFor();
 await page.locator('.content-config-table tbody tr').filter({hasText:'TMUA 专题课程'}).getByRole('button',{name:'编辑',exact:true}).click();await dialog.getByLabel('名称',{exact:true}).fill('并发输入仍保留');
 const latest=(await api(boss,'/api/business-settings/content-config')).configurations.find((c:any)=>c.subjectId==='tmua');await api(boss,'/api/business-settings/content-config',{subjectId:'tmua',expectedRevision:latest.revision,config:latest.config});
 await dialog.getByRole('button',{name:'保存',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'已更新'}).waitFor();assert.equal(await dialog.getByLabel('名称',{exact:true}).inputValue(),'并发输入仍保留');await shot(page,'admin-1440-config-conflict');
 const cancel=respondToBusinessConfirm(page,true);await dialog.getByRole('button',{name:'取消',exact:true}).click();await cancel;
 await go(page,'/business/settings?view=business');await page.waitForSelector('astro-island[component-url*=BusinessContentConfiguration]:not([ssr])');await page.getByLabel('配置学科').selectOption('tmua');await page.getByRole('button',{name:'新增帖子类型',exact:true}).click();await dialog.getByLabel('名称',{exact:true}).fill('专题活动通知与后续学习支持');await dialog.getByRole('button',{name:'保存',exact:true}).click();await dialog.waitFor({state:'hidden'});assert(await page.getByRole('rowheader',{name:'专题活动通知与后续学习支持',exact:true}).count());await shot(page,'admin-1440-new-type');
 mark('管理员配置：新增用途、改名、默认类型、按学科隔离、键盘排序、失败重试和并发保留输入');
 await page.setViewportSize({width:390,height:844});await shot(page,'admin-390-config-overflow');await page.setViewportSize({width:1440,height:1000});

 let version=frozen.version.versionNumber;
 for(const [role,actor] of [['admin',admin],['employee',employee]] as const) {
  const ctx=role==='admin'?boss:await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:dir+'/video',size:{width:1440,height:1000}}});
  if(role!=='admin')await login(ctx,actor);const p=role==='admin'?page:await ctx.newPage();debug=p;p.on('pageerror',(e:Error)=>errors.push(e.message));
  for(const width of [1920,1440,1024]) {
   await p.setViewportSize({width,height:1000});await go(p,'/business/meeting-review?meeting='+frozen.meeting.id);
   await p.waitForSelector('astro-island[component-url*="BusinessMeetingDiscussion"]:not([ssr])');await p.waitForFunction(()=>!document.querySelector('[data-monthly-cost-trend=spend] [data-chart-pending]'));await settleBusinessUI(p);
   const markers=p.locator('[data-monthly-cost-trend=spend] .report-trend-point');assert((await markers.count())>=4);
   const styles=await markers.evaluateAll((nodes:HTMLElement[])=>nodes.map(n=>{const b=n.querySelector('button')!,s=getComputedStyle(b,'::after'),r=b.getBoundingClientRect();return {current:n.hasAttribute('data-current'),opacity:s.opacity,width:s.width,height:s.height,display:s.display,transform:s.transform,x:r.x+r.width/2,y:r.y+r.height/2};}));
   assert(styles.every((s:any)=>s.opacity==='1'));assert(styles.filter((s:any)=>s.current).every((s:any)=>s.width==='9px'&&s.height==='9px'&&s.display==='block'));assert(styles.filter((s:any)=>!s.current).every((s:any)=>s.width==='6px'&&s.height==='6px'&&s.display==='block'));assert.equal(styles.filter((s:any)=>s.current).length,1);assert(styles.at(-1).current);geometry.push({role,width,styles});
   await shot(p,role+'-'+width+'-monthly-points');
   const first=markers.first().locator('button'),pointBefore=await first.boundingBox();await first.hover();await settleBusinessUI(p);await shot(p,role+'-'+width+'-point-tooltip');await first.click();assert.deepEqual(await first.boundingBox(),pointBefore);assert.equal(await first.evaluate((n:HTMLElement)=>getComputedStyle(n,'::after').transform),'none');await p.keyboard.press('Escape');
  }
  await p.setViewportSize({width:1440,height:1000});await p.locator('[data-meeting-mode] [value=edit]').check();await p.getByRole('button',{name:'修改核心结论',exact:true}).click();await p.getByRole('textbox',{name:'核心结论',exact:true}).fill(actor.username+'：核对本月来源并保留封存基准。');
  assert.equal(await p.locator('[data-monthly-plan-execution] textarea').count(),0);assert.equal(await p.getByRole('button',{name:'确认预排期',exact:false}).count(),0);
  await shot(p,role+'-1440-sealed-text-edit');
  const save=p.waitForResponse((r:any)=>r.url().includes('/api/meeting-reviews/')&&r.request().method()==='PATCH');await p.getByRole('button',{name:'保存文字修订',exact:true}).click();const saved=await save;assert.equal(saved.status(),200,await saved.text());const value=await saved.json();assert.equal(value.versionNumber,++version);
  await p.waitForURL('**version='+version);await settleBusinessUI(p);await shot(p,role+'-1440-sealed-text-saved');
  const plan=(await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.id,frozen.plan.id)))[0];assert.deepEqual(plan,frozen.plan);
  const [oldPDF]=await db.select().from(s.operationsMeetingAttachment).where(eq(s.operationsMeetingAttachment.id,originalPDF.id));assert.equal(oldPDF.base64,originalPDF.base64);
  const [newPDF]=await db.select().from(s.operationsMeetingAttachment).where(eq(s.operationsMeetingAttachment.meetingVersionId,value.versionId));await writeFile(dir+'/pdf/'+role+'-revision.pdf',Buffer.from(newPDF.base64,'base64'));
  const original=(await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,frozen.version.id)))[0];assert.deepEqual(original.snapshot,frozen.snapshot);
  // The same API accepts correction of a record originally filled by the other role.
  const data={scheduleId:normal.schedule.id,checkpointType:'day_7',recordedThrough:'2026-11-05',exposureCount:1000,readCount:role==='admin'?180:210,threeSecondReadRate:60,conclusion:actor.username+'已核对',fingerprint:await readNonPromotionFingerprint(db,normal.schedule.id,'day_7')};
  await api(ctx,'/api/non-promotion-reviews',data,'POST',201,true);
  await go(p,'/business/non-promotion-review?view=history&mode=standard&group=0&row='+normal.schedule.id+':day_7');assert(await p.getByText('更正笔记 ID',{exact:true}).count());await shot(p,role+'-1440-nonpromotion-correction-entry');
  const nextId=randomUUID().replaceAll('-','').slice(0,24),old=(await db.select().from(s.operationsContent).where(eq(s.operationsContent.id,normal.content.id)))[0].platformNoteId;
  await api(ctx,'/api/operations-content/'+normal.content.id+'/platform-note-id',{platformNoteId:nextId,expectedPlatformNoteId:old,confirmSharedUpdate:'true'},'POST',200,true);
  const planInput={year:2027,sectionKey:'subject:tmua',sectionLabel:'TMUA 细致规划',subjectId:'tmua',categoryId:'temporary',rowName:role+' 年度共同编辑',note:null,sortOrder:0,isActive:true,blocks:[],links:[]};
  const created=await api(ctx,'/api/operations-annual-plans',planInput,'POST',201);await api(ctx,'/api/operations-annual-plans/'+created.id,{...planInput,rowName:role+' 年度已更正',expectedVersionNumber:0});
  await go(p,'/business/annual-plan?year=2027');assert(await p.getByRole('button',{name:'新建规划行',exact:false}).count());await shot(p,role+'-1440-annual-editable');
  if(role==='employee'){
   for(const path of ['/business/settings?view=business','/business/settings?view=accounts','/business/settings?view=permissions','/api/business-settings/content-config','/api/monthly-cost-mapping'])await api(ctx,path,undefined,'GET',403);
   await go(p,'/business/settings?view=guide');assert.equal(await p.locator('#guide-maintain').count(),0);assert(!(await p.content()).includes('账号管理'));await shot(p,'employee-1440-public-guide');
  }
  await p.emulateMedia({reducedMotion:'reduce'});await go(p,'/business/monthly-operations?month=2026-10');assert.equal(await p.getByRole('button',{name:'费用归属',exact:true}).count(),0);
  await p.getByRole('button',{name:'录入／更正',exact:true}).click();await settleBusinessUI(p);assert(await p.locator('#monthly-private-sheet').getByText('专题活动',{exact:true}).count());await shot(p,role+'-1440-dynamic-private-entry');await p.locator('#monthly-private-sheet').getByRole('button',{name:'取消',exact:true}).click();
  await p.setViewportSize({width:390,height:844});await shot(p,role+'-390-monthly-overflow');await p.setViewportSize({width:1440,height:1000});
  mark(role+'：月会文字修订生成PDF且冻结基准保持，非推广更正、笔记ID、年度增改及动态用途可用');
  if(role!=='admin'){const video=p.video();await ctx.close();await video.saveAs(dir+'/video/employee-1440.webm');}
 }
 const revisions=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId,frozen.meeting.id));
 assert(revisions.filter(v=>v.id!==frozen.version.id).every(v=>v.pdfStatus==='ready'));
 const noteHistory=(await db.select().from(s.operationsContentSchedule).where(eq(s.operationsContentSchedule.id,normal.schedule.id)))[0].executionHistory;assert(noteHistory.some(e=>e.actor==='test_employee'));
 const video=page.video();await boss.close();await video.saveAs(dir+'/video/admin-1440.webm');
 assert.deepEqual(errors,[]);await writeFile(dir+'/result.json',JSON.stringify({checks,images,geometry,errors},null,2));
 console.log('PARITY_VISUAL_PASSED '+checks.length+' checks '+images.length+' images');
}catch(e){if(debug)await debug.screenshot({path:dir+'/failure.png',fullPage:true}).catch(()=>{});console.error(f.logs().slice(-3000));throw e;}
finally{await browser?.close();await f.stop();}
