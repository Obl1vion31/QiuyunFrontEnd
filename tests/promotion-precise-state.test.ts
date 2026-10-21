import assert from 'node:assert/strict';
import {after,before,test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {eq} from 'drizzle-orm';
import {generateDrizzleJson,generateMigration} from 'drizzle-kit/api';
import {readFile} from 'node:fs/promises';
import {migrateFixture} from './migrate-fixture';
import * as s from '../src/db/schema';
import {promotionSuccessorOptions,promotionNextOptions} from '../src/db/promotion-successors.mjs';
import {replayPromotionHistory} from '../src/db/promotion-rules.mjs';
import {promotionDailySchema,promotionDailyUpdateSchema} from '../src/db/promotion-validation';
import {promotionTotals} from '../src/db/promotion-overview';
import {aggregateStageRows} from '../src/db/promotion-stage-reviews';
import {changePromotionTimeline,promotionSnapshot,timelineSchema,timelineFingerprint,readPromotionTimeline} from '../src/db/promotion-timeline';
import {readPromotionContext} from '../src/db/promotion-pauses';
import {promotionReviewDays,promotionReviewQueue} from '../src/db/promotion-review-days';
const metric=(date:string,status:string,decision:string,extra:Record<string,unknown>={})=>({id:randomUUID(),campaignId:randomUUID(),metricDate:date,dailyStatus:['testing','scaling'].includes(status)?'active':'waiting_action',actualStatusSnapshot:status,stageTypeSnapshot:status.startsWith('scaling')?'scaling':'testing',recordKind:'regular',sourceStageStartedOn:'2026-10-17',spend:'40.00',platformOpenCount:5,actualOpenCount:4,platformLeadCount:2,actualLeadCount:2,reviewDecision:decision,note:null,...extra});
test('实际修改只允许后继；结束待定不得恢复测试；次日允许继续当前状态',()=>{
 assert.deepEqual(promotionSuccessorOptions('testing').map(x=>x.value),['test_paused','test_pending','scaling','test_discarded']);
 assert.deepEqual(promotionNextOptions('test_pending').map(x=>x.value),['wait_continue','start_scaling','test_discarded']);
 assert.ok(!promotionSuccessorOptions('testing').some(x=>x.value==='testing'));
 assert.deepEqual(promotionNextOptions('test_discarded'),[]);
});
test('暂停、待定的非零指标保留，状态次日生效，残留不重启生命周期',()=>{
 const facts=[metric('2026-10-17','testing','test_pause'),metric('2026-10-18','test_paused','test_continue'),metric('2026-10-19','testing','test_pending'),metric('2026-10-20','test_pending','start_scaling')];
 const replay=replayPromotionHistory('2026-10-17',facts,{asOf:'2026-10-21'});
 assert.equal(replay?.currentStatus,'scaling');assert.equal(replay?.currentStage,'scaling');
 assert.deepEqual(replay?.stages.map(s=>[s.startedOn,s.endedOn]),[['2026-10-17','2026-10-17'],['2026-10-19','2026-10-19'],['2026-10-21',null]]);
 assert.equal(replayPromotionHistory('2026-10-17',[metric('2026-10-17','testing','test_pending'),metric('2026-10-18','test_pending','test_continue')],{asOf:'2026-10-19'}),null);
 const terminal=[metric('2026-10-17','testing','test_discarded'),metric('2026-10-20','test_discarded','test_discarded',{recordKind:'test_residual'})];
 const state=replayPromotionHistory('2026-10-17',terminal,{asOf:'2026-10-21'});assert.equal(state?.currentStatus,'test_discarded');assert.equal(state?.endedOn,'2026-10-17');
 assert.equal(promotionTotals(facts).spend,160);assert.equal(promotionTotals(facts).actualOpenCost,10);
});
test('普通、暂停和待定可以保存真实零或非零；更正入口保留同一口径',()=>{
 for(const status of ['testing','test_paused','test_pending','scaling_paused'])for(const value of [0,25]){
  const m={...metric('2026-10-20',status,'wait_continue'),platformNoteId:'a'.repeat(24),spend:value};
  assert.equal(promotionDailySchema.safeParse(m).success,true);assert.equal(promotionDailyUpdateSchema.safeParse(m).success,true);
 }
 for(const name of ['spend','platformOpenCount','actualOpenCount','platformLeadCount','actualLeadCount'])for(const empty of ['',null,undefined])assert.equal(promotionDailySchema.safeParse({...metric('2026-10-20','test_pending','wait_continue'),[name]:empty}).success,false,'空字段不能被伪造为零');
 assert.equal(promotionDailySchema.safeParse({...metric('2026-02-30','testing','test_continue'),platformNoteId:null}).success,false);
});
test('阶段区间按原阶段归属追加残留，不重复历史整段累计',()=>{
 const first=metric('2026-10-17','testing','test_discarded',{spend:100,actualOpenCount:10,actualLeadCount:5});
 const late=metric('2026-10-20','test_discarded','test_discarded',{recordKind:'test_residual',spend:20,actualOpenCount:2,actualLeadCount:1});
 const input={campaignId:'campaign',metadata:{scheduleId:'schedule',contentVersionId:'version',contentId:'content',contentName:'隔离测试',versionNumber:0,subjectName:'TMUA',categoryName:null,projectDocUrl:null},stages:[{stageType:'testing',startedOn:'2026-10-17',endedOn:'2026-10-17'}],metrics:[first,late],windows:[],periodStart:'2026-10-17',periodEnd:'2026-10-17'};
 const original=aggregateStageRows(input);assert.equal(original[0].spend,100);
 const addition=aggregateStageRows({...input,periodStart:'2026-10-20',periodEnd:'2026-10-20'});assert.equal(addition[0].spend,20);assert.equal(addition[0].additionOnly,true);assert.equal(addition[0].originalStageStartedOn,'2026-10-17');
 const together=aggregateStageRows({...input,periodEnd:'2026-10-20'});assert.equal(together[0].spend,120);assert.equal(together[0].facts.length,2);
 assert.equal(original[0].spend,100,'已经生成的快照不被后续数据修改');
});
const pg=new PGlite(),db=drizzle(pg,{schema:s});before(()=>migrateFixture(pg));after(()=>pg.close());
const actor={id:'isolated-precise-admin',username:'隔离管理员',role:'admin' as const};
async function seed(){const [c]=await db.insert(s.operationsContent).values({platformNoteId:randomUUID().replaceAll('-','').slice(0,24)}).returning();const [v]=await db.insert(s.operationsContentVersion).values({contentId:c.id,versionNumber:0,workType:'new',contentName:'隔离状态测试',subjectId:'tmua',categoryId:'temporary'}).returning();const [schedule]=await db.insert(s.operationsContentSchedule).values({contentVersionId:v.id,isPromoted:true,promotionStatus:'testing',completionStatus:'on_time',plannedPublishAt:new Date('2026-10-17T12:00:00+08:00'),actualPublishAt:new Date('2026-10-17T12:00:00+08:00')}).returning();const [campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:schedule.id,startedOn:'2026-10-17',dailyReviewEnabledOn:'2026-10-17',currentStage:'testing',currentStatus:'testing'}).returning();return {schedule,campaign};}
async function change(id:string,date:string,targetStatus:string,extra:Record<string,unknown>={}){return changePromotionTimeline(db,timelineSchema.parse({scheduleId:id,reviewDate:date,action:'status',targetStatus,reason:'隔离测试原因',requestKey:randomUUID(),fingerprint:timelineFingerprint(await promotionSnapshot(db,id)),...extra}),actor,new Date('2026-10-21T12:00:00+08:00'));}
test('实际状态变更按固定日期保存原因与审计，幂等、指纹和权限生效',async()=>{
 const {schedule}=await seed();const body=timelineSchema.parse({scheduleId:schedule.id,reviewDate:'2026-10-17',action:'status',targetStatus:'test_paused',reason:'中途暂停',requestKey:randomUUID(),fingerprint:timelineFingerprint(await promotionSnapshot(db,schedule.id))});
 await changePromotionTimeline(db,body,actor,new Date('2026-10-21'));assert.equal((await promotionSnapshot(db,schedule.id)).campaigns[0].currentStatus,'test_paused');
 await changePromotionTimeline(db,body,actor,new Date('2026-10-21'));assert.equal((await promotionSnapshot(db,schedule.id)).decisions.length,1);
 await assert.rejects(changePromotionTimeline(db,{...body,requestKey:randomUUID()},actor,new Date('2026-10-21')),/已变化/);
 await change(schedule.id,'2026-10-18','test_pending');await assert.rejects(change(schedule.id,'2026-10-19','testing'),/后继/);
 const snapshot=await promotionSnapshot(db,schedule.id);assert.equal(snapshot.decisions[1].actualStatus,'test_pending');assert.equal(snapshot.decisions[1].reason,'隔离测试原因');
 const rows=await readPromotionTimeline(db,new Date('2026-10-21T12:00:00+08:00'),schedule.id),context=await readPromotionContext(db);const queue=promotionReviewQueue(promotionReviewDays(rows,context,new Date('2026-10-21T12:00:00+08:00')));
 assert.equal(queue.ready.length,1);assert.equal(queue.ready[0].day.defaultZero,true);assert.equal(queue.ready[0].day.actualStatus,'test_paused');assert.equal(queue.blocked.length,3);
});
test('终态当日保留未填指标行，实际数据不因暂停更正而删除',async()=>{
 const {schedule,campaign}=await seed();await db.insert(s.operationsPromotionDailyMetric).values({...metric('2026-10-17','testing','test_continue'),campaignId:campaign.id});
 await change(schedule.id,'2026-10-17','test_paused');let snap=await promotionSnapshot(db,schedule.id);assert.equal(snap.metrics.length,1);assert.equal(snap.metrics[0].spend,'40.00');assert.equal(snap.metrics[0].actualStatusSnapshot,'test_paused');
 await change(schedule.id,'2026-10-18','test_discarded');const rows=await readPromotionTimeline(db,new Date('2026-10-21T12:00:00+08:00'),schedule.id),context=await readPromotionContext(db);const queue=promotionReviewQueue(promotionReviewDays(rows,context,new Date('2026-10-21T12:00:00+08:00')));assert.equal(queue.ready[0].day.date,'2026-10-18');assert.equal(queue.ready[0].day.actualStatus,'test_discarded');
});
test('追加兼容迁移保留旧事实与冻结快照，解除等待零值限制且不补造历史零值',async()=>{
 const isolated=new PGlite();
 try{
  const prior=JSON.parse(await readFile(new URL('../drizzle/meta/0034_snapshot.json',import.meta.url),'utf8'));
  for(const sql of await generateMigration(generateDrizzleJson({}),prior))await isolated.exec(sql);
  const contentId=randomUUID(),versionId=randomUUID(),scheduleId=randomUUID(),campaignId=randomUUID(),factId=randomUUID(),reviewId=randomUUID();
  const frozen={schemaVersion:1,name:'隔离旧快照',rows:[{spend:40,actualOpenCount:4}],periodStart:'2026-01-01',periodEnd:'2026-01-01'};
  await isolated.exec(`
   INSERT INTO operations_subject(id,name,sort_order) VALUES ('legacy-review','隔离旧学科',1);
   INSERT INTO operations_category(id,name,sort_order) VALUES ('legacy-review','隔离旧分类',1);
   INSERT INTO operations_subject_category(subject_id,category_id) VALUES ('legacy-review','legacy-review');
   INSERT INTO operations_content(id) VALUES ('${contentId}');
   INSERT INTO operations_content_version(id,content_id,version_number,work_type,content_name,subject_id,category_id) VALUES ('${versionId}','${contentId}',0,'new','隔离旧事实','legacy-review','legacy-review');
   INSERT INTO operations_content_schedule(id,content_version_id,planned_publish_at,actual_publish_at,completion_status,is_promoted,promotion_status) VALUES ('${scheduleId}','${versionId}','2026-01-01T10:00:00+08:00','2026-01-01T10:00:00+08:00','on_time',true,'testing');
   INSERT INTO operations_promotion_campaign(id,schedule_id,started_on,initial_stage,current_stage,current_status) VALUES ('${campaignId}','${scheduleId}','2026-01-01','testing','testing','testing');
   INSERT INTO operations_promotion_daily_metric(id,campaign_id,metric_date,daily_status,stage_type_snapshot,spend,platform_open_count,actual_open_count,platform_lead_count,actual_lead_count,review_decision) VALUES ('${factId}','${campaignId}','2026-01-01','active','testing',40,5,4,2,2,'test_continue');
   INSERT INTO operations_promotion_stage_review(id,request_key,name,period_start,period_end,created_by_label) VALUES ('${reviewId}','${randomUUID()}','隔离旧快照','2026-01-01','2026-01-01','隔离管理员');
   INSERT INTO operations_promotion_stage_review_version(review_id,version_number,snapshot,created_by_label) VALUES ('${reviewId}',0,'${JSON.stringify(frozen)}','隔离管理员');
  `);
  const migration=await readFile(new URL('../drizzle/0036_precise_promotion_review.sql',import.meta.url),'utf8');await isolated.exec(migration);
  const constraints=await isolated.query<{conname:string}>("select conname from pg_constraint where conname='operations_promotion_daily_waiting_zero_check'");assert.equal(constraints.rows.length,0);
  const facts=await isolated.query<{spend:string;actual_status_snapshot:string|null;record_kind:string;source_stage_started_on:string|null}>('select * from operations_promotion_daily_metric');assert.equal(facts.rows.length,1);assert.equal(facts.rows[0].spend,'40.00');assert.equal(facts.rows[0].record_kind,'regular');assert.equal(facts.rows[0].actual_status_snapshot,null);assert.equal(facts.rows[0].source_stage_started_on,null);
  const snapshots=await isolated.query<{snapshot:unknown}>('select snapshot from operations_promotion_stage_review_version');assert.deepEqual(snapshots.rows[0].snapshot,frozen);
  await isolated.exec("update operations_promotion_daily_metric set daily_status='waiting_action',spend=17.5");const updated=await isolated.query<{spend:string}>('select spend from operations_promotion_daily_metric');assert.equal(updated.rows[0].spend,'17.50');
 }finally{await isolated.close();}
});

test('真实日度 API 原子保存 ID 与指标、幂等返回、T+1、非零等待与残留边界',async()=>{
 const {withDatabase}=await import('../src/db/client');const daily=await import('../src/pages/api/promotion-daily');
 const post=async(values:Record<string,unknown>)=>{const form=new FormData();for(const [key,value] of Object.entries(values))if(value!=null)form.set(key,String(value));const url=new URL('http://isolated.test/api/promotion-daily');return withDatabase(db,async()=>daily.POST({request:new Request(url,{method:'POST',headers:{origin:url.origin},body:form}),url,locals:{user:actor}} as never));};
 const {schedule,campaign}=await seed();await change(schedule.id,'2026-10-17','test_pending');const requestKey=randomUUID(),fingerprint=timelineFingerprint(await promotionSnapshot(db,schedule.id));
 const values={...metric('2026-10-17','test_pending','wait_continue'),campaignId:campaign.id,platformNoteId:null,requestKey,fingerprint};
 let response=await post(values);assert.equal(response.status,201,JSON.stringify(await response.clone().json()));const saved=await response.json();
 response=await post(values);assert.equal(response.status,201);assert.equal((await response.json()).id,saved.id);
 const facts=(await promotionSnapshot(db,schedule.id)).metrics;assert.equal(facts.length,1);assert.equal(facts[0].spend,'40.00');assert.equal(facts[0].sourceStageStartedOn,'2026-10-17');
 response=await post({...values,requestKey:randomUUID(),metricDate:'2026-10-18'});assert.equal(response.status,409,'旧指纹阻止覆盖');
 response=await post({...values,requestKey:randomUUID(),fingerprint:undefined,metricDate:'2026-10-21'});assert.equal(response.status,422,'T+1 阻止今天指标');
 response=await post({...values,requestKey:randomUUID(),fingerprint:undefined,metricDate:'2026-10-19'});assert.equal(response.status,409,'前一天未完成不可越过');
 await change(schedule.id,'2026-10-18','test_discarded');
 response=await post({...values,requestKey:randomUUID(),fingerprint:undefined,metricDate:'2026-10-18',actualStatusSnapshot:'test_discarded',reviewDecision:'test_discarded'});assert.equal(response.status,201,JSON.stringify(await response.clone().json()));
 const closed=(await promotionSnapshot(db,schedule.id)).campaigns[0];
 response=await post({...values,requestKey:randomUUID(),fingerprint:undefined,metricDate:'2026-10-20',recordKind:'test_residual',reviewDecision:'test_discarded'});assert.equal(response.status,201,JSON.stringify(await response.clone().json()));
 const after=await promotionSnapshot(db,schedule.id);assert.equal(after.campaigns[0].endedOn,closed.endedOn);assert.equal(after.campaigns[0].currentStatus,'test_discarded');assert.equal(after.metrics.at(-1)?.recordKind,'test_residual');
 response=await post({...values,requestKey:randomUUID(),fingerprint:undefined,metricDate:'2026-10-20',recordKind:'test_residual',reviewDecision:'test_discarded'});assert.equal(response.status,409,'重复日期禁止补录');
 const content=await db.select().from(s.operationsContent).where(eq(s.operationsContent.id,(await db.select().from(s.operationsContentVersion).where(eq(s.operationsContentVersion.id,schedule.contentVersionId)))[0].contentId));const url=new URL(`http://isolated.test/api/promotion-daily?noteId=${content[0].platformNoteId}`);response=await withDatabase(db,async()=>daily.GET({url} as never));const found=await response.json();assert.equal(found.residualCandidates[0].campaignId,campaign.id);assert.equal(found.residualCandidates[0].earliestDate,'2026-10-19');
});

test('历史 PATCH 保留暂停非零与残留原阶段，权限和兼容后续事实受保护',async()=>{
 const {withDatabase}=await import('../src/db/client');const api=await import('../src/pages/api/promotion-daily/[id]');
 const patch=async(id:string,values:Record<string,unknown>,user:{id:string;username:string;role:'admin'|'employee'}=actor)=>{const form=new FormData();for(const [key,value] of Object.entries(values))if(value!=null)form.set(key,String(value));const url=new URL(`http://isolated.test/api/promotion-daily/${id}`);return withDatabase(db,async()=>api.PATCH({request:new Request(url,{method:'PATCH',headers:{origin:url.origin},body:form}),url,params:{id},locals:{user}} as never));};
 const {campaign,schedule}=await seed();const [paused]=await db.insert(s.operationsPromotionDailyMetric).values({...metric('2026-10-17','testing','test_pause'),campaignId:campaign.id}).returning();const [next]=await db.insert(s.operationsPromotionDailyMetric).values({...metric('2026-10-18','test_paused','wait_continue'),campaignId:campaign.id}).returning();
 const staff={...actor,role:'employee' as const};let response=await patch(next.id,{...next,spend:90,actualOpenCount:3},staff);assert.equal(response.status,200);let saved=(await db.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.id,next.id)))[0];assert.equal(saved.spend,'90.00');assert.equal(saved.actualStatusSnapshot,'test_paused');assert.equal(saved.sourceStageStartedOn,'2026-10-17');
 response=await patch(paused.id,{...paused,reviewDecision:'test_pending'},staff);assert.equal(response.status,403,'员工不能改变已保存后续安排');
 response=await patch(paused.id,{...paused,reviewDecision:'test_pending'},actor);assert.equal(response.status,409);const preview=await response.json();assert.equal(preview.correctionRequired,true);assert.equal((await promotionSnapshot(db,schedule.id)).metrics.length,2,'影响预览不能写入');
 response=await patch(next.id,{...saved,actualStatusSnapshot:'scaling'},actor);assert.equal(response.status,422,'不能通过指标接口伪造实际状态');
 const residualCampaign=(await seed()).campaign;await db.update(s.operationsPromotionCampaign).set({endedOn:'2026-10-17',currentStage:null,currentStatus:'test_discarded'}).where(eq(s.operationsPromotionCampaign.id,residualCampaign.id));const [residual]=await db.insert(s.operationsPromotionDailyMetric).values({...metric('2026-10-20','test_discarded','test_discarded',{recordKind:'test_residual'}),campaignId:residualCampaign.id}).returning();response=await patch(residual.id,{...residual,spend:65},staff);assert.equal(response.status,200);saved=(await db.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.id,residual.id)))[0];assert.equal(saved.recordKind,'test_residual');assert.equal(saved.sourceStageStartedOn,'2026-10-17');assert.equal(saved.spend,'65.00');const terminal=(await db.select().from(s.operationsPromotionCampaign).where(eq(s.operationsPromotionCampaign.id,residualCampaign.id)))[0];assert.equal(terminal.endedOn,'2026-10-17');assert.equal(terminal.currentStatus,'test_discarded');
 response=await patch(residual.id,{...saved,reviewDecision:'start_scaling'},actor);assert.equal(response.status,422);
});
