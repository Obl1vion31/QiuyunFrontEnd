/** 阅读表列宽、PDF操作组及条件状态；仅写隔离PGlite。 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startFixture,admin} from './auth.fixture';
import * as s from '../src/db/schema';
import {settleBusinessUI} from './business-confirm.helper';

const folder=process.env.MEETING_LEDGER_DIR||'.tools/test-artifacts/meeting-ledger';
await mkdir(folder,{recursive:true});
const fixture=await startFixture(),{db,baseURL}=fixture;
let browser:any,context:any;
const checks:string[]=[],measurements:any[]=[],errors:string[]=[];
const draft={schemaVersion:4 as const,workflowVersion:7 as const,finalizationStage:'post' as const,coreConclusion:'隔离视觉验收',nextAction:'继续观察',promotionInputs:{},issues:[],nonPromotionSelections:[]};
async function seed(name:string,stage='post',pdfStatus:string|null='ready',manual=0,generated=true){
  const [meeting]=await db.insert(s.operationsReviewMeeting).values({name,periodStart:'2026-10-16',periodEnd:'2026-10-24',meetingAt:new Date('2026-10-25T16:00:00+08:00'),status:stage==='draft'?'draft':'completed',currentVersionNumber:3,draftSnapshot:{...draft,finalizationStage:stage==='post'?'post':'pre'},createdByLabel:'虚构验收'}).returning();
  const [version]=await db.insert(s.operationsReviewMeetingVersion).values({meetingId:meeting.id,versionNumber:3,lifecycleStatus:stage==='draft'?'draft':'finalized',snapshot:{schemaVersion:4,meeting:{id:meeting.id,name,periodStart:meeting.periodStart,periodEnd:meeting.periodEnd},finalizationStage:stage==='post'?'post':'pre',draft,generated:{summary:{posts:0,spend:0},promotions:[],nonPromotions:[]}},changeSummary:'隔离版本备注',pdfStatus,finalizedByLabel:'虚构验收'}).returning();
  const sources=[...(generated?['generated']:[]),...Array.from({length:manual},()=> 'manual')];
  if(sources.length)await db.insert(s.operationsMeetingAttachment).values(sources.map((source,index)=>({meetingId:meeting.id,meetingVersionId:version.id,source,name:source==='generated'?'会后报告.pdf':`补充资料：长名称与下一轮执行安排-${index}.pdf`,mimeType:'application/pdf',byteLength:12,base64:Buffer.from('%PDF-fixture').toString('base64'),createdByLabel:'虚构验收'})));
  return {meeting,version};
}
try{
  const primary=await seed('2026.10.16—10.24 周度业务复盘');
  const {chromium}=await import(new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);
  browser=await chromium.launch({headless:true});
  context=await browser.newContext({viewport:{width:1920,height:1000},locale:'zh-CN',recordVideo:{dir:folder+'/video',size:{width:1440,height:1000}}});
  const login=await context.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:admin});assert.equal(login.status(),200);
  const page=await context.newPage();page.on('pageerror',(error:Error)=>errors.push(error.message));
  const capture=async(name:string)=>{await settleBusinessUI(page);await page.screenshot({path:folder+'/'+name+'.png'});};
  const rowFor=(id:string)=>page.locator('.meeting-ledger-main tbody tr').filter({has:page.locator(`a.meeting-name[href="?meeting=${id}"]`)});
  for(const width of [1920,1440,1280,1024,390,320]){
    await page.setViewportSize({width,height:1000});await page.goto(baseURL+'/business/meeting-review');await page.waitForLoadState('networkidle');
    const row=rowFor(primary.meeting.id);await row.getByRole('button',{name:'重新生成',exact:true}).waitFor();
    const geometry=await row.evaluate((node:HTMLElement)=>{
      const table=node.closest('table')!,cells=[...node.querySelectorAll('td')],actions=node.querySelector('.meeting-pdf-actions')!;
      const boxes=[...actions.children].filter(el=>el.getBoundingClientRect().width>0).map(el=>el.getBoundingClientRect());
      const row=node.getBoundingClientRect(),cell=cells[5].getBoundingClientRect(),title=cells[3].getBoundingClientRect(),name=node.querySelector('.meeting-name-cell')!.getBoundingClientRect();
      return {rowHeight:row.height,tableWidth:table.getBoundingClientRect().width,titleWidth:title.width,nameWidth:name.width,titlePadding:parseFloat(getComputedStyle(cells[3]).paddingLeft)+parseFloat(getComputedStyle(cells[3]).paddingRight),centers:boxes.map(r=>r.y+r.height/2),within:boxes.every(r=>r.left>=cell.left&&r.right<=cell.right),padding:parseFloat(getComputedStyle(cells[5]).paddingTop)+parseFloat(getComputedStyle(cells[5]).paddingBottom),actionHeight:Math.max(...boxes.map(r=>r.height))};
    });measurements.push({width,...geometry});
    assert.ok(Math.max(...geometry.centers)-Math.min(...geometry.centers)<=1,'四个PDF动作同排且中线一致');
    assert.ok(geometry.within,'动作完整包含在PDF列中');
    assert.ok(geometry.rowHeight<110,'常规记录保持紧凑且容纳两行会议信息');
    assert.ok(geometry.tableWidth<=1280,'阅读表不扩展到整屏剩余宽度');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'仅表格内部横滚');
    assert.equal(await page.getByRole('columnheader',{name:'版本状态',exact:true}).count(),1);
    assert.match(await row.locator('td').nth(2).innerText(),/2026年10月 · 第3周/);
    if(width>=1440){const balance=await page.locator('section.ledger').evaluate((node:HTMLElement)=>{const box=node.getBoundingClientRect(),host=node.closest('main')!.getBoundingClientRect(),style=getComputedStyle(node.closest('main')!);return {left:box.left-host.left-parseFloat(style.paddingLeft),right:host.right-box.right-parseFloat(style.paddingRight)};});assert.ok(Math.abs(balance.left-balance.right)<=1,'标题与表格的外部留白对称');}
     const aligns=await row.evaluate((node:HTMLElement)=>[...node.querySelectorAll('td')].map(cell=>getComputedStyle(cell).textAlign));assert.ok(aligns.every((value:string)=>value==='center'));
     await capture('normal-'+width);
    if(width<1440){const scroll=page.locator('.meeting-ledger-scroll').first();await row.locator('.meeting-pdf-actions').evaluate((n:HTMLElement)=>n.scrollIntoView({inline:'center',block:'nearest'}));const visible=await row.locator('.meeting-pdf-actions').evaluate((n:HTMLElement)=>{const r=n.getBoundingClientRect(),host=n.closest('.meeting-ledger-scroll')!.getBoundingClientRect();return r.left>=host.left&&r.right<=host.right;});assert.ok(visible,'表内横滚后PDF操作完整可见');await capture('normal-right-'+width);}
  }
  checks.push('六档视口普通记录：列宽按内容、操作同行、行高、表头语义及内部横滚');
  const long=await seed('长标题：从完整条件、图像与反例理解复杂业务问题，并保留跨周期结论和执行记录，供团队会议核对', 'post','ready',2);
  await seed('会前版本只读材料','pre',null,0,false);
  const failed=await seed('PDF生成失败待重试','post','failed',0,false);
  await seed('PDF正在生成','post','pending',0,false);
  await seed('尚未定稿的会议草稿','draft',null,0,false);
  for(const width of [1920,1440,1024]){
    await page.setViewportSize({width,height:1000});await page.goto(baseURL+'/business/meeting-review');await page.waitForLoadState('networkidle');
    const longRow=rowFor(long.meeting.id);await longRow.getByRole('button',{name:'查看手动附件'}).waitFor();
    assert.equal(await longRow.locator('a.meeting-name').getAttribute('title'),long.meeting.name);
    if(width>=1440)assert.equal(await longRow.locator('.meeting-pdf-actions').evaluate((n:HTMLElement)=>n.getBoundingClientRect().right<=innerWidth-12),true,'桌面长标题与多附件不挤出右边界');
    await capture('mixed-'+width);
    await longRow.getByRole('button',{name:'查看手动附件'}).click();
    const popup=page.getByRole('region',{name:'手动附件',exact:true});await popup.waitFor();
    const box=await popup.boundingBox();assert.ok(box.x>=11&&box.x+box.width<=width-11);
    await capture('attachments-'+width);await page.keyboard.press('Escape');assert.equal(await popup.isVisible(),false);
  }
  checks.push('长标题、手动附件、会前、草稿、生成中与失败状态，以及附件键盘关闭');
  await page.setViewportSize({width:1440,height:1000});await page.goto(baseURL+'/business/meeting-review');await page.waitForLoadState('networkidle');
  await page.locator('.meeting-history-overview>summary').click();
  await page.locator('.meeting-history>summary').filter({hasText:primary.meeting.name}).click();
  const history=page.locator('.meeting-history[open] .meeting-ledger');await history.waitFor();await capture('history-1440');
  checks.push('历史版本共用同一PDF操作与内容列宽');
  const failure=rowFor(failed.meeting.id),endpoint=`**/api/meeting-versions/${failed.version.id}/pdf`;
  let release!:()=>void,reached!:()=>void;const started=new Promise<void>(resolve=>reached=resolve);
  await page.route(endpoint,async(route:any)=>{await new Promise<void>(resolve=>{release=resolve;reached();});await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'生成失败：请稍后重试，当前已有文件继续保留，可在同一条记录重新操作。'})});});
  const before=await page.locator('.meeting-ledger-main thead th').evaluateAll((nodes:HTMLElement[])=>nodes.map(n=>n.getBoundingClientRect().width));
  await failure.getByRole('button',{name:'重试PDF',exact:true}).click();await failure.getByText('正在生成PDF…',{exact:true}).waitFor();await started;await capture('busy-1440');release();await failure.getByText(/^生成失败：/).waitFor();await capture('error-1440');
  const after=await page.locator('.meeting-ledger-main thead th').evaluateAll((nodes:HTMLElement[])=>nodes.map(n=>n.getBoundingClientRect().width));assert.ok(before.every((n:number,i:number)=>Math.abs(n-after[i])<=1),'错误反馈不重新分配整张表的列宽');
  const output=await failure.locator('output').evaluate((node:HTMLElement)=>({client:node.clientWidth,scroll:node.scrollWidth}));assert.ok(output.scroll<=output.client+1);
  checks.push('生成中及失败可重试，文字完整，其他列宽不变');
  assert.deepEqual(errors,[]);await writeFile(folder+'/result.json',JSON.stringify({checks,measurements,errors},null,2));console.log(JSON.stringify({passed:true,checks,folder}));
}catch(error){console.error(fixture.logs().slice(-1800));throw error;}finally{await context?.close();await browser?.close();await fixture.stop();}
