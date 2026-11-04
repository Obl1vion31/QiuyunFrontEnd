/** 同一个本机 PostgreSQL、同一批冻结版本，对照正式基线的真实查询、接口与界面。 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer,connect,type Socket} from 'node:net';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {settleBusinessUI,openPostLookup} from './business-confirm.helper';
import {readMeetingDecisions} from '../src/db/meeting-decisions';
import {readPromotionContext} from '../src/db/promotion-pauses';
import {readPromotionTimeline} from '../src/db/promotion-timeline';
import {readWeeklyMaterial,selectWeeklyMaterial} from '../src/db/meeting-weekly-material';
import {readMeetingMaterial} from '../src/db/meeting-snapshots';
import {readMonthlyIssues,readMonthlyMeeting} from '../src/db/monthly-meeting';
import {generateStageSnapshot} from '../src/db/promotion-stage-reviews';
import * as s from '../src/db/schema';

const dir=process.env.MEETING_TRANSFER_DIR||'.tools/test-artifacts/meeting-read-transfer';
const baselineSource=process.env.MEETING_BASELINE_SOURCE;
assert.ok(baselineSource,'指定同仓库的正式源码工作树，所有比较只使用本机隔离库');
const previous=(file:string)=>import(pathToFileURL(resolve(baselineSource,file)).href);
const [oldDecisions,oldContext,oldTimeline,oldWeekly,oldMaterial,oldMonthly]=await Promise.all([
  previous('src/db/meeting-decisions.ts'),previous('src/db/promotion-pauses.ts'),previous('src/db/promotion-timeline.ts'),
  previous('src/db/meeting-weekly-material.ts'),previous('src/db/meeting-snapshots.ts'),previous('src/db/monthly-meeting.ts'),
]);
await mkdir(dir,{recursive:true});
const originalURL=process.env.TEST_POSTGRES_URL!;assert.ok(originalURL);const target=new URL(originalURL);
assert.ok(['localhost','127.0.0.1'].includes(target.hostname));
let received=0,sent=0;const sockets=new Set<Socket>(),queries:string[]=[];
const proxy=createServer(client=>{
  const upstream=connect(Number(target.port)||5432,target.hostname);client.setNoDelay(true);upstream.setNoDelay(true);
  sockets.add(client);sockets.add(upstream);let buffer=Buffer.alloc(0),started=false;
  client.on('data',chunk=>{
    sent+=chunk.length;buffer=Buffer.concat([buffer,chunk]);
    if(!started){if(buffer.length<4)return;const length=buffer.readInt32BE(0);if(buffer.length<length)return;buffer=buffer.subarray(length);started=true;}
    while(buffer.length>=5){const length=buffer.readInt32BE(1);if(buffer.length<length+1)break;
      const kind=buffer[0],body=buffer.subarray(5,length+1);
      if(kind===81)queries.push(body.toString('utf8',0,body.indexOf(0)));
      if(kind===80){const at=body.indexOf(0)+1,end=body.indexOf(0,at);queries.push(body.toString('utf8',at,end));}
      buffer=buffer.subarray(length+1);
    }
  });
  upstream.on('data',chunk=>received+=chunk.length);client.pipe(upstream);upstream.pipe(client);
  client.on('error',()=>upstream.destroy());upstream.on('error',()=>client.destroy());
  client.on('close',()=>{sockets.delete(client);upstream.destroy();});upstream.on('close',()=>{sockets.delete(upstream);client.destroy();});
});
await new Promise<void>(r=>proxy.listen(0,'127.0.0.1',r));
const forwarded=new URL(originalURL);forwarded.hostname='127.0.0.1';forwarded.port=String((proxy.address() as {port:number}).port);process.env.TEST_POSTGRES_URL=forwarded.href;
const now=new Date('2026-11-05T12:00:00+08:00'),clockFile=resolve(dir,'clock.txt');await writeFile(clockFile,now.toISOString());
const fixture=await startPostgresFixture({clockFile}),{db,baseURL}=fixture;
let browser:any,baselineProcess:ReturnType<typeof spawn>|undefined,baselineLogs='';
const measurements:any[]=[],checks:string[]=[],errors:string[]=[];
const json=(value:unknown)=>JSON.parse(JSON.stringify(value, (key,value)=>key==='generatedAt'?undefined:value));
const measure=async(name:string,version:string,action:()=>Promise<any>)=>{
  const before={received,sent,queries:queries.length},value=await action();
  const sql=queries.slice(before.queries),tables:Record<string,number>={};
  for(const query of sql){const table=/from "(operations_[^"]+)"/i.exec(query)?.[1];if(table)tables[table]=(tables[table]||0)+1;}
  const result={name,version,databaseToAppBytes:received-before.received,appToDatabaseBytes:sent-before.sent,queries:sql.length,tables};
  measurements.push(result);console.log(JSON.stringify(result));return {value:json(value),measurement:result};
};
const compare=async(name:string,before:()=>Promise<any>,after:()=>Promise<any>)=>{
  const original=await measure(name,'baseline',before),candidate=await measure(name,'candidate',after);
  assert.deepEqual(candidate.value,original.value,name+' 保持全部业务输出与指纹');
  assert.ok(candidate.measurement.databaseToAppBytes<original.measurement.databaseToAppBytes,name+' 裁掉无关传输');
  checks.push(name+' 输出一致');return candidate;
};
try{
  const posts:any[]=[],campaigns:any[]=[];
  for(let i=0;i<6;i++){
    const [content]=await db.insert(s.operationsContent).values({platformNoteId:String(i+1).padStart(24,'0')}).returning();
    const [version]=await db.insert(s.operationsContentVersion).values({contentId:content.id,versionNumber:0,workType:'new',contentName:'隔离样本：读取对照 '+(i+1),subjectId:'tmua',categoryId:'temporary',projectDocUrl:'https://example.test/material'}).returning();
    const promoted=i<2,[post]=await db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,isPromoted:promoted,promotionStatus:promoted?'testing':'none',plannedPublishAt:new Date('2026-10-01T10:00+08:00'),actualPublishAt:new Date('2026-10-01T10:00+08:00'),completionStatus:'on_time'}).returning();posts.push(post);
    if(promoted){
      const [campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:post.id,startedOn:'2026-10-09',initialStage:'testing',currentStage:'testing',currentStatus:'test_pending',dailyReviewEnabledOn:'2026-10-09'}).returning();campaigns.push(campaign);
      await db.insert(s.operationsPromotionStage).values({campaignId:campaign.id,stageType:'testing',startedOn:'2026-10-09',endedOn:'2026-10-12'});
      for(let day=9;day<=12;day++)await db.insert(s.operationsPromotionDailyMetric).values({campaignId:campaign.id,metricDate:'2026-10-'+String(day).padStart(2,'0'),stageTypeSnapshot:'testing',actualStatusSnapshot:'testing',dailyStatus:'active',sourceStageStartedOn:'2026-10-09',spend:'100.00',platformOpenCount:10,actualOpenCount:5,platformLeadCount:4,actualLeadCount:2,reviewDecision:day===12?'test_pending':'test_continue',updatedAt:new Date('2026-10-14T10:00+08:00')});
    }else await db.insert(s.operationsContentPerformanceMetric).values({scheduleId:post.id,checkpointType:'day_7',recordedThrough:'2026-10-08',clickRate:'5',threeSecondReadRate:'35'});
  }
  const draft={schemaVersion:4 as const,workflowVersion:7 as const,coreConclusion:'核对本期结果',nextAction:'保留正常操作与历史入口',promotionInputs:{},issues:[],nonPromotionSelections:[]};
  const [current]=await db.insert(s.operationsReviewMeeting).values({name:'隔离样本：当前周例会',periodStart:'2026-10-01',periodEnd:'2026-10-24',meetingAt:new Date('2026-10-25T16:00+08:00'),createdByLabel:'fixture',draftSnapshot:draft}).returning();
  const initial=await readWeeklyMaterial(db,current,now);
  assert.equal(initial.promotions.length,2);assert.ok(initial.nonPromotions.length);
  const generated=selectWeeklyMaterial(initial,initial.promotions.map(p=>p.key),initial.nonPromotions.map(p=>({scheduleId:p.scheduleId,checkpointType:p.checkpointType})));
  const padding='isolated-material-only-'.repeat(800),history:any[]=[];
  const decision=(meetingId:string,versionNumber:number,effectiveOn:string,id='kept')=>({id,campaignId:campaigns[0].id,scheduleId:posts[0].id,effectiveOn,targetStatus:'test_paused',stageType:'testing',meetingId,versionNumber,label:'隔离例会决定'});
  for(let index=0;index<4;index++){
    const [meeting]=await db.insert(s.operationsReviewMeeting).values({name:'隔离样本：历史例会 '+index,periodStart:'2026-10-01',periodEnd:'2026-10-12',meetingAt:new Date('2026-10-'+String(13+index).padStart(2,'0')+'T16:00+08:00'),status:'completed',currentVersionNumber:index===0?8:2,createdByLabel:'fixture',draftSnapshot:{...draft,materialSnapshot:{padding}}}).returning();history.push(meeting);
    for(let number=0;number<=(index===0?8:2);number++){
      const at=new Date(meeting.meetingAt.getTime()+number*1000);
      const snapshot:any={schemaVersion:4,meeting:{id:meeting.id,name:meeting.name,periodStart:meeting.periodStart,periodEnd:meeting.periodEnd},finalizationStage:'post',decisionEffectiveOn:index===0?'2026-11-08':'2026-11-09',decisionPolicy:'inherit',draft:{...draft,promotionInputs:Object.fromEntries(initial.promotions.map(card=>[card.key,{confirmed:true,clickRate:3,rateRange:card.dataRange,currentSituation:padding}])),issues:[{id:'carry',problem:'核对历史事项',conclusion:'更新 '+index+'-'+number,status:'pending'}]},generated:{...generated,padding,promotions:generated.promotions.map((card:any)=>({...card,historical:{padding},peers:{padding},ownHistory:[{padding}]})),promotionSnapshots:[{snapshot:{rows:generated.promotions.map((card:any)=>({...card,originalStageStartedOn:card.startedOn,peers:{padding}}))}}]}};
      let lifecycleStatus='finalized',invalidatedAt:Date|null=null,businessEffects:any[]=null!;
      if(index===0){
        if(number===0)snapshot.finalizationStage='pre';
        if([1,3,7].includes(number)){snapshot.decisionPolicy='replace';snapshot.decisionEffectiveOn=number===1?'2026-11-06':number===3?'2026-11-07':'2026-11-08';snapshot.generated.meetingDecisions=[decision(meeting.id,number,snapshot.decisionEffectiveOn,number===7?'kept':'removed-'+number)];}
        if(number===4){snapshot.decisionPolicy='reset';snapshot.decisionEffectiveOn='2026-11-06';}
        if(number===5){invalidatedAt=at;businessEffects=[{type:'meeting_decisions_reset',effectiveOn:'2026-11-07'},{type:'irrelevant',padding}];}
        if(number===6){lifecycleStatus='draft';snapshot.decisionPolicy='replace';snapshot.generated.meetingDecisions=[decision(meeting.id,6,'2026-11-08','draft-ignored')];}
      }else if(index===1&&number<2){snapshot.decisionPolicy='replace';snapshot.generated.meetingDecisions=[decision(meeting.id,number,'2026-11-09','corrected')];}
      if(index===2&&number===2)invalidatedAt=at;
      if(index===3&&number===2)snapshot.finalizationStage='pre';
      await db.insert(s.operationsReviewMeetingVersion).values({meetingId:meeting.id,versionNumber:number,lifecycleStatus,invalidatedAt,businessEffects,snapshot,changeSummary:'隔离版本',createdAt:at,finalizedAt:lifecycleStatus==='draft'?null:at});
    }
  }
  const changed=decision(history[1].id,1,'2026-11-09','corrected');changed.targetStatus='testing';
  for(const version of [0,1])await db.insert(s.operationsPromotionTimelineAudit).values({requestKey:crypto.randomUUID(),scheduleId:posts[0].id,businessDate:'2026-11-09',action:'meeting_decision_correction',reason:'隔离更正',before:{padding},after:{meetingDecision:{...changed,versionNumber:version},padding},changedById:'fixture',changedByLabel:'fixture',createdAt:new Date('2026-10-20T16:00:0'+version+'+08:00')});
  const material=await readWeeklyMaterial(db,current,now);
  await db.update(s.operationsReviewMeeting).set({draftSnapshot:{...draft,materialSnapshot:material as unknown as Record<string,unknown>}}).where(eq(s.operationsReviewMeeting.id,current.id));
  await db.insert(s.operationsReviewMeetingVersion).values({meetingId:current.id,versionNumber:0,lifecycleStatus:'draft',snapshot:{schemaVersion:4,meeting:current,draft,generated:material},changeSummary:'隔离草稿'});
  const [future]=await db.insert(s.operationsReviewMeeting).values({name:'隔离样本：上海月界之后',periodStart:'2026-10-25',periodEnd:'2026-10-31',meetingAt:new Date('2026-10-31T16:00:00Z'),status:'completed',createdByLabel:'fixture'}).returning();
  await db.insert(s.operationsReviewMeetingVersion).values({meetingId:future.id,versionNumber:0,snapshot:{finalizationStage:'post',draft:{issues:[{id:'future',problem:'次月才出现',status:'pending'}]},padding},changeSummary:'隔离边界'});
  for(const [index,snapshot] of [
    {scheduleId:posts[0].id,padding},
    {deep:[null,[[{scheduleId:posts[0].id}]]],padding},
    {scheduleId:[posts[0].id],text:posts[0].id,padding},
    {scheduleId:42,text:posts[0].id,padding},
  ].entries())await db.insert(s.operationsReviewMeetingVersion).values({meetingId:future.id,versionNumber:index+1,snapshot,changeSummary:'隔离关联边界'});
  await readPromotionContext(db);
  const decisions=await compare('meeting-decisions',()=>oldDecisions.readMeetingDecisions(db),()=>readMeetingDecisions(db));
  assert.deepEqual(decisions.value.map((d:any)=>[d.id,d.versionNumber,d.targetStatus]),[['kept',7,'test_paused'],['corrected',1,'testing']]);
  await compare('promotion-context',()=>oldContext.readPromotionContext(db),()=>readPromotionContext(db));
  await compare('promotion-timeline',()=>oldTimeline.readPromotionTimeline(db,now),()=>readPromotionTimeline(db,now));
  await compare('weekly-material',()=>oldWeekly.readWeeklyMaterial(db,current,now),()=>readWeeklyMaterial(db,current,now));
  await compare('legacy-material',()=>oldMaterial.readMeetingMaterial(db,current),()=>readMeetingMaterial(db,current));
  const issues=await compare('monthly-issues',()=>oldMonthly.readMonthlyIssues(db,'2026-10'),()=>readMonthlyIssues(db,'2026-10'));
  assert.ok(issues.value.every((i:any)=>i.id!=='future'));assert.equal(issues.value.find((i:any)=>i.id==='carry').conclusion,'更新 3-1');
  await compare('monthly-material',()=>oldMonthly.readMonthlyMeeting(db,current),()=>readMonthlyMeeting(db,current));
  const probe=createServer();await new Promise<void>(r=>probe.listen(0,'127.0.0.1',r));const port=(probe.address() as {port:number}).port;await new Promise<void>(r=>probe.close(()=>r()));
  const oldURL='http://127.0.0.1:'+port;
  baselineProcess=spawn(process.execPath,['--import',resolve('tests/clock.fixture.mjs'),resolve(baselineSource,'dist/server/entry.mjs')],{cwd:baselineSource,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),NODE_ENV:'test',DATABASE_URL:fixture.url,BETTER_AUTH_URL:oldURL,BETTER_AUTH_SECRET:'fictional-browser-secret-at-least-32-characters',FIXTURE_CLOCK_FILE:clockFile},stdio:['ignore','pipe','pipe']});
  baselineProcess.stdout!.on('data',b=>baselineLogs+=b);baselineProcess.stderr!.on('data',b=>baselineLogs+=b);
  for(let i=0;i<100;i++){try{if((await fetch(oldURL+'/api/auth/get-session')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));if(i===99)throw Error(baselineLogs);}
  const login=async(url:string,username='test_admin',password='fictional-admin-password')=>{const response=await fetch(url+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify({username,password})});assert.equal(response.status,200);return response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');};
  const oldCookie=await login(oldURL),cookie=await login(baseURL);
  const request=async(url:string,cookie:string,path:string)=>{const response=await fetch(url+path,{headers:{Cookie:cookie}});assert.equal(response.status,200,path);return response.headers.get('Content-Type')?.includes('application/json')?response.json():response.text();};
  const pages=['/business/operations-schedule?month=2026-10','/business/daily-promotion-review','/business/non-promotion-review','/business/monthly-operations?month=2026-10','/business/meeting-review','/business/meeting-review?meeting='+current.id,'/business/meeting-review?meeting='+history[1].id+'&version=0'];
  for(const path of ['/api/content-search?id='+posts[0].id,'/api/operations-content/'+posts[0].id+'/workflow',...pages]){
    await request(oldURL,oldCookie,path);await request(baseURL,cookie,path);
    const original=await measure(path,'baseline',()=>request(oldURL,oldCookie,path)),candidate=await measure(path,'candidate',()=>request(baseURL,cookie,path));
    if(path.startsWith('/api/'))assert.deepEqual(candidate.value,original.value,path+' JSON完全一致');
    if(path.includes('daily-promotion-review'))assert.equal(candidate.measurement.tables.operations_review_meeting_version,1,'日度页只读取一次决定');
    if(path==='/business/meeting-review')assert.ok(!candidate.measurement.tables.operations_promotion_stage_review_version,'总览不读取阶段快照');
    assert.ok(candidate.measurement.databaseToAppBytes<original.measurement.databaseToAppBytes/2,path+' 至少减少一半无关传输');
  }
  await writeFile(dir+'/profiles.json',JSON.stringify({measurements,checks},null,2));
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:dir+'/videos',size:{width:1440,height:1000}}});
  await context.addInitScript('window.__name=(fn)=>fn');await context.addCookies(cookie.split('; ').map(c=>{const at=c.indexOf('=');return {name:c.slice(0,at),value:c.slice(at+1),url:baseURL};}));
  const oldBrowserContext=await browser.newContext({viewport:{width:1440,height:1000}});
  await oldBrowserContext.addInitScript('window.__name=(fn)=>fn');await oldBrowserContext.addCookies(oldCookie.split('; ').map(c=>{const at=c.indexOf('=');return {name:c.slice(0,at),value:c.slice(at+1),url:oldURL};}));
  const oldPage=await oldBrowserContext.newPage();await oldPage.clock.setFixedTime(now);
  const page=await context.newPage();await page.clock.setFixedTime(now);page.on('pageerror',(e:Error)=>errors.push(e.message));
  const contentChecks:any[]=[];
  for(const path of pages){
    await page.goto(baseURL+path);await page.waitForLoadState('networkidle');await settleBusinessUI(page);
    const contents=await page.locator('.business-console-content').innerText();assert.ok(!contents.includes('暂时不可用'),path);
    await oldPage.goto(oldURL+path);await oldPage.waitForLoadState('networkidle');await settleBusinessUI(oldPage);
    assert.equal(contents,await oldPage.locator('.business-console-content').innerText(),path+' 实际渲染内容一致');
    contentChecks.push({path,characters:contents.length});
    if(path==='/business/daily-promotion-review'||path==='/business/meeting-review'){
      const name=path.endsWith('meeting-review')?'meeting-list':'promotion';
      await page.screenshot({path:dir+'/'+name+'-1440.png'});await oldPage.screenshot({path:dir+'/'+name+'-baseline-1440.png'});
    }
    if(path.includes('?meeting='))await page.screenshot({path:dir+'/'+(path.includes('&version=')?'meeting-history':'meeting-draft')+'-1440.png'});
  }
  await page.goto(baseURL+'/business/operations-schedule?month=2026-10');await page.waitForLoadState('networkidle');
  await openPostLookup(page);const lookup=page.locator('[data-post-lookup]');await lookup.locator('input').fill('读取对照 1');await lookup.locator('button[type=submit]').click();
  await lookup.getByRole('button',{name:/读取对照 1/}).first().click();await lookup.locator('[data-lookup-detail]').waitFor();assert.ok(await lookup.locator('a[href*="meeting="]').count());await settleBusinessUI(page);
  await page.screenshot({path:dir+'/post-lookup-1440.png'});await page.keyboard.press('Escape');
  for(const width of [1920,1440,1024,390,320]){
    await page.setViewportSize({width,height:width<500?780:1000});await page.goto(baseURL+'/business/meeting-review');await page.waitForLoadState('networkidle');await settleBusinessUI(page);await page.screenshot({path:dir+'/meeting-list-'+width+'.png'});
    assert.ok(await page.locator('.business-console-content').evaluate((n:HTMLElement)=>n.scrollWidth<=n.clientWidth+1),'例会列表未新增横向溢出 '+width);
  }
  const employeeCookie=await login(baseURL,'test_employee','fictional-employee-password');
  const employeeResult=await request(baseURL,employeeCookie,'/api/content-search?id='+posts[0].id);assert.ok(employeeResult.meetings.length);
  // 旧V4草稿缺少缓存材料时仍走原兼容表单，阶段快照选择器不能被省掉。
  const stage=await generateStageSnapshot(db,'2026-10-01','2026-10-24','隔离旧草稿快照选择器');
  const [stageReview]=await db.insert(s.operationsPromotionStageReview).values({requestKey:crypto.randomUUID(),name:stage.name,periodStart:stage.periodStart,periodEnd:stage.periodEnd,createdByLabel:'fixture'}).returning();
  const [stageVersion]=await db.insert(s.operationsPromotionStageReviewVersion).values({reviewId:stageReview.id,versionNumber:0,snapshot:stage as unknown as Record<string,unknown>,createdByLabel:'fixture'}).returning();
  await db.update(s.operationsReviewMeeting).set({draftSnapshot:{...draft,promotionSnapshotIds:[stageVersion.id]}}).where(eq(s.operationsReviewMeeting.id,current.id));
  await page.setViewportSize({width:1440,height:1000});
  for(const [target,url] of [[page,baseURL],[oldPage,oldURL]]){
    await target.goto(url+'/business/meeting-review?meeting='+current.id);await target.waitForLoadState('networkidle');await settleBusinessUI(target);
    await target.locator('#promotion details.picker>summary').click();
    assert.equal(await target.locator('input[data-stage-ref][value="'+stageVersion.id+'"]').isChecked(),true);
  }
  assert.equal(await page.locator('.business-console-content').innerText(),await oldPage.locator('.business-console-content').innerText(),'旧草稿兼容表单与阶段引用保持一致');
  await page.screenshot({path:dir+'/legacy-draft-picker-1440.png'});
  checks.push('旧V4草稿缺缓存材料时仍可选择阶段快照，实际页面与基线一致');
  assert.equal(errors.length,0);
  const videoPath=await page.video()?.path();await context.close();await oldBrowserContext.close();
  checks.push('同库 HTTP JSON一致、日度决定只读一次、管理员和员工读取、真实查帖关联例会与五档视口');
  await writeFile(dir+'/results.json',JSON.stringify({isolatedPostgres:true,baselineSource,seed:{posts:6,meetingVersions:24,paddingBytes:Buffer.byteLength(padding)},measurements,checks,contentChecks,videoPath,pageErrors:errors},null,2));
  console.log(JSON.stringify({measurements,checks,pageErrors:errors},null,2));
}catch(error){await writeFile(dir+'/failure.log',String(error)+'\n'+fixture.logs().slice(-7000)+'\n'+baselineLogs.slice(-4000));throw error;}
finally{
  if(browser)await browser.close();
  if(baselineProcess&&baselineProcess.exitCode===null){baselineProcess.kill('SIGTERM');await once(baselineProcess,'exit');}
  await fixture.stop();for(const socket of sockets)socket.destroy();await new Promise<void>(r=>proxy.close(()=>r()));process.env.TEST_POSTGRES_URL=originalURL;
}
