import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {before,after,test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {eq} from 'drizzle-orm';
import {migrateFixture} from './migrate-fixture';
import * as s from '../src/db/schema';
import {changePromotionTimeline,promotionSnapshot,readPromotionTimeline,timelineFingerprint,timelineSchema} from '../src/db/promotion-timeline';
import {firstMissingPromotionDate} from '../src/db/promotion-state.mjs';
import {registerPublication} from '../src/db/publication-workflow';
import {publicationSchema} from '../src/db/validation';
import {inclusiveDays,isPendingPromotionRow,pendingPromotionPeriod,promotionPeriodRecords,promotionIntervalPreview} from '../src/db/promotion-pending';
const pg=new PGlite(),db=drizzle(pg,{schema:s});
const staff={id:'fictional-timeline-staff',username:'虚构日序员工',role:'employee' as const},admin={...staff,role:'admin' as const};
const now=new Date('2026-10-21T12:00:00+08:00');
before(()=>migrateFixture(pg));after(()=>pg.close());
async function seed(){const [content]=await db.insert(s.operationsContent).values({}).returning();const [version]=await db.insert(s.operationsContentVersion).values({contentId:content.id,versionNumber:0,workType:'new',contentName:'虚构日期测试帖',subjectId:'tmua',categoryId:'temporary'}).returning();return (await db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:new Date('2026-10-17T18:00:00+08:00'),actualPublishAt:new Date('2026-10-17T18:00:00+08:00'),isPromoted:true,promotionStatus:'awaiting_promotion',completionStatus:'on_time'}).returning())[0];}
async function input(id:string,values:Record<string,unknown>){return timelineSchema.parse({scheduleId:id,reviewDate:'2026-10-17',requestKey:randomUUID(),fingerprint:timelineFingerprint(await promotionSnapshot(db,id)),...values});}
test('没有活动明细的历史状态不能误作首次待办，也不能经接口重新开始',async()=>{
 for(const status of ['ended','test_discarded','formal_discarded','testing','scaling','waiting_action']){
  const row=await seed();await db.update(s.operationsContentSchedule).set({promotionStatus:status}).where(eq(s.operationsContentSchedule.id,row.id));
  const before=await promotionSnapshot(db,row.id),[view]=await readPromotionTimeline(db,now,row.id);
  assert.equal(view.promotionStatus,status);assert.equal(view.pending,false);assert.equal(view.canArrangeInitial,false);
  for(const actor of [staff,admin])for(const action of ['wait','start_testing','start_scaling'])await assert.rejects(changePromotionTimeline(db,await input(row.id,{action}),actor,now),/历史推广状态/);
  assert.deepEqual(await promotionSnapshot(db,row.id),before);
  assert.equal((await db.select().from(s.operationsPromotionTimelineAudit).where(eq(s.operationsPromotionTimelineAudit.scheduleId,row.id))).length,0);
 }
 const row=await seed(),[view]=await readPromotionTimeline(db,now,row.id);assert.equal(view.canArrangeInitial,true);assert.equal(view.pending,true);
});
test('首次待办锚定发布日期，待定末日保留空下一步；晚处理不跳日',async()=>{
 const row=await seed();let [view]=await readPromotionTimeline(db,now,row.id);assert.equal(view.date,'2026-10-17');
 await changePromotionTimeline(db,await input(row.id,{action:'wait',waitingThrough:'2026-10-20'}),staff,now);
 [view]=await readPromotionTimeline(db,new Date('2026-10-25T12:00:00+08:00'),row.id);assert.equal(view.date,'2026-10-20');assert.equal(view.plan?.plannedOn,null);assert.equal(view.campaign,null);
 await changePromotionTimeline(db,await input(row.id,{action:'plan',reviewDate:'2026-10-20',nextDecision:'start_scaling'}),staff,now);
 [view]=await readPromotionTimeline(db,now,row.id);assert.equal(view.plan?.plannedOn,'2026-10-21');assert.equal(view.campaign?.startedOn,'2026-10-21');assert.equal(view.campaign?.initialStage,'scaling');assert.equal(view.date,'2026-10-21');assert.equal((await promotionSnapshot(db,row.id)).metrics.length,0);
});
test('首次待定形成连续区间，包含中间日期且不产生指标；到期只保留原末日',async()=>{
 const row=await seed();await changePromotionTimeline(db,await input(row.id,{action:'wait',waitingThrough:'2026-10-20'}),staff,now);
 const day=new Date('2026-10-19T12:00:00+08:00'),[view]=await readPromotionTimeline(db,day,row.id),period=pendingPromotionPeriod(view,day)!;
 assert.equal(period.startedOn,'2026-10-17');assert.equal(period.endedOn,'2026-10-20');assert.equal(period.days,4);assert.equal(period.reviewOn,'2026-10-21');assert.equal(period.due,false);
 const records=promotionPeriodRecords(period,day);assert.deepEqual(records.map(row=>row.date),['2026-10-17','2026-10-18','2026-10-19','2026-10-20']);assert.equal(records[2].label,'待定中');
 assert.equal(isPendingPromotionRow({...view,pending:false},day),true,'团队暂停不抹掉已保存区间的展示');
 const late=pendingPromotionPeriod(view,new Date('2026-10-25T12:00:00+08:00'))!;assert.equal(late.endedOn,'2026-10-20');assert.equal(late.days,4);assert.equal(late.due,true);
 const snapshot=await promotionSnapshot(db,row.id);assert.equal(snapshot.metrics.length,0);assert.equal(snapshot.campaigns.length,0);
 assert.equal(pendingPromotionPeriod({...view,promotionStatus:'ended',canArrangeInitial:false},day),null);
});
test('测试待定与放量暂停保留各自阶段，缩短截止日与提前恢复同步连续记录',async()=>{
 for(const stage of ['testing','scaling']){
  const row=await seed();await changePromotionTimeline(db,await input(row.id,{action:stage==='testing'?'start_testing':'start_scaling'}),staff,now);
  await changePromotionTimeline(db,await input(row.id,{action:'pause',waitingThrough:'2026-10-20',reason:'临时暂停'}),staff,now);
  let [view]=await readPromotionTimeline(db,now,row.id),period=pendingPromotionPeriod(view,now)!;
  assert.equal(period.status,stage==='testing'?'测试待定中':'推广暂停中');assert.equal(period.days,4);assert.equal((await promotionSnapshot(db,row.id)).metrics.length,0);
  await changePromotionTimeline(db,await input(row.id,{action:'next',reviewDate:'2026-10-20',rangeId:period.range!.id,nextDecision:'wait_continue',waitingThrough:'2026-10-18',reason:'缩短区间'}),staff,now);
  [view]=await readPromotionTimeline(db,now,row.id);period=pendingPromotionPeriod(view,now)!;assert.equal(period.days,2);assert.equal(period.reviewOn,'2026-10-19');
  await changePromotionTimeline(db,await input(row.id,{action:stage==='testing'?'start_testing':'start_scaling',target:'day',reviewDate:'2026-10-18',reason:'十八日实际已恢复'}),staff,now);
  [view]=await readPromotionTimeline(db,now,row.id);assert.equal(pendingPromotionPeriod(view,now),null);assert.equal(view.campaign?.currentStatus,stage);assert.equal((await promotionSnapshot(db,row.id)).metrics.length,0);
 }
});
test('区间预览明确含首尾与下次复盘；长区间连续范围不展开成海量节点',()=>{
 assert.equal(inclusiveDays('2028-02-28','2028-03-01'),3);assert.match(promotionIntervalPreview('2026-10-17','2026-10-20')!,/共 4 天.*2026-10-21.*2026-10-20/);assert.equal(promotionIntervalPreview('2026-10-17','2026-10-16'),null);
 const records=promotionPeriodRecords({startedOn:'2026-10-17',endedOn:'2026-12-31',days:76,state:'待定',status:'待定中',untilLabel:'待定至',reviewOn:'2027-01-01',due:false,context:'尚未开始推广',range:undefined},now);
 assert.equal(records.length,10);assert.equal(records[7].gapBefore?.from,'2026-10-24');assert.equal(records[7].gapBefore?.to,'2026-12-28');assert.equal(records.at(-1)?.date,'2026-12-31');
});
test('直接放量不生成测试阶段或指标；重复请求仅创建一次',async()=>{
 const row=await seed(),body=await input(row.id,{action:'start_scaling'});
 await changePromotionTimeline(db,body,staff,now);await changePromotionTimeline(db,body,staff,now);
 const snapshot=await promotionSnapshot(db,row.id);assert.equal(snapshot.campaigns.length,1);assert.equal(snapshot.campaigns[0].initialStage,'scaling');assert.deepEqual(snapshot.stages.map(stage=>stage.stageType),['scaling']);assert.equal(snapshot.metrics.length,0);
});
test('区间内提前开始，保留前面的待定，取消余下待定',async()=>{
 const row=await seed();await changePromotionTimeline(db,await input(row.id,{action:'wait',waitingThrough:'2026-10-20'}),staff,now);
 const stale=await input(row.id,{action:'start_testing',reviewDate:'2026-10-18',reason:'实际提前开始'});
 await changePromotionTimeline(db,stale,staff,now);const snapshot=await promotionSnapshot(db,row.id);assert.equal(snapshot.plan?.waitingThrough,'2026-10-17');assert.equal(snapshot.campaigns[0].startedOn,'2026-10-18');
 await assert.rejects(changePromotionTimeline(db,{...stale,requestKey:randomUUID()},staff,now),/已变化/);
});
const metric=(campaignId:string,date:string)=>({campaignId,metricDate:date,dailyStatus:'active',stageTypeSnapshot:'testing',spend:'20.00',platformOpenCount:2,actualOpenCount:1,platformLeadCount:1,actualLeadCount:1,reviewDecision:'test_continue'});
test('历史开始日提前，保留兼容的18日数据，重新开放17日缺口',async()=>{
 const row=await seed();await changePromotionTimeline(db,await input(row.id,{action:'wait'}),staff,now);await changePromotionTimeline(db,await input(row.id,{action:'start_testing',reviewDate:'2026-10-18'}),staff,now);
 let snapshot=await promotionSnapshot(db,row.id);await db.insert(s.operationsPromotionDailyMetric).values(metric(snapshot.campaigns[0].id,'2026-10-18'));
 await changePromotionTimeline(db,await input(row.id,{action:'start_testing',reason:'核对后17日已经测试'}),admin,now);
 snapshot=await promotionSnapshot(db,row.id);assert.equal(snapshot.metrics.length,1);assert.equal(firstMissingPromotionDate(snapshot.metrics,snapshot.campaigns[0].startedOn),'2026-10-17');
});
test('更正首次开始日延后，冲突首日归档，后续兼容指标保留',async()=>{
 const row=await seed();await changePromotionTimeline(db,await input(row.id,{action:'start_testing'}),staff,now);let snapshot=await promotionSnapshot(db,row.id);const campaign=snapshot.campaigns[0];
 await db.insert(s.operationsPromotionDailyMetric).values(['2026-10-17','2026-10-18'].map(date=>metric(campaign.id,date)));
 const body=await input(row.id,{action:'start_testing',target:'initial',reviewDate:'2026-10-18',reason:'实际18日才开始'});const preview=await changePromotionTimeline(db,body,admin,now);assert.ok('confirmationRequired' in preview);if('confirmationRequired' in preview)assert.deepEqual(preview.impact.dates,['2026-10-17']);
 await changePromotionTimeline(db,{...body,confirmImpact:true},admin,now);snapshot=await promotionSnapshot(db,row.id);assert.equal(snapshot.campaigns[0].startedOn,'2026-10-18');assert.equal(snapshot.plan?.waitingThrough,'2026-10-17');assert.deepEqual(snapshot.metrics.map(row=>row.metricDate),['2026-10-18']);
});
test('当日暂停不需要笔记ID或指标，并可更正首个暂停日的实际状态',async()=>{
 const row=await seed();await changePromotionTimeline(db,await input(row.id,{action:'start_testing'}),staff,now);
 await changePromotionTimeline(db,await input(row.id,{action:'pause',reason:'当日没有实际投放'}),staff,now);
 let snapshot=await promotionSnapshot(db,row.id);assert.equal(snapshot.metrics.length,0);assert.equal(snapshot.campaigns[0].currentStatus,'waiting_action');
 await changePromotionTimeline(db,await input(row.id,{action:'start_testing',reason:'核对后实际已经测试'}),staff,now);
 snapshot=await promotionSnapshot(db,row.id);assert.equal(snapshot.campaigns[0].currentStatus,'testing');assert.equal(snapshot.ranges.length,0);
});
test('当日阶段覆盖后暂停保留原阶段，不能把已测试的前一天改成首次待定',async()=>{
 const row=await seed();await changePromotionTimeline(db,await input(row.id,{action:'start_testing'}),staff,now);let snapshot=await promotionSnapshot(db,row.id);await db.insert(s.operationsPromotionDailyMetric).values(metric(snapshot.campaigns[0].id,'2026-10-17'));
 await changePromotionTimeline(db,await input(row.id,{reviewDate:'2026-10-18',action:'start_scaling',reason:'当日直接转放量'}),staff,now);
 assert.equal((await promotionSnapshot(db,row.id)).plan?.waitingThrough,null);
 await changePromotionTimeline(db,await input(row.id,{reviewDate:'2026-10-18',action:'pause',reason:'当日放量临时暂停'}),staff,now);
 snapshot=await promotionSnapshot(db,row.id);assert.equal(snapshot.ranges[0].stageType,'scaling');assert.equal(snapshot.metrics.length,1);assert.equal(snapshot.decisions.length,1);
});
test('冲突指标先预览不落库，确认后保留原事实审计，并阻止员工破坏历史',async()=>{
 const row=await seed();await changePromotionTimeline(db,await input(row.id,{action:'start_testing'}),staff,now);let snapshot=await promotionSnapshot(db,row.id);await db.insert(s.operationsPromotionDailyMetric).values(metric(snapshot.campaigns[0].id,'2026-10-17'));
 const body=await input(row.id,{action:'start_scaling',reason:'历史阶段更正'});await assert.rejects(changePromotionTimeline(db,body,staff,now),/管理员/);
 const preview=await changePromotionTimeline(db,body,admin,now);assert.ok('confirmationRequired' in preview);assert.equal((await promotionSnapshot(db,row.id)).campaigns[0].initialStage,'testing');
 await changePromotionTimeline(db,{...body,confirmImpact:true},admin,now);snapshot=await promotionSnapshot(db,row.id);assert.equal(snapshot.metrics.length,0);assert.equal(snapshot.campaigns[0].initialStage,'scaling');
 const audits=await db.select().from(s.operationsPromotionTimelineAudit).where(eq(s.operationsPromotionTimelineAudit.requestKey,body.requestKey));assert.equal((audits[0].before.metrics as unknown[]).length,1);
});
test('更正发布时间也须确认首次待定影响，确认后清理计划并保留原始审计',async()=>{
 const row=await seed();await changePromotionTimeline(db,await input(row.id,{action:'wait',waitingThrough:'2026-10-20'}),staff,now);
 const body=publicationSchema.parse({actualPublishAt:'2026-10-17T19:00',publicationUrl:'https://www.xiaohongshu.com/explore/'+'a'.repeat(24),expectedPlanRevision:0,expectedPublicationRevision:0,correctionReason:'核对原发布时间'});
 const preview=await registerPublication(db,row.id,body,[],false,admin,now);assert.equal(preview.kind,'reset-required');assert.ok((await promotionSnapshot(db,row.id)).plan);
 await registerPublication(db,row.id,body,[],true,admin,now);const snapshot=await promotionSnapshot(db,row.id);assert.equal(snapshot.plan,null);assert.equal(snapshot.schedule.promotionDeferredThrough,null);assert.equal(snapshot.schedule.promotionStatus,'awaiting_promotion');
 const audit=await db.select().from(s.operationsPromotionTimelineAudit).where(eq(s.operationsPromotionTimelineAudit.scheduleId,row.id));assert.ok(audit.some(row=>row.action==='publication_reset'&&row.before.plan));
});
