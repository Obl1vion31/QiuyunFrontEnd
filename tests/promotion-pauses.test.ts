import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { migrateFixture } from './migrate-fixture';
import * as schema from '../src/db/schema';
import { requiresAdmin } from '../src/auth/permissions';
import { createPromotionPause, guardPromotionStart, pauseCreateSchema, readPromotionContext, updatePromotionPause } from '../src/db/promotion-pauses';
import { campaignPauseWindows, countPromotionDays, effectivePromotionStatus, fullPauseRange, nextReviewDate, pauseIsActive, promotionReplayOptions, waitingPromotionDays } from '../src/db/promotion-state.mjs';
import { replayPromotionHistory } from '../src/db/promotion-rules.mjs';
const pg=new PGlite();const db=drizzle(pg,{schema});
const actor={id:'fictional-employee',username:'虚构员工',role:'employee' as const};
const now=new Date('2026-10-15T12:00:00+08:00');
before(()=>migrateFixture(pg));after(()=>pg.close());
async function seed(status:string,stage='scaling') {
  const [content]=await db.insert(schema.operationsContent).values({}).returning();
  const [version]=await db.insert(schema.operationsContentVersion).values({contentId:content.id,versionNumber:0,workType:'new',contentName:'虚构暂停测试帖',subjectId:'tmua',categoryId:'temporary'}).returning();
  const [schedule]=await db.insert(schema.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:now,actualPublishAt:now,isPromoted:true,promotionStatus:status,completionStatus:'on_time'}).returning();
  const [campaign]=await db.insert(schema.operationsPromotionCampaign).values({scheduleId:schedule.id,startedOn:'2026-10-01',currentStatus:status,currentStage:stage}).returning();return campaign;
}
test('员工拥有暂停、调整与恢复权限，其他管理入口保持原权限',()=>{
  assert.equal(requiresAdmin('/api/promotion-pauses','POST'),false);
  assert.equal(requiresAdmin('/api/promotion-pauses/id','PATCH'),false);
  assert.equal(requiresAdmin('/api/operations-annual-plans','POST'),true);
  assert.equal(pauseCreateSchema.safeParse({endsOn:'2026-02-30',requestKey:randomUUID()}).success,false);
});
test('完整暂停日包含截止日，立即暂停当天仍需真实数据，提前恢复日不整日略过',()=>{
  const pause={id:'pause',startsAt:now,endsAt:new Date('2026-10-19T00:00:00+08:00')};
  assert.deepEqual(fullPauseRange(pause),{startedOn:'2026-10-16',endedOn:'2026-10-18'});
  assert.equal(pauseIsActive(pause,new Date('2026-10-18T23:59:59+08:00')),true);
  assert.equal(pauseIsActive(pause,new Date('2026-10-19T00:00:00+08:00')),false);
  assert.deepEqual(fullPauseRange({...pause,resumedAt:new Date('2026-10-17T10:00:00+08:00')}),{startedOn:'2026-10-16',endedOn:'2026-10-16'});
});
test('5篇中只暂停3篇：幂等、并发防覆盖、员工调整截止与提前恢复，不修改原有等待',async()=>{
  const waitingA=await seed('waiting_action'),waitingB=await seed('waiting_action','testing');
  const running=await Promise.all([seed('scaling'),seed('scaling'),seed('testing','testing')]);
  const input={endsOn:'2026-10-18',requestKey:randomUUID(),reason:'虚构假期'};
  const results=await Promise.all([createPromotionPause(db,input,actor,now),createPromotionPause(db,input,actor,now)]);
  assert.equal(results[0].id,results[1].id);
  const context=await readPromotionContext(db);assert.equal(context.targets.length,3);
  assert.ok(context.targets.every(t=>running.some(c=>c.id===t.campaignId)));
  for(const c of running)assert.equal(effectivePromotionStatus(c.currentStatus,c.currentStage,c.id,context,now),'promotion_paused');
  assert.equal(effectivePromotionStatus(waitingA.currentStatus,waitingA.currentStage,waitingA.id,context,now),'promotion_paused');
  assert.equal(effectivePromotionStatus(waitingB.currentStatus,waitingB.currentStage,waitingB.id,context,now),'test_pending');
  assert.equal(campaignPauseWindows(waitingB,context).length,1);
  await assert.rejects(createPromotionPause(db,{...input,requestKey:randomUUID()},actor,now),/已有暂停/);
  await assert.rejects(db.transaction(tx=>guardPromotionStart(tx,'2026-10-15',now)),/节假日暂停/);
  await updatePromotionPause(db,results[0].id,{action:'extend',expectedRevision:0,endsOn:'2026-10-20'},actor,now);
  await assert.rejects(updatePromotionPause(db,results[0].id,{action:'resume',expectedRevision:0},actor,now),/已更新/);
  await updatePromotionPause(db,results[0].id,{action:'resume',expectedRevision:1},actor,new Date('2026-10-17T10:00:00+08:00'));
  const restored=await readPromotionContext(db);
  assert.equal(effectivePromotionStatus('testing','testing',running[2].id,restored,new Date('2026-10-18T00:00:00+08:00')),'testing');
  assert.equal((await db.select().from(schema.operationsPromotionCampaign).where(eq(schema.operationsPromotionCampaign.id,waitingB.id)))[0].currentStatus,'waiting_action');
  assert.equal((await db.select().from(schema.operationsPromotionDailyMetric)).length,0);
  assert.equal(restored.pauses[0].history.length,3);
});
test('暂停后首个复盘跨过整日窗口，历史回放不把假期算成投放天数',()=>{
  const campaign={id:'c',startedOn:'2026-10-15',initialStage:'scaling',currentStatus:'scaling'};
  const context={holds:[],targets:[{pauseId:'p',campaignId:'c'}],pauses:[{id:'p',startsAt:now,endsAt:new Date('2026-10-19T00:00:00+08:00')}]};
  const windows=campaignPauseWindows(campaign,context);
  assert.equal(nextReviewDate('2026-10-15',campaign.startedOn,windows),'2026-10-19');
  assert.equal(countPromotionDays('2026-10-15','2026-10-19',windows),2);
  assert.equal(waitingPromotionDays(campaign,context,['2026-10-16'],'2026-10-15','2026-10-19'),3,'暂停区间与已有等待日期不重复计数');
  const metrics=[{metricDate:'2026-10-15',stageTypeSnapshot:'scaling',dailyStatus:'active',reviewDecision:'scaling_continue'},{metricDate:'2026-10-19',stageTypeSnapshot:'scaling',dailyStatus:'active',reviewDecision:'scaling_continue'}];
  const replay=replayPromotionHistory(campaign.startedOn,metrics,promotionReplayOptions(campaign,context));
  assert.ok(replay);assert.deepEqual(replay.stages.map(s=>[s.startedOn,s.endedOn]),[['2026-10-15','2026-10-15'],['2026-10-19',null]]);
});
test('测试待定区间不生成指标，同阶段真实零投放继续计入原阶段',()=>{
  const hold={startedOn:'2026-08-17',endedOn:'2026-08-29',resumeStage:'scaling'};
  const replay=replayPromotionHistory('2026-08-16',[{metricDate:'2026-08-16',stageTypeSnapshot:'testing',reviewDecision:'wait_continue'},{metricDate:'2026-08-30',stageTypeSnapshot:'scaling',reviewDecision:'scaling_continue'}],{holds:[hold]});
  assert.ok(replay);assert.equal(replay.currentStatus,'scaling');assert.deepEqual(replay.stages.map(s=>[s.stageType,s.startedOn,s.endedOn]),[['testing','2026-08-16','2026-08-16'],['scaling','2026-08-30',null]]);
  assert.equal(countPromotionDays('2026-08-16','2026-08-18'),3);
});
