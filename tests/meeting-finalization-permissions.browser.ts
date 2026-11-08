import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {eq,desc} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {admin,employee} from './auth.fixture';
import {prepareMonthlyArrangement} from './monthly-arrangement.fixture';
import {discussionFromDraft} from '../src/db/meeting-discussion-values';
import {settleBusinessUI,respondToBusinessConfirm} from './business-confirm.helper';
import * as s from '../src/db/schema';
const dir=process.env.MEETING_PERMISSION_DIR??'.tools/test-artifacts/weekly-permission/focused';
for(const sub of ['screenshots','video'])await mkdir(dir+'/'+sub,{recursive:true});
const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-05T12:00:00+08:00');
const f=await startPostgresFixture({clockFile,entry:process.env.MEETING_PERMISSION_ENTRY}),{db,baseURL}=f;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);let browser:any;const checks:string[]=[],errors:string[]=[];
async function versions(id:string){return db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId,id)).orderBy(desc(s.operationsReviewMeetingVersion.versionNumber));}
async function meeting(id:string){return (await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,id)))[0];}
async function call(context:any,path:string,data?:any,status=200,form=false){const response=data===undefined?await context.request.get(baseURL+path):await context.request.fetch(baseURL+path,{method:path==='/api/meeting-reviews'||path.endsWith('/arrangement')?'POST':'PATCH',headers:{Origin:baseURL},...(form?{form:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,String(v)]))}:{data})});const value=await response.json();assert.equal(response.status(),status,JSON.stringify({path,value}));return value;}
async function nav(page:any,id:string){await page.goto(baseURL+'/business/meeting-review?meeting='+id);await settleBusinessUI(page);}
async function shots(page:any,name:string){for(const width of [1920,1440,1024]){await page.setViewportSize({width,height:1000});await page.locator('.weekly-report-actions').last().scrollIntoViewIfNeeded();await settleBusinessUI(page);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:dir+'/screenshots/'+name+'-'+width+'.png'});}await page.setViewportSize({width:1440,height:1000});}
try{
 browser=await chromium.launch({headless:true});
 const boss=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:dir+'/video',size:{width:1440,height:1000}}}),staff=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:dir+'/video',size:{width:1440,height:1000}}});
 for(const [context,actor]of [[boss,admin],[staff,employee]]as const){const r=await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:actor});assert.equal(r.status(),200);}
 const bossPage=await boss.newPage(),staffPage=await staff.newPage();for(const page of [bossPage,staffPage]){await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+08:00'));page.on('pageerror',(error:Error)=>errors.push(error.message));}
 for(const [context,actor,page]of [[staff,employee,staffPage],[boss,admin,bossPage]]as const){
  const created=await call(context,'/api/meeting-reviews',{meetingType:'weekly',meetingAt:'2026-11-05T16:00',periodStart:'2026-10-27',periodEnd:'2026-11-04',name:actor.role+' 周会定稿验收'},201,true);
  const row=await meeting(created.id),initial=(await versions(created.id))[0],material=(await call(context,'/api/meeting-reviews/'+created.id+'/material')).material;
  const draft={...row.draftSnapshot,workflowVersion:6,candidatesConfirmed:true,materialFingerprint:material.fingerprint,coreConclusion:'本周按真实结果核对，无新增推广阶段。',nextAction:'按既定内容继续准备。',situation:'本期尚无可纳入的复盘数据。',strategy:'继续完成实际排期。'};
  await call(context,'/api/meeting-reviews/'+created.id,{action:'finalize_version_draft',stage:'pre',draftVersionId:initial.id,expectedUpdatedAt:row.updatedAt.toISOString(),draft});
  await nav(page,created.id);await page.getByRole('radio',{name:'编辑模式',exact:true}).check();assert(await page.getByRole('button',{name:'会后定稿 V1',exact:true}).isEnabled());await shots(page,actor.role+'-weekly-enabled');
  if(actor.role==='employee'){await nav(bossPage,created.id);await bossPage.getByRole('radio',{name:'编辑模式',exact:true}).check();assert(await bossPage.getByRole('button',{name:'会后定稿 V1',exact:true}).isEnabled());await shots(bossPage,'admin-same-weekly-enabled');}
  await page.getByRole('button',{name:'会后定稿 V1',exact:true}).click();await respondToBusinessConfirm(page,false);assert.equal((await versions(created.id)).length,1);
  await page.getByRole('button',{name:'会后定稿 V1',exact:true}).click();await respondToBusinessConfirm(page,true);await page.waitForURL(/version=1/);await settleBusinessUI(page);
  const latest=(await versions(created.id))[0];assert.equal((latest.snapshot as any).finalizationStage,'post');assert.equal(latest.lifecycleStatus,'finalized');assert.equal(latest.pdfStatus,'ready');assert.equal((await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.meetingId,created.id))).length,0);
  checks.push(actor.role+'：无月计划的周会，维持原文字也可从会前转会后；取消不新增版本，真实保存及PDF成功');
 }
 const bossCookie=(await boss.cookies()).map((v:any)=>v.name+'='+v.value).join('; '),setup=await prepareMonthlyArrangement(db,baseURL,bossCookie,{stage:'pre'}),pre=(await versions(setup.meetingId))[0];
 await nav(staffPage,setup.meetingId);await staffPage.getByRole('radio',{name:'编辑模式',exact:true}).check();assert(await staffPage.getByRole('button',{name:'确认预排期 V1',exact:true}).isDisabled());await shots(staffPage,'employee-monthly-first-blocked');
 const row=await meeting(setup.meetingId),payload={action:'finalize_version_draft',stage:'post',sourceVersionId:pre.id,expectedUpdatedAt:row.updatedAt.toISOString(),discussion:discussionFromDraft(row.draftSnapshot)};
 await call(staff,'/api/meeting-reviews/'+setup.meetingId,payload,403);assert.equal((await versions(setup.meetingId)).length,1);assert.equal((await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.id,setup.planId)))[0].firstFinalizedAt,null);
 await nav(bossPage,setup.meetingId);await bossPage.getByRole('radio',{name:'编辑模式',exact:true}).check();assert(await bossPage.getByRole('button',{name:'确认预排期 V1',exact:true}).isEnabled());await shots(bossPage,'admin-monthly-first-enabled');
 await bossPage.getByRole('button',{name:'确认预排期 V1',exact:true}).click();await respondToBusinessConfirm(bossPage,true);await bossPage.waitForURL(/version=1/);await settleBusinessUI(bossPage);
 checks.push('月会首次预排期：员工按钮禁用、直调接口403且无变化；管理员真实点击确认成功');
 await nav(staffPage,setup.meetingId);await staffPage.getByRole('radio',{name:'编辑模式',exact:true}).check();await staffPage.getByRole('button',{name:'修改核心结论',exact:true}).click();await staffPage.getByRole('textbox',{name:'核心结论',exact:true}).fill('预排期已确认，员工补充核对说明。');await staffPage.getByRole('heading',{name:'下一步行动',exact:true}).click();assert(await staffPage.getByRole('button',{name:/确认预排期 V/}).isEnabled());await shots(staffPage,'employee-monthly-confirmed-edit');
 const originalPlan=(await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.id,setup.planId)))[0];
 await staffPage.getByRole('button',{name:/确认预排期 V/}).click();await respondToBusinessConfirm(staffPage,true);await staffPage.waitForURL(/version=2/);await settleBusinessUI(staffPage);
 const editedPlan=(await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.id,setup.planId)))[0];assert.deepEqual(editedPlan.content,originalPlan.content);assert.equal(editedPlan.firstFinalizedAt?.toISOString(),originalPlan.firstFinalizedAt?.toISOString());assert.equal(editedPlan.sealedVersionId,null);
 checks.push('月会预排期已确认后，员工原有文字修订真实保存成功，不重置确认时间、不改计划、不提前封存');
 const endpoint='/api/monthly-plans/'+setup.planId+'/arrangement',state=await call(boss,endpoint),confirm={action:'confirm',fingerprint:state.fingerprint,requestId:randomUUID(),reason:'隔离验收：管理员核对当前空排期并最终封存'};
 await call(staff,endpoint,confirm,403);assert.equal((await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.id,setup.planId)))[0].sealedVersionId,null);await call(boss,endpoint,confirm);
 const plan=(await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.id,setup.planId)))[0];assert(plan.sealedVersionId);
 for(const [context,page,actor]of [[staff,staffPage,employee],[boss,bossPage,admin]]as const){
  await call(context,'/api/meeting-reviews/'+setup.meetingId,{...payload,expectedUpdatedAt:(await meeting(setup.meetingId)).updatedAt.toISOString()},403);
  await nav(page,setup.meetingId);await page.getByRole('radio',{name:'编辑模式',exact:true}).check();assert.equal(await page.getByRole('button',{name:/确认预排期 V/}).count(),0);assert.equal(await page.getByRole('button',{name:'保存文字修订',exact:true}).count(),1);await shots(page,actor.role+'-monthly-sealed-text-only');
 }
 checks.push('月会封存：员工直调403、管理员成功；封存后双方普通修改均403，界面仅保留既有两项文字修订入口');
 assert.deepEqual(errors,[]);await boss.close();await staff.close();const videos={admin:await bossPage.video().path(),employee:await staffPage.video().path()};await writeFile(dir+'/checks.json',JSON.stringify({checks,errors,videos,isolatedPostgres:true},null,2));console.log(checks.join('\n'));
}finally{await browser?.close();await f.stop();}
