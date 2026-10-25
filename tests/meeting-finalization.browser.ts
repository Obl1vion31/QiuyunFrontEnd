/** 定稿失败必须可见、可定位、可重试；业务写入只使用隔离 PGlite。 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startFixture,employee} from './auth.fixture';
import {respondToBusinessConfirm} from './business-confirm.helper';
import * as s from '../src/db/schema';
const folder=process.env.MEETING_FINALIZATION_DIR||'.tools/test-artifacts/meeting-finalization';await mkdir(folder,{recursive:true});
const clockFile=new URL('../'+folder+'/clock.txt',import.meta.url).pathname;await writeFile(clockFile,'2026-10-25T18:00:00+08:00');
const fixture=await startFixture({clockFile}),{db,baseURL}=fixture;let browser:any,page:any;const checks:string[]=[],errors:string[]=[];
try{
 const [content]=await db.insert(s.operationsContent).values({platformNoteId:'f'.repeat(24)}).returning();
 const [version]=await db.insert(s.operationsContentVersion).values({contentId:content.id,contentName:'函数图像与关键条件',versionNumber:0,workType:'new',subjectId:'tmua',categoryId:'temporary'}).returning();
 const [schedule]=await db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,isPromoted:true,promotionStatus:'testing',completionStatus:'on_time',plannedPublishAt:new Date('2026-10-21T18:00:00+08:00'),actualPublishAt:new Date('2026-10-21T18:00:00+08:00')}).returning();
 const [campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:schedule.id,startedOn:'2026-10-21',dailyReviewEnabledOn:'2026-10-21',initialStage:'testing',currentStage:'testing',currentStatus:'testing'}).returning();
 await db.insert(s.operationsPromotionStage).values({campaignId:campaign.id,startedOn:'2026-10-21',stageType:'testing'});
 const [metric]=await db.insert(s.operationsPromotionDailyMetric).values({campaignId:campaign.id,metricDate:'2026-10-22',dailyStatus:'active',actualStatusSnapshot:'testing',stageTypeSnapshot:'testing',recordKind:'regular',sourceStageStartedOn:'2026-10-21',spend:'120',platformOpenCount:10,actualOpenCount:4,platformLeadCount:3,actualLeadCount:2,reviewDecision:'test_continue'}).returning();
 const [nonContent]=await db.insert(s.operationsContent).values({platformNoteId:'e'.repeat(24)}).returning();
 const [nonVersion]=await db.insert(s.operationsContentVersion).values({contentId:nonContent.id,contentName:'从例题到方法：首轮复盘',versionNumber:0,workType:'new',subjectId:'tmua',categoryId:'temporary'}).returning();
 const [non]=await db.insert(s.operationsContentSchedule).values({contentVersionId:nonVersion.id,isPromoted:false,promotionStatus:'none',completionStatus:'on_time',plannedPublishAt:new Date('2026-10-15T18:00:00+08:00'),actualPublishAt:new Date('2026-10-15T18:00:00+08:00')}).returning();
 const login=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(employee)});assert.equal(login.status,200);const cookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 const form=new FormData();for(const[k,v]of Object.entries({meetingType:'weekly',meetingAt:'2026-10-25T18:00',periodStart:'2026-10-17',periodEnd:'2026-10-23'}))form.set(k,v);
 const create=await fetch(baseURL+'/api/meeting-reviews',{method:'POST',headers:{Cookie:cookie,Origin:baseURL},body:form});assert.equal(create.status,201);const{id}=await create.json();
 const pw=await import(new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);browser=await pw.chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:folder+'/video',size:{width:1440,height:1000}}});await context.addCookies(cookie.split('; ').map(c=>({name:c.slice(0,c.indexOf('=')),value:c.slice(c.indexOf('=')+1),url:baseURL})));
 page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',(e:Error)=>errors.push(e.message));
 let writes=0;page.on('request',(r:any)=>{if(r.method()==='PATCH'&&r.url().endsWith('/api/meeting-reviews/'+id))writes++});
 await page.goto(baseURL+'/business/meeting-review?meeting='+id);await page.locator('[data-report-v4]').waitFor();await page.evaluate(()=>document.fonts.ready);
 const pre=()=>page.getByRole('button',{name:'会前定稿 V0',exact:true});const alert=page.locator('.weekly-report-actions [role=alert]');
 await pre().click();await alert.filter({hasText:'确认纳入'}).waitFor();assert.equal(await page.locator('[data-business-confirm][open]').count(),0);
 await page.getByRole('button',{name:'全选推广帖',exact:true}).click();await page.getByRole('button',{name:'确认纳入',exact:true}).click();
 await page.getByRole('textbox',{name:'衡量情况',exact:true}).fill('本期实际开口和留资已核对。');await page.getByRole('textbox',{name:'本期具体动作',exact:true}).fill('补充关键条件并持续核对。');
 await pre().click();await alert.filter({hasText:'请补充核心结论'}).waitFor();assert.equal(await page.locator('[data-meeting-field=coreConclusion]').evaluate((n:Element)=>n===document.activeElement),true);assert.equal(writes,0);
 await page.screenshot({path:folder+'/missing-conclusion-1440.png'});
 await page.getByRole('textbox',{name:'核心结论',exact:true}).fill('先稳定有效开口，再核对留资质量。');await pre().click();await alert.filter({hasText:'点击率'}).waitFor();
 const clickRate=page.getByLabel('函数图像与关键条件 点击率',{exact:true});assert.equal(await clickRate.evaluate((n:Element)=>n===document.activeElement),true);
 await clickRate.fill('4.62');
 await pre().click();await alert.filter({hasText:'非推广数据'}).waitFor();assert.equal(await page.locator(`[data-weekly-non="${non.id}"] select`).evaluate((n:Element)=>n===document.activeElement),true);
 checks.push('候选、结论、点击率范围及非推广缺项在确认前提示并定位，不发定稿请求');
 // 模拟另一入口完成非推广，保留四位精度；已确认隐藏字段不能拦截整份例会。
 await db.insert(s.operationsContentPerformanceMetric).values({scheduleId:non.id,checkpointType:'day_7',recordedThrough:'2026-10-22',clickRate:'12.3456',threeSecondReadRate:'48.4321'});
 await page.getByRole('button',{name:'刷新数据',exact:true}).click();await page.locator('.weekly-report-actions output').filter({hasText:'数据已刷新'}).waitFor();
 assert.equal(await page.getByRole('textbox',{name:'核心结论',exact:true}).inputValue(),'先稳定有效开口，再核对留资质量。');assert.equal(await clickRate.inputValue(),'4.62');
 assert.equal(await page.locator(`[data-weekly-non="${non.id}"] fieldset[hidden] input[type=number]`).first().isDisabled(),true);
 await clickRate.fill('101');await pre().click();await alert.filter({hasText:'请检查'}).waitFor();assert.equal(writes,0);await clickRate.fill('4.62');
 // 请求前后来源发生变化，真实事务应拒绝，界面将原因及刷新入口留在可见位置。
 await db.update(s.operationsPromotionDailyMetric).set({spend:'150',updatedAt:new Date('2026-10-25T10:00:00Z')}).where(eq(s.operationsPromotionDailyMetric.id,metric.id));
 await pre().click();await respondToBusinessConfirm(page,true);await alert.filter({hasText:'来源数据已变化'}).waitFor();
 assert.equal(await page.locator('[data-refresh-material]').evaluate((n:Element)=>n===document.activeElement),true);assert.equal((await db.select().from(s.operationsReviewMeetingVersion)).length,0);
 for(const width of [1920,1440,1280,1024]){await page.setViewportSize({width,height:1000});await page.screenshot({path:folder+`/source-changed-${width}.png`});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.ok(await alert.isVisible());}
 checks.push('真实来源指纹冲突不产生版本，明确提示并定位刷新，四档桌面错误反馈可读且无溢出');
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'刷新数据',exact:true}).click();await page.locator('.weekly-report-actions output').filter({hasText:'数据已刷新'}).waitFor();
 await pre().click();await respondToBusinessConfirm(page,false);assert.equal(await page.locator('[data-meeting-field=coreConclusion]').inputValue(),'先稳定有效开口，再核对留资质量。');
 const pattern=baseURL+'/api/meeting-reviews/'+id;
 await page.route(pattern,(r:any)=>r.fulfill({status:503,contentType:'text/html',body:'<h1>Service unavailable</h1>'}));await pre().click();await respondToBusinessConfirm(page,true);await alert.filter({hasText:'保存失败（503）'}).waitFor();assert.equal(await pre().isEnabled(),true);await page.screenshot({path:folder+'/server-failure-1440.png'});await page.unroute(pattern);
 await page.route(pattern,(r:any)=>r.abort('internetdisconnected'));await pre().click();await respondToBusinessConfirm(page,true);await alert.filter({hasText:'连接失败'}).waitFor();assert.equal(await clickRate.inputValue(),'4.62');await page.unroute(pattern);
 checks.push('取消、非JSON服务错误和断网均保留输入并可重试，不生成版本');
 const before=writes;await pre().dblclick();await respondToBusinessConfirm(page,true);await page.waitForURL('**version=0');assert.equal(writes,before+1);await page.locator('.weekly-final-stage').filter({hasText:'会前定稿'}).waitFor();await page.screenshot({path:folder+'/pre-v0-success-1440.png'});assert.equal((await db.select().from(s.operationsReviewMeetingVersion)).length,1);
 await page.goto(baseURL+'/business/meeting-review?meeting='+id+'&edit=1');await page.locator('[data-report-v4]').waitFor();
 await page.getByRole('button',{name:'会后定稿 V1',exact:true}).click();await alert.filter({hasText:'请补充下一步行动'}).waitFor();assert.equal(await page.locator('[data-meeting-field=nextAction]').evaluate((n:Element)=>n===document.activeElement),true);
 await page.getByRole('textbox',{name:'下一步行动',exact:true}).fill('继续核对素材与有效留资。');await page.getByRole('button',{name:'会后定稿 V1',exact:true}).click();await respondToBusinessConfirm(page,true);await page.waitForURL('**version=1');await page.screenshot({path:folder+'/post-v1-success-1440.png'});
 checks.push('连续点击仅提交一次，会前V0和会后V1真实写入并自动打开对应展示版本');
 assert.deepEqual(errors,[]);await context.close();await writeFile(folder+'/checks.json',JSON.stringify({scope:'正式组件、隔离PGlite、虚构业务数据',checks,errors},null,2));console.log(JSON.stringify({checks,folder}));
}catch(error){if(page){await page.screenshot({path:folder+'/failure.png'});console.error(JSON.stringify({errors,url:page.url(),body:(await page.locator('body').innerText()).slice(-3500)}));}console.error(fixture.logs());throw error;}finally{await browser?.close();await fixture.stop();}
