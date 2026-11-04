import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startFixture,admin,employee} from './auth.fixture';
import {businessFetch} from './business-request.helper';
import {settleBusinessUI,respondToBusinessConfirm} from './business-confirm.helper';
import * as s from '../src/db/schema';
const folder=process.env.RESULTS_EVIDENCE_DIR||'.tools/test-artifacts/nonpromotion-results';
await mkdir(folder+'/screenshots',{recursive:true});
const clockFile=new URL('../'+folder+'/clock.txt',import.meta.url).pathname;await writeFile(clockFile,'2026-11-24T12:00:00+08:00');
const fixture=await startFixture({clockFile}),{db,baseURL}=fixture;
const {chromium}=await import(new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href),browser=await chromium.launch({headless:true});
let number=0;const errors:string[]=[],checks:string[]=[];
async function login(actor:typeof admin|typeof employee){const response=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(actor)});assert.equal(response.status,200);return response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');}
const cookie=await login(admin);
async function api(path:string){const response=await fetch(baseURL+path,{headers:{Cookie:cookie}});assert.equal(response.status,200);return response.json();}
async function seed(name:string,mode:'standard'|'instant'|'continuous'='standard',category='innovation',source?:any){
 const [content]=source?[source.content]:await db.insert(s.operationsContent).values({platformNoteId:(++number).toString(16).padStart(24,'0')}).returning();
 const [version]=await db.insert(s.operationsContentVersion).values({contentId:content.id,versionNumber:source?1:0,sourceVersionId:source?.version.id,workType:source?'revision':'new',contentName:name,subjectId:'tmua',categoryId:category,projectDocUrl:'https://example.test/document'}).returning();
 const actual=new Date((source?'2026-11-05':'2026-11-02')+'T10:00:00+08:00');
 const [schedule]=await db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:actual,actualPublishAt:actual,completionStatus:'on_time',isPromoted:false,promotionStatus:'none',publicationUrl:'https://www.xiaohongshu.com/explore/'+content.platformNoteId}).returning();
 if(!source)await db.insert(s.operationsNonPromotionReviewPlan).values({contentId:content.id,anchorScheduleId:schedule.id,mode,day7:mode!=='continuous',day15:mode!=='continuous'});
 return {content,version,schedule};
}
async function record(post:any,type:string,through:string,count:number|null,click='12.5',read='67.25'){
 const custom=type.startsWith('custom:')?type.slice(7):null;
 const [metric]=await db.insert(s.operationsContentPerformanceMetric).values({scheduleId:post.schedule.id,checkpointType:type,customCheckpointId:custom,recordedThrough:through,exposureCount:count==null?null:Math.max(count,10000),readCount:count,clickRate:click,threeSecondReadRate:read}).returning();
 await db.insert(s.operationsNonPromotionReview).values({scheduleId:post.schedule.id,metricId:metric.id,checkpointType:type,customCheckpointId:custom,actualPublishAtSnapshot:post.schedule.actualPublishAt,subjectIdSnapshot:'tmua',subjectNameSnapshot:'TMUA',categoryIdSnapshot:post.version.categoryId,categoryNameSnapshot:'隔离分类',contentNameSnapshot:post.version.contentName,exposureCountSnapshot:metric.exposureCount,readCountSnapshot:count,clickRateSnapshot:click,threeSecondReadRateSnapshot:read,cohortSnapshot:{},reviewedByLabel:'隔离验收'});
}
async function node(post:any,dueOn:string){return (await db.insert(s.operationsNonPromotionCustomCheckpoint).values({contentId:post.content.id,scheduleId:post.schedule.id,dueOn}).returning())[0];}
try{
 const standard=await seed('从真题到方法：用反例拆解长条件与逻辑关系'),missing=await seed('旧帖数据：保留已有比率，阅读量尚未记录'),instant=await seed('即时解析：考试当天的重点问题回应','instant');
 await record(standard,'day_7','2026-11-09',1001,'10.01','72.36');await record(standard,'day_15','2026-11-17',2600,'26','70.19');await record(missing,'day_7','2026-11-09',null,'20','60');await record(instant,'day_7','2026-11-09',2000,'20','80');
 const instantNode=await node(instant,'2026-11-04');await record(instant,'custom:'+instantNode.id,instantNode.dueOn,628,'6.28','83.7');
 const legacy=await seed('改版历史：保留事实，不重复进入样本','standard','innovation',standard);await record(legacy,'day_7','2026-11-12',99000,'99','99');
 const handout=await seed('模考讲义：知识结构与错题方法整理','standard','non-promotional-handout');await record(handout,'day_7','2026-11-09',0,'0','52.38');await record(handout,'day_15','2026-11-17',800,'8','64.2');
 const edge=await seed('最大合法阅读量：检查完整数字与列宽','standard','temporary');await record(edge,'day_7','2026-11-09',2147483647,'100','100');
 const missingOnly=await seed('备考须知：旧记录只保留已知比率','standard','exam-guide');await record(missingOnly,'day_7','2026-11-09',null);await record(missingOnly,'day_15','2026-11-17',null);
 const continuous=await seed('持续观察：讲义与模拟考试内容的长期阅读表现','continuous','non-promotional-handout');
 for(const [day,count]of [['2026-11-04',120],['2026-11-06',null],['2026-11-13',560],['2026-11-20',1620]] as const){const n=await node(continuous,day);await record(continuous,'custom:'+n.id,day,count,'15.2','69.8');}
 await node(continuous,'2026-11-28');const awaiting=await seed('持续复盘：等待安排下一次观察日期','continuous');
 const continuousPending=await seed('持续待复盘：本节点使用精简任务行','continuous');await node(continuousPending,'2026-11-23');await node(instant,'2026-11-23');
 const pending=await seed('待复盘内容：核对阅读量空态与快速填写');await seed('即时待复盘：后续日期尚未开放','instant','non-promotional-handout').then(post=>node(post,'2026-11-27'));
 let model=await api('/api/non-promotion-reviews?view=history&mode=standard&group=1');const cohort=model.categoryGroups.find((g:any)=>g.key==='tmua:innovation').rounds[0];
 assert.equal(cohort.count,3);assert.equal(cohort.reading,1500.5);assert.equal(cohort.readingCount,2);assert.equal(cohort.clickCount,3);assert(model.tableRows.some((r:any)=>r.row.id===instant.schedule.id));assert(!model.tableRows.some((r:any)=>r.row.id===legacy.schedule.id));
 assert((await api('/api/non-promotion-reviews?view=history')).tableRows.some((r:any)=>r.row.id===continuous.schedule.id));
 assert((await api('/api/non-promotion-reviews?view=history&mode=instant')).tableRows.every((r:any)=>r.row.mode==='instant'));
 checks.push('标准基准跨方式共享；阅读量独立有效分母；旧版不入样；旧API保持完整队列');
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:folder+'/video-desktop',size:{width:1440,height:1000}}});await context.addCookies(cookie.split('; ').map(c=>({name:c.slice(0,c.indexOf('=')),value:c.slice(c.indexOf('=')+1),url:baseURL})));
 const page=await context.newPage();await page.clock.setFixedTime(new Date('2026-11-24T12:00:00+08:00'));page.on('pageerror',(error:Error)=>errors.push(error.message));
 const nav=async(query:string)=>{await page.goto(baseURL+'/business/non-promotion-review?'+query);await settleBusinessUI(page);};
 const shot=async(name:string)=>{await settleBusinessUI(page);await page.screenshot({path:folder+'/screenshots/'+name+'.png',fullPage:false});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'页面无横向溢出');};
 for(const width of [1920,1440,1024,390,320]){
  await page.setViewportSize({width,height:1000});await nav('view=history&mode=standard&group=1');assert.equal(await page.locator('.category-group-head>span').count(),7);await shot('category-'+width);if(width<=1024){await page.locator('.table-scroll').evaluate((n:HTMLElement)=>n.scrollLeft=n.scrollWidth);await shot('category-right-'+width);await page.locator('.table-scroll').evaluate((n:HTMLElement)=>n.scrollLeft=0);}
  const group=page.locator('[data-category-group="tmua:innovation"]');assert.equal(await group.locator('[data-category-reading=day_7]').textContent(),'1,500.5');await group.locator('summary').click();await shot('category-expanded-'+width);
  const unavailable=page.locator('[data-category-group="tmua:exam-guide"] [data-category-metric=reading]');assert.equal(await unavailable.first().locator('strong').textContent(),'—');assert.equal(await unavailable.first().locator('small').isVisible(),false);
  if(width>=1440){const aligned=await group.locator('[data-round=day_7] strong').evaluateAll((nodes:HTMLElement[])=>nodes.map(n=>n.getBoundingClientRect().top));assert(Math.max(...aligned)-Math.min(...aligned)<=1,'分类三项主值共线');}
  const bounds=await page.evaluate(()=>{const parent=document.querySelector('.category-summary-row')!.getBoundingClientRect(),child=document.querySelector('.category-detail-body')!.getBoundingClientRect();return {left:Math.abs(parent.left-child.left),right:Math.abs(parent.right-child.right)};});assert(bounds.left<=1&&bounds.right<=1,JSON.stringify(bounds));
  await page.locator('[data-review-display] input[value="0"]').check();assert.equal(await page.locator(`[data-inspector-key="${instant.schedule.id}:day_7"]`).isVisible(),false);await shot('history-'+width);await page.locator('[data-review-display] input[value="1"]').check();assert(await group.getAttribute('open')!==null);
  const missingReading=page.locator(`[data-inspector-key="${missing.schedule.id}:day_7"] [data-label=阅读量] strong`);assert.equal(await missingReading.textContent(),'—');assert.equal(await missingReading.getAttribute('aria-label'),'阅读量未记录');
  if(width<=390){
   await page.locator('[data-review-display] input[value="0"]').check();
   const pairs:{primary:number;track:number}[]=await missingReading.locator('..').locator('..').locator('.metric-cell').evaluateAll((nodes:HTMLElement[])=>nodes.map(n=>({primary:n.querySelector('.metric-primary')!.getBoundingClientRect().bottom,track:n.querySelector('.result-track')!.getBoundingClientRect().top})));
   assert(pairs.every(n=>n.track>=n.primary+6),'窄屏差值不被细轨遮挡 '+JSON.stringify(pairs));assert(Math.abs(pairs[0].track-pairs[1].track)<=1,'窄屏两项比率轨道对齐');
   await page.locator('[data-review-display] input[value="1"]').check();
  }
  if(width>=1440){const aligned=await missingReading.locator('..').locator('..').locator('[data-label=阅读量] strong,.metric-primary strong').evaluateAll((nodes:HTMLElement[])=>nodes.map(n=>n.getBoundingClientRect().top));assert(Math.max(...aligned)-Math.min(...aligned)<=1,'事实行缺值与比率主值共线');}
  await nav('view=history&mode=instant');assert.equal(await page.locator('.post-result-heading').count(),1);await shot('instant-'+width);
  await nav('view=history&mode=continuous');const history=page.locator('[data-post-history]');assert.equal(await history.getAttribute('open'),null);await shot('continuous-'+width);await history.locator(':scope>summary').click();await shot('continuous-expanded-'+width);assert.equal(await page.locator('[data-trend-lines] path').count(),2);
  await nav('mode=continuous');await page.locator('summary').filter({hasText:'未到期与后续节点'}).click();await page.locator('summary').filter({hasText:'持续复盘待安排'}).click();await shot('continuous-upcoming-'+width);
  for(const mode of ['instant','continuous','standard']){
   await nav('mode='+mode);assert.equal(await page.locator('.review-table .metric-cell,.review-table .review-read-count').count(),0);assert.equal(await page.locator('.post-metric-head').getByText('阅读量',{exact:true}).count(),0);await shot('pending-'+mode+'-'+width);
  }
  assert.equal(await page.locator('[data-flat-head] [role=columnheader]').count(),4);
  if(width>=1024){const bounds=await page.evaluate(()=>{const main=document.querySelector('.business-console-content')!,table=document.querySelector('.review-workspace')!,style=getComputedStyle(main);return {actual:table.getBoundingClientRect().width,expected:main.getBoundingClientRect().width-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)};});assert(Math.abs(bounds.actual-bounds.expected)<=1,'完整公共画布 '+JSON.stringify(bounds));}
  const row=page.locator(`[data-inspector-key="${pending.schedule.id}:day_7"]`);await row.locator('[data-inspector-trigger]').first().click();await settleBusinessUI(page);const form=page.locator('[data-inspector] [data-review-form]');await form.locator('[name=exposureCount]').fill('10000');await form.locator('[name=readCount]').fill('1250');assert.equal(await form.locator('[name=clickRate]').inputValue(),'12.50');await shot('input-'+width);await form.locator('[name=readCount]').fill('');await form.locator('[name=exposureCount]').fill('');await page.evaluate(()=>{document.querySelector('[data-inspector]')?.setAttribute('data-dirty','false');document.documentElement.dataset.unsaved='false';});
 }
 checks.push('五档分类/展开/平铺节点保持；即时/持续结果、断点趋势、后续安排和真实输入');
 await page.setViewportSize({width:1440,height:1000});await nav('view=history&mode=standard&group=1&row='+standard.schedule.id+':day_7');const form=page.locator('[data-inspector] [data-review-form]');await form.locator('[name=readCount]').fill('1101');
 await page.route('**/api/non-promotion-reviews',async(route:any)=>route.request().method()==='POST'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'隔离保存失败'})}):route.continue());await form.locator('[type=submit]').click();await form.getByText('隔离保存失败',{exact:true}).waitFor();assert.equal(await form.locator('[name=readCount]').inputValue(),'1101');await shot('save-failure-1440');
 await page.unroute('**/api/non-promotion-reviews');await form.locator('[type=submit]').click();await form.getByText('已保存',{exact:true}).waitFor();assert.equal(await page.locator('[data-category-group="tmua:innovation"] [data-category-reading=day_7]').textContent(),'1,550.5');await shot('save-success-1440');
 await form.locator('[name=readCount]').fill('1102');const answer=respondToBusinessConfirm(page,false);await page.locator('[data-close-inspector]').click();await answer;assert.equal(await form.locator('[name=readCount]').inputValue(),'1102');await form.locator('[name=readCount]').fill('1101');await page.evaluate(()=>{document.querySelector('[data-inspector]')?.setAttribute('data-dirty','false');document.documentElement.dataset.unsaved='false';});
 await nav('view=history&group=0&row='+continuous.schedule.id+':custom:'+instantNode.id); // 不存在的旧链接安全落在常规。
 const continuousModel=await api('/api/non-promotion-reviews?view=history&mode=continuous');const old=continuousModel.tableRows.at(-1);await nav('view=history&row='+old.key);assert.equal(await page.locator('[name=mode]').inputValue(),'continuous');assert(await page.locator('[data-inspector]').isVisible());
 checks.push('真实保存失败保留/重试；SSR与刷新均值一致；取消离开保留草稿；旧链接识别方式');
 await nav('mode=continuous');await page.getByText('持续复盘待安排 (1)',{exact:true}).click();const waiting=page.locator(`[data-awaiting-review="${awaiting.schedule.id}"]`);await waiting.locator('[data-popover-trigger]').click();await waiting.locator('[name=dueOn]').fill('2026-11-23');await waiting.locator('[type=submit]').click();await page.locator(`[data-review-group="${awaiting.schedule.id}"]`).waitFor();assert.equal(await waiting.count(),0);await shot('append-date-1440');
 const newNode=(await api('/api/non-promotion-reviews?mode=continuous')).tableRows.find((r:any)=>r.row.id===awaiting.schedule.id);await nav('mode=continuous&row='+newNode.key);await page.locator('[data-inspector] .checkpoint-action>summary').click();let checkpoint=page.locator('[data-inspector] [data-checkpoint-form]');await checkpoint.locator('[name=reason]').fill('隔离：平台本节点无有效数据');await checkpoint.locator('[type=submit]').click();await page.waitForURL(/view=skipped/);await settleBusinessUI(page);await page.waitForTimeout(350);
 for(const width of [1920,1440,1024,390,320]){await page.setViewportSize({width,height:1000});await shot('skipped-'+width);assert.equal(await page.locator('.review-row [data-label=阅读量]').count(),0);}
 await page.setViewportSize({width:1440,height:1000});await page.locator('[data-post-open]').click();await settleBusinessUI(page);checkpoint=page.locator('[data-inspector] [data-checkpoint-form]');await checkpoint.locator('[name=reason]').fill('隔离：数据已恢复，可以补录');await checkpoint.locator('[type=submit]').click();await page.waitForURL(/view=pending/);
 const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const documentNode=await cdp.send('DOM.getDocument');const fontNode=await cdp.send('DOM.querySelector',{nodeId:documentNode.root.nodeId,selector:'.review-controls label'});const fonts=await cdp.send('CSS.getPlatformFontsForNode',{nodeId:fontNode.nodeId});assert(fonts.fonts.some((font:any)=>font.familyName.includes('MiSans')),JSON.stringify(fonts));await writeFile(folder+'/actual-fonts.json',JSON.stringify(fonts,null,2));await cdp.detach();
 checks.push('共享Inspector真实不复盘/恢复、标题入口与实际MiSans字体');
 await context.close();
 const phone=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'zh-CN',recordVideo:{dir:folder+'/video-mobile',size:{width:390,height:844}}});await phone.addCookies(cookie.split('; ').map(c=>({name:c.slice(0,c.indexOf('=')),value:c.slice(c.indexOf('=')+1),url:baseURL})));const mobile=await phone.newPage();await mobile.clock.setFixedTime(new Date('2026-11-24T12:00:00+08:00'));await mobile.goto(baseURL+'/business/non-promotion-review?view=history&mode=continuous');await settleBusinessUI(mobile);await mobile.locator('[data-post-history]>summary').click();await settleBusinessUI(mobile);await mobile.screenshot({path:folder+'/screenshots/touch-trend-390.png'});await mobile.locator('.post-history [data-inspector-trigger]').last().click();await settleBusinessUI(mobile);await mobile.screenshot({path:folder+'/screenshots/touch-inspector-390.png'});await phone.close();
 const staffCookie=await login(employee),staff=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',locale:'zh-CN'});await staff.addCookies(staffCookie.split('; ').map(c=>({name:c.slice(0,c.indexOf('=')),value:c.slice(c.indexOf('=')+1),url:baseURL})));const staffPage=await staff.newPage();await staffPage.goto(baseURL+'/business/non-promotion-review?view=history&mode=standard');await settleBusinessUI(staffPage);await staffPage.screenshot({path:folder+'/screenshots/employee-category-1440.png'});assert.equal(await staffPage.locator('[data-category-group="tmua:innovation"] [data-category-reading=day_7]').textContent(),'1,550.5');assert.equal(await staffPage.evaluate(()=>document.getAnimations().length),0);await staff.close();
 assert.deepEqual(errors,[]);await writeFile(folder+'/checks.json',JSON.stringify({passed:true,checks,errors,source:'isolated PGlite'},null,2));console.log(JSON.stringify({passed:true,folder,checks}));
}catch(error){console.error(fixture.logs().slice(-2500));throw error;}finally{await browser.close();await fixture.stop();}
