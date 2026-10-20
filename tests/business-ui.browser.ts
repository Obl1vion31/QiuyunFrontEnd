import {respondToBusinessConfirm} from './business-confirm.helper';
import { fillBusinessDateTime, checkBusinessDateTime } from './business-datetime.helper';
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
      assert.equal(await page.locator('.business-page-header__copy>span').count(),0,'页面标题没有装饰性英文眉题');
      const controlFonts=await page.locator('button:visible,input:visible,select:visible,textarea:visible').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>({label:node.getAttribute('aria-label')||node.textContent?.slice(0,18),family:getComputedStyle(node).fontFamily})));assert.ok(controlFonts.every((item:any)=>item.family.includes('system-ui')&&!item.family.includes('monospace')),`${path} 控件字体统一 ${JSON.stringify(controlFonts.filter((item:any)=>!item.family.includes('system-ui')||item.family.includes('monospace')))}`);
      if(path==='settings') {
        const controls=await page.locator('.business-form input:not([type=checkbox]),.business-form select').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>({height:node.getBoundingClientRect().height,size:getComputedStyle(node).fontSize})));
        const options=await page.locator('.checks input[type=checkbox]').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>node.getBoundingClientRect().width));assert.ok(options.every((width:number)=>width===18),'独立选项统一为 18px');assert.ok(controls.length>=3);assert.ok(controls.every((c:{height:number;size:string})=>c.height===40&&c.size==='13px'),'系统设置接入公共表单规格');
        await page.screenshot({path:`.tools/test-artifacts/settings-ui-${width}.png`,fullPage:true});
      }
      if(path==='meeting-review') {
        await page.locator('[data-open-create]').click();const dialog=page.locator('[data-create]');await dialog.waitFor();
        const controls=await dialog.locator('input:not([type=hidden])').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>({height:node.getBoundingClientRect().height,size:getComputedStyle(node).fontSize})));
        assert.ok(controls.every((c:{height:number;size:string})=>c.height===40&&c.size==='13px'),'例会创建与其他表单使用相同控件');
        assert.equal(await dialog.getAttribute('aria-labelledby'),'create-meeting-title');
        await checkBusinessDateTime(dialog.locator('[data-datetime-field]'));await fillBusinessDateTime(page,'meetingAt',`${today}T00:00`);
        assert.equal(await dialog.locator('[name=meetingAt]').inputValue(),`${today}T00:00`);
        assert.equal(await dialog.evaluate((node:HTMLElement)=>node.scrollWidth<=node.clientWidth),true,'窄屏对话框无横向溢出');
        await page.screenshot({path:`.tools/test-artifacts/meeting-create-ui-${width}.png`});
        if(width===1440){
          await dialog.locator('[name=periodStart]').fill(start);await dialog.locator('[name=periodEnd]').fill(previousDateKey(today));await dialog.locator('[name=name]').fill('虚构拆分时间例会');
          const created=page.waitForResponse((response:any)=>response.url().endsWith('/api/meeting-reviews')&&response.request().method()==='POST');await dialog.locator('button[type=submit],button.primary').click();const response=await created;assert.equal(response.status(),201);await page.waitForURL((url:URL)=>Boolean(url.searchParams.get('meeting')));const result={id:new URL(page.url()).searchParams.get('meeting')!};
          await page.waitForLoadState('networkidle');
          const [meeting]=await db.select().from(schema.operationsReviewMeeting).where(eq(schema.operationsReviewMeeting.id,result.id));assert.equal(meeting.meetingAt.toISOString(),new Date(`${today}T00:00`).toISOString(),'拆分输入保持原有会议时间解析');
        }else await dialog.locator('[data-close]').click();
      }
      if(path==='annual-plan') {
        await page.locator('[data-open-new]').click();const dialog=page.locator('#row-dialog');await dialog.waitFor();
        const before=await dialog.locator('.dialog-head,.dialog-actions').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>{const r=node.getBoundingClientRect();return [r.y,r.height]}));
        await dialog.locator('[name=note]').evaluate((node:HTMLElement)=>node.style.height='1400px');
        await dialog.locator('.form-dialog-body').evaluate((node:HTMLElement)=>node.scrollTop=node.scrollHeight);
        assert.deepEqual(await dialog.locator('.dialog-head,.dialog-actions').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>{const r=node.getBoundingClientRect();return [r.y,r.height]})),before,'年度长表单只滚动正文，头尾位置稳定');
        await page.screenshot({path:`.tools/test-artifacts/annual-dialog-ui-${width}.png`});await dialog.locator('[data-close-row]').first().click();
      }

    }
    await page.goto(baseURL+'/business/daily-promotion-review');
    await page.evaluate(()=>{(window as any).__toolbar=document.querySelector('[data-promotion-toolbar]');(window as any).__tabs=document.querySelector('.toolbar-segmented');(window as any).__document=document;});
    const original=await page.locator('.toolbar-segmented').boundingBox();
    for(const view of ['stage','daily','history','stage']) {
      if(view==='history') await page.locator('a[href="?view=history"]').click(); else await page.locator(`[data-promotion-toolbar] a[href="?view=${view}"]`).click();
      await page.waitForURL(new RegExp(`view=${view}`));await page.waitForLoadState('networkidle');
      assert.equal(await page.evaluate(()=>(window as any).__document===document&&(window as any).__toolbar===document.querySelector('[data-promotion-toolbar]')&&(window as any).__tabs===document.querySelector('.toolbar-segmented')),true,'相邻视图保留同一工具栏和切换节点');
      if(view==='daily'||view==='stage')await page.screenshot({path:`.tools/test-artifacts/promotion-${view}-ui-${width}.png`,fullPage:true});
      if(view==='stage') {
        const heights=await page.locator('.range-form input[type=date],.range-form button').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>node.getBoundingClientRect().height));
        assert.ok(heights.every((height:number)=>height===36),'阶段筛选使用紧凑控件规格');
      }
      if(view==='daily') {
        const heights=await page.locator('[data-pause-form] input[type=date],[data-pause-form] button').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>node.getBoundingClientRect().height));
        assert.ok(heights.every((height:number)=>height===36),'节假日操作同组控件对齐');
        if(width===1440)assert.equal((await page.locator('[data-pause-form]').boundingBox())!.height,36,'桌面节假日暂停保持单行');
        const dailyForm=page.locator('[data-metric-form]').first();await dailyForm.locator('[data-toggle-day-state]').click();assert.equal(await dailyForm.locator('[data-toggle-day-state]').getAttribute('aria-expanded'),'true');await dailyForm.locator('[name=dayAction]').selectOption('pause');
        const waitControls=await dailyForm.locator('[data-pause-reason] input,[data-pause-through] input').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>({height:node.getBoundingClientRect().height,size:getComputedStyle(node).fontSize})));assert.equal(waitControls.length,2);assert.ok(waitControls.every((c:{height:number;size:string})=>c.height===40&&c.size==='13px'),'行内暂停与日度表单共用常规控件规格');
        assert.equal(await dailyForm.locator('[name=spend]').isDisabled(),true);await dailyForm.locator('[name=dayAction]').selectOption('active');{const answer=respondToBusinessConfirm(page,true);await page.locator('[data-promotion-toolbar] a[href="?view=stage"]').click();await answer;await page.waitForURL(/view=stage/);await page.locator('[data-promotion-toolbar] a[href="?view=daily"]').click();await page.waitForURL(/view=daily/);await page.waitForLoadState('networkidle');}
      }

      const box=await page.locator('.toolbar-segmented').boundingBox();for(const key of ['x','y','width','height']) assert.ok(Math.abs(box[key]-original[key])<=1,`${width} ${view} tabs ${key}`);
    }
    const redirected=await fetch(baseURL+`/business/promotion-stage-review?from=${start}&to=${start}&review=example&snapshot=version`,{redirect:'manual',headers:{Cookie:cookie}});assert.equal(redirected.status,302);assert.match(redirected.headers.get('location')!,/view=stage&from=.*review=example&snapshot=version/);
    await page.goto(baseURL+'/business/non-promotion-review?view=history&subject=tmua&category=temporary');
    assert.equal(await page.locator('.missing-round').count(),1);assert.match(await page.locator('.missing-round').innerText(),/二轮.*暂无已复盘数据/s);assert.equal(await page.locator('.missing-round [data-inspector-key]').count(),0);
    await page.goto(baseURL+'/business/non-promotion-review?view=history&subject=tmua&category=innovation');
    assert.equal(await page.locator('.review-post-group').count(),2,'同一逻辑帖的 V0 / V1 按排期独立分组');
    for(const group of await page.locator('.review-post-group').all()){assert.equal(await group.locator('[data-review-common][data-label="帖子"]:visible').count(),1,'分组只展示一次帖子名称与版本');assert.equal(await group.locator('[data-review-common][data-label="实验日期"]:visible').count(),1);assert.equal(await group.locator('[data-review-common][data-label="分类"]:visible').count(),1);assert.equal(await group.locator('[data-inspector-key]').count(),2,'两轮仍是可独立操作的记录');}
    assert.equal(await page.getByRole('radio',{name:'按帖子分组',exact:true}).isChecked(),true);
    assert.equal(await page.locator('[data-review-filters] [type=radio],[data-group-toggle]').count(),0,'筛选与展示方式独立分组');
    const controlHeights=await page.locator('[data-review-filters] select,[data-review-display]').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>node.getBoundingClientRect().height));assert.ok(controlHeights.every((height:number)=>height===36),'筛选与展示控件统一紧凑规格');
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
    await page.screenshot({path:`.tools/test-artifacts/review-grouped-${width}.png`,fullPage:true});if(width<=390){assert.equal(await page.locator('.table-scroll').evaluate((node:HTMLElement)=>node.scrollWidth<=node.clientWidth+1),true,'手机无需横向寻找结果');const values=await page.locator('[data-review-body] [data-result-metric] strong').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>{const range=document.createRange();range.selectNodeContents(node);const box=node.getBoundingClientRect();return {size:parseFloat(getComputedStyle(node).fontSize),fits:range.getBoundingClientRect().width<=box.width+1,right:box.right};}));assert.ok(values.every((value:any)=>value.size>=18&&value.fits&&value.right<=width),'手机两项结果完整可见');}
    await page.getByRole('radio',{name:'不分组',exact:true}).check();await page.waitForURL(/group=0/);
    assert.equal(await page.locator('[data-review-body] [data-inspector-key] [data-label="帖子"]:visible').count(),4,'不分组时每个轮次独立展示完整帖子信息');
    assert.deepEqual(await groupingGeometry(),groupGeometry,'分组切换保留筛选、表头和六列坐标');
    assert.equal(await page.locator('.table-scroll').evaluate((node:HTMLElement)=>node.scrollLeft),tableScroll,'分组切换保留表格横向位置');
    assert.equal(await page.evaluate(()=>(window as any).__groupTable===document.querySelector('.review-table')&&(window as any).__groupHead===document.querySelector('.table-head')&&(window as any).__groupRows.every((node:Element)=>node.isConnected)),true,'只移动现有行，保留公共节点');
    assert.equal(groupDocuments,0,'分组切换不请求新文档');
    await page.screenshot({path:`.tools/test-artifacts/review-ungrouped-${width}.png`,fullPage:true});
    await page.locator('[data-sort=click]').click();
    await page.getByRole('radio',{name:'按帖子分组',exact:true}).check();await page.waitForURL(/group=1/);
    assert.equal(await page.locator('[data-sort=click]').isDisabled(),true);
    assert.equal(await page.locator('[data-sort=date]').locator('..').getAttribute('aria-sort'),'descending','跨轮分组恢复日期倒序');
    await page.goBack();await page.waitForURL(/group=0/);assert.equal(await page.getByRole('radio',{name:'按帖子分组',exact:true}).isChecked(),false);
    await page.goForward();await page.waitForURL(/group=1/);assert.equal(await page.getByRole('radio',{name:'按帖子分组',exact:true}).isChecked(),true);
    assert.equal(groupDocuments,0,'分组前后退同样原位完成');
    const metricType=await page.locator('.metric-cell em').first().evaluate((node:HTMLElement)=>({size:parseFloat(getComputedStyle(node).fontSize),family:getComputedStyle(node).fontFamily}));assert.ok(metricType.size>=12);assert.match(metricType.family,/system-ui/);
    const first=page.locator(`[data-inspector-key="${ids[1]}:day_7"]`), second=page.locator(`[data-inspector-key="${ids[1]}:day_15"]`);
    assert.match(await first.innerText(),/同类均值\s+8.99%/);assert.match(await first.innerText(),/-3.47pp/);
    assert.match(await second.innerText(),/同类均值\s+8.59%/);assert.match(await second.innerText(),/-3.64pp/);
    assert.equal(await first.locator('[data-label=节点]').innerText(),'首轮');assert.equal(await second.locator('[data-label=节点]').innerText(),'二轮');
    assert.equal(await first.locator('.post-cell').innerText().then((value:string)=>value.includes('ID ')),false,'完整 ID 留在悬停和详情，不重复占行');
    await page.evaluate(()=>{(window as any).__table=document.querySelector('.review-table');(window as any).__document=document;});
    let documents=0;page.on('request',(request:any)=>{if(request.resourceType()==='document')documents++;});
    await first.click();await page.locator('[data-inspector].is-open').waitFor();
    await page.screenshot({path:`.tools/test-artifacts/inspector-ui-${width}.png`,fullPage:true});
    const before=await page.evaluate(()=>({scroll:scrollY,tableScroll:document.querySelector('.table-scroll')!.scrollLeft}));
    assert.equal(await page.evaluate(()=>(window as any).__document===document&&(window as any).__table===document.querySelector('.review-table')),true);
    assert.equal(documents,0,'详情点击不请求新文档');
    const inspector=page.locator('[data-inspector]');
    await inspector.locator('.correction summary').click();
    const readonly=await inspector.locator('.correction input[readonly]').evaluate((node:HTMLElement)=>({border:getComputedStyle(node).borderTopStyle,fill:getComputedStyle(node).backgroundColor}));
    assert.deepEqual(readonly,{border:'dashed',fill:'rgb(242, 245, 242)'},'只读信息与可编辑字段明确区分');
    await inspector.locator('.correction summary').click();
    assert.equal(await inspector.locator('.rate input').first().evaluate((node:HTMLElement)=>getComputedStyle(node).borderTopWidth),'0px','复合百分比控件不重复边框');
    await inspector.locator('[name=conclusion]').fill('尚未保存');
    if(width===1440){
      await inspector.locator('[name=conclusion]').evaluate((node:Element)=>{(window as any).__dirtyEditor=node;});
      await page.getByRole('radio',{name:'不分组',exact:true}).check();await page.getByRole('radio',{name:'按帖子分组',exact:true}).check();
      assert.equal(await inspector.locator('[name=conclusion]').inputValue(),'尚未保存');
      assert.equal(await inspector.locator('[name=conclusion]').evaluate((node:Element)=>node===(window as any).__dirtyEditor),true,'局部分组保留编辑节点和输入');
      await page.goBack();await page.waitForURL(/group=0/);assert.equal(await inspector.locator('[name=conclusion]').inputValue(),'尚未保存');
      await page.goBack();await page.waitForURL(/group=1/);assert.equal(await inspector.locator('[name=conclusion]').inputValue(),'尚未保存');
    }
    {const answered=respondToBusinessConfirm(page);await page.getByRole('link',{name:'待复盘',exact:true}).click();await answered;}assert.equal(new URL(page.url()).searchParams.get('view'),'history','取消离开保留当前视图');
    {const answered=respondToBusinessConfirm(page);await page.goBack();await answered;}await page.waitForURL((url:URL)=>url.searchParams.get('row')===`${ids[1]}:day_7`);assert.equal(new URL(page.url()).searchParams.get('row'),`${ids[1]}:day_7`);assert.equal(await inspector.locator('[name=conclusion]').inputValue(),'尚未保存');
    {const answered=respondToBusinessConfirm(page);await inspector.locator('[data-close-inspector]').click();await answered;}assert.equal(await inspector.isVisible(),true,'未保存取消关闭');
    {const answered=respondToBusinessConfirm(page,true);await page.keyboard.press('Escape');await answered;}await inspector.waitFor({state:'hidden'});
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
      await inspector.locator('[name=clickRate]').fill('6.95');await inspector.locator('[data-review-form] button[type=submit]').click();await inspector.getByText('已保存',{exact:true}).waitFor();assert.match(await second.innerText(),/同类均值\s+9.59%/);
      await page.keyboard.press('Escape');await inspector.waitFor({state:'hidden'});
    }
    await page.locator('[name=checkpoint]').selectOption('day_7');await page.waitForURL(/checkpoint=day_7/);assert.equal(await page.locator('[data-sort=click]').isDisabled(),false);assert.equal(await page.locator('[data-checkpoint=day_15]').count(),0);
    await page.locator('[data-sort=click]').click();await page.locator('[data-sort=click]').click();assert.equal(await page.locator('.review-post-group').first().getAttribute('data-review-group'),ids[1],'单轮指标排序按整个帖子组移动');
    await page.getByRole('radio',{name:'不分组',exact:true}).check();await page.waitForURL(/group=0/);assert.equal(await page.locator('.review-post-group').count(),0);
    await page.screenshot({path:`.tools/test-artifacts/business-ui-${width}.png`,fullPage:true});
    if(width===1440) {
      await page.goto(baseURL+`/business/operations-schedule?month=${published.slice(0,7)}`);
      await page.route(`**/api/operations-content/${ids[0]}/workflow`,async(route:any)=>{const response=await route.fetch();await new Promise(resolve=>setTimeout(resolve,400));await route.fulfill({response});});
      await page.route(`**/api/operations-content/${ids[1]}/workflow`,(route:any)=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'虚构读取失败'})}));
      const staleResponse=page.waitForResponse((response:any)=>response.url().includes(`/api/operations-content/${ids[0]}/workflow`));
      await page.locator(`[data-inspect-id="${ids[0]}"]`).first().click();
      await page.locator('[data-inspector].is-open').waitFor();
      await page.locator(`[data-inspect-id="${ids[1]}"]`).first().click();
      await page.locator('[data-schedule-workflow]').getByText('虚构读取失败').waitFor();await staleResponse;await page.waitForTimeout(50);
      assert.equal(await page.locator('[data-inspector]').getAttribute('data-selected-id'),ids[1]);
      assert.equal(await page.locator('[data-schedule-workflow]').getByText('虚构读取失败').count(),1,'晚到的旧请求不覆盖新选择');
      await page.unroute(`**/api/operations-content/${ids[1]}/workflow`);await page.getByRole('button',{name:'重新读取',exact:true}).click();await page.locator('[data-schedule-workflow][data-ready=true]').waitFor({state:'attached'});
      await page.keyboard.press('Escape');await page.locator('[data-inspector]').waitFor({state:'hidden'});
    }
    await page.goto(baseURL+'/business/daily-promotion-review?view=history');await page.locator('[data-daily-record]').first().locator('th').click();await page.locator('[data-edit-trigger]').first().click();await page.locator('dialog[open]').waitFor();
    const editor=page.locator('dialog[open]');
    const editControls=await editor.locator('input:not([type=hidden]),select').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>({height:node.getBoundingClientRect().height,size:getComputedStyle(node).fontSize})));
    assert.ok(editControls.every((c:{height:number;size:string})=>c.height===40&&c.size==='13px'),`推广历史更正共用常规表单规格 ${JSON.stringify(editControls)}`);
    assert.equal(await editor.locator('header').evaluate((node:HTMLElement)=>getComputedStyle(node).backgroundColor),'rgb(16, 36, 62)','保留深蓝标题栏');
    assert.equal(await editor.locator('h3').evaluate((node:HTMLElement)=>getComputedStyle(node).fontSize),'18px','详情区样式不泄漏到编辑标题');
    assert.equal(await editor.locator('.dialog-head p').evaluate((node:HTMLElement)=>getComputedStyle(node).color),'rgb(216, 226, 239)','深蓝标题栏辅助信息清晰可读');
    const editorGeometry=await editor.locator('.dialog-head,.dialog-actions').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>{const r=node.getBoundingClientRect();return [r.y,r.height]}));
    await editor.locator('textarea').evaluate((node:HTMLElement)=>node.style.height='1100px');await editor.locator('.form-dialog-body').evaluate((node:HTMLElement)=>node.scrollTop=node.scrollHeight);
    assert.deepEqual(await editor.locator('.dialog-head,.dialog-actions').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>{const r=node.getBoundingClientRect();return [r.y,r.height]})),editorGeometry,`推广历史长表单头尾固定 ${JSON.stringify(await editor.evaluate((node:HTMLElement)=>({html:node.outerHTML.slice(0,600),dialogHeight:getComputedStyle(node).height,formHeight:getComputedStyle(node.querySelector('form')!).height,formDisplay:getComputedStyle(node.querySelector('form')!).display,bodyHeight:getComputedStyle(node.querySelector('.form-dialog-body')!).height})))}`);
    await page.screenshot({path:`.tools/test-artifacts/promotion-edit-ui-${width}.png`});await editor.locator('[data-close-edit]').first().click();await page.keyboard.press('Escape');await page.locator('[data-inspector]').waitFor({state:'hidden'});
    await context.close();
    await db.update(schema.operationsContentPerformanceMetric).set({clickRate:'4.95'}).where(and(eq(schema.operationsContentPerformanceMetric.scheduleId,ids[1]),eq(schema.operationsContentPerformanceMetric.checkpointType,'day_15')));
  }
  assert.deepEqual(errors,[]);console.log('通过：共享正文和工具栏几何、推广同节点切换、同名分组与轮次基准、无文档跳转 Inspector、历史与键盘、未保存保护、保存刷新及失败保留、1440/390/320px。');
} catch(error){console.error(fixture.logs());throw error;}
finally{await browser?.close();await fixture.stop();}
