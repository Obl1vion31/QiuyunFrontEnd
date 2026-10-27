/** 每日首次安排与数据区块操作的正式组件验收，仅使用隔离PGlite。 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {randomUUID} from 'node:crypto';
import {startFixture,admin} from './auth.fixture';
import * as s from '../src/db/schema';
import {respondToBusinessConfirm} from './business-confirm.helper';
const dir=process.env.INITIAL_EVIDENCE_DIR||'.tools/test-artifacts/initial-arrangement';
await mkdir(dir,{recursive:true});
const clockFile=new URL('../'+dir+'/clock.txt',import.meta.url).pathname;
await writeFile(clockFile,'2026-10-28T12:00:00+08:00');
const fixture=await startFixture({clockFile}),{db,baseURL}=fixture;
let browser:any,context:any,page:any;const errors:string[]=[],geometry:unknown[]=[];
async function seed(name:string,mode:'initial'|'wait'|'finite'|'expired'|'active'|'zero'){
 const [content]=await db.insert(s.operationsContent).values({platformNoteId:randomUUID().replaceAll('-','').slice(0,24)}).returning();
 const [version]=await db.insert(s.operationsContentVersion).values({contentId:content.id,versionNumber:2,workType:'new',contentName:name,subjectId:'interview',categoryId:'interview-course',projectDocUrl:'https://example.com/fictional-document'}).returning();
 const active=['active','zero'].includes(mode);
 const [post]=await db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:new Date('2026-10-25T09:00:00+08:00'),actualPublishAt:new Date('2026-10-25T09:00:00+08:00'),isPromoted:true,promotionStatus:active?(mode==='active'?'scaling':'test_paused'):'awaiting_promotion',completionStatus:'on_time'}).returning();
 if(['wait','finite','expired'].includes(mode))await db.insert(s.operationsPromotionStartPlan).values({scheduleId:post.id,waitingThrough:mode==='finite'?'2026-10-29':mode==='expired'?'2026-10-26':null});
 if(active){const stage=mode==='active'?'scaling':'testing';const [campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:post.id,startedOn:'2026-10-27',dailyReviewEnabledOn:'2026-10-27',initialStage:stage,currentStage:stage,currentStatus:mode==='active'?'scaling':'test_paused'}).returning();await db.insert(s.operationsPromotionStage).values({campaignId:campaign.id,stageType:stage,startedOn:'2026-10-27'});if(mode==='zero')await db.insert(s.operationsPromotionDayDecision).values({campaignId:campaign.id,businessDate:'2026-10-27',stageType:'testing',actualStatus:'test_paused',reason:'虚构暂停事实'});}
 return post;
}
const initial=await seed('面试课第一轮②','initial'),waiting=await seed('面试课持续待定','wait'),finite=await seed('有截止日的待定','finite'),expired=await seed('已到截止的待定','expired'),active=await seed('TMUA一月1v1','active'),zero=await seed('真实暂停仍可填写','zero');
const record=(post:any,date?:string)=>page.locator(`[data-review-record][data-review-post="${post.id}"]${date?`[data-review-date="${date}"]`:''}`).filter({has:page.locator('[data-initial-row],[data-metric-form]')});
const popup=(post:any)=>record(post).locator('[data-initial-panel]');
async function settle(){await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(260);}
async function shot(name:string){await settle();await page.screenshot({path:`${dir}/${name}.png`,fullPage:false});}
async function save(form:any){const response=page.waitForResponse((r:any)=>r.url().endsWith('/api/promotion-timeline')&&r.request().method()==='POST');await form.locator('[type=submit]').click();const r=await response;assert.equal(r.status(),200,await r.text());await page.waitForTimeout(350);}
try{
 const login=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(admin)});assert.equal(login.status,200);
 const pw=await import(process.env.PLAYWRIGHT_MODULE||new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);browser=await pw.chromium.launch({headless:true});
 context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',recordVideo:{dir:dir+'/video',size:{width:1440,height:1000}}});
 await context.addInitScript(()=>{(window as any).__name=(v:unknown)=>v;});
 await context.addCookies(login.headers.getSetCookie().map(c=>{const pair=c.split(';')[0],i=pair.indexOf('=');return {name:pair.slice(0,i),value:pair.slice(i+1),url:baseURL};}));
 page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',(e:Error)=>errors.push(e.message));
 await page.goto(baseURL+'/business/daily-promotion-review');await settle();
 assert.equal(await page.locator('[data-review-container=ready] [data-initial-row]').count(),4);assert.equal(await page.locator('[data-due-count]').getAttribute('data-due-count'),'2');
 assert.equal(await page.locator('[data-review-section=arrangements]').isVisible(),false);
 for(const post of [initial,waiting,finite,expired]){assert.equal(await record(post).locator('.review-number input:disabled').count(),5);assert.deepEqual(await record(post).locator('.review-number input').evaluateAll((ns:HTMLInputElement[])=>ns.map(n=>n.value)),['','','','','']);assert.equal(await record(post).locator('[data-metric-form]').count(),0);}
 assert.equal(await record(zero).locator('[name=spend]').inputValue(),'0');assert.equal(await record(zero).locator('[name=spend]').isEnabled(),true);
 assert.equal(await record(finite).locator('[name=nextDecision]').isDisabled(),true);assert.equal(await record(expired).getAttribute('data-review-date'),'2026-10-26');
 // 测量完整文字组，不用外框样式代替中心检查。
 for(const width of [1920,1440,1024,390,320]){
  await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));await settle();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  const measured=await page.locator('.toolbar-action-group--section').evaluate((group:HTMLElement)=>{
   const nodes=[...group.children] as HTMLElement[];return {width:innerWidth,gap:getComputedStyle(group).gap,items:nodes.map(n=>{const b=n.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(n);const t=range.getBoundingClientRect();return {text:n.textContent,x:b.x,y:b.y,w:b.width,h:b.height,tx:t.x,ty:t.y,tw:t.width,th:t.height,font:getComputedStyle(n).font};})};
  });geometry.push(measured);assert.equal(measured.gap,'12px');
  for(const item of measured.items){assert.equal(item.h,36);assert.ok(Math.abs(item.ty+item.th/2-item.y-item.h/2)<=2.5,JSON.stringify(item));}
  await page.locator('#daily-table').scrollIntoViewIfNeeded();await shot(`daily-left-${width}`);
  await page.locator('[data-review-container=ready]').evaluate((n:HTMLElement)=>n.scrollLeft=n.scrollWidth);await shot(`daily-right-${width}`);
  await page.locator('[data-review-container=ready]').evaluate((n:HTMLElement)=>n.scrollLeft=0);
  // 条件态必须在五档视口逐个验收，不能只拍初始空态。
  const pending=record(waiting),plan=pending.locator('.review-initial-next'),rowBox=await pending.boundingBox();
  await plan.locator('[name=nextDecision]').selectOption('wait_continue');await plan.locator('[data-deadline-trigger]').waitFor({state:'visible'});
  const selectedBox=await pending.boundingBox();assert.ok(Math.abs(selectedBox.height-rowBox.height)<=1,'选择继续待定不改变行高');
  const aligned=await pending.evaluate((node:HTMLElement)=>{const pick=(s:string)=>{const b=node.querySelector<HTMLElement>(s)!.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,mid:b.y+b.height/2};};return {metric:pick('.review-number input'),select:pick('[name=nextDecision]'),deadline:pick('[data-deadline-trigger]'),save:pick('.review-plan-actions [type=submit]'),cancel:pick('[data-cancel-plan]')};});
  for(const control of [aligned.select,aligned.deadline,aligned.save,aligned.cancel]){assert.equal(control.h,40);assert.ok(Math.abs(control.mid-aligned.metric.mid)<=1,JSON.stringify(aligned));}
  assert.ok(aligned.select.w>=128);assert.equal(aligned.deadline.w,56);geometry.push({width,condition:'wait_continue',aligned});
  await plan.locator('[data-deadline-trigger]').scrollIntoViewIfNeeded();await shot(`wait-empty-${width}`);
  await plan.locator('[data-deadline-trigger]').click();const deadline=plan.locator('[data-deadline-panel]');await deadline.waitFor({state:'visible'});await shot(`wait-date-popup-${width}`);
  const dateBox=await deadline.boundingBox();assert.ok(dateBox.x>=11&&dateBox.x+dateBox.width<=width-11);await deadline.locator('input').fill('2026-10-30');
  await deadline.locator('[data-deadline-close]').last().click();assert.equal(await plan.locator('[name=waitingThrough]').inputValue(),'2026-10-30');assert.equal(await deadline.isVisible(),false);
  assert.ok(Math.abs((await pending.boundingBox()).height-rowBox.height)<=1);await shot(`wait-date-selected-${width}`);
  await plan.locator('[data-deadline-trigger]').click();await page.keyboard.press('Escape');assert.equal(await plan.locator('[name=waitingThrough]').inputValue(),'2026-10-30');
  let release:()=>void=()=>{};await page.route('**/api/promotion-timeline',async(route:any)=>{await new Promise<void>(resolve=>release=resolve);await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'截止日保存失败，草稿已保留。'})});await page.unroute('**/api/promotion-timeline');});
  await plan.locator('[type=submit]').click();assert.equal(await plan.locator('[name=nextDecision]').isDisabled(),true);assert.equal(await plan.locator('[data-cancel-plan]').isDisabled(),true);await shot(`wait-save-busy-${width}`);release();await plan.getByText('截止日保存失败，草稿已保留。').waitFor();const errorBounds=await plan.locator('output').boundingBox(),scrollBounds=await page.locator('[data-review-container=ready]').boundingBox();assert.ok(errorBounds.x>=scrollBounds.x-1&&errorBounds.x+errorBounds.width<=scrollBounds.x+scrollBounds.width+1,JSON.stringify({width,errorBounds,scrollBounds}));assert.equal(await plan.locator('[name=waitingThrough]').inputValue(),'2026-10-30');await shot(`wait-save-failure-${width}`);
  await plan.locator('[data-cancel-plan]').click();assert.equal(await plan.locator('[name=nextDecision]').inputValue(),'');assert.equal(await plan.locator('[name=waitingThrough]').inputValue(),'');assert.ok(Math.abs((await pending.boundingBox()).height-rowBox.height)<=1);await shot(`wait-cancelled-${width}`);
  await page.locator('[data-review-container=ready]').evaluate((n:HTMLElement)=>n.scrollLeft=0);
  await record(initial).locator('[data-initial-toggle]').click();await shot(`initial-popup-${width}`);
  const bounds=await popup(initial).boundingBox();assert.ok(bounds.x>=11&&bounds.x+bounds.width<=width-11);await page.keyboard.press('Escape');
 }
 await page.setViewportSize({width:1440,height:1000});
 // 有截止日通过同一行唯一提交落库，随后由状态更正恢复无截止，保留后续午夜场景。
 const finitePlan=record(waiting).locator('.review-initial-next');await finitePlan.locator('[name=nextDecision]').selectOption('wait_continue');await finitePlan.locator('[data-deadline-trigger]').click();await finitePlan.locator('[name=waitingThrough]').fill('2026-10-30');await page.keyboard.press('Escape');await save(finitePlan);
 assert.equal((await db.select().from(s.operationsPromotionStartPlan).where(eq(s.operationsPromotionStartPlan.scheduleId,waiting.id)))[0].waitingThrough,'2026-10-30');await shot('wait-date-saved-1440');
 await record(waiting).locator('[data-initial-toggle]').click();await popup(waiting).locator('[name=waitingThrough]').fill('');await popup(waiting).locator('[name=reason]').fill('虚构验收：恢复持续待定');await save(popup(waiting));
 // 默认、双位数、保存中、成功和禁用，均使用同一内容组。
 const batch=page.locator('[data-save-all]');const original=await batch.innerText();
 for(const [name,text,disabled] of [['count','一键保存（12）',false],['saving','正在保存…',true],['success','全部已保存',true],['disabled','一键保存（0）',true]] as const){await batch.evaluate((n:HTMLButtonElement,v:{text:string;disabled:boolean})=>{n.textContent=v.text;n.disabled=v.disabled;},{text,disabled});await shot('toolbar-'+name);}
 await batch.evaluate((n:HTMLButtonElement,text:string)=>{n.textContent=text;n.disabled=false;},original);
 // 保存失败保留输入，重试成功只更新本帖；指标节点、草稿、滚动保留。
 await record(active).locator('[name=spend]').fill('123.45');await page.evaluate((id:string)=>{(window as any).__kept=document.querySelector(`[data-review-post="${id}"] [name=spend]`);},active.id);
 await record(initial).locator('[data-initial-toggle]').click();await popup(initial).locator('[name=action]').selectOption('wait');assert.equal(await popup(initial).locator('[name=waitingThrough]').inputValue(),'');assert.equal(await popup(initial).locator('[name=waitingThrough]').getAttribute('required'),null);
 await page.route('**/api/promotion-timeline',async(route:any)=>{await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'模拟服务暂不可用，输入已保留。'})});await page.unroute('**/api/promotion-timeline');});
 await popup(initial).locator('[type=submit]').click();await page.getByText('模拟服务暂不可用，输入已保留。').waitFor();assert.equal(await popup(initial).locator('[name=action]').inputValue(),'wait');await shot('save-failure-1440');
 await save(popup(initial));assert.equal(await record(initial).getAttribute('data-review-date'),'2026-10-27');assert.match(await record(initial).innerText(),/待定/);
 assert.equal(await page.evaluate(()=>(window as any).__kept.isConnected&&(window as any).__kept.value==='123.45'),true);
 assert.equal((await db.select().from(s.operationsPromotionCampaign).where(eq(s.operationsPromotionCampaign.scheduleId,initial.id))).length,0);
 assert.equal((await db.select().from(s.operationsPromotionStartPlan).where(eq(s.operationsPromotionStartPlan.scheduleId,initial.id)))[0].waitingThrough,null);
 // 修改必填理由、取消关闭保留输入与焦点，再明确放弃。
 await record(initial).locator('[data-initial-toggle]').click();await popup(initial).locator('[name=waitingThrough]').fill('2026-10-30');assert.equal(await popup(initial).evaluate((f:HTMLFormElement)=>f.checkValidity()),false);
 await popup(initial).locator('[name=reason]').fill('虚构验收：修改截止日');await page.keyboard.press('Escape');await respondToBusinessConfirm(page,false);assert.equal(await popup(initial).locator('[name=reason]').inputValue(),'虚构验收：修改截止日');await shot('draft-confirm-cancel-1440');
 await page.keyboard.press('Escape');await respondToBusinessConfirm(page,true);assert.equal(await popup(initial).isVisible(),false);
 // 草稿期间导航取消与一键保存互锁。
 const next=record(initial).locator('.review-initial-next');await next.locator('[name=nextDecision]').selectOption('wait_continue');await batch.click();assert.match(await next.locator('output').innerText(),/请先/);assert.equal(await record(active).locator('[name=spend]').inputValue(),'123.45');
 await page.locator('.toolbar-action-group--section a').click();await respondToBusinessConfirm(page,false);assert.equal(await next.locator('[name=nextDecision]').inputValue(),'wait_continue');
 await next.locator('[data-cancel-plan]').click();assert.equal(await next.locator('[name=nextDecision]').inputValue(),'');
 await next.locator('[name=nextDecision]').selectOption('start_scaling');await save(next);assert.equal((await db.select().from(s.operationsPromotionCampaign).where(eq(s.operationsPromotionCampaign.scheduleId,initial.id)))[0].startedOn,'2026-10-28');assert.equal(await page.locator('[data-operation-label]').innerText(),'安排已保存');assert.equal(await page.evaluate(()=>document.activeElement?.matches('[data-review-section=upcoming]>summary')),true);await shot('next-start-today-feedback-1440');
 // 同类入口：另开只读页避免打断主表草稿。
 const peer=await context.newPage();
 for(const [name,url] of [['annual','/business/annual-plan'],['schedule','/business/operations-schedule'],['history','/business/daily-promotion-review?view=history'],['non-promotion','/business/non-promotion-review'],['meeting','/business/meeting-review']]){
  await peer.goto(baseURL+url);await peer.evaluate(()=>document.fonts.ready);await peer.waitForTimeout(300);await peer.screenshot({path:`${dir}/peer-${name}-1440.png`,fullPage:false});
 }
 await peer.goto(baseURL+`/business/operations-schedule?row=${waiting.id}`);const history=peer.locator('[data-promotion-state-history]');await history.locator('[data-timeline-row]').waitFor();await history.locator('summary').first().click();const initialHistory=history.locator('.timeline-state-form');assert.equal(await initialHistory.locator('[name=action]').inputValue(),'wait');assert.equal(await initialHistory.locator('[name=waitingThrough]').inputValue(),'');assert.equal(await initialHistory.locator('[name=waitingThrough]').getAttribute('required'),null);const dateWidths=await initialHistory.locator('input[type=date]').evaluateAll((ns:HTMLElement[])=>ns.map(n=>n.getBoundingClientRect().width));assert.ok(dateWidths.every((w:number)=>w>=160),JSON.stringify(dateWidths));await peer.screenshot({path:`${dir}/peer-waiting-inspector-1440.png`,fullPage:false});await peer.close();
 // 跨午夜：带草稿的27日灰行保留，新派生28日行只一条；保存旧草稿仍按原日期生效。
 await page.evaluate(()=>{document.querySelectorAll<HTMLElement>('[data-dirty=true]').forEach(n=>delete n.dataset.dirty);document.documentElement.dataset.unsaved='false';});
 await writeFile(clockFile,'2026-10-28T23:59:50+08:00');await page.clock.install({time:new Date('2026-10-28T23:59:50+08:00')});await page.goto(baseURL+'/business/daily-promotion-review');
 const old=record(waiting,'2026-10-27').locator('.review-initial-next');await old.locator('[name=nextDecision]').selectOption('start_testing');
 await writeFile(clockFile,'2026-10-29T00:00:00+08:00');await page.clock.setFixedTime(new Date('2026-10-29T00:00:00+08:00'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await record(waiting,'2026-10-28').waitFor({state:'attached'});assert.equal(await old.locator('[name=nextDecision]').inputValue(),'start_testing');
 await save(old);assert.equal((await db.select().from(s.operationsPromotionCampaign).where(eq(s.operationsPromotionCampaign.scheduleId,waiting.id)))[0].startedOn,'2026-10-28');
 await record(waiting,'2026-10-28').locator('[data-metric-form]').waitFor({state:'attached'});await shot('midnight-start-opened-1440');
 assert.equal((await db.select().from(s.operationsPromotionDailyMetric)).length,0);
 await writeFile(dir+'/geometry.json',JSON.stringify(geometry,null,2));assert.deepEqual(errors,[]);
 console.log('PASS initial arrangement: five viewports, disabled vs real zero, header states, optional deadline, retry, reasons, draft / navigation protection, nodes, T+1 midnight, peer entry screenshots.');
}catch(error){console.error(fixture.logs().slice(-4000));throw error;}finally{await context?.close();await browser?.close();await fixture.stop();}
