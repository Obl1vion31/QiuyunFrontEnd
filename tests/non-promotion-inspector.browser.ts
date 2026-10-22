/** 正式非推广表格与共享 Inspector；仅使用隔离 PGlite 和虚构资料。 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { startFixture, admin } from './auth.fixture';
import { respondToBusinessConfirm } from './business-confirm.helper';
import * as s from '../src/db/schema';

const folder = '.tools/test-artifacts/non-promotion-inspector';
await mkdir(folder, { recursive:true });
const clockFile = new URL('../' + folder + '/clock.txt', import.meta.url).pathname;
await writeFile(clockFile, '2026-10-23T12:00:00+08:00');
const fixture = await startFixture({ clockFile }), { db, baseURL } = fixture;
let browser:any;
const checks:string[] = [], errors:string[] = [], geometry:any[] = [];
try {
  const login = await fetch(baseURL + '/api/auth/sign-in/username', { method:'POST', headers:{ Origin:baseURL, 'Content-Type':'application/json' }, body:JSON.stringify(admin) });
  assert.equal(login.status,200);
  const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const api = async (path:string, values?:Record<string,string>) => {
    const form = new FormData(); for (const [key,value] of Object.entries(values??{})) form.set(key,value);
    const response = await fetch(baseURL + path,{ method:values?'POST':'GET', headers:{ Cookie:cookie,Origin:baseURL },body:values?form:undefined });
    const data = await response.json(); assert.ok(response.ok,JSON.stringify(data)); return data;
  };
  let number = 0;
  const seed = async (name:string, options:{source?:any; missing?:boolean; noteId?:boolean; category?:string}={}) => {
    number++;
    const content = options.source?.content ?? (await db.insert(s.operationsContent).values({ platformNoteId:options.noteId===false?null:number.toString(16).padStart(24,'0') }).returning())[0];
    const [version] = await db.insert(s.operationsContentVersion).values({contentId:content.id, versionNumber:options.source?1:0, workType:options.source?'revision':'new',sourceVersionId:options.source?.version.id,revisionSummary:options.source?'核对新版内容':null,contentName:name,subjectId:'tmua',categoryId:options.category??'innovation',projectDocUrl:options.missing?null:'https://fictional.example.test/project/'+number}).returning();
    const [schedule] = await db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:new Date('2026-09-30T23:30:00+08:00'),actualPublishAt:new Date('2026-10-01T00:15:00+08:00'),publicationUrl:options.missing?null:'https://www.xiaohongshu.com/explore/'+content.platformNoteId+'?xsec_token=fixture',isPromoted:false,promotionStatus:'none',completionStatus:'on_time'}).returning();
    return {content,version,schedule};
  };
  const first = await seed('TMUA 备考：用反例辨析常见逻辑命题');
  const second = await seed(first.version.contentName,{source:first,missing:true});
  const long = await seed('从真题到方法：如何拆解数学入学考试中的长条件与逻辑关系，建立完整解题过程',{noteId:false});
  await seed('数列与递推：把关键条件转化成可用信息');
  const history = await seed('分类思路：从读题到建模');
  for(const [checkpointType,clickRate] of [['day_7','6.25'],['day_15','8.50']])
    await api('/api/non-promotion-reviews',{scheduleId:history.schedule.id,checkpointType,recordedThrough:checkpointType==='day_7'?'2026-10-08':'2026-10-16',clickRate,threeSecondReadRate:'42',conclusion:'保留问题拆解方式，补充反例。'});
  const skipped = await seed('方法对照：条件充分性判断',{category:'temporary'});
  await api('/api/non-promotion-checkpoints',{scheduleId:skipped.schedule.id,checkpointType:'day_7',action:'skip',scope:'schedule',expectedEventId:'',expectedEvents:JSON.stringify({day_7:null,day_15:null}),reason:'本次平台数据不可用'});

  assert.equal((await fetch(baseURL+'/api/non-promotion-reviews')).status,401);
  const data = await api('/api/non-promotion-reviews?view=pending');
  const fact = data.tableRows.find((item:any)=>item.row.id===first.schedule.id);
  assert.equal(fact.row.publicationUrl,first.schedule.publicationUrl);
  assert.equal(fact.row.plannedPublishAt,first.schedule.plannedPublishAt.toISOString());
  assert.equal(fact.row.actualPublishAt,first.schedule.actualPublishAt!.toISOString());
  checks.push('认证 GET 与 SSR 共用应发、实发和发布链接；无需新接口');

  const pw = await import(process.env.PLAYWRIGHT_MODULE||new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);
  browser = await pw.chromium.launch({headless:true});
  const context = await browser.newContext({viewport:{width:1440,height:1100},recordVideo:{dir:folder+'/video',size:{width:1440,height:1100}}});
  await context.addCookies(cookie.split('; ').map(c=>({name:c.slice(0,c.indexOf('=')),value:c.slice(c.indexOf('=')+1),url:baseURL})));
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror',(e:Error)=>errors.push(e.message));
  page.on('dialog',(dialog:any)=>{errors.push('不应出现原生弹框：'+dialog.type());void dialog.dismiss();});
  await context.route('https://fictional.example.test/**',(route:any)=>route.fulfill({status:200,contentType:'text/html',body:'<html><body>隔离资料页面</body></html>'}));
  await context.route('https://www.xiaohongshu.com/**',(route:any)=>route.fulfill({status:200,contentType:'text/html',body:'<html><body>隔离帖子页面</body></html>'}));
  const nav = async(path:string) => {await page.goto(baseURL+path);await page.waitForLoadState('networkidle');await page.evaluate(()=>document.fonts.ready);};
  const shot = async(name:string) => {
    await pane.evaluate(async(node:HTMLElement)=>{await Promise.allSettled(node.getAnimations({subtree:true}).map(a=>a.finished));});
    await page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await page.screenshot({path:folder+'/'+name+'.png',fullPage:false});
  };
  const row = (id:string,round='day_7')=>page.locator('[data-inspector-key="'+id+':'+round+'"]');
  const pane = page.locator('[data-inspector]');
  const close = async()=>{await pane.locator('[data-close-inspector]').click();await pane.waitFor({state:'hidden'});};
  const assertIdentity = async(id:string,round='day_7')=>{
    assert.equal(await pane.getAttribute('data-selected-id'),id+':'+round);
    assert.equal(await pane.locator('[name=scheduleId]').first().inputValue(),id);
    assert.equal(await pane.locator('[name=checkpointType]').first().inputValue(),round);
  };
  await nav('/business/non-promotion-review');
  let documents = 0; page.on('request',(request:any)=>{if(request.resourceType()==='document'&&request.frame()===page.mainFrame())documents++;});
  await page.evaluate(()=>{(window as any).__reviewTable=document.querySelector('.review-table');});
  for (const width of [1440,1024,390,320]) {
    await page.setViewportSize({width,height:1100});
    const r = row(first.schedule.id), action = r.locator('.review-entry-button');
    assert.equal(await action.innerText(),'点击录入');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'页面不横向溢出');
    if(width<=1440) {
      const button = await action.boundingBox(); assert.ok(button&&button.x>=0&&button.x+button.width<=width,'录入按钮完整可见');
    }
    await shot('pending-'+width);
    await action.click(); await pane.waitFor({state:'visible'}); await assertIdentity(first.schedule.id);
    await pane.evaluate(async(node:HTMLElement)=>{await Promise.allSettled(node.getAnimations().map(a=>a.finished));});
    const resources = pane.locator('.review-resources');
    assert.match(await resources.innerText(),/2026-09-30 23:30/);
    assert.match(await resources.innerText(),/2026-10-01 00:15/);
    assert.equal(await resources.getByRole('link',{name:'打开项目文档 ↗',exact:true}).getAttribute('href'),first.version.projectDocUrl);
    assert.equal(await resources.getByRole('link',{name:'打开小红书帖子 ↗',exact:true}).getAttribute('href'),first.schedule.publicationUrl);
    const scheduleHref = await resources.getByRole('link',{name:'查看排期详情 ↗',exact:true}).getAttribute('href');
    const scheduleURL = new URL(scheduleHref!,baseURL);
    assert.equal(scheduleURL.searchParams.get('month'),'2026-09');
    assert.equal(scheduleURL.searchParams.get('row'),first.schedule.id);
    assert.equal(await pane.evaluate((node:HTMLElement)=>node.scrollWidth<=node.clientWidth),true,'资料与表单无横向溢出');
    const fonts = await pane.locator('a,dt,dd,input,button').evaluateAll((nodes:HTMLElement[])=>nodes.map(n=>getComputedStyle(n).fontFamily));
    assert.ok(fonts.every((family:string)=>family.includes('MiSans')&&!family.includes('monospace')));
    await shot('inspector-'+width);
    geometry.push({width,button:await action.boundingBox(),pane:await pane.boundingBox()});
    await close();
    assert.equal(await action.evaluate((n:HTMLElement)=>n===document.activeElement),true,'关闭返回触发按钮');
    for(const entry of ['title','row','keyboard-button','keyboard-row']) {
      if(entry==='title')await r.locator('.review-title-button').click();
      else if(entry==='row')await r.locator('[data-label=节点]').click();
      else if(entry==='keyboard-button'){await action.focus();await page.keyboard.press('Space');}
      else {await r.focus();await page.keyboard.press('Enter');}
      await pane.waitFor({state:'visible'});await assertIdentity(first.schedule.id);
      await close();
    }
    await r.locator('.review-title-button').click();await pane.waitFor({state:'visible'});
    await pane.locator('[name=conclusion]').fill('保留未保存的复盘内容');
    await page.evaluate(()=>{(window as any).__reviewForm=document.querySelector('[data-inspector] [data-review-form]');});
    await action.evaluate((n:HTMLElement)=>n.click());
    await r.locator('.review-title-button').evaluate((n:HTMLElement)=>n.click());
    assert.equal(await page.evaluate(()=>(window as any).__reviewForm===document.querySelector('[data-inspector] [data-review-form]')),true,'同记录不重建表单');
    assert.equal(await pane.locator('[name=conclusion]').inputValue(),'保留未保存的复盘内容');
    const cancel = respondToBusinessConfirm(page);
    await row(second.schedule.id).locator('.review-entry-button').evaluate((n:HTMLElement)=>n.click());await cancel;
    await assertIdentity(first.schedule.id);
    assert.equal(await pane.locator('[name=conclusion]').inputValue(),'保留未保存的复盘内容');
    if(width===1440) {
      for(const label of ['打开项目文档 ↗','打开小红书帖子 ↗','查看排期详情 ↗']) {
        const popupPromise = context.waitForEvent('page');
        await resources.getByRole('link',{name:label,exact:true}).click();
        const popup = await popupPromise; await popup.waitForLoadState('domcontentloaded');
        if(label==='查看排期详情 ↗') {
          assert.equal(new URL(popup.url()).searchParams.get('month'),'2026-09');
          assert.equal(await popup.locator('[data-inspector]').getAttribute('data-selected-id'),first.schedule.id);
          await popup.screenshot({path:folder+'/schedule-deep-link-1440.png',fullPage:false});
        }
        await popup.close();await page.bringToFront();
        assert.equal(await pane.locator('[name=conclusion]').inputValue(),'保留未保存的复盘内容');
      }
    }
    const accept = respondToBusinessConfirm(page,true);
    await row(second.schedule.id).locator('.review-title-button').evaluate((n:HTMLElement)=>n.click());await accept;
    await assertIdentity(second.schedule.id);
    assert.equal(await pane.locator('.resource-missing').count(),2);
    assert.match(await pane.locator('header').innerText(),/V1/);
    await shot('missing-resources-'+width);await close();
    await row(long.schedule.id).locator('.review-entry-button').click();await pane.waitFor({state:'visible'});
    assert.equal(await pane.locator('[name=platformNoteId]').count(),1);
    await shot('long-title-'+width);
    const toolbar = await page.locator('.business-toolbar').boundingBox();
    assert.ok(toolbar&&Math.abs(toolbar.y)<=1,'滚动后打开详情保留顶部工具栏：'+JSON.stringify(toolbar));
    await close();
  }
  checks.push('1440/1024/390/320px 三入口、键盘、准确身份、缺资料、长标题、焦点与草稿保护');
  assert.equal(documents,0,'打开及切换详情无文档导航');
  assert.equal(await page.evaluate(()=>(window as any).__reviewTable===document.querySelector('.review-table')),true);
  checks.push('新标签查看文档、小红书及跨月排期，保留原始输入');

  await page.setViewportSize({width:1440,height:1100});
  await row(first.schedule.id).locator('.review-entry-button').click();
  await pane.locator('[name=clickRate]').fill('7.25');await pane.locator('[name=threeSecondReadRate]').fill('43.50');
  await pane.locator('[name=conclusion]').fill('第一次保存并检查资料');
  await pane.locator('[data-review-form] button[type=submit]').click();
  await page.waitForURL((url:URL)=>url.searchParams.get('view')==='history');await page.waitForLoadState('networkidle');
  const group = page.locator('[data-category-group="tmua:innovation"]');
  await group.locator('summary').first().click();
  await row(first.schedule.id).locator('.review-entry-button').click();await assertIdentity(first.schedule.id);
  assert.equal(Number(await pane.locator('[name=clickRate]').inputValue()),7.25);
  assert.equal(await pane.locator('.review-resources a[target=_blank]').count(),3);
  await close();
  await row(history.schedule.id,'day_15').locator('.review-title-button').click();await assertIdentity(history.schedule.id,'day_15');
  await pane.locator('[name=conclusion]').fill('二轮输入不会随视图切换丢失');
  await page.getByRole('radio',{name:'历史数据总览',exact:true}).check();
  assert.equal(await pane.locator('[name=conclusion]').inputValue(),'二轮输入不会随视图切换丢失');
  await pane.locator('[data-review-form] button[type=submit]').click();await pane.getByText('已保存',{exact:true}).waitFor();
  await close();await row(history.schedule.id,'day_7').locator('.review-entry-button').click();await assertIdentity(history.schedule.id,'day_7');
  assert.equal(Number(await pane.locator('[name=clickRate]').inputValue()),6.25);await close();
  for(const width of [1440,1024,390,320]) {
    await page.setViewportSize({width,height:1100});
    const action=row(history.schedule.id,'day_15').locator('.review-entry-button');
    const rect=await action.boundingBox();assert.ok(rect&&rect.x>=0&&rect.x+rect.width<=width,'已复盘按钮完整可见');
    await shot('history-flat-'+width);
    await action.click();await assertIdentity(history.schedule.id,'day_15');
    await shot('history-inspector-'+width);await close();
  }
  await page.setViewportSize({width:1440,height:1100});
  await page.getByRole('radio',{name:'分类均值查看',exact:true}).check();await shot('history-category-1440');
  checks.push('首次保存后资料仍可读，历史保存刷新、首二轮独立及分类/平铺共用节点');

  await nav('/business/non-promotion-review?view=skipped');
  await row(skipped.schedule.id).locator('.review-entry-button').click();
  assert.equal(await pane.locator('[data-review-form]').count(),0);
  assert.equal(await pane.locator('.review-resources a').count(),3);
  await shot('skipped-1440');await close();
  checks.push('不复盘记录提供资料与恢复入口，按钮文案为查看详情');

  await nav('/business/non-promotion-review?view=pending');
  await page.evaluate('(()=>{const frames=[];window.__entryFrames=frames;const start=performance.now();function tick(){const n=document.querySelector("[data-inspector]"),r=n.getBoundingClientRect();frames.push({time:performance.now()-start,hidden:n.hidden,width:r.width,opacity:Number(getComputedStyle(n).opacity)});if(performance.now()-start<350)requestAnimationFrame(tick);}tick();})()');
  await row(second.schedule.id).locator('.review-entry-button').evaluate((n:HTMLElement)=>n.click());
  await page.waitForTimeout(380);
  const frames = await page.evaluate(()=>(window as any).__entryFrames);
  assert.ok(frames.some((f:any)=>f.opacity>0&&f.opacity<.98),'共享 Inspector 连续进入');
  await writeFile(folder+'/entry-frames.json',JSON.stringify(frames));
  await shot('motion-end-1440');await close();
  await page.emulateMedia({reducedMotion:'reduce'});
  await row(second.schedule.id).locator('.review-entry-button').click();await pane.waitFor();
  assert.equal(await pane.evaluate((n:HTMLElement)=>n.getAnimations().length),0);
  await close();checks.push('220ms 公共动效与减少动态效果');
  assert.deepEqual(errors,[]);
  await writeFile(folder+'/checks.json',JSON.stringify({checks,geometry,errors},null,2));
  console.log('通过：'+checks.join('；'));
  const videoPath = await page.video().path();
  await context.close();
  await writeFile(folder+'/video-path.txt',videoPath);
} catch(error) {console.error(fixture.logs().slice(-2500));throw error;}
finally {await browser?.close();await fixture.stop();}
