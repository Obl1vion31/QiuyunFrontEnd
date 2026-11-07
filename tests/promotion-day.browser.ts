import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startPostgresFixture} from './postgres.fixture';
import {seedHistoricalDay} from './promotion-day.fixture';
import {admin,employee} from './auth.fixture';
import {settleBusinessUI,respondToBusinessConfirm} from './business-confirm.helper';
import {promotionSnapshot} from '../src/db/promotion-timeline';
const dir=process.env.PROMOTION_DAY_DIR??'.tools/test-artifacts/promotion-day';await mkdir(dir+'/screenshots',{recursive:true});
const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-06T10:00:00+08:00');
const f=await startPostgresFixture({clockFile,entry:process.env.PROMOTION_DAY_ENTRY}),{db,baseURL}=f;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);let browser:any,debug:any;const checks:string[]=[],images:string[]=[],errors:string[]=[],fonts:any[]=[];
async function cookies(actor:any){const r=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(actor)});assert.equal(r.status,200);return r.headers.getSetCookie().map(v=>{const [name,...rest]=v.split(';')[0].split('=');return {name,value:rest.join('='),url:baseURL};});}
async function shot(page:any,name:string,key?:any){
 await settleBusinessUI(page);await page.waitForFunction(()=>![...document.querySelectorAll('[data-operation-feedback]')].some(e=>e.getAttribute('aria-hidden')==='false'));
 const file=dir+'/screenshots/'+name+'.png';await page.screenshot({path:file,fullPage:false});images.push(file);
 if(!await page.locator('dialog[open]').count()){const full=dir+'/screenshots/'+name+'-full.png';await page.screenshot({path:full,fullPage:true});images.push(full);}
 if(key){const detail=dir+'/screenshots/'+name+'-detail.png';await key.screenshot({path:detail});images.push(detail);}
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
}
async function openMetric(page:any,c:any,index=2){
 await page.goto(baseURL+'/business/daily-promotion-review?view=history&from=2026-10-01&to=2026-11-05&q='+encodeURIComponent(c.post.version.contentName));await page.waitForLoadState('networkidle');
 await page.locator('[data-promotion-data="'+c.post.schedule.id+'"]>summary').click();
 await page.locator('[data-daily-record="'+c.metrics[index].id+'"]').click();await settleBusinessUI(page);
 return page.locator('[data-inspector] [data-metric-card]');
}
async function edit(page:any,card:any){await card.locator('[data-edit-trigger]').click();const e=page.locator('[data-edit-dialog][open]');await e.waitFor();await settleBusinessUI(page);return e;}
const save=(page:any,editor:any)=>Promise.all([page.waitForResponse((r:any)=>r.url().includes('/api/promotion-daily/')&&r.request().method()==='PATCH'),editor.locator('[type=submit]').click()]).then(([r])=>r);
try{
 const boss=await cookies(admin),staff=await cookies(employee);browser=await chromium.launch({headless:true});
 for(const width of [1440,1920,1024]){
  const c=await seedHistoricalDay(db,'面试课 · 单日安排核对 · '+width,Array(6).fill('testing'));
  const ctx=await browser.newContext({viewport:{width,height:1000},...(width===1440?{recordVideo:{dir:dir+'/video',size:{width:1440,height:1000}}}:{reducedMotion:'reduce'})});await ctx.addCookies(boss);const page=await ctx.newPage();debug=page;page.on('pageerror',(e:Error)=>errors.push(e.message));
  const card=await openMetric(page,c);await page.locator('[data-inspector] [data-close-inspector]').click();await settleBusinessUI(page);
  await shot(page,'admin-'+width+'-01-before',page.locator('[data-promotion-data="'+c.post.schedule.id+'"]'));
  await page.locator('[data-daily-record="'+c.metrics[2].id+'"]').click();await settleBusinessUI(page);
  const editor=await edit(page,card);assert.equal(await editor.locator('select[name=reviewDecision]').count(),0);assert.equal(await page.locator('[data-inspector] [data-history-status-edit]').count(),0);
  assert.equal(await editor.locator('[name=dayStatus]').inputValue(),'testing');
  await editor.locator('[name=dayStatus]').selectOption('test_paused');await editor.locator('[name=note]').fill('核对10月31日暂停，当天指标保留，前后继续测试');
  const before=await promotionSnapshot(db,c.post.schedule.id);assert.equal((await save(page,editor)).status(),409);
  const confirm=page.locator('[data-business-confirm][open]');await confirm.waitFor();
  const text=await confirm.innerText();for(const str of ['2026-10-30','2026-10-31','2026-11-01','测试中 → 测试暂停','前后日期保持原状'])assert(text.includes(str),text);
  await shot(page,'admin-'+width+'-02-context',confirm);await respondToBusinessConfirm(page,false);
  assert.equal(await editor.locator('[name=dayStatus]').inputValue(),'test_paused');assert.equal(await editor.locator('[name=note]').inputValue(),'核对10月31日暂停，当天指标保留，前后继续测试');assert.deepEqual(await promotionSnapshot(db,c.post.schedule.id),before);
  assert(await editor.locator('[type=submit]').evaluate((e:Element)=>e===document.activeElement));assert.equal(await editor.locator('[data-edit-message]').innerText(),'');
  await shot(page,'admin-'+width+'-03-cancel-preserved',editor);
  await save(page,editor);await confirm.waitFor();const done=page.waitForResponse((r:any)=>r.url().includes('/api/promotion-daily/')&&r.request().method()==='PATCH');const navigation=page.waitForNavigation({waitUntil:'networkidle'});
  await respondToBusinessConfirm(page,true);assert.equal((await done).status(),200);await navigation;
  await page.locator('[data-inspector] [data-close-inspector]').click();await settleBusinessUI(page);
  const table=page.locator('[data-promotion-data="'+c.post.schedule.id+'"]');if(!await table.getAttribute('open'))await table.locator('summary').click();
  await settleBusinessUI(page);await shot(page,'admin-'+width+'-04-after',table);
  const after=await promotionSnapshot(db,c.post.schedule.id);assert.equal(after.metrics.length,6);assert.deepEqual(after.metrics.map(m=>m.actualStatusSnapshot),['testing','testing','test_paused','testing','testing','testing']);assert.equal(after.metrics.reduce((n,m)=>n+Number(m.spend),0),195);
  const controls=await page.evaluate(()=>[...document.querySelectorAll('button,input,select,textarea')].slice(0,10).map(e=>getComputedStyle(e).fontFamily));assert(controls.every((s:string)=>s.includes('MiSans')));
  checks.push(width+'桌面：当日表单、三日确认、取消焦点/输入保留、保存只改10/31、6天指标合计195不变、无横向溢出');
  if(width===1440){
   await page.locator('[data-daily-record="'+c.metrics[2].id+'"]').click();await settleBusinessUI(page);const invalid=await edit(page,page.locator('[data-inspector] [data-metric-card]'));await invalid.locator('[name=dayStatus]').selectOption('test_pending');assert.equal((await save(page,invalid)).status(),422);await invalid.locator('[data-edit-message]').filter({hasText:'不能衔接'}).waitFor();assert.equal(await invalid.locator('[name=dayStatus]').inputValue(),'test_pending');assert.equal(await page.locator('[data-business-confirm][open]').count(),0);await shot(page,'admin-1440-05-invalid-adjacency',invalid);assert.deepEqual(await promotionSnapshot(db,c.post.schedule.id),after);
   checks.push('待定接次日旧轮测试：明确显示具体日期/两端状态，选择保留、未弹删除后续确认、数据库未变');
  }
  const video=page.video();await page.waitForTimeout(200);await ctx.close();if(width===1440)await video.saveAs(dir+'/video/admin-1440.webm');
 }
 // Employee compatible edit plus network failure and no unsaved-input loss.
 const c=await seedHistoricalDay(db,'员工 · 暂停与待定单日更正',Array(6).fill('test_paused'));
 const sc=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await sc.addCookies(staff);const sp=await sc.newPage();debug=sp;
 const card=await openMetric(sp,c);const e=await edit(sp,card);const opts=await e.locator('[name=dayStatus] option:enabled').evaluateAll((items:HTMLOptionElement[])=>items.map(n=>n.value));assert(opts.includes('testing')&&opts.includes('scaling')&&opts.includes('ended'));
 await e.locator('[name=dayStatus]').selectOption('test_pending');await e.locator('[name=spend]').fill('66.50');
 await sp.route('**/api/promotion-daily/*',(r:any)=>r.abort('internetdisconnected'));await e.locator('[type=submit]').click();await e.locator('[data-edit-message]').filter({hasText:'无法连接'}).waitFor();assert.equal(await e.locator('[name=spend]').inputValue(),'66.50');await shot(sp,'employee-1440-01-network-preserved',e);await sp.unroute('**/api/promotion-daily/*');
 assert.equal((await save(sp,e)).status(),409);await shot(sp,'employee-1440-02-context',sp.locator('[data-business-confirm][open]'));const sn=sp.waitForNavigation({waitUntil:'networkidle'});await respondToBusinessConfirm(sp,true);await sn;const after=await promotionSnapshot(db,c.post.schedule.id);assert.deepEqual(after.metrics.map(m=>m.actualStatusSnapshot),['test_paused','test_paused','test_pending','test_paused','test_paused','test_paused']);assert.equal(after.metrics[2].spend,'66.50');checks.push('员工与管理员同权：历史单日更正需三日确认；断网保留金额和选择，重试只改当天');await sc.close();
 // Both roles see exactly the same public instructions, desktop widths only.
 let publicText='';
 for(const [role,cookie]of [['admin',boss],['employee',staff]] as const){
  const ctx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await ctx.addCookies(cookie);const p=await ctx.newPage();debug=p;p.on('pageerror',(e:Error)=>errors.push(e.message));
  for(const width of [1920,1440,1024]){
   await p.setViewportSize({width,height:1000});await p.goto(baseURL+'/business/settings?view=guide#guide-promotion');await p.locator('#guide-promotion').waitFor();await settleBusinessUI(p);await p.waitForTimeout(100);
   const section=p.locator('#guide-promotion');await section.evaluate((e:HTMLElement)=>e.scrollIntoView({block:'start',behavior:'instant'}));await settleBusinessUI(p);
   const t=await section.innerText();assert(t.includes('当日安排'));if(!publicText)publicText=t;else assert.equal(t,publicText);
   assert.equal(await p.locator('#guide-maintain').count(),role==='admin'?1:0);
   await shot(p,role+'-'+width+'-guide',section);
   const cdp=await ctx.newCDPSession(p);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const doc=await cdp.send('DOM.getDocument');const q=await cdp.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#guide-promotion h2'});const actual=(await cdp.send('CSS.getPlatformFontsForNode',{nodeId:q.nodeId})).fonts;assert(actual.some((f:any)=>f.familyName==='MiSans VF'&&f.glyphCount>0));fonts.push({role,width,actual});await cdp.detach();
  }
  await ctx.close();
 }
 checks.push('使用说明：管理员/员工1920/1440/1024内容一致、允许/不允许示例可读，员工无管理入口，实际MiSans字形');
 assert.deepEqual(errors,[]);await writeFile(dir+'/browser.json',JSON.stringify({passed:true,checks,images,fonts,errors},null,2));console.log(checks.join('\n'));
}catch(e){if(debug&&!debug.isClosed())await debug.screenshot({path:dir+'/debug.png'});console.error(f.logs().slice(-2500));throw e;}finally{await browser?.close();await f.stop();}
