/** 真实浏览器验证公共节点、几何与详情交互。数据只写隔离 PGlite。 */
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { mkdir } from 'node:fs/promises';
import { startFixture, admin } from './auth.fixture';
import * as schema from '../src/db/schema';
import { previousDateKey, shanghaiDateKey } from '../src/db/promotion-rules.mjs';
const fixture = await startFixture(); const {db,baseURL}=fixture;
let browser:any;
try {
  const today=shanghaiDateKey(new Date()), old=new Date(Date.now()-24*86400000), published=shanghaiDateKey(old);
  const ids:string[]=[];let sharedContentId='';let sourceVersionId='';
  for(let i=0;i<3;i++) {
    const contentId=i===1?sharedContentId:(await db.insert(schema.operationsContent).values({platformNoteId:(i+1).toString().repeat(24)}).returning())[0].id;
    if(i===0)sharedContentId=contentId;
    const [version]=await db.insert(schema.operationsContentVersion).values({contentId,versionNumber:i===1?1:0,workType:i===1?'revision':'new',sourceVersionId:i===1?sourceVersionId:null,revisionSummary:i===1?'虚构改帖':null,contentName:'虚构同名分组验收帖',subjectId:'tmua',categoryId:i===2?'temporary':'innovation'}).returning();
    if(i===0)sourceVersionId=version.id;
    const [schedule]=await db.insert(schema.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:old,actualPublishAt:old,isPromoted:false,promotionStatus:'none',completionStatus:'on_time'}).returning();
    ids.push(schedule.id);
    for(const [checkpointType,clickRate] of (i===2 ? [['day_7',8]] : [['day_7',[12.46,5.52][i]],['day_15',[12.23,4.95][i]]]) as Array<[string,number]>) {
      const [metric]=await db.insert(schema.operationsContentPerformanceMetric).values({scheduleId:schedule.id,checkpointType,recordedThrough:published,clickRate:String(clickRate),threeSecondReadRate:'40'}).returning();
      await db.insert(schema.operationsNonPromotionReview).values({scheduleId:schedule.id,metricId:metric.id,checkpointType,actualPublishAtSnapshot:old,subjectIdSnapshot:'tmua',subjectNameSnapshot:'TMUA',categoryIdSnapshot:version.categoryId,categoryNameSnapshot:i===2?'临时帖':'创新帖',contentNameSnapshot:'虚构同名分组验收帖',clickRateSnapshot:String(clickRate),threeSecondReadRateSnapshot:'40',reviewedByLabel:'test_admin',reviewedAt:new Date(),conclusion:'虚构验收结论',cohortSnapshot:{}});
    }
  }
  const [content]=await db.insert(schema.operationsContent).values({platformNoteId:'a'.repeat(24)}).returning();
  const [version]=await db.insert(schema.operationsContentVersion).values({contentId:content.id,versionNumber:0,workType:'new',contentName:'虚构推广详情验收',subjectId:'tmua',categoryId:'temporary'}).returning();
  const start=previousDateKey(previousDateKey(today));
  const [schedule]=await db.insert(schema.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:old,actualPublishAt:old,isPromoted:true,promotionStatus:'testing',completionStatus:'on_time'}).returning();
  const [campaign]=await db.insert(schema.operationsPromotionCampaign).values({scheduleId:schedule.id,startedOn:start,initialStage:'testing',currentStage:'testing',currentStatus:'testing'}).returning();
  await db.insert(schema.operationsPromotionStage).values({campaignId:campaign.id,stageType:'testing',startedOn:start});
  await db.insert(schema.operationsPromotionDailyMetric).values({campaignId:campaign.id,metricDate:start,dailyStatus:'active',stageTypeSnapshot:'testing',spend:'20',platformOpenCount:3,actualOpenCount:2,platformLeadCount:2,actualLeadCount:1,reviewDecision:'test_continue'});
  const login=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(admin)});assert.equal(login.status,200);
  const cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  assert.equal((await fetch(baseURL+'/api/non-promotion-reviews')).status,401);
  const playwright=await import(process.env.PLAYWRIGHT_MODULE||new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);
  browser=await playwright.chromium.launch({headless:true});await mkdir('.tools/test-artifacts',{recursive:true});
  const errors:string[]=[];
  for(const width of [1440,390,320]) {
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
    await context.addCookies(cookie.split('; ').map(pair=>({name:pair.slice(0,pair.indexOf('=')),value:pair.slice(pair.indexOf('=')+1),url:baseURL})));
    const page=await context.newPage();
    page.on('pageerror',(error:Error)=>errors.push(error.message));
    let geometry:any;
    for(const path of ['annual-plan','operations-schedule','daily-promotion-review','non-promotion-review','meeting-review','settings']) {
      await page.goto(baseURL+'/business/'+path);await page.locator('.business-toolbar').waitFor();
      const current=await page.evaluate(() => {
        const bar=document.querySelector('.business-toolbar')!.getBoundingClientRect();
        const title=document.querySelector('.business-toolbar__title strong')!.getBoundingClientRect();
        const main=getComputedStyle(document.querySelector('main')!);
        return {bar:{x:bar.x,y:bar.y,width:bar.width,height:bar.height},title:{x:title.x,y:title.y,width:title.width,height:title.height},padding:[main.paddingTop,main.paddingLeft,main.paddingRight]};
      });
      if(geometry) {
        for(const property of ['x','y','width','height']) assert.ok(Math.abs(current.bar[property]-geometry.bar[property])<=1,`${path} ${width} 工具栏 ${property}`);
        assert.ok(Math.abs(current.title.x-geometry.title.x)<=1,`${path} 标题起点`);assert.deepEqual(current.padding,geometry.padding,`${path} 正文留白`);
      } else geometry=current;
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${path} ${width} 页面无横向溢出`);
    }
    await page.goto(baseURL+'/business/daily-promotion-review');
    await page.evaluate(()=>{(window as any).__toolbar=document.querySelector('[data-promotion-toolbar]');(window as any).__tabs=document.querySelector('.toolbar-segmented');(window as any).__document=document;});
    const original=await page.locator('.toolbar-segmented').boundingBox();
    for(const view of ['stage','daily','history','stage']) {
      if(view==='history') await page.locator('a[href="?view=history"]').click(); else await page.locator(`[data-promotion-toolbar] a[href="?view=${view}"]`).click();
      await page.waitForURL(new RegExp(`view=${view}`));await page.waitForLoadState('networkidle');
      assert.equal(await page.evaluate(()=>(window as any).__document===document&&(window as any).__toolbar===document.querySelector('[data-promotion-toolbar]')&&(window as any).__tabs===document.querySelector('.toolbar-segmented')),true,'相邻视图保留同一工具栏和切换节点');
      if(view==='daily'||view==='stage')await page.screenshot({path:`.tools/test-artifacts/promotion-${view}-ui-${width}.png`,fullPage:true});
      const box=await page.locator('.toolbar-segmented').boundingBox();for(const key of ['x','y','width','height']) assert.ok(Math.abs(box[key]-original[key])<=1,`${width} ${view} tabs ${key}`);
    }
    const redirected=await fetch(baseURL+`/business/promotion-stage-review?from=${start}&to=${start}&review=example&snapshot=version`,{redirect:'manual',headers:{Cookie:cookie}});assert.equal(redirected.status,302);assert.match(redirected.headers.get('location')!,/view=stage&from=.*review=example&snapshot=version/);
    await page.goto(baseURL+'/business/non-promotion-review?view=history&subject=tmua&category=temporary');
    assert.equal(await page.locator('.missing-round').count(),1);assert.match(await page.locator('.missing-round').innerText(),/二轮.*暂无已复盘数据/s);assert.equal(await page.locator('.missing-round [data-inspector-key]').count(),0);
    await page.goto(baseURL+'/business/non-promotion-review?view=history&subject=tmua&category=innovation');
    assert.equal(await page.locator('.review-post-group').count(),2,'同一逻辑帖的 V0 / V1 按排期独立分组');
    assert.equal(await page.locator('[data-group-toggle]').isChecked(),true);
    assert.equal(await page.locator('[data-sort=click]').isDisabled(),true);
    assert.equal(await page.locator('.sort-hint,.post-group-title').count(),0);
    const groupingGeometry=()=>page.evaluate(()=>{
      const rects=[document.querySelector('[data-review-filters]')!,document.querySelector('.table-head')!,...document.querySelectorAll('.table-head>[role=columnheader]')].map(node=>{const r=node.getBoundingClientRect();return [r.x,r.y,r.width,r.height]});
      return {filters:rects[0],header:rects[1],columns:rects.slice(2)};
    });
    await page.evaluate(()=>{(window as any).__groupTable=document.querySelector('.review-table');(window as any).__groupHead=document.querySelector('.table-head');(window as any).__groupRows=[...document.querySelectorAll('[data-inspector-key]')];});
    const tableScroll=await page.locator('.table-scroll').evaluate((node:HTMLElement)=>{node.scrollLeft=43;return node.scrollLeft;});
    const groupGeometry=await groupingGeometry();assert.equal(groupGeometry.columns.length,6);
    let groupDocuments=0;page.on('request',(request:any)=>{if(request.resourceType()==='document')groupDocuments++;});
    await page.screenshot({path:`.tools/test-artifacts/review-grouped-${width}.png`,fullPage:true});
    await page.locator('[data-group-toggle]').uncheck();await page.waitForURL(/group=0/);
    assert.deepEqual(await groupingGeometry(),groupGeometry,'分组切换保留筛选、表头和六列坐标');
    assert.equal(await page.locator('.table-scroll').evaluate((node:HTMLElement)=>node.scrollLeft),tableScroll,'分组切换保留表格横向位置');
    assert.equal(await page.evaluate(()=>(window as any).__groupTable===document.querySelector('.review-table')&&(window as any).__groupHead===document.querySelector('.table-head')&&(window as any).__groupRows.every((node:Element)=>node.isConnected)),true,'只移动现有行，保留公共节点');
    assert.equal(groupDocuments,0,'分组切换不请求新文档');
    await page.screenshot({path:`.tools/test-artifacts/review-ungrouped-${width}.png`,fullPage:true});
    await page.locator('[data-sort=click]').click();
    await page.locator('[data-group-toggle]').check();await page.waitForURL(/group=1/);
    assert.equal(await page.locator('[data-sort=click]').isDisabled(),true);
    assert.equal(await page.locator('[data-sort=date]').locator('..').getAttribute('aria-sort'),'descending','跨轮分组恢复日期倒序');
    await page.goBack();await page.waitForURL(/group=0/);assert.equal(await page.locator('[data-group-toggle]').isChecked(),false);
    await page.goForward();await page.waitForURL(/group=1/);assert.equal(await page.locator('[data-group-toggle]').isChecked(),true);
    assert.equal(groupDocuments,0,'分组前后退同样原位完成');
    const metricType=await page.locator('.metric-cell em').first().evaluate((node:HTMLElement)=>({size:parseFloat(getComputedStyle(node).fontSize),family:getComputedStyle(node).fontFamily}));assert.ok(metricType.size>=12);assert.match(metricType.family,/system-ui/);
    const first=page.locator(`[data-inspector-key="${ids[1]}:day_7"]`), second=page.locator(`[data-inspector-key="${ids[1]}:day_15"]`);
    assert.match(await first.innerText(),/首轮均值 8.99%/);assert.match(await first.innerText(),/-3.47pp/);
    assert.match(await second.innerText(),/二轮均值 8.59%/);assert.match(await second.innerText(),/-3.64pp/);
    await page.evaluate(()=>{(window as any).__table=document.querySelector('.review-table');(window as any).__document=document;});
    let documents=0;page.on('request',(request:any)=>{if(request.resourceType()==='document')documents++;});
    await first.click();await page.locator('[data-inspector].is-open').waitFor();
    await page.screenshot({path:`.tools/test-artifacts/inspector-ui-${width}.png`,fullPage:true});
    const before=await page.evaluate(()=>({scroll:scrollY,tableScroll:document.querySelector('.table-scroll')!.scrollLeft}));
    assert.equal(await page.evaluate(()=>(window as any).__document===document&&(window as any).__table===document.querySelector('.review-table')),true);
    assert.equal(documents,0,'详情点击不请求新文档');
    const inspector=page.locator('[data-inspector]');
    await inspector.locator('[name=conclusion]').fill('尚未保存');
    if(width===1440){
      await inspector.locator('[name=conclusion]').evaluate((node:Element)=>{(window as any).__dirtyEditor=node;});
      await page.locator('[data-group-toggle]').uncheck();await page.locator('[data-group-toggle]').check();
      assert.equal(await inspector.locator('[name=conclusion]').inputValue(),'尚未保存');
      assert.equal(await inspector.locator('[name=conclusion]').evaluate((node:Element)=>node===(window as any).__dirtyEditor),true,'局部分组保留编辑节点和输入');
      await page.goBack();await page.waitForURL(/group=0/);assert.equal(await inspector.locator('[name=conclusion]').inputValue(),'尚未保存');
      await page.goBack();await page.waitForURL(/group=1/);assert.equal(await inspector.locator('[name=conclusion]').inputValue(),'尚未保存');
    }
    page.once('dialog',(dialog:any)=>dialog.dismiss());await page.getByRole('link',{name:'待复盘',exact:true}).click();assert.equal(new URL(page.url()).searchParams.get('view'),'history','取消离开保留当前视图');
    page.once('dialog',(dialog:any)=>dialog.dismiss());await page.goBack();await page.waitForURL((url:URL)=>url.searchParams.get('row')===`${ids[1]}:day_7`);assert.equal(new URL(page.url()).searchParams.get('row'),`${ids[1]}:day_7`);assert.equal(await inspector.locator('[name=conclusion]').inputValue(),'尚未保存');
    page.once('dialog',(dialog:any)=>dialog.dismiss());await inspector.locator('[data-close-inspector]').click();assert.equal(await inspector.isVisible(),true,'未保存取消关闭');
    page.once('dialog',(dialog:any)=>dialog.accept());await page.keyboard.press('Escape');await inspector.waitFor({state:'hidden'});
    assert.deepEqual(await page.evaluate(()=>({scroll:scrollY,tableScroll:document.querySelector('.table-scroll')!.scrollLeft})),before,'关闭保留列表滚动位置');
    await page.goBack();await inspector.waitFor();assert.equal(await page.evaluate(()=>(window as any).__table===document.querySelector('.review-table')),true,'后退保留列表节点');await page.goForward();await inspector.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>(window as any).__table===document.querySelector('.review-table')),true,'前进保留列表节点');
    await first.focus();await page.keyboard.press('Enter');await inspector.waitFor();await page.keyboard.press('Escape');await inspector.waitFor({state:'hidden'});assert.equal(await first.evaluate((node:HTMLElement)=>node===document.activeElement),true,JSON.stringify(await page.evaluate(()=>({active:document.activeElement?.outerHTML?.slice(0,500),selected:document.querySelector('[data-inspector]')?.getAttribute('data-selected-id'),sameTable:(window as any).__table===document.querySelector('.review-table')}))));
    if(width===1440) {
      // 快速选择最后一次立即生效，不等待后台请求。
      await first.click();await second.click();assert.equal(await inspector.locator('[name=checkpointType]').inputValue(),'day_15');
      // 保存后刷新数据，失败时明确指出已保存且保留编辑内容。
      await inspector.locator('[name=conclusion]').fill('虚构本地保存');
      await page.route('**/api/non-promotion-reviews?**',(route:any)=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
      await inspector.locator('[data-review-form] button[type=submit]').click();await inspector.getByText(/保存已成功，列表刷新失败/).waitFor();assert.equal(await inspector.locator('[name=conclusion]').inputValue(),'虚构本地保存');
      await page.unroute('**/api/non-promotion-reviews?**');
      await inspector.locator('[name=clickRate]').fill('6.95');await inspector.locator('[data-review-form] button[type=submit]').click();await inspector.getByText('已保存',{exact:true}).waitFor();assert.match(await second.innerText(),/二轮均值 9.59%/);
      await page.keyboard.press('Escape');await inspector.waitFor({state:'hidden'});
    }
    await page.locator('[name=checkpoint]').selectOption('day_7');await page.waitForURL(/checkpoint=day_7/);assert.equal(await page.locator('[data-sort=click]').isDisabled(),false);assert.equal(await page.locator('[data-checkpoint=day_15]').count(),0);
    await page.locator('[data-sort=click]').click();await page.locator('[data-sort=click]').click();assert.equal(await page.locator('.review-post-group').first().getAttribute('data-review-group'),ids[1],'单轮指标排序按整个帖子组移动');
    await page.locator('[data-group-toggle]').uncheck();await page.waitForURL(/group=0/);assert.equal(await page.locator('.review-post-group').count(),0);
    await page.screenshot({path:`.tools/test-artifacts/business-ui-${width}.png`,fullPage:true});
    if(width===1440) {
      await page.goto(baseURL+`/business/operations-schedule?month=${published.slice(0,7)}`);
      await page.route(`**/api/operations-content/${ids[0]}/workflow`,async(route:any)=>{const response=await route.fetch();await new Promise(resolve=>setTimeout(resolve,400));await route.fulfill({response});});
      await page.route(`**/api/operations-content/${ids[1]}/workflow`,(route:any)=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'虚构读取失败'})}));
      await page.locator(`[data-inspect-id="${ids[0]}"]`).first().click();
      await page.locator('[data-inspector].is-open').waitFor();
      await page.locator(`[data-inspect-id="${ids[1]}"]`).first().click();
      await page.locator('[data-schedule-workflow]').getByText('虚构读取失败').waitFor();await page.waitForLoadState('networkidle');
      assert.equal(await page.locator('[data-inspector]').getAttribute('data-selected-id'),ids[1]);
      assert.equal(await page.locator('[data-schedule-workflow]').getByText('虚构读取失败').count(),1,'晚到的旧请求不覆盖新选择');
      await page.unroute(`**/api/operations-content/${ids[1]}/workflow`);await page.getByRole('button',{name:'重新读取',exact:true}).click();await page.locator('[data-schedule-workflow]').getByText('当前没有延期或改期记录。').waitFor();
      await page.keyboard.press('Escape');await page.locator('[data-inspector]').waitFor({state:'hidden'});
    }
    await page.goto(baseURL+'/business/daily-promotion-review?view=history');await page.locator(`[data-inspector-key="${campaign.id}"]`).click();await page.locator('[data-edit-trigger]').first().click();await page.locator('dialog[open]').waitFor();await page.locator('dialog[open] [data-close-edit]').first().click();await page.keyboard.press('Escape');await page.locator('[data-inspector]').waitFor({state:'hidden'});
    await context.close();
    await db.update(schema.operationsContentPerformanceMetric).set({clickRate:'4.95'}).where(and(eq(schema.operationsContentPerformanceMetric.scheduleId,ids[1]),eq(schema.operationsContentPerformanceMetric.checkpointType,'day_15')));
  }
  assert.deepEqual(errors,[]);console.log('通过：共享正文和工具栏几何、推广同节点切换、同名分组与轮次基准、无文档跳转 Inspector、历史与键盘、未保存保护、保存刷新及失败保留、1440/390/320px。');
} catch(error){console.error(fixture.logs());throw error;}
finally{await browser?.close();await fixture.stop();}
