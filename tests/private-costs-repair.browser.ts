import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {and,eq,gte,lte} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {admin,employee} from './auth.fixture';
import {settleBusinessUI,respondToBusinessConfirm} from './business-confirm.helper';
import {seedPrivateSources,seedFrozenPrivateMeeting,octoberData} from './private-sources.fixture';
import {sourceCountsProjection} from '../src/db/monthly-private-sources';
import * as s from '../src/db/schema';

const dir=process.env.COST_REPAIR_DIR??'.tools/test-artifacts/private-costs-repair';
for(const sub of ['screenshots','video','pdf'])await mkdir(`${dir}/${sub}`,{recursive:true});
const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-06T12:00:00+08:00');
const fixture=await startPostgresFixture({clockFile,entry:process.env.COST_REPAIR_ENTRY}),{db,baseURL}=fixture;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);
let browser:any,context:any,page:any;const checks:string[]=[],images:any[]=[],errors:string[]=[];
const mark=(label:string)=>{checks.push(label);console.log('PASS '+label);};
const costs={added:1395.13,consulted:1860.18,converted:2790.27};
async function go(path:string){await page.goto(baseURL+path);await settleBusinessUI(page);}
async function api(path:string,data?:unknown){const r=data===undefined?await context.request.get(baseURL+path):await context.request.patch(baseURL+path,{headers:{Origin:baseURL},data});assert.equal(r.status(),200,await r.text());return r.json();}
const read=()=>api('/api/monthly-operations?month=2026-10');
const save=(data:any,month='2026-10')=>api('/api/monthly-private-data',{month,expectedRevision:-1,data});
const input=(label:string)=>page.locator('#monthly-private-sheet').getByRole('spinbutton',{name:label,exact:true});
const sheet=()=>page.locator('#monthly-private-sheet');
async function openEditor(){await page.getByRole('button',{name:'录入／更正',exact:true}).click();await settleBusinessUI(page);}
async function screenshot(name:string,fullPage=true){
 await page.mouse.move(0,0);await settleBusinessUI(page);
 if(fullPage){for(const target of await page.locator('[data-chart-pending]').elementHandles()){await target.scrollIntoViewIfNeeded();await settleBusinessUI(page);}await page.evaluate(()=>scrollTo(0,0));await settleBusinessUI(page);}
 const geometry=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,font:getComputedStyle(document.querySelector('.mc-value')??document.body).fontFamily,metrics:[...document.querySelectorAll('.mc-value')].map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,text:n.textContent,overflow:n.scrollWidth>n.clientWidth+1};})}));
 assert(geometry.scrollWidth<=geometry.viewport+1,JSON.stringify({name,geometry}));assert(!geometry.metrics.some((n:any)=>n.overflow),JSON.stringify({name,metrics:geometry.metrics}));
 await page.screenshot({path:`${dir}/screenshots/${name}.png`,fullPage});images.push({name,...geometry});
}
try{
 await seedPrivateSources(db);
 const records=await db.select({metric:s.operationsPromotionDailyMetric,subject:s.operationsContentVersion.subjectId,category:s.operationsContentVersion.categoryId,scheduleId:s.operationsContentSchedule.id}).from(s.operationsPromotionDailyMetric).innerJoin(s.operationsPromotionCampaign,eq(s.operationsPromotionCampaign.id,s.operationsPromotionDailyMetric.campaignId)).innerJoin(s.operationsContentSchedule,eq(s.operationsContentSchedule.id,s.operationsPromotionCampaign.scheduleId)).innerJoin(s.operationsContentVersion,eq(s.operationsContentVersion.id,s.operationsContentSchedule.contentVersionId)).where(and(gte(s.operationsPromotionDailyMetric.metricDate,'2026-10-01'),lte(s.operationsPromotionDailyMetric.metricDate,'2026-10-31')));
 for(const row of records){
  if(row.subject==='tmua'&&row.category==='small-class-or-tutoring'||row.subject==='interview'&&row.category==='interview-course')await db.update(s.operationsPromotionDailyMetric).set({spend:row.subject==='tmua'?'1483.39':'4097.14'}).where(eq(s.operationsPromotionDailyMetric.id,row.metric.id));
  else{await db.delete(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.id,row.metric.id));await db.delete(s.operationsPromotionStage).where(eq(s.operationsPromotionStage.campaignId,row.metric.campaignId));await db.delete(s.operationsPromotionCampaign).where(eq(s.operationsPromotionCampaign.id,row.metric.campaignId));}
 }
 await db.delete(s.operationsMonthlyPrivate).where(eq(s.operationsMonthlyPrivate.month,'2026-10'));
 await db.delete(s.operationsMonthlyPrivate).where(eq(s.operationsMonthlyPrivate.month,'2026-09'));
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:dir+'/video',size:{width:1440,height:1000}}});
 assert.equal((await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:admin})).status(),200);
 page=await context.newPage();page.on('pageerror',(e:Error)=>errors.push(e.message));
 await go('/business/monthly-operations?month=2026-10');await openEditor();
 assert.equal(await sheet().locator('.ps-input-row').count(),2);assert.deepEqual(await sheet().locator('.ps-input-row strong').allTextContents(),['课程','课程']);
 for(const [subject,values] of [['TMUA',[3,3,2]],['面试课',[1,0,0]]] as const)for(const [i,label]of ['私域增加人数','课程意向人数','成交人数'].entries())await input(`${subject}·课程${label}`).fill(String(values[i]));
 await sheet().getByRole('button',{name:'保存',exact:true}).click();await sheet().waitFor({state:'hidden'});
 assert.deepEqual((await read()).privateData.totalCosts,costs);assert.match(await page.locator('[data-monthly-cost-results]').innerText(),/1,395.13/);
 assert.equal(await page.locator('.ps-disclosure').count(),2);assert.equal(await page.locator('.ps-disclosure[open]').count(),0);
 mark('真实旧口径首次录入仅生成两门实际推广课程，保存后学科与顶部成本回显一致');
 const baseline=(await read()).privateData.sourceData;
 const corrupt={...structuredClone(baseline),promotion:[...baseline.promotion,...['tmua','interview'].map(subjectId=>({subjectId,demand:'handout' as const,added:null,consulted:null,converted:null}))]};
 await db.update(s.operationsMonthlyPrivate).set({data:{...corrupt,...sourceCountsProjection(corrupt)}}).where(eq(s.operationsMonthlyPrivate.month,'2026-10'));
 const before=(await db.select().from(s.operationsMonthlyPrivate).where(eq(s.operationsMonthlyPrivate.month,'2026-10')))[0];
 assert.deepEqual((await read()).privateData.totalCosts,costs);
 assert.deepEqual((await db.select().from(s.operationsMonthlyPrivate).where(eq(s.operationsMonthlyPrivate.month,'2026-10')))[0],before,'读取不改写旧占位记录或历史');
 await save(corrupt);const stored=(await db.select().from(s.operationsMonthlyPrivate).where(eq(s.operationsMonthlyPrivate.month,'2026-10')))[0];assert.equal((stored.data as any).promotion.length,2);assert.deepEqual((stored.data as any).total,{added:4,consulted:3,converted:2});
 mark('已存空讲义读取即时修复且不写库，正常保存清理占位并保持推广兼容投影');
 const value=await read();assert.equal(value.core.comparison.privateData.sourceData,null);assert(value.core.comparison.spend.spend>0);assert.equal(value.core.costHistory.length,6);assert.equal(value.core.costHistory.at(-2).added,null);
 assert.equal(value.core.costHistory.at(-1).added,costs.added);assert(value.core.costHistory.at(-2).actualOpenCost!==null);
 mark('上月没有私域数据仍保留推广消耗和开口留资比较，六个月序列按指标缺值断开');
 await go('/business/monthly-operations?month=2026-10');
 for(const label of ['推广总消耗','开口成本','留资成本'])assert.equal(await page.locator(`[data-cost-metric="${label}"] .ps-change`).count(),1);
 assert.equal(await page.locator('[data-cost-metric="私域增加成本"] .ps-change').count(),0);
 await page.locator('.ps-disclosure[aria-label="推广来源"]>summary').click();
 let writes=0;page.on('request',(request:any)=>{if(request.method()==='PATCH'&&request.url().includes('/api/monthly-private-data'))writes++;});
 await openEditor();await input('TMUA·课程私域增加人数').fill('4');
 await page.route('**/api/monthly-operations?**',(route:any)=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'本机故障注入：结果读取失败'})}));
 await sheet().getByRole('button',{name:'保存',exact:true}).click();await sheet().getByRole('status').filter({hasText:'已保存，页面结果暂未更新'}).waitFor();
 assert.equal(writes,1);assert.equal((await read()).privateData.data.total.added,5);await page.screenshot({path:dir+'/screenshots/saved-refresh-failed-1440.png'});
 await page.unroute('**/api/monthly-operations?**');await sheet().getByRole('button',{name:'刷新结果',exact:true}).click();await sheet().waitFor({state:'hidden'});assert.equal(writes,1);
 assert.equal(await page.locator('.ps-disclosure[aria-label="推广来源"]').getAttribute('open'),'');
 mark('PATCH成功、读取503明确区分；重试只读不重写，展开状态保留');
 await openEditor();await input('TMUA·课程私域增加人数').fill('5');
 let release!:()=>void,entered!:()=>void;const waiting=new Promise<void>(resolve=>entered=resolve),gate=new Promise<void>(resolve=>release=resolve);
 await page.route('**/api/monthly-operations?**',async(route:any)=>{entered();await gate;await route.continue();});
 await sheet().getByRole('button',{name:'保存',exact:true}).click();await waiting;await input('TMUA·课程私域增加人数').fill('6');release();
 await sheet().getByRole('status').filter({hasText:'还有新修改待保存'}).waitFor();assert.equal(await input('TMUA·课程私域增加人数').inputValue(),'6');
 await page.unroute('**/api/monthly-operations?**');await sheet().getByRole('button',{name:'保存',exact:true}).click();await sheet().waitFor({state:'hidden'});
 mark('慢刷新期间的新输入与dirty保留，后续正常保存不丢修改');
 await openEditor();await input('TMUA·课程私域增加人数').fill('7');let answered=respondToBusinessConfirm(page);await page.keyboard.press('Escape');await answered;assert.equal(await input('TMUA·课程私域增加人数').inputValue(),'7');
 answered=respondToBusinessConfirm(page,true);await page.keyboard.press('Escape');await answered;await sheet().waitFor({state:'hidden'});
 await save({...baseline,nonPromotion:octoberData.nonPromotion.slice(0,2)});
 mark('关闭取消、键盘与未保存输入保护沿用公共实现');
 const partial=structuredClone(baseline);partial.promotion[0].consulted=null;await save(partial);const missing=await read();assert.equal(missing.privateData.totalCosts.added,costs.added);assert.equal(missing.privateData.totalCosts.consulted,null);assert.equal(missing.privateData.totalCosts.converted,costs.converted);await save(baseline);
 const paidUnknown=records.find(row=>row.subject==='tmua'&&row.category==='promotional-handout')!;
 const [campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:paidUnknown.scheduleId,startedOn:paidUnknown.metric.metricDate,dailyReviewEnabledOn:paidUnknown.metric.metricDate,initialStage:'scaling',currentStatus:'ended',endedOn:paidUnknown.metric.metricDate}).returning();
 const {id:_metricId,campaignId:_campaignId,...fact}=paidUnknown.metric;await db.insert(s.operationsPromotionDailyMetric).values({...fact,campaignId:campaign.id,spend:'0.00'});
 const zeroPending=await read();assert.equal(zeroPending.privateData.sourceData.promotion.length,3);assert.equal(zeroPending.privateData.totalCosts.added,null);
 await db.delete(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.campaignId,campaign.id));await db.delete(s.operationsPromotionCampaign).where(eq(s.operationsPromotionCampaign.id,campaign.id));
 mark('三项完整性独立；真实0元推广用途仍保留，未填人数不能被忽略');
 const monthly=await seedFrozenPrivateMeeting(db,'2026-10','10月月例会 · 课程成本核对');
 const legacy=await seedFrozenPrivateMeeting(db,'2026-07','7月月例会 · 旧口径归档',true);
 const long=await seedFrozenPrivateMeeting(db,'2026-06','6月月例会 · 长金额核对');
 const frozen=structuredClone(monthly.snapshot);
 await db.update(s.operationsMonthlyPlan).set({sealedVersionId:null,arrangementStatus:'editing'}).where(eq(s.operationsMonthlyPlan.id,monthly.plan.id));
 await go('/business/meeting-review?meeting='+monthly.meeting.id);assert.equal(await page.locator('.mc-value').count(),6);assert.equal(await page.locator('.ps-disclosure[open]').count(),0);
 await save(partial);await page.reload();await settleBusinessUI(page);assert.match(await page.locator('[data-cost-metric="课程意向成本"]').innerText(),/—/);
 await db.update(s.operationsMonthlyPlan).set({sealedVersionId:monthly.version.id,arrangementStatus:'confirmed'}).where(eq(s.operationsMonthlyPlan.id,monthly.plan.id));await page.reload();await settleBusinessUI(page);assert.match(await page.locator('[data-cost-metric="课程意向成本"]').innerText(),/1,860.18/);
 assert.deepEqual((await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,monthly.version.id)))[0].snapshot,frozen);await save({...baseline,nonPromotion:octoberData.nonPromotion.slice(0,2)});
 mark('未封存当前月会读取最新成本，封存后的六个月趋势与事实保持原快照');
 const flowVideo=page.video();await context.close();await flowVideo.saveAs(dir+'/video/save-retry-flow.webm');
 context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:admin});page=await context.newPage();
 for(const width of [1920,1440,1024]){
  await page.setViewportSize({width,height:1000});await go('/business/monthly-operations?month=2026-10');await screenshot('monthly-collapsed-'+width);
  for(const summary of await page.locator('.ps-disclosure>summary').all())await summary.click();await screenshot('monthly-expanded-'+width);
  await openEditor();await screenshot('editor-'+width,false);await page.keyboard.press('Escape');await sheet().waitFor({state:'hidden'});
  await go('/business/meeting-review?meeting='+monthly.meeting.id);await screenshot('meeting-'+width);
  await page.getByRole('button',{name:'历史月份',exact:true}).click();const history=page.locator('#monthly-history-sheet');await history.locator('input[type="month"]').fill('2026-09');await history.locator('[data-monthly-cost-results]').waitFor();await settleBusinessUI(page);assert.equal(await history.getByText('学科私域结果',{exact:true}).count(),0);assert.equal(await history.locator('.monthly-subject-summary').count(),0);await screenshot('history-missing-'+width,false);await page.keyboard.press('Escape');await history.waitFor({state:'hidden'});
 }
 mark('三档桌面运营／月会／录入／历史实际渲染，无空学科需求表与页面级溢出');
 await page.setViewportSize({width:1440,height:1000});await go('/business/monthly-operations?month=2026-10');
 const priorMonth=await api('/api/monthly-operations?month=2026-09');
 await page.route('**/api/monthly-operations?month=2026-09*',async(route:any)=>{await new Promise(resolve=>setTimeout(resolve,800));await route.fulfill({json:priorMonth});});
 const oldRequest=page.waitForRequest((r:any)=>r.url().includes('/api/monthly-operations?month=2026-09'));
 await page.locator('input[name=month]').fill('2026-09');await oldRequest;await page.locator('input[name=month]').fill('2026-08');await page.locator('[data-report-month="2026-08"]').waitFor();await page.waitForTimeout(900);
 assert.equal(await page.locator('input[name=month]').inputValue(),'2026-08');assert.equal(await page.locator('[data-report-month]').getAttribute('data-report-month'),'2026-08');await page.unroute('**/api/monthly-operations?month=2026-09*');
 mark('快速切月旧响应不覆盖新选择，来源折叠按月份重置');
 await page.setViewportSize({width:1440,height:1000});await go('/business/meeting-review?meeting='+long.meeting.id);await page.getByRole('button',{name:'历史月份',exact:true}).click();await page.locator('#monthly-history-sheet input[type=month]').fill('2026-06');await page.locator('#monthly-history-sheet .mc-value').first().filter({hasText:'12,345,678.90'}).waitFor();await screenshot('history-long-1440',false);await page.keyboard.press('Escape');
 await go('/business/meeting-review?meeting='+legacy.meeting.id);assert.equal(await page.locator('.mc-value').count(),0);assert.equal(await page.locator('.monthly-private-results').count(),1);await screenshot('legacy-frozen-1440');
 for(const [name,version]of [['meeting-costs',monthly.version],['meeting-legacy',legacy.version],['meeting-long',long.version]] as const){const r=await context.request.post(baseURL+'/api/meeting-versions/'+version.id+'/pdf',{headers:{Origin:baseURL},data:{}});assert.equal(r.status(),200,await r.text());const result=await r.json();assert.equal(result.status,'ready');const pdf=await context.request.get(baseURL+'/api/meeting-attachments/'+result.id);assert.equal(pdf.status(),200);await writeFile(`${dir}/pdf/${name}.pdf`,await pdf.body());}
 mark('三份正式渲染PDF含完整来源，旧封存展示保持；长金额历史两列不截断');
 await page.setViewportSize({width:390,height:844});await go('/business/monthly-operations?month=2026-10');await screenshot('monthly-mobile-390');await openEditor();await screenshot('editor-mobile-390',false);await page.keyboard.press('Escape');await sheet().waitFor({state:'hidden'});mark('390px仅核查页面溢出、明显遮挡和关闭保存入口');
 await context.close();context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:dir+'/video',size:{width:1440,height:1000}}});await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:employee});page=await context.newPage();
 await go('/business/monthly-operations?month=2026-10');await page.reload();await settleBusinessUI(page);await page.getByRole('link',{name:'排期管理',exact:true}).first().click();await page.waitForURL('**/business/operations-schedule**');await page.getByRole('link',{name:'月度运营',exact:true}).first().click();await page.waitForURL('**/business/monthly-operations**');await settleBusinessUI(page);assert.equal(await page.locator('[data-monthly-cost-results]').count(),1);const firstPaint=page.video();await context.close();await firstPaint.saveAs(dir+'/video/first-paint.webm');
 assert.deepEqual(errors,[]);await writeFile(dir+'/checks.json',JSON.stringify({checks,images,errors,dataSource:'tests/private-sources.fixture.ts＋仅课程／空讲义隔离数据；全部位于本机独立PostgreSQL',baseURL},null,2));console.log('COST_REPAIR_OK '+checks.length);
}finally{await browser?.close();await fixture.stop();}
