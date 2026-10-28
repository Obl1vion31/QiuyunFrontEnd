import {businessFetch as fetch} from './business-request.helper';
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
      const [metric]=await db.insert(schema.operationsContentPerformanceMetric).values({scheduleId:schedule.id,checkpointType,recordedThrough:new Date(Date.parse(published+'T00:00:00Z')+(checkpointType==='day_7'?7:15)*86400000).toISOString().slice(0,10),clickRate:String(clickRate),threeSecondReadRate:'40'}).returning();
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
  for(const width of [1440,1280,390,320]) {
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',...(width===1440?{recordVideo:{dir:'.tools/test-artifacts/category-motion',size:{width:1440,height:900}}}:{})});
    await context.addCookies(cookie.split('; ').map(pair=>({name:pair.slice(0,pair.indexOf('=')),value:pair.slice(pair.indexOf('=')+1),url:baseURL})));
    const page=await context.newPage();
    page.on('pageerror',(error:Error)=>errors.push(error.message));
    let geometry:any;
    for(const path of ['annual-plan','operations-schedule','daily-promotion-review','non-promotion-review','meeting-review','settings']) {
      await page.goto(baseURL+'/business/'+path+(path==='settings'?'?view=permissions':''));await page.locator('.business-toolbar').waitFor();
      const tool=page.locator('[data-tools-trigger]');assert.ok(await tool.isVisible());const toolBox=await tool.boundingBox();assert.ok(toolBox.width>=44&&toolBox.height>=44);const shell=await page.locator('.business-console-workspace').evaluate((n:HTMLElement)=>({padding:getComputedStyle(n).paddingRight,width:n.getBoundingClientRect().width,toolbar:n.querySelector('.business-toolbar')!.getBoundingClientRect().width}));assert.equal(shell.padding,'0px');assert.ok(Math.abs(shell.width-shell.toolbar)<=1,'不再预留独立工具栏宽度');
      await tool.click();const tools=page.locator('#business-tools-menu');assert.equal(await tools.locator('button:disabled').count(),3);assert.deepEqual(await tools.locator('button>span').allTextContents(),['查找帖子','找功能','AI 录入','数据导出']);await page.keyboard.press('Escape');
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
        const controls=await page.locator('.business-form input:not([type=checkbox]):not([type=hidden]):visible,.business-form select:visible').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>({height:node.getBoundingClientRect().height,size:getComputedStyle(node).fontSize})));
        const options=await page.locator('.checks input[type=checkbox]').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>node.getBoundingClientRect().width));assert.ok(options.every((width:number)=>width===18),'独立选项统一为 18px');assert.ok(controls.length>=3);assert.ok(controls.every((c:{height:number;size:string})=>c.height===40&&c.size==='14px'),'系统设置接入公共表单规格');
        await page.screenshot({path:`.tools/test-artifacts/settings-ui-${width}.png`,fullPage:true});
      }
      if(path==='meeting-review') {
        await page.locator('[data-open-create]').click();const dialog=page.locator('[data-create]');await dialog.waitFor();
        const controls=await dialog.locator('input:not([type=hidden])').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>({height:node.getBoundingClientRect().height,size:getComputedStyle(node).fontSize})));
        assert.ok(controls.every((c:{height:number;size:string})=>c.height===40&&c.size==='14px'),'例会创建与其他表单使用相同控件');
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
    for(const view of ['history','daily','history','daily']) {
      if(view==='history') await page.locator('[data-promotion-toolbar] a[href="?view=history"]').click(); else await page.locator(`[data-promotion-toolbar] a[href="?view=${view}"]`).click();
      await page.waitForURL(new RegExp(`view=${view}`));await page.waitForLoadState('networkidle');
      assert.equal(await page.evaluate(()=>(window as any).__document===document&&(window as any).__toolbar===document.querySelector('[data-promotion-toolbar]')&&(window as any).__tabs===document.querySelector('.toolbar-segmented')),true,'相邻视图保留同一工具栏和切换节点');
      if(view==='daily'||view==='history')await page.screenshot({path:`.tools/test-artifacts/promotion-${view}-ui-${width}.png`,fullPage:true});

      if(view==='daily') {
        assert.equal(await page.locator('[data-pause-form]').count(),0,'团队暂停已移除');
        const dailyForm=page.locator('[data-metric-form]').first();await dailyForm.locator('[data-toggle-day-state]').click();assert.equal(await dailyForm.locator('[data-toggle-day-state]').getAttribute('aria-expanded'),'true');
        const stateBubble=page.locator('[data-day-state-form]:visible');await stateBubble.locator('[name=targetStatus]').selectOption('test_paused');
        assert.equal(await stateBubble.locator('input[type=date]').count(),0,'当日状态固定作用于该行日期');
        const stateControls=await stateBubble.locator('select,textarea').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>({height:node.getBoundingClientRect().height,size:getComputedStyle(node).fontSize})));assert.equal(stateControls.length,2);assert.ok(stateControls.every((c:{height:number;size:string})=>c.height>=40&&c.size==='14px'),'状态气泡使用共享常规控件规格');
        assert.equal(await dailyForm.locator('[name=spend]').isDisabled(),false,'暂停仍允许记录实际跑量');await page.keyboard.press('Escape');
        {const answer=respondToBusinessConfirm(page,true);await page.locator('[data-promotion-toolbar] a[href="?view=history"]').click();await answer;await page.waitForURL(/view=history/);await page.locator('[data-promotion-toolbar] a[href="?view=daily"]').click();await page.waitForURL(/view=daily/);await page.waitForLoadState('networkidle');}
      }

      const box=await page.locator('.toolbar-segmented').boundingBox();for(const key of ['x','y','width','height']) assert.ok(Math.abs(box[key]-original[key])<=1,`${width} ${view} tabs ${key}`);
    }
    const redirected=await fetch(baseURL+`/business/promotion-stage-review?from=${start}&to=${start}&review=example&snapshot=version`,{redirect:'manual',headers:{Cookie:cookie}});assert.equal(redirected.status,302);assert.match(redirected.headers.get('location')!,/view=stage&from=.*review=example&snapshot=version/);
    await page.goto(baseURL+'/business/non-promotion-review?view=history');
    assert.equal(await page.locator('[data-category-group]').count(),2);
    assert.equal(await page.locator('select[name=checkpoint]').count(),0);
    const group=page.locator('[data-category-group="tmua:innovation"]');await group.locator('summary').first().click();
    await page.evaluate(()=>{(window as any).__record=document.querySelector('[data-category-group="tmua:innovation"] [data-row-href]');});
    await page.getByRole('radio',{name:'历史数据总览',exact:true}).check();assert.equal(await page.evaluate(()=>(window as any).__record.isConnected),true);
    await page.getByRole('radio',{name:'分类均值查看',exact:true}).check();assert.equal(await group.getAttribute('open')!==null,true);
    await page.screenshot({path:`.tools/test-artifacts/review-inline-categories-${width}.png`,fullPage:true});
    await page.getByRole('radio',{name:'历史数据总览',exact:true}).check();
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
    assert.deepEqual(readonly,{border:'dashed',fill:'rgb(248, 249, 251)'},'只读信息与可编辑字段明确区分');
    await inspector.locator('.correction summary').click();
    assert.equal(await inspector.locator('.rate input').first().evaluate((node:HTMLElement)=>getComputedStyle(node).borderTopWidth),'0px','复合百分比控件不重复边框');
    await inspector.locator('[name=conclusion]').focus();await inspector.locator('[data-review-form][data-edit-lock=owned]').waitFor();await inspector.locator('[name=conclusion]').fill('尚未保存');assert.equal(await inspector.locator('[name=conclusion]').inputValue(),'尚未保存');
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
      await inspector.locator('[name=conclusion]').click();await inspector.locator('[name=conclusion]').fill('虚构本地保存');
      await page.route('**/api/non-promotion-reviews?**',(route:any)=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
      await inspector.locator('[data-review-form] button[type=submit]').click();await inspector.getByText(/保存已成功，列表刷新失败/).waitFor();assert.equal(await inspector.locator('[name=conclusion]').inputValue(),'虚构本地保存');
      await page.unroute('**/api/non-promotion-reviews?**');
      await inspector.locator('[name=clickRate]').click();await inspector.locator('[name=clickRate]').fill('6.95');await inspector.locator('[data-review-form] button[type=submit]').click();await inspector.getByText('已保存',{exact:true}).waitFor();assert.match(await second.innerText(),/同类均值\s+9.59%/);
      await page.keyboard.press('Escape');await inspector.waitFor({state:'hidden'});
    }
    if(width===1440) {
      await page.goto(baseURL+`/business/operations-schedule?month=${published.slice(0,7)}`);
      await page.route(`**/api/operations-content/${ids[0]}/workflow`,async(route:any)=>{const response=await route.fetch();await new Promise(resolve=>setTimeout(resolve,400));try{await route.fulfill({response});}catch{}});
      await page.route(`**/api/operations-content/${ids[1]}/workflow`,(route:any)=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'虚构读取失败'})}));
      const staleRequest=page.waitForRequest((request:any)=>request.url().includes(`/api/operations-content/${ids[0]}/workflow`));
      await page.locator(`[data-inspect-id="${ids[0]}"]`).first().click();
      await page.locator('[data-inspector].is-open').waitFor();await staleRequest;
      await page.locator(`[data-inspect-id="${ids[1]}"]`).first().click();
      await page.locator('[data-schedule-workflow]').getByText('虚构读取失败').waitFor();await page.waitForTimeout(450);
      assert.equal(await page.locator('[data-inspector]').getAttribute('data-selected-id'),ids[1]);
      assert.equal(await page.locator('[data-schedule-workflow]').getByText('虚构读取失败').count(),1,'晚到的旧请求不覆盖新选择');
      await page.unroute(`**/api/operations-content/${ids[1]}/workflow`);await page.getByRole('button',{name:'重新读取',exact:true}).click();await page.locator('[data-schedule-workflow][data-ready=true]').waitFor({state:'attached'});
      await page.keyboard.press('Escape');await page.locator('[data-inspector]').waitFor({state:'hidden'});
    }
    await page.goto(baseURL+'/business/daily-promotion-review?view=history');await page.locator('[data-history-group=unfinished] .lifecycle-expand').first().click();await page.locator('[data-daily-record]').first().locator('th').click();await page.locator('[data-edit-trigger]').first().click();await page.locator('dialog[open]').waitFor();
    const editor=page.locator('dialog[open]');
    const editControls=await editor.locator('input:not([type=hidden]),select').evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>({height:node.getBoundingClientRect().height,size:getComputedStyle(node).fontSize})));
    assert.ok(editControls.every((c:{height:number;size:string})=>c.height===40&&c.size==='14px'),`推广历史更正共用常规表单规格 ${JSON.stringify(editControls)}`);
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
  assert.deepEqual(errors,[]);console.log('business UI shared geometry and inline category checks passed');
}finally{await browser?.close();await fixture.stop();}
