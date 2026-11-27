/** 空报表默认零与手填零；实际运行包、隔离数据库和上游协议故障注入。 */
import assert from 'node:assert/strict';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {and,eq} from 'drizzle-orm';
import {startFixture,admin,employee} from './auth.fixture';
import {settleBusinessUI} from './business-confirm.helper';
import {withDatabase,type Database} from '../src/db/client';
import {saveJuguangConnection} from '../src/integrations/xiaohongshu-juguang';
import {juguangMetricFields} from '../src/integrations/juguang-metric-types';
import * as s from '../src/db/schema';

process.env.NODE_ENV='test';process.env.XHS_JUGUANG_APP_ID='42';process.env.XHS_JUGUANG_APP_SECRET='fictional-app-secret';process.env.BETTER_AUTH_SECRET='fictional-browser-secret-at-least-32-characters';process.env.JUGUANG_PGLITE_TEST='1';
const dir=process.env.EMPTY_REPORT_DIR??'.tools/test-artifacts/juguang-empty-report';await mkdir(dir,{recursive:true});
const scenario=process.cwd()+'/'+dir+'/scenario.json',clock=process.cwd()+'/'+dir+'/clock.txt';
process.env.JUGUANG_SCENARIO_FILE=scenario;
const reports={11:[{time:'2026-11-20',note_id:'cccccccccccccccccccccccc',fee:'0',impression:'0',click:'0',initiative_message:'0',msg_leads_num:'0'}]};
await writeFile(scenario,JSON.stringify({reports,hold:true}));await writeFile(scenario+'.calls','');await writeFile(clock,'2026-11-27T10:00:00+08:00');
const f=await startFixture({clockFile:clock,entry:'tests/juguang-server.fixture.mjs'}),db=f.db as unknown as Database;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);const browser=await chromium.launch({headless:true,args:['--disable-gpu','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:dir+'/video',size:{width:1440,height:1000}}});
type Case={key:string;campaign:typeof s.operationsPromotionCampaign.$inferSelect;stage:'testing'|'scaling';date:string};
let page:any;const checks:string[]=[],pageErrors:string[]=[];
const metrics=(item:Case)=>db.select().from(s.operationsPromotionDailyMetric).where(and(eq(s.operationsPromotionDailyMetric.campaignId,item.campaign.id),eq(s.operationsPromotionDailyMetric.metricDate,item.date)));
async function seed(key:string,name:string,stage:Case['stage']='testing',date='2026-11-20'):Promise<Case>{
 const [content]=await db.insert(s.operationsContent).values({platformNoteId:key.repeat(24),operationType:'promotion_only'}).returning();
 const [version]=await db.insert(s.operationsContentVersion).values({contentId:content.id,contentName:'隔离样例 · '+name,versionNumber:0,workType:'new',subjectId:'tmua',categoryId:'temporary'}).returning();
 const [schedule]=await db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,isPromoted:true,promotionStatus:stage,completionStatus:'on_time',plannedPublishAt:new Date(date+'T10:00:00+08:00'),actualPublishAt:new Date(date+'T10:00:00+08:00')}).returning();
 const [campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:schedule.id,startedOn:date,dailyReviewEnabledOn:date,initialStage:stage,currentStage:stage,currentStatus:stage}).returning();
 await db.insert(s.operationsPromotionStage).values({campaignId:campaign.id,stageType:stage,startedOn:date});return {key,campaign,stage,date};
}
const form=(item:Case)=>page.locator('form[data-metric-form][data-pending-record="'+item.campaign.id+':'+item.date+'"]');
async function shot(name:string){await page.locator('.review-entry-scroll').evaluateAll((nodes:HTMLElement[])=>{for(const node of nodes)node.scrollLeft=0;});await settleBusinessUI(page);await page.mouse.move(0,0);await page.screenshot({path:dir+'/'+name+'.png'});}
async function completeInput(item:Case){
 for(const name of ['actualOpenCount','actualLeadCount'])await form(item).locator('[name='+name+']').fill('0');
 await form(item).locator('select[name=reviewDecision]').selectOption(item.stage==='testing'?'test_discarded':'ended');
}
async function submit(item:Case,status=201){
 const [response]=await Promise.all([page.waitForResponse((r:any)=>r.url()===f.baseURL+'/api/promotion-daily'&&r.request().method()==='POST'),form(item).getByRole('button',{name:'完成复盘',exact:true}).click()]);
 const body=await response.json();assert.equal(response.status(),status,JSON.stringify(body));return body;
}
try{
 assert.equal((await context.request.post(f.baseURL+'/api/auth/sign-in/username',{headers:{Origin:f.baseURL},data:admin})).status(),200);
 const actor=(await (await context.request.get(f.baseURL+'/api/auth/get-session')).json()).user;
 const a=await seed('a','空报表默认零'),b=await seed('b','保留手填值','scaling'),c=await seed('c','官方真实零','scaling');
 await withDatabase(db,()=>saveJuguangConnection({access_token:'fictional-access',refresh_token:'fictional-refresh',access_token_expires_in:86400,refresh_token_expires_in:2592000,user_id:'fictional-upstream',platform_type:1,scope:'["report_service"]',approval_advertisers:[{advertiser_id:11,advertiser_name:'隔离报表账户'}]},'42',actor.id));
 page=await context.newPage();page.on('pageerror',(e:Error)=>pageErrors.push(e.message));await page.goto(f.baseURL+'/business/daily-promotion-review?view=daily');await form(a).waitFor();
 // 先触发真实原生必填提示，再让慢报表返回，核对默认0不会留下旧错误。
 await form(a).getByRole('button',{name:'完成复盘',exact:true}).click();assert.match(await form(a).locator('[name=spend]').evaluate((n:HTMLInputElement)=>n.validationMessage),/请填写/);
 for(const [name,value]of Object.entries({spend:'5.25',platformOpenCount:'2',impressionCount:'4',clickCount:'1'}))await form(b).locator('[name='+name+']').fill(value);
 await writeFile(scenario,JSON.stringify({reports}));
 for(const item of [a,b])await form(item).locator('[data-juguang-summary]').filter({hasText:'暂无报表'}).waitFor();
 await form(c).locator('[data-juguang-summary]').filter({hasText:'待保存'}).waitFor();
 for(const name of juguangMetricFields){assert.equal(await form(a).locator('[name='+name+']').inputValue(),'0');assert(await form(a).locator('[name='+name+']').evaluate((n:HTMLInputElement)=>n.checkValidity()));}
 for(const name of ['actualOpenCount','actualLeadCount'])assert.equal(await form(a).locator('[name='+name+']').inputValue(),'');
 assert.equal(await form(a).locator('[name=juguangReceipt]').inputValue(),'');assert.equal(await form(a).locator('[data-juguang-ctr]').innerText(),'—');
 for(const [name,value]of Object.entries({spend:'5.25',platformOpenCount:'2',impressionCount:'4',clickCount:'1'}))assert.equal(await form(b).locator('[name='+name+']').inputValue(),value);
 assert.equal((await db.select().from(s.operationsPromotionDailyMetric)).length,0);await form(a).locator('[name=spend]').scrollIntoViewIfNeeded();await shot('admin-default-zero-1440');
 await page.setViewportSize({width:1024,height:1000});await form(a).locator('[name=spend]').scrollIntoViewIfNeeded();await shot('admin-default-zero-1024');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.setViewportSize({width:1440,height:1000});
 await form(a).getByRole('button',{name:'查看聚光数据来源',exact:true}).click();await shot('empty-report-explanation-1440');await page.keyboard.press('Escape');
 checks.push('空报表只填空白投放五项，实际人数和安排仍需填写；保留已输入非零值，不生成来源或写库，零曝光的点击率未知；慢读回填清理旧原生错误');
 await completeInput(a);
 const invalidReceiptBody=await form(a).evaluate((node:HTMLFormElement)=>({...Object.fromEntries(new FormData(node)),fingerprint:node.dataset.fingerprint!}));
 const invalidReceipt=await context.request.post(f.baseURL+'/api/promotion-daily',{headers:{Origin:f.baseURL},multipart:{...invalidReceiptBody,juguangReceipt:'forged.receipt'}});assert.equal(invalidReceipt.status(),409);assert.equal((await metrics(a)).length,0);
 await submit(a);const [savedA]=await metrics(a);assert.equal(savedA.spend,'0.00');assert.equal(savedA.impressionCount,0);assert.equal(savedA.clickCount,0);assert.equal(savedA.clickRate,null);assert.equal(savedA.juguangSource,null);
 await completeInput(b);const rejected=await submit(b,422);assert.match(rejected.message,/同时填 0|同时填0/);assert.equal((await metrics(b)).length,0);
 await form(b).locator('[name=impressionCount]').fill('0');await form(b).locator('[name=clickCount]').fill('0');await submit(b);const [savedB]=await metrics(b);assert.equal(savedB.spend,'5.25');assert.equal(savedB.platformOpenCount,2);assert.equal(savedB.juguangSource,null);
 await completeInput(c);await submit(c);const [savedC]=await metrics(c);assert.equal(savedC.impressionCount,0);assert.equal(savedC.clickCount,0);assert(savedC.juguangSource);
 const edit=new FormData();for(const[k,v]of Object.entries({...savedA,actualLeadCount:1,expectedUpdatedAt:savedA.updatedAt.toISOString()}))if(v!=null)edit.set(k,String(v));
 const updated=await context.request.patch(f.baseURL+'/api/promotion-daily/'+savedA.id,{headers:{Origin:f.baseURL},multipart:Object.fromEntries(edit)});assert.equal(updated.status(),200,await updated.text());assert.equal((await metrics(a))[0].actualLeadCount,1);
 checks.push('空报表的无来源0/0、原生测试／放量次日安排、官方真实零可正常保存；历史更正共用规则；无来源非零及伪造来源仍拒绝，保留已有金额和人数');
 const d=await seed('d','读取失败保留未知','testing','2026-11-21');await writeFile(scenario,JSON.stringify({network:true}));await page.reload();await form(d).locator('[data-juguang-summary]').filter({hasText:'读取失败'}).waitFor();
 for(const name of juguangMetricFields)assert.equal(await form(d).locator('[name='+name+']').inputValue(),'');await shot('network-failure-1440');
 await db.update(s.xiaohongshuJuguangConnection).set({refreshTokenExpiresAt:new Date(0)});await writeFile(scenario,'{}');await page.reload();await form(d).locator('[data-juguang-summary]').filter({hasText:'读取失败'}).waitFor();
 for(const name of juguangMetricFields)assert.equal(await form(d).locator('[name='+name+']').inputValue(),'');
 await db.update(s.xiaohongshuJuguangConnection).set({refreshTokenExpiresAt:new Date(Date.now()+30*86400000)});
 for(const name of [...juguangMetricFields,'actualOpenCount','actualLeadCount'])await form(d).locator('[name='+name+']').fill('0');await completeInput(d);await submit(d);assert.equal((await metrics(d))[0].impressionCount,0);
 checks.push('断网和授权失效不会自动补零；用户明确手填0/0仍可保存，不要求重新读报表');
 const adminVideo=page.video();
 const e=await seed('e','员工批量一','testing','2026-11-22'),g=await seed('f','员工批量二','scaling','2026-11-22');await writeFile(scenario,'{}');
 const staff=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});assert.equal((await staff.request.post(f.baseURL+'/api/auth/sign-in/username',{headers:{Origin:f.baseURL},data:employee})).status(),200);page=await staff.newPage();page.on('pageerror',(e:Error)=>pageErrors.push(e.message));await page.goto(f.baseURL+'/business/daily-promotion-review?view=daily');
 for(const item of [e,g]){await form(item).locator('[data-juguang-summary]').filter({hasText:'暂无报表'}).waitFor();for(const name of juguangMetricFields)assert.equal(await form(item).locator('[name='+name+']').inputValue(),'0');await completeInput(item);}
 await shot('employee-batch-zero-1440');
 await form(g).locator('[name=impressionCount]').fill('1');
 async function batch(status:number){const [r]=await Promise.all([page.waitForResponse((r:any)=>r.url()===f.baseURL+'/api/promotion-daily/batch'&&r.request().method()==='POST'),page.getByRole('button',{name:/^一键保存/}).click()]);assert.equal(r.status(),status,await r.text());}
 await batch(422);assert.equal((await metrics(e)).length,0);assert.equal((await metrics(g)).length,0);
 await form(g).locator('[name=impressionCount]').fill('0');await batch(201);assert.equal((await metrics(e)).length,1);assert.equal((await metrics(g)).length,1);
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 checks.push('员工同一默认零行为与一键保存成功；整批中有不合法非零时全部回滚，改为0后可原批重试；390仅核查明显页面溢出');
 assert.deepEqual(pageErrors,[]);await staff.close();await context.close();await copyFile(await adminVideo.path(),dir+'/defaults-and-save.webm');
 await writeFile(dir+'/result.json',JSON.stringify({passed:true,database:'PGlite',productionWrites:false,video:'defaults-and-save.webm',checks,pageErrors},null,2));console.log(checks.join('\n'));
}catch(error){await page?.screenshot({path:dir+'/failure.png'}).catch(()=>{});console.error(f.logs().slice(-2200));throw error;}finally{await browser.close();await f.stop();}
