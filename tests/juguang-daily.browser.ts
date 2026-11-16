import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {seedJuguangPilot,pilotReports} from './juguang-daily.fixture';
import {admin,employee} from './auth.fixture';
import {withDatabase} from '../src/db/client';
import {saveJuguangConnection} from '../src/integrations/xiaohongshu-juguang';
import * as s from '../src/db/schema';
process.env.NODE_ENV='test';process.env.XHS_JUGUANG_APP_ID='42';process.env.XHS_JUGUANG_APP_SECRET='fictional-app-secret';process.env.BETTER_AUTH_SECRET='fictional-browser-secret-at-least-32-characters';
const directory=await mkdtemp(join(tmpdir(),'juguang-daily-browser-')),scenario=join(directory,'scenario.json'),clock=join(directory,'clock');
process.env.JUGUANG_SCENARIO_FILE=scenario;await writeFile(scenario,JSON.stringify({reports:pilotReports,delay:700}));await writeFile(scenario+'.calls','');await writeFile(clock,'2026-11-16T04:00:00Z');
const evidence=process.env.JUGUANG_EVIDENCE_DIR??'.tools/test-artifacts/juguang-daily-pilot/browser';await mkdir(evidence,{recursive:true});
const f=await startPostgresFixture({entry:'tests/juguang-server.fixture.mjs',clockFile:clock}),{db,baseURL}=f;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright'),browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:evidence+'/video',size:{width:1440,height:1000}}}),page=await context.newPage(),checks:string[]=[],videoStarted=Date.now();
async function mode(value:unknown){await writeFile(scenario,JSON.stringify(value));}
async function settle(){await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(650);}
async function login(actor:typeof admin|typeof employee){const r=await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:actor});assert.equal(r.status(),200);const identity=await(await context.request.get(baseURL+'/api/auth/get-session')).json();return identity.user.id;}
async function metric(id:string){return(await db.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.id,id)))[0];}
async function waitRead(form:any){await waitFor(async()=>!!await form.locator('[name=juguangReceipt]').inputValue()&&!(await form.locator('[data-retry-juguang]').isDisabled()));}
async function waitFor(predicate:()=>Promise<boolean>){for(let i=0;i<100;i++){if(await predicate())return;await page.waitForTimeout(100);}throw new Error('state not reached');}
try {
 await context.addInitScript({content:'window.__name = value => value;'});
 const bossId=await login(admin),[one,two,ended]=await seedJuguangPilot(db,'scaling');
 await withDatabase(db,()=>saveJuguangConnection({access_token:'fictional-access',refresh_token:'fictional-refresh',access_token_expires_in:86400,refresh_token_expires_in:2592000,user_id:'fictional-upstream',platform_type:1,scope:'["report_service"]',approval_advertisers:[11,22,33].map(advertiser_id=>({advertiser_id,advertiser_name:'隔离验收账户 '+advertiser_id}))},'42',bossId));
 for(const row of [one,two]){await db.update(s.operationsContentVersion).set({projectDocUrl:'https://example.test/document'}).where(eq(s.operationsContentVersion.id,row.post.version.id));await db.update(s.operationsContentSchedule).set({publicationUrl:'https://www.xiaohongshu.com/explore/'+String(row===one?1:2).repeat(24)}).where(eq(s.operationsContentSchedule.id,row.post.schedule.id));}
 await page.goto(baseURL+`/business/daily-promotion-review?view=history&campaign=${two.metric.id}`);await page.locator('[data-promotion-inspector].is-open').waitFor();assert.equal(await page.locator('.promotion-day-platform .is-api').count(),0);assert.match(await page.locator('.promotion-day-platform h3').innerText(),/手填/);await settle();await page.screenshot({path:evidence+'/day-pilot-unsourced-1440.png'});
 const originalStrategy=await db.select().from(s.operationsPromotionCampaign);
 await page.goto(baseURL+'/business/daily-promotion-review');
 let first=page.locator(`[data-saved-review="${one.metric.id}"]`),second=page.locator(`[data-saved-review="${two.metric.id}"]`);
 await first.locator('[data-continue-review]').click();await first.locator('[name=spend]').focus();
 for(const expected of ['spend','impressionCount','clickCount','platformOpenCount','platformLeadCount','actualOpenCount','actualLeadCount']){assert.equal(await page.evaluate(()=>(document.activeElement as HTMLInputElement)?.name),expected);await page.keyboard.press('Tab');}
 await first.locator('[name=spend]').fill('240');await first.locator('[name=actualOpenCount]').fill('4');await first.locator('[name=reviewDecision]').selectOption('scaling_pause');
 await first.locator('[data-business-read-loading]').waitFor({state:'visible'});const loading=await first.locator('[data-business-read-loading]').evaluate((node:HTMLElement)=>({height:node.getBoundingClientRect().height,parent:node.parentElement!.getBoundingClientRect().height,position:getComputedStyle(node).position}));assert(loading.height<=20&&loading.parent<=24);assert.equal(loading.position,'static');await page.screenshot({path:evidence+'/daily-loading-1440.png',fullPage:true});
 await waitRead(first);
 assert.equal(Number(await first.locator('[name=spend]').inputValue()),240);assert.equal(await first.locator('[name=actualOpenCount]').inputValue(),'4');assert.equal(await first.locator('[name=reviewDecision]').inputValue(),'scaling_pause');
 assert.equal(await first.locator('[name=impressionCount]').inputValue(),'1320');assert.equal((await metric(one.metric.id)).impressionCount,null);
 checks.push('首次慢读保留已输入消耗、实际人数及人工策略，预览不落库');
 await first.locator('[data-cancel-saved]').click();await page.getByRole('button',{name:'放弃修改',exact:true}).click();
 await first.locator('[data-continue-review]').waitFor({state:'visible'});assert.equal(await first.locator('[name=actualOpenCount]').inputValue(),'0');
 await mode({reports:pilotReports});await settle();await page.screenshot({path:evidence+'/daily-preview-1440.png',fullPage:true});
 await first.locator('[data-continue-review]').click();await first.locator('[data-save-saved]').click();await waitFor(async()=>(await metric(one.metric.id)).impressionCount===1320);
 first=page.locator(`[data-saved-review="${one.metric.id}"]`);second=page.locator(`[data-saved-review="${two.metric.id}"]`);
 await second.locator('[data-continue-review]').click();await second.locator('[data-save-saved]').click();await waitFor(async()=>(await metric(two.metric.id)).clickCount===23);
 assert.equal((await metric(two.metric.id)).actualOpenCount,1);checks.push('继续编辑后保存官方曝光与点击，面试课原实际1人保持');
 await page.reload();first=page.locator(`[data-saved-review="${one.metric.id}"]`);await waitRead(first);
 await first.locator('[data-continue-review]').click();await first.locator('[name=spend]').fill('240');await first.locator('[name=actualOpenCount]').fill('2');
 assert.equal(await first.locator('[name=juguangOverrideReason]').isVisible(),true);assert.equal(await first.locator('[name=juguangOverrideReason]').getAttribute('required'),'');
 await first.locator('[name=juguangOverrideReason]').fill('人工账单核对');await settle();await page.screenshot({path:evidence+'/daily-override-1440.png',fullPage:true});
 await page.setViewportSize({width:1920,height:1000});await page.locator('.review-entry-scroll[data-review-container=ready]').evaluate((node:HTMLElement)=>{node.scrollLeft=0;});await settle();await page.screenshot({path:evidence+'/daily-override-1920.png',fullPage:true});
 assert.equal(await first.locator('[data-juguang-ctr]').textContent(),'3.03%');
 await page.setViewportSize({width:1440,height:1000});
 await first.locator('[data-save-saved]').click();await waitFor(async()=>(await metric(one.metric.id)).juguangSource?.overriddenFields.includes('spend')??false);
 await page.reload();first=page.locator(`[data-saved-review="${one.metric.id}"]`);await waitRead(first);assert.equal(Number(await first.locator('[name=spend]').inputValue()),240);assert.equal(await first.locator('[name=actualOpenCount]').inputValue(),'2');
 await first.locator('[data-continue-review]').click();await first.locator('[data-restore-juguang=spend]').click();assert.equal(await first.locator('[name=spend]').inputValue(),'238.44');await first.locator('[data-save-saved]').click();await waitFor(async()=>(await metric(one.metric.id)).juguangSource?.overriddenFields.length===0);
 checks.push('覆盖原因必填、覆盖标记刷新保留、恢复单字段聚光值，不清空实际人数');
 await page.reload();first=page.locator(`[data-saved-review="${one.metric.id}"]`);await waitRead(first);await first.locator('[data-continue-review]').click();
 await first.locator('[name=clickCount]').fill('20');assert.equal(await first.locator('[data-juguang-ctr]').textContent(),'1.52%');await first.locator('[data-restore-juguang=clickCount]').click();assert.equal(await first.locator('[data-juguang-ctr]').textContent(),'3.03%');
 await first.locator('[name=actualOpenCount]').fill('3');await mode({network:true});if(!await first.locator('[data-retry-juguang]').isVisible())await first.getByRole('button',{name:'查看聚光数据来源'}).click();await first.locator('[data-retry-juguang]').click();await first.locator('[data-juguang-message][data-error=true]').waitFor();assert.equal(await first.locator('[name=actualOpenCount]').inputValue(),'3');assert.equal(await first.locator('[name=impressionCount]').inputValue(),'1320');
 await settle();await page.screenshot({path:evidence+'/daily-error-1440.png',fullPage:true});await mode({reports:pilotReports});if(!await first.locator('[data-retry-juguang]').isVisible())await first.getByRole('button',{name:'查看聚光数据来源'}).click();await first.locator('[data-retry-juguang]').click();await waitRead(first);assert.equal(await first.locator('[name=actualOpenCount]').inputValue(),'3');
 await first.locator('[data-cancel-saved]').click();await page.getByRole('button',{name:'放弃修改',exact:true}).click();
 checks.push('原始计数编辑自动重算、恢复值、断网保留、重试保留实际草稿、公共未保存保护与取消');
 await first.locator('[data-continue-review]').click();await first.locator('[name=actualOpenCount]').fill('0');await first.locator('[data-save-saved]').click();await waitFor(async()=>(await metric(one.metric.id)).actualOpenCount===0);await page.reload();first=page.locator(`[data-saved-review="${one.metric.id}"]`);second=page.locator(`[data-saved-review="${two.metric.id}"]`);await waitRead(first);await waitRead(second);
 const layoutChecks:any[]=[];
 for(const width of [1920,1440,1024]){
  await page.setViewportSize({width,height:1000});await page.locator('.review-entry-scroll[data-review-container=ready]').evaluate((node:HTMLElement)=>{node.scrollLeft=0;});await settle();
  const layout=await first.evaluate((form:HTMLFormElement)=>{
   const [api,end,actual,last,identity]=['[data-review-field=spend]','[data-review-field=platformLeadCount]','[data-review-field=actualOpenCount]','[data-review-field=actualLeadCount]','.review-entry-identity'].map(selector=>form.querySelector<HTMLElement>(selector)!.getBoundingClientRect());
   const head=document.querySelector<HTMLElement>('[data-juguang-review-header]')!,apiHead=head.querySelector('.review-pilot-api-heading')!.getBoundingClientRect(),actualHead=head.querySelector('.review-pilot-actual-heading')!.getBoundingClientRect();
   const numbers=[...form.querySelectorAll<HTMLElement>('input[name=spend],input[name=platformOpenCount],input[name=actualOpenCount],input[name=platformLeadCount],input[name=actualLeadCount],input[name=impressionCount],input[name=clickCount],[data-juguang-ctr]')];
   const centers=numbers.map(node=>{const r=node.getBoundingClientRect();return r.y+r.height/2;});
   const dateHead=head.querySelector('.review-pilot-date')!.getBoundingClientRect(),formRect=form.getBoundingClientRect(),date=form.querySelector('.review-date-block')!.getBoundingClientRect();
   const internalGap=form.querySelector('input[name=actualOpenCount]')!.getBoundingClientRect().left-form.querySelector('input[name=platformLeadCount]')!.getBoundingClientRect().right;
   const identityHead=head.querySelector('.review-pilot-identity')!.getBoundingClientRect();
   return {headerBottom:head.getBoundingClientRect().bottom,dateHeadBottom:dateHead.bottom,formTop:form.closest('.review-entry-scroll')!.querySelector('.review-record .review-metric-row')!.getBoundingClientRect().top,rowBottom:formRect.bottom,dateBottom:date.bottom,internalGap,identityStart:identity.left,identityHeaderStart:identityHead.left,centers,apiStart:api.left,apiEnd:end.right,headerStart:apiHead.left,headerEnd:apiHead.right,actualStart:actual.left,actualEnd:last.right,actualHeaderStart:actualHead.left,actualHeaderEnd:actualHead.right,groupGap:actual.left-end.right};
  });
  assert(Math.max(...layout.centers)-Math.min(...layout.centers)<1);assert(Math.abs(layout.apiStart-layout.headerStart)<1&&Math.abs(layout.apiEnd-layout.headerEnd)<1);assert(Math.abs(layout.actualStart-layout.actualHeaderStart)<1&&Math.abs(layout.actualEnd-layout.actualHeaderEnd)<1);assert(Math.abs(layout.groupGap)<1);assert(layout.internalGap>=16);assert(layout.dateHeadBottom<=layout.headerBottom-1);assert(layout.dateBottom<=layout.rowBottom-1);assert(Math.abs(layout.formTop-layout.headerBottom)<1);assert(Math.abs(layout.identityStart-layout.identityHeaderStart)<1);layoutChecks.push({width,...layout});
  await page.screenshot({path:`${evidence}/daily-ready-${width}.png`,fullPage:true});
  if(width===1920)await page.locator('#daily-table').screenshot({path:evidence+'/daily-module-1920.png'});
 }
 await page.setViewportSize({width:1920,height:1000});await page.locator('.review-entry-scroll[data-review-container=ready]').evaluate((node:HTMLElement)=>{node.scrollLeft=0;});
 const helpStarted=(Date.now()-videoStarted)/1000;
 const rateHelp=page.getByRole('button',{name:'点击率计算方式',exact:true}),rateTip=page.locator('#juguang-ctr-formula');
 assert.equal(await page.locator('.review-pilot-formula').count(),0);await rateHelp.hover();await rateTip.waitFor({state:'visible'});assert.match(await rateTip.textContent()??'',/点击量 ÷ 曝光量 × 100%/);await page.screenshot({path:evidence+'/daily-ctr-help-1920.png',fullPage:true});await page.waitForTimeout(1200);
 await page.mouse.move(100,100);await rateTip.waitFor({state:'hidden'});await rateHelp.focus();await rateTip.waitFor({state:'visible'});await page.waitForTimeout(600);await page.keyboard.press('Escape');await rateTip.waitFor({state:'hidden'});assert.equal(await rateHelp.evaluate((node:HTMLElement)=>document.activeElement===node),true);
 await writeFile(evidence+'/video-timing.json',JSON.stringify({start:Math.max(0,helpStarted-1),duration:5}));
 checks.push('公式只在点击率旁信息图标悬停或键盘聚焦时显示，移出或Escape可关闭，表尾无重复说明');
 await writeFile(evidence+'/layout.json',JSON.stringify(layoutChecks,null,2));
 assert.equal(await page.locator('[data-juguang-review-header] .review-pilot-api-mark:visible').count(),1);assert.equal(await page.locator('[data-juguang-review-header] .review-pilot-manual-mark:visible').count(),1);
 const readonlyStyle=await first.evaluate((form:HTMLFormElement)=>[...form.querySelectorAll<HTMLInputElement>('[data-juguang-field] input')].map(input=>({background:getComputedStyle(input).backgroundColor,border:getComputedStyle(input).borderTopColor})));assert(readonlyStyle.every((value:{background:string;border:string})=>value.background==='rgba(0, 0, 0, 0)'&&value.border==='rgba(0, 0, 0, 0)'));
 checks.push('三档桌面原始数据同一行，两层分组表头与数值区域逐边对齐、连续分组背景交界无空白列、组内控件有留白、整条边线贯通，API只读无碎框且只标一次来源');
 await page.setViewportSize({width:1440,height:1000});await page.locator('.review-entry-scroll[data-review-container=ready]').evaluate((node:HTMLElement)=>{node.scrollLeft=node.scrollWidth-node.clientWidth;});await settle();await page.screenshot({path:evidence+'/daily-right-1440.png',fullPage:true});

 const alignment=await first.evaluate((form:HTMLFormElement)=>[...form.querySelectorAll<HTMLElement>('input[name=spend],input[name=platformOpenCount],input[name=actualOpenCount],input[name=platformLeadCount],input[name=actualLeadCount],input[name=impressionCount],input[name=clickCount],[data-juguang-ctr]')].map(node=>{const r=node.getBoundingClientRect();return r.y+r.height/2;}));assert(Math.max(...alignment)-Math.min(...alignment)<1,'原五项与曝光、点击、CTR同一行同基线');
 const geometry:Array<{name:string;font:string;disabled:boolean}>=await first.evaluate((form:HTMLFormElement)=>{const inputs=[...form.querySelectorAll<HTMLInputElement>('input:not([type=hidden])')];return inputs.map(input=>({name:input.name,font:getComputedStyle(input).fontFamily,size:getComputedStyle(input).fontSize,disabled:input.disabled,bg:getComputedStyle(input).backgroundColor,rect:input.getBoundingClientRect().toJSON()}));});
 await writeFile(evidence+'/geometry.json',JSON.stringify(geometry,null,2));assert(geometry.every(g=>g.font.includes('MiSans')));assert(geometry.filter(g=>g.name!=='juguangOverrideReason').every(g=>g.disabled));
 for(const width of [1920,1440,1024]){
  await page.setViewportSize({width,height:1000});await page.goto(baseURL+`/business/daily-promotion-review?view=history&from=2026-11-15&to=2026-11-15&campaign=${two.metric.id}`);const pane=page.locator('[data-promotion-inspector].is-open');await pane.waitFor();await settle();
  const geometry=await pane.evaluate((p:HTMLElement)=>{const rect=(s:string)=>p.querySelector(s)!.getBoundingClientRect();return {width:p.getBoundingClientRect().width,links:[...p.querySelectorAll('.surface-resource')].map(e=>e.getBoundingClientRect().toJSON()),facts:[...p.querySelectorAll('[data-day-fact]')].map(e=>e.getBoundingClientRect().toJSON()),date:rect('.promotion-day-heading time').toJSON(),edit:rect('.promotion-day-heading button').toJSON(),scroll:p.scrollWidth>p.clientWidth};});assert.equal(geometry.width,width>1240?338:380);assert.equal(geometry.scroll,false);assert(Math.abs(geometry.links[0].y-geometry.links[1].y)<1);assert(Math.abs(geometry.facts[0].y-geometry.facts[1].y)<1&&Math.abs(geometry.facts[1].y-geometry.facts[2].y)<1);assert(geometry.date.right<geometry.edit.left);assert.equal(await pane.getByText('更正当日状态',{exact:true}).count(),0);assert.equal(await pane.getByText('更正首次开始日期',{exact:true}).count(),0);assert.equal(await pane.locator('.promotion-source-mark.is-api').count(),1);assert.equal(await pane.locator('[data-total=actualOpenCount]').innerText(),'1');assert.equal(await pane.locator('[data-total=actualOpenCost]').innerText(),'¥208.60');assert.equal(await pane.locator('[data-total=actualLeadCost]').innerText(),'—');await page.screenshot({path:`${evidence}/day-inspector-${width}.png`});await pane.screenshot({path:`${evidence}/day-panel-${width}.png`});
 }
 const pane=page.locator('[data-promotion-inspector].is-open');const info=pane.getByRole('button',{name:'点击率计算方式',exact:true});await info.hover();await page.locator(`#ctr-${two.metric.id}`).waitFor({state:'visible'});await page.screenshot({path:evidence+'/day-ctr-help-1024.png'});await page.mouse.move(0,0);await page.locator(`#ctr-${two.metric.id}`).waitFor({state:'hidden'});
 await page.goto(baseURL+`/business/daily-promotion-review?view=history&campaign=${ended.metric.id}`);await page.locator('[data-promotion-inspector].is-open').waitFor();assert.equal(await page.locator('[data-day-fact]').count(),6);assert.equal(await page.locator('.promotion-source-mark.is-api').count(),0);await settle();await page.screenshot({path:evidence+'/day-manual-1024.png'});
 checks.push('推广日详情三档桌面保留338/380窄宽：资源同排、API六项三列两行、实际人数与成本成对；未接API和无匹配日期显示手填，零人数成本显示—；公式悬停显示，重复更正入口已移除');
 await page.setViewportSize({width:1440,height:1000});await page.goto(baseURL+`/business/daily-promotion-review?view=history&from=2026-11-15&to=2026-11-15&campaign=${two.metric.id}`);await page.locator(`[data-edit-trigger="${two.metric.id}"]`).click();
 let history=page.locator('dialog[open] [data-history-edit-form]');await waitRead(history);assert.equal(await history.locator('[name=impressionCount]').inputValue(),'618');assert.equal(await history.locator('[name=actualOpenCount]').inputValue(),'1');
 await settle();await page.screenshot({path:evidence+'/history-editor-1440.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await settle();assert(await page.locator('dialog[open] [data-close-edit]').first().isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:evidence+'/history-editor-390.png',fullPage:true});
 await page.locator('dialog[open] [data-close-edit]').first().click();await page.waitForTimeout(300);assert.equal(await page.locator('dialog[data-edit-dialog][open]').count(),0);
 checks.push('1440／1920／1024桌面与历史编辑已截图、MiSans及禁用字段实测；390只检无页面溢出和关闭可达');
 await page.setViewportSize({width:1440,height:1000});await login(employee);await page.goto(baseURL+'/business/daily-promotion-review');second=page.locator(`[data-saved-review="${two.metric.id}"]`);await waitRead(second);assert.equal(await second.locator('[name=actualOpenCount]').inputValue(),'1');await second.locator('[data-continue-review]').click();await settle();await page.screenshot({path:evidence+'/employee-edit-1440.png',fullPage:true});
 assert.deepEqual(await db.select().from(s.operationsPromotionCampaign),originalStrategy);checks.push('员工同对象来源与输入一致，所有自动读取及数值保存后推广策略逐项不变');
 await writeFile(clock,'2026-10-01T04:00:00Z');await page.goto(baseURL+'/business/daily-promotion-review');assert.equal(await page.locator('form[data-juguang-pilot]').count(),0);assert.equal(await page.locator('.review-entry-head [data-juguang-column]:visible').count(),0);assert.equal(await page.locator('[data-juguang-review-header]:visible').count(),0);checks.push('10月以前没有聚光读取任务，空态不显示分组表头');
 await writeFile(evidence+'/result.json',JSON.stringify({passed:true,checks},null,2));console.log(checks.join('\n'));
}catch(error){await page.screenshot({path:evidence+'/failure.png',fullPage:true}).catch(()=>{});console.error(f.logs().slice(-3000));throw error;}
finally{await context.close();await browser.close();await f.stop();}
