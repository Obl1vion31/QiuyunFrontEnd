import {discussionFromDraft} from '../src/db/meeting-discussion-values';
/** 紧凑卡片、真实非零日期、点击率复核、排序和事项；全部业务写入在隔离 PGlite。 */
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {startFixture,employee} from './auth.fixture';
import {respondToBusinessConfirm} from './business-confirm.helper';
import * as s from '../src/db/schema';
import {readWeeklyDraftStates,type WeeklyMaterial} from '../src/db/meeting-weekly-material';
const folder=process.env.MEETING_COMPACT_DIR||'.tools/test-artifacts/meeting-compact';await mkdir(folder,{recursive:true});
const clockFile=new URL('../'+folder+'/clock.txt',import.meta.url).pathname;await writeFile(clockFile,'2026-10-27T18:00:00+08:00');
const fixture=await startFixture({clockFile}),{db,baseURL}=fixture;let browser:any,page:any;const checks:string[]=[],errors:string[]=[],geometry:any[]=[];
try{
 const login=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(employee)});assert.equal(login.status,200);const cookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 const api=async(path:string,body?:any,status=200)=>{const r=await fetch(baseURL+path,{method:body?'PATCH':'GET',headers:{Origin:baseURL,Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const j=await r.json();assert.equal(r.status,status,JSON.stringify(j));return j;};
 async function create(from='2026-10-16',to='2026-10-24',type='weekly',name=''){
  const data=new FormData();for(const[k,v]of Object.entries({meetingType:type,meetingAt:'2026-10-27T18:00',periodStart:from,periodEnd:to,name}))data.set(k,v);
  const r=await fetch(baseURL+'/api/meeting-reviews',{method:'POST',headers:{Origin:baseURL,Cookie:cookie},body:data});assert.equal(r.status,201);return(await r.json()).id;
 }
 async function seed(name:string,day:string,promoted=false,recorded=false){
  const[c]=await db.insert(s.operationsContent).values({platformNoteId:randomUUID().replaceAll('-','').slice(0,24)}).returning();
  const[v]=await db.insert(s.operationsContentVersion).values({contentId:c.id,contentName:name,versionNumber:0,workType:'new',subjectId:'tmua',categoryId:'temporary',projectDocUrl:'https://example.test/doc/'+c.id}).returning();
  const[p]=await db.insert(s.operationsContentSchedule).values({contentVersionId:v.id,isPromoted:promoted,promotionStatus:promoted?'testing':'none',completionStatus:'on_time',plannedPublishAt:new Date(day+'T18:00:00+08:00'),actualPublishAt:new Date(day+'T18:00:00+08:00'),publicationUrl:'https://www.xiaohongshu.com/explore/'+c.platformNoteId}).returning();
  if(!promoted){if(recorded)await db.insert(s.operationsContentPerformanceMetric).values({scheduleId:p.id,checkpointType:'day_7',recordedThrough:day.slice(0,8)+String(Number(day.slice(8))+7),clickRate:'12.3456',threeSecondReadRate:'48.4321'});return {p,campaign:null};}
  const[campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:p.id,startedOn:day,dailyReviewEnabledOn:day,initialStage:'testing',currentStage:'testing',currentStatus:'testing'}).returning();await db.insert(s.operationsPromotionStage).values({campaignId:campaign.id,startedOn:day,stageType:'testing'});return {p,campaign};
 }
 async function metric(post:any,day:number,spend='0',opens=0,leads=0,pending=false,decision='wait_continue'){
  await db.insert(s.operationsPromotionDailyMetric).values({campaignId:post.campaign.id,metricDate:'2026-10-'+day,dailyStatus:pending?'waiting_action':'active',actualStatusSnapshot:day===16||day===17?null:pending?'test_pending':'testing',stageTypeSnapshot:'testing',recordKind:'regular',sourceStageStartedOn:post.campaign.startedOn,spend,platformOpenCount:opens,actualOpenCount:opens,platformLeadCount:leads,actualLeadCount:leads,reviewDecision:decision});
 }
 const a=await seed('暂停后的转化仍计入区间','2026-10-16',true),b=await seed('尾部零值不延长区间','2026-10-19',true),c=await seed('全部指标为零的阶段','2026-10-21',true),d=await seed('长标题：从题目条件、函数图像与逻辑关系建立完整的解题过程并核对表达','2026-10-20',true);
 for(let day=16;day<=25;day++)await metric(a,day,day===16?'100':day===18?'40':'0',day===16?2:day===25?1:0,day===25?1:0,day>=19,day===18?'test_pending':day>=19?'wait_continue':'test_continue');
 await metric(b,19,'80',2,1,false,'test_pending');for(let day=20;day<=25;day++)await metric(b,day,'0',0,0,true);
 await metric(c,21,'0',0,0,false,'test_pending');await metric(c,22,'0',0,0,true);
 await metric(d,20,'99',3,1,false,'test_continue');
 const n14=await seed('14号发布：最早待处理','2026-10-14'),n15=await seed('15号发布：已有首轮','2026-10-15',false,true),n16=await seed('16号发布：待填写首轮','2026-10-16'),n17=await seed('17号发布：已有首轮','2026-10-17',false,true);
 const prior=await create('2026-09-01','2026-09-30','monthly');const[carried]=await db.insert(s.operationsReviewActionItem).values({problem:'上期遗留：继续核对素材',status:'pending',createdMeetingId:prior}).returning();
 const id=await create();await db.update(s.operationsReviewMeeting).set({name:'2026.10.18—10.24 周度业务复盘'}).where(eq(s.operationsReviewMeeting.id,id));
 const pw=await import(new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);browser=await pw.chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:folder+'/video',size:{width:1440,height:1000}}});await context.addCookies(cookie.split('; ').map(v=>({name:v.slice(0,v.indexOf('=')),value:v.slice(v.indexOf('=')+1),url:baseURL})));
 page=await context.newPage();await page.clock.install({time:new Date(await readFile(clockFile,'utf8'))});page.setDefaultTimeout(15000);page.on('pageerror',(e:Error)=>errors.push(e.message));
 const nav=async(path:string)=>{await page.evaluate(()=>document.documentElement.dataset.unsaved='false').catch(()=>{});await page.goto(baseURL+path);await page.locator('.business-toolbar').waitFor();await page.evaluate(()=>document.fonts.ready);};
 const post=(p:any)=>page.locator(`[data-weekly-promotion^="${p.campaign.id}:"]`),non=(p:any)=>page.locator(`[data-weekly-non="${p.p.id}"]`);
 const scroll=async(node:any)=>{await node.evaluate((n:HTMLElement)=>scrollTo(0,n.getBoundingClientRect().top+scrollY-100));};
 const shot=async(name:string)=>{await page.locator('textarea').evaluateAll((nodes:HTMLTextAreaElement[])=>nodes.forEach(n=>n.scrollTop=0));await page.screenshot({path:folder+'/'+name+'.png'});};
 const refresh=async()=>{await page.getByRole('button',{name:'刷新数据',exact:true}).click();await page.locator('.weekly-report-actions output').filter({hasText:'数据已刷新'}).waitFor();};
 const record=async()=> (await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,id)))[0];
 await nav('/business/meeting-review?meeting='+id);await page.getByRole('button',{name:'全选推广帖',exact:true}).click();assert.equal(await page.locator('.business-toolbar__title strong').innerText(),'2026.10.16—10.24 周度业务复盘');await page.getByRole('button',{name:'确认纳入',exact:true}).click();
 assert.match(await post(a).locator('.weekly-data-range').innerText(),/2026-10-16—2026-10-18/);assert.match(await post(b).locator('.weekly-data-range').innerText(),/2026-10-19—2026-10-19/);assert.equal(await post(c).locator('.weekly-data-range').innerText(),'暂无非零数据');
 const order=()=>page.locator('#weekly-non [data-weekly-non]').evaluateAll((nodes:HTMLElement[])=>nodes.map(n=>n.dataset.weeklyNon));
 assert.deepEqual(await order(),[n14.p.id,n15.p.id,n16.p.id,n17.p.id]);
 const long='观察：保留长条件、图像和反例的完整判断，不因展示压缩而截断。下一轮继续核对实际留资质量与表达方式。';
 for(const p of[a,b,c,d]){await post(p).locator('input[type=number]').fill('4.62');await post(p).getByRole('textbox',{name:/观察$/}).fill(long);await post(p).getByRole('textbox',{name:/行动$/}).fill('继续核对有效开口与留资。');}
 for(const [name,value]of [['衡量情况','核对本期实际跑量与留资。'],['本期具体动作','完善素材中的关键条件。'],['核心结论','保留有效表达，继续验证真实转化。']])await page.getByRole('textbox',{name,exact:true}).fill(value);
 // 空行、中间行及末行删除；后方 DOM 身份和输入保留，焦点回到相邻字段。
 for(let i=0;i<3;i++)await page.getByRole('button',{name:'新增事项',exact:true}).click();let issues=page.locator('[data-meeting-issue]');
 await issues.nth(1).getByRole('textbox',{name:'问题',exact:true}).fill('误加的问题');await issues.nth(1).getByRole('textbox',{name:'解决方案',exact:true}).fill('误加的方案');
 await issues.nth(2).getByRole('textbox',{name:'解决方案',exact:true}).fill('先写方案，问题稍后补齐');await issues.nth(3).getByRole('textbox',{name:'问题',exact:true}).fill('本期继续跟进表达');await issues.nth(3).getByRole('textbox',{name:'解决方案',exact:true}).fill('整理反例后核对');
 const retained=await issues.nth(3).elementHandle();await issues.nth(1).getByRole('button',{name:/删除/}).click();assert.equal(await retained.evaluate((n:HTMLElement)=>n.isConnected),true);assert.equal(await issues.nth(1).getByRole('textbox',{name:'解决方案',exact:true}).inputValue(),'先写方案，问题稍后补齐');
 await page.getByRole('button',{name:'新增事项',exact:true}).click();await issues.last().getByRole('button',{name:/删除/}).click();assert.equal(await issues.count(),3);assert.equal(await issues.first().getByRole('button',{name:/删除/}).count(),0);
 for(const width of[1920,1440,1280,1024]){
  await page.setViewportSize({width,height:1000});await scroll(page.locator('#weekly-promotion'));await shot('draft-cards-'+width);await scroll(page.locator('#weekly-non'));await shot('draft-non-'+width);await scroll(page.locator('#weekly-other'));await shot('draft-issues-'+width);
  const metrics=await page.locator('[data-weekly-promotion]').evaluateAll((nodes:HTMLElement[])=>nodes.map(n=>{const r=n.getBoundingClientRect(),title=n.querySelector('.weekly-card-title strong')!.getBoundingClientRect(),icon=n.querySelector('svg')!.getBoundingClientRect();return {x:r.x,y:r.y,h:r.height,centerDelta:Math.abs((title.top+title.bottom-icon.top-icon.bottom)/2)};}));
  const perRow=width===1024?2:3;assert.equal(metrics[0].y,metrics[perRow-1].y);assert.ok(Math.abs(metrics[0].h-metrics[perRow-1].h)<1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);geometry.push({width,metrics});
  const controls=await issues.first().locator('textarea,select,.weekly-issue-check').evaluateAll((nodes:HTMLElement[])=>nodes.map(n=>({top:n.getBoundingClientRect().top,height:n.getBoundingClientRect().height})));assert.equal(controls[0].height,64);assert.equal(controls[1].height,64);assert.ok(controls.every((r:any)=>Math.abs(r.top-controls[0].top)<1));
 }
 checks.push('四档桌面紧凑卡片三列/两列、同行等高、64px事项文本框与顶部基线、混合非推广发布时间排序');
 await page.setViewportSize({width:1440,height:1000});await post(a).getByRole('button',{name:'确认',exact:true}).click();await post(a).getByRole('button',{name:'修改',exact:true}).waitFor();
 await page.getByRole('button',{name:'保存草稿',exact:true}).click();await page.waitForURL('**/business/meeting-review');assert.ok((await record()).draftSnapshot.issues.some(i=>!i.problem&&i.conclusion==='先写方案，问题稍后补齐'));
 // 模拟升级前保存的材料：前两天已有真实记录，但没有 actualStatusSnapshot/dailyStates。
 const legacyDraft=structuredClone((await record()).draftSnapshot),legacyMaterial=legacyDraft.materialSnapshot as unknown as WeeklyMaterial;
 const legacyCard=legacyMaterial.promotions.find(row=>row.campaignId===a.campaign!.id)!;delete legacyCard.dailyStates;legacyMaterial.fingerprint='0'.repeat(64);legacyDraft.materialFingerprint=legacyMaterial.fingerprint;
 await db.update(s.operationsReviewMeeting).set({draftSnapshot:legacyDraft}).where(eq(s.operationsReviewMeeting.id,id));const beforeRead=JSON.stringify(await record());
 await nav('/business/meeting-review?meeting='+id);await scroll(post(a));await post(a).getByRole('button',{name:'查看明细',exact:true}).click();
 for(const day of['2026-10-16','2026-10-17'])assert.match(await post(a).locator(':popover-open .weekly-daily-facts tbody tr').filter({hasText:day}).innerText(),/测试中/);
 assert.equal(JSON.stringify(await record()),beforeRead);assert.equal(await page.getByRole('button',{name:'刷新数据',exact:true}).isEnabled(),true);await shot('legacy-draft-states-1440');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'保存草稿',exact:true}).click();await page.waitForURL('**/business/meeting-review');const savedLegacy=(await record()).draftSnapshot;
 assert.equal((savedLegacy.materialSnapshot as any).promotions.find((row:any)=>row.key===legacyCard.key).dailyStates['2026-10-16'],'testing');
 assert.equal(savedLegacy.materialFingerprint,legacyDraft.materialFingerprint);assert.deepEqual(savedLegacy.promotionInputs,legacyDraft.promotionInputs);assert.deepEqual((savedLegacy.materialSnapshot as any).summary,legacyMaterial.summary);
 assert.deepEqual((savedLegacy.materialSnapshot as any).promotions.find((row:any)=>row.key===legacyCard.key).facts,legacyCard.facts);
 const unknown=structuredClone(legacyMaterial),unknownCard=unknown.promotions.find(row=>row.key===legacyCard.key)!;unknownCard.facts.push({...unknownCard.facts[0],id:randomUUID(),metricDate:'2026-10-15'});
 assert.equal((await readWeeklyDraftStates(db,unknown)).promotions.find(row=>row.key===legacyCard.key)!.dailyStates?.['2026-10-15'],undefined);
 checks.push('旧草稿不手动刷新即可还原有记录日期的状态，GET不写库，保存保留补齐状态且不改指标/输入/指纹；缺日度记录不猜测');
 await nav('/business/meeting-review?meeting='+id);await page.locator('[data-report-v4]').waitFor();await page.getByRole('textbox',{name:'结束日',exact:true}).count();
 await page.locator('.weekly-material-tools input[type=date]').last().fill('2026-10-25');await refresh();
 assert.equal(await page.locator('.business-toolbar__title strong').innerText(),'2026.10.16—10.25 周度业务复盘');assert.match(await page.title(),/10.25/);assert.match(await post(a).locator('.weekly-data-range').innerText(),/2026-10-16—2026-10-25/);assert.equal(await post(a).locator('input[type=number]').inputValue(),'4.62');await post(a).getByText('数据区间已变化，点击率待核对',{exact:true}).waitFor();
 await page.getByRole('button',{name:'会前定稿 V0',exact:true}).click();await page.locator('.weekly-report-actions [role=alert]').filter({hasText:'重新确认'}).waitFor();
 await scroll(post(a));await shot('range-needs-review-1440');await page.getByRole('button',{name:'保存草稿',exact:true}).click();await page.waitForURL('**/business/meeting-review');let r=await record();assert.equal(r.name,'2026.10.16—10.25 周度业务复盘');assert.equal(r.draftSnapshot.promotionInputs[Object.keys(r.draftSnapshot.promotionInputs).find(k=>k.startsWith(a.campaign!.id))!].rateNeedsReview,true);
 await api('/api/meeting-reviews/'+id,{action:'finalize_pre',draft:r.draftSnapshot,expectedUpdatedAt:r.updatedAt.toISOString()},422);
 await nav('/business/meeting-review?meeting='+id);await post(a).getByText('数据区间已变化，点击率待核对',{exact:true}).waitFor();await post(a).getByRole('button',{name:'确认',exact:true}).click();await post(a).getByRole('button',{name:'修改',exact:true}).waitFor();r=await record();const input=Object.entries(r.draftSnapshot.promotionInputs).find(([key])=>key.startsWith(a.campaign!.id))![1];assert.deepEqual(input.rateRange,{from:'2026-10-16',through:'2026-10-25'});assert.equal(input.rateNeedsReview,false);
 // 每日实际状态与次日决定独立；区间之外的零值事实仍保留。
 await scroll(post(a));const button=post(a).getByRole('button',{name:'查看明细',exact:true});const before=await post(a).evaluate((n:HTMLElement)=>({y:n.getBoundingClientRect().y,scrollY}));await button.click();const bubble=post(a).locator('.weekly-detail-popover:popover-open');await bubble.waitFor();assert.deepEqual(await post(a).evaluate((n:HTMLElement)=>({y:n.getBoundingClientRect().y,scrollY})),before);
 assert.match(await bubble.locator('.weekly-daily-facts tbody tr').filter({hasText:'2026-10-18'}).innerText(),/测试中/);assert.match(await bubble.locator('.weekly-daily-facts tbody tr').filter({hasText:'2026-10-19'}).innerText(),/测试结束待定/);assert.equal(await bubble.locator('.weekly-daily-facts tbody tr').filter({hasText:'2026-10-25'}).locator('td').nth(3).innerText(),'1');await shot('daily-status-1440');await page.keyboard.press('Escape');
 const skipped=non(n14);await skipped.getByRole('combobox').selectOption('skip');await skipped.getByRole('textbox',{name:'不复盘理由',exact:true}).fill('本轮不复盘，保留业务原因。');await skipped.getByRole('button',{name:'确认',exact:true}).click();await skipped.waitFor({state:'detached'});
 const pending=non(n16),index=(await order()).indexOf(n16.p.id);await pending.locator('input[type=number]').first().fill('8.25');await pending.locator('input[type=number]').last().fill('40.50');await pending.getByRole('button',{name:'确认',exact:true}).click();await pending.getByRole('button',{name:'修改',exact:true}).waitFor();assert.equal((await order()).indexOf(n16.p.id),index);
 await page.getByRole('button',{name:'会前定稿 V0',exact:true}).click();await page.locator('.weekly-report-actions [role=alert]').filter({hasText:'事项的问题'}).waitFor();assert.equal(await issues.nth(1).getByRole('textbox',{name:'问题',exact:true}).evaluate((n:Element)=>n===document.activeElement),true);await issues.nth(1).getByRole('textbox',{name:'问题',exact:true}).fill('补齐的问题描述');
 checks.push('半填事项保存回显、删除新增行不丢其他输入、区间16至25包含中间零值和晚转化、点击率保留/跨保存复核且前后端阻止绕过、每日当日状态不误用次日安排、非推广完成后位置稳定');
 await page.getByRole('button',{name:'会前定稿 V0',exact:true}).click();await respondToBusinessConfirm(page,true);await page.waitForURL('**version=0');const[version0]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId,id));const frozen=JSON.stringify(version0.snapshot);
 for(const width of[1920,1440,1280,1024]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));await shot('pre-overview-'+width);await scroll(page.locator('[aria-label="推广帖阶段复盘"]'));await shot('pre-cards-'+width);}
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:folder+'/pre-full-1440.png',fullPage:true});assert.equal(await page.locator('.weekly-metrics input,.weekly-non-card input,.weekly-non-card textarea').count(),0);assert.match(await post(a).innerText(),/拟议安排 · 尚未生效/);
 await nav('/business/meeting-review?meeting='+id+'&mode=edit');await page.getByRole('button',{name:'修改下一步行动',exact:true}).click();await page.getByRole('textbox',{name:'下一步行动',exact:true}).fill('按会后结论执行，并持续核对真实转化。');await page.getByRole('heading',{name:'核心结论',exact:true}).click();await page.getByRole('checkbox',{name:'事项1已解决',exact:true}).check();await page.getByRole('button',{name:'会后定稿 V1',exact:true}).click();await respondToBusinessConfirm(page,true);await page.waitForURL('**version=1');
 for(const width of[1920,1440,1280,1024]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));await shot('post-overview-'+width);await scroll(page.locator('[aria-label="推广帖阶段复盘"]'));await shot('post-cards-'+width);}
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:folder+'/post-full-1440.png',fullPage:true});await scroll(page.locator('.weekly-support'));await shot('post-issues-1440');assert.match(await post(a).innerText(),/已定安排/);assert.equal(JSON.stringify((await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,version0.id)))[0].snapshot),frozen);
 assert.equal((await db.select().from(s.operationsReviewActionItem).where(eq(s.operationsReviewActionItem.id,carried.id)))[0].status,'resolved');const next=await create('2026-10-26','2026-10-26');assert.equal((await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,next)))[0].draftSnapshot.issues.some(i=>i.id===carried.id),false);
 // 自动标题和自定义标题分开；刷新失败不更换标题或清空输入。
 const custom=await create('2026-10-16','2026-10-24','monthly','月度素材专题会');await nav('/business/meeting-review?meeting='+custom);await page.getByRole('textbox',{name:'核心结论',exact:true}).fill('失败也保留的输入');await page.locator('.weekly-material-tools input[type=date]').last().fill('2026-10-25');
 await page.route('**/api/meeting-reviews/*/material?*',(route:any)=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'隔离模拟读取失败'})}));await page.getByRole('button',{name:'刷新数据',exact:true}).click();await page.locator('.weekly-report-actions [role=alert]').filter({hasText:'隔离模拟读取失败'}).waitFor();assert.equal(await page.locator('.business-toolbar__title strong').innerText(),'月度素材专题会');assert.equal(await page.getByRole('textbox',{name:'核心结论',exact:true}).inputValue(),'失败也保留的输入');await page.unroute('**/api/meeting-reviews/*/material?*');await refresh();assert.equal(await page.locator('.business-toolbar__title strong').innerText(),'月度素材专题会');
 const legacy=await create('2026-09-01','2026-09-30','monthly','旧版例会样式');const old=JSON.parse(frozen);old.meeting.id=legacy;old.meeting.name='旧版例会样式';for(const card of old.generated.promotions){delete card.dataRange;delete card.dailyStates;for(const f of card.facts)f.actualStatusSnapshot=null;}await db.insert(s.operationsReviewMeetingVersion).values({meetingId:legacy,versionNumber:0,snapshot:old,changeSummary:'隔离旧版样本',finalizedByLabel:'test_employee'});await db.update(s.operationsReviewMeeting).set({status:'completed',currentVersionNumber:0}).where(eq(s.operationsReviewMeeting.id,legacy));await nav('/business/meeting-review?meeting='+legacy+'&version=0');await scroll(post(a));await post(a).getByRole('button',{name:'查看明细',exact:true}).click();assert.match(await post(a).locator(':popover-open .weekly-daily-facts').innerText(),/状态未记录/);await page.keyboard.press('Escape');
 checks.push('会前V0与会后V1四档桌面和完整页面；事项会后解决退出下场；自动标题预览与持久化、自定义保留、失败不改名；旧冻结不回写且缺状态不补造');
 assert.deepEqual(errors,[]);await context.close();await writeFile(folder+'/checks.json',JSON.stringify({checks,errors,geometry,scope:'正式组件、隔离PGlite、虚构业务数据'},null,2));console.log(JSON.stringify({checks,folder}));
}catch(error){if(page){await page.screenshot({path:folder+'/failure.png'});console.error(JSON.stringify({errors,url:page.url(),body:(await page.locator('body').innerText()).slice(-2500)}));}console.error(fixture.logs().slice(-3000));throw error;}finally{await browser?.close();await fixture.stop();}
