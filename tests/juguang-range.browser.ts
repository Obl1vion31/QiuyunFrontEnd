import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {eq,inArray} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {seedJuguangPilot,pilotReports} from './juguang-daily.fixture';
import {admin,employee} from './auth.fixture';
import {withDatabase} from '../src/db/client';
import {saveJuguangConnection} from '../src/integrations/xiaohongshu-juguang';
import * as s from '../src/db/schema';
process.env.NODE_ENV='test';process.env.XHS_JUGUANG_APP_ID='42';process.env.XHS_JUGUANG_APP_SECRET='fictional-app-secret';process.env.BETTER_AUTH_SECRET='fictional-browser-secret-at-least-32-characters';
const dir=await mkdtemp(join(tmpdir(),'juguang-range-ui-')),scenario=join(dir,'scenario.json'),clock=join(dir,'clock');
const reports={11:[...pilotReports[11].slice(0,2).map(r=>({...r,time:'2026-11-16'})),{...pilotReports[11][2],time:'2026-10-02',fee:'11.11',impression:'100',click:'5'}],22:[],33:[]};
process.env.JUGUANG_SCENARIO_FILE=scenario;await writeFile(scenario,JSON.stringify({reports,delay:550}));await writeFile(scenario+'.calls','');await writeFile(clock,'2026-11-17T04:00:00Z');
const evidence='.tools/test-artifacts/juguang-rollout/browser-range';await mkdir(evidence,{recursive:true});
const f=await startPostgresFixture({entry:'tests/juguang-server.fixture.mjs',clockFile:clock}),{db,baseURL}=f;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright'),browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1920,height:1000},recordVideo:{dir:evidence+'/video',size:{width:1920,height:1000}}}),page=await context.newPage(),checks:string[]=[];
const reads:any[]=[];page.on('response',async(response:any)=>{if(response.url().includes('/api/promotion-daily/juguang-preview?'))reads.push({url:response.url(),status:response.status(),body:await response.json().catch(()=>null)});});
async function login(actor:any){const r=await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:actor});assert.equal(r.status(),200);return(await(await context.request.get(baseURL+'/api/auth/get-session')).json()).user.id;}
async function settle(){await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(450);}
async function waitRead(form:any){await form.locator('[name=juguangReceipt]').waitFor({state:'attached'});await page.waitForFunction((el:HTMLInputElement)=>el.value.length>0,await form.locator('[name=juguangReceipt]').elementHandle());}
async function count(campaign:string){return(await db.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.campaignId,campaign)));}
try{
 await context.addInitScript({content:'window.__name = value => value;'});
 const id=await login(admin),[one,two,closed]=await seedJuguangPilot(db);
 await db.delete(s.operationsPromotionDailyMetric).where(inArray(s.operationsPromotionDailyMetric.campaignId,[one.campaign.id,two.campaign.id]));
 for(const c of [one,two]){
  await db.update(s.operationsPromotionCampaign).set({startedOn:'2026-11-16',dailyReviewEnabledOn:'2026-11-16'}).where(eq(s.operationsPromotionCampaign.id,c.campaign.id));
  await db.update(s.operationsPromotionStage).set({startedOn:'2026-11-16'}).where(eq(s.operationsPromotionStage.campaignId,c.campaign.id));
 }
 await db.update(s.operationsPromotionCampaign).set({startedOn:'2026-10-01',dailyReviewEnabledOn:'2026-10-01',currentStatus:'test_discarded',endedOn:'2026-10-01'}).where(eq(s.operationsPromotionCampaign.id,closed.campaign.id));
 await db.update(s.operationsPromotionStage).set({startedOn:'2026-10-01',endedOn:'2026-10-01'}).where(eq(s.operationsPromotionStage.campaignId,closed.campaign.id));
 await db.update(s.operationsPromotionDailyMetric).set({metricDate:'2026-10-01',actualStatusSnapshot:'test_discarded',reviewDecision:'test_discarded',sourceStageStartedOn:'2026-10-01'}).where(eq(s.operationsPromotionDailyMetric.id,closed.metric.id));
 await withDatabase(db,()=>saveJuguangConnection({access_token:'fictional-access',refresh_token:'fictional-refresh',access_token_expires_in:86400,refresh_token_expires_in:2592000,user_id:'fictional-upstream',platform_type:1,scope:'["report_service"]',approval_advertisers:[11,22,33].map(advertiser_id=>({advertiser_id,advertiser_name:'隔离账户'+advertiser_id}))},'42',id));
 const strategies=await db.select().from(s.operationsPromotionCampaign);
 await page.goto(baseURL+'/business/daily-promotion-review');
 let first=page.locator('form[data-metric-form][data-juguang-campaign="'+one.campaign.id+'"]'),second=page.locator('form[data-metric-form][data-juguang-campaign="'+two.campaign.id+'"]');
 await first.locator('[name=actualOpenCount]').fill('4');await first.locator('[name=actualLeadCount]').fill('1');await first.locator('[name=reviewDecision]').selectOption('test_continue');
 await waitRead(first);await waitRead(second);
 assert.equal(await first.locator('[name=actualOpenCount]').inputValue(),'4');assert.equal(await first.locator('[name=reviewDecision]').inputValue(),'test_continue');assert.equal(await second.locator('[name=actualOpenCount]').inputValue(),'');assert.equal(await second.locator('[name=reviewDecision]').inputValue(),'');assert.equal(await first.locator('[name=impressionCount]').inputValue(),'1320');assert.equal((await count(one.campaign.id)).length,0);
 checks.push('11/16未保存行自动带入五项事实；慢读保留实际人数和人工策略，其他待填写人数与策略仍空白，GET不写库');
 for(const width of [1920,1440,1024]){
  await page.setViewportSize({width,height:1000});await settle();
  const geo=await first.evaluate((form:HTMLFormElement)=>{
   const names=['spend','impressionCount','clickCount','platformOpenCount','platformLeadCount','actualOpenCount','actualLeadCount'];
   const fields=names.map(n=>form.querySelector<HTMLInputElement>('[name='+n+']')!),centers=fields.map(n=>{const r=n.getBoundingClientRect();return r.y+r.height/2;});
   const action=form.querySelector('button[type=submit]')!.getBoundingClientRect(),strategy=form.querySelector('[name=reviewDecision]')!.getBoundingClientRect(),row=form.getBoundingClientRect();
   return {centers,action:action.toJSON(),strategy:strategy.toJSON(),row:row.toJSON(),font:fields.map(n=>getComputedStyle(n).fontFamily)};
  });
  assert(Math.max(...geo.centers)-Math.min(...geo.centers)<1);assert(geo.action.x>=geo.strategy.right+8);assert(geo.action.bottom<=geo.row.bottom);assert(geo.font.every((v:string)=>v.includes('MiSans')));
  await page.screenshot({path:evidence+'/new-daily-'+width+'.png',fullPage:true});
  if(width===1920)await page.locator('#daily-table').screenshot({path:evidence+'/new-daily-module-1920.png'});
 }
 await page.setViewportSize({width:1920,height:1000});
 await first.locator('button[type=submit]').click();await page.locator('[data-saved-review]').filter({has:page.locator('[name=campaignId][value="'+one.campaign.id+'"]')}).waitFor();
 let stored=(await count(one.campaign.id))[0];assert.equal(stored.actualOpenCount,4);assert.equal(stored.actualLeadCount,1);assert.equal(stored.clickRate,'3.0303');assert.equal(stored.juguangSource?.original.spend,238.44);
 second=page.locator('form[data-metric-form][data-juguang-campaign="'+two.campaign.id+'"]');await waitRead(second);await second.locator('[name=actualOpenCount]').fill('2');await second.locator('[name=actualLeadCount]').fill('0');await second.locator('[name=reviewDecision]').selectOption('test_continue');
 await page.locator('[data-save-all]').click();await page.waitForFunction(()=>document.querySelectorAll('form[data-metric-form]').length===0);
 stored=(await count(two.campaign.id))[0];assert.equal(stored.actualOpenCount,2);assert.equal(stored.impressionCount,618);assert.equal(stored.juguangSource?.noteId,'2'.repeat(24));
 checks.push('实际点击单行完成复盘与一键保存：来源与曝光点击同时落库，人工实际人数按提交保留');
 await page.locator('[data-residual-trigger]').click();await page.locator('[data-residual-search] input').fill('3'.repeat(24));await page.locator('[data-residual-search] button[type=submit]').click();
 await page.locator('[data-residual-candidates]').waitFor({state:'visible'});await page.locator('[data-residual-candidates] select').selectOption(closed.campaign.id);await page.locator('[data-residual-candidates] input[type=date]').fill('2026-10-02');await page.locator('[data-residual-candidates] button[type=submit]').click();
 const residual=page.locator('form[data-residual-form]');await waitRead(residual);assert.equal(await residual.locator('[name=spend]').inputValue(),'11.11');assert.equal(await residual.locator('[name=actualOpenCount]').inputValue(),'');assert.equal(await residual.locator('[data-juguang-ctr]').textContent(),'5.00%');
 await residual.locator('[name=actualOpenCount]').fill('0');await residual.locator('[name=actualLeadCount]').fill('0');await settle();
 await page.screenshot({path:evidence+'/residual-1920.png',fullPage:true});await page.locator('[data-residual-editor]').screenshot({path:evidence+'/residual-module-1920.png'});
 const rg=await residual.evaluate((form:HTMLFormElement)=>{const action=form.querySelector('button[type=submit]')!.getBoundingClientRect(),r=form.getBoundingClientRect(),fields=[...form.querySelectorAll<HTMLInputElement>('input[type=number]')].map(el=>{const r=el.getBoundingClientRect();return r.y+r.height/2;});return {action:action.toJSON(),r:r.toJSON(),fields};});assert(rg.action.bottom<=rg.r.bottom);assert(Math.max(...rg.fields)-Math.min(...rg.fields)<1);
 await residual.locator('button[type=submit]').click();await residual.locator('[type=submit][data-success]').waitFor();assert.equal((await count(closed.campaign.id)).length,2);assert.equal((await count(closed.campaign.id)).find(r=>r.metricDate==='2026-10-02')?.juguangSource?.original.spend,11.11);
 const businessState=(rows:any[])=>rows.map(({updatedAt,...row})=>row).sort((a,b)=>a.id.localeCompare(b.id));
 assert.deepEqual(businessState(await db.select().from(s.operationsPromotionCampaign)),businessState(strategies));
 checks.push('10/2残留补录自动读取、实际人数手填，成功保存保留10/1淘汰结束日期，所有API读写不改策略');
 await page.locator('[data-residual-close]').click();await login(employee);await page.goto(baseURL+'/business/daily-promotion-review');await page.setViewportSize({width:1440,height:1000});for(const form of await page.locator('form[data-saved-review]').all())await waitRead(form);await settle();await page.screenshot({path:evidence+'/employee-1440.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await settle();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:evidence+'/limited-390.png',fullPage:true});
 await writeFile(scenario,JSON.stringify({reports:{11:[],22:[],33:[]}}));await page.setViewportSize({width:1440,height:1000});await page.reload();await page.getByText('暂无报表',{exact:true}).first().waitFor();
 const missing=page.locator('form[data-saved-review]').first();assert.equal(await missing.locator('[data-juguang-message]').getAttribute('data-error'),'false');assert.notEqual(await missing.locator('[name=impressionCount]').inputValue(),'');await settle();await page.screenshot({path:evidence+'/missing-report-1440.png',fullPage:true});
 checks.push('官方无匹配行显示中性的暂无报表，原值和实际人数保留，正常缺报表不误报为接口失败');
 await writeFile(evidence+'/result.json',JSON.stringify({passed:true,checks},null,2));console.log(checks.join('\n'));
}catch(e){await page.screenshot({path:evidence+'/failure.png',fullPage:true}).catch(()=>{});await writeFile(evidence+'/failed-reads.json',JSON.stringify(reads,null,2));console.error(f.logs().slice(-1800));throw e;}
finally{await context.close();await browser.close();await f.stop();}
