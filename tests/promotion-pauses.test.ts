import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { migrateFixture } from './migrate-fixture';
import * as schema from '../src/db/schema';
import {readFile} from 'node:fs/promises';
import {readPromotionContext} from '../src/db/promotion-pauses';
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
test('完整暂停日包含截止日，立即暂停当天仍需真实数据，提前恢复日不整日略过',()=>{
  const pause={id:'pause',startsAt:now,endsAt:new Date('2026-10-19T00:00:00+08:00')};
  assert.deepEqual(fullPauseRange(pause),{startedOn:'2026-10-16',endedOn:'2026-10-18'});
  assert.equal(pauseIsActive(pause,new Date('2026-10-18T23:59:59+08:00')),true);
  assert.equal(pauseIsActive(pause,new Date('2026-10-19T00:00:00+08:00')),false);
  assert.deepEqual(fullPauseRange({...pause,resumedAt:new Date('2026-10-17T10:00:00+08:00')}),{startedOn:'2026-10-16',endedOn:'2026-10-16'});
});
test('团队暂停退役结束有效批次，保留关联、历史窗口及原始事实',async()=>{
 const current=new Date(),start=new Date(current.getTime()-5*86400000),end=new Date(current.getTime()+5*86400000);
 const campaign=await seed('testing','testing');
 const [pause]=await db.insert(schema.operationsPromotionPause).values({requestKey:randomUUID(),startsAt:start,endsAt:end,reason:'虚构旧批次',createdById:actor.id,createdByLabel:actor.username,updatedById:actor.id,updatedByLabel:actor.username}).returning();
 await db.insert(schema.operationsPromotionPauseTarget).values({pauseId:pause.id,campaignId:campaign.id,stageType:'testing'});
 const [future]=await db.insert(schema.operationsPromotionPause).values({requestKey:randomUUID(),startsAt:new Date(current.getTime()+86400000),endsAt:end,reason:'虚构未来旧批次',createdById:actor.id,createdByLabel:actor.username,updatedById:actor.id,updatedByLabel:actor.username}).returning();
 await pg.exec(await readFile(new URL('../drizzle/0035_retire_team_promotion_pauses.sql',import.meta.url),'utf8'));
 const context=await readPromotionContext(db),retired=context.pauses.find(p=>p.id===pause.id)!;
 assert.ok(retired.resumedAt);assert.equal(retired.revision,1);assert.equal(retired.history.at(-1)?.action,'feature_retired');
 assert.equal(pauseIsActive(retired,new Date()),false);assert.equal(pauseIsActive(context.pauses.find(p=>p.id===future.id)!,new Date(current.getTime()+2*86400000)),false);assert.ok(fullPauseRange(retired));
 assert.equal(context.targets.length,1);assert.equal(effectivePromotionStatus('testing','testing',campaign.id,context,new Date()),'testing');
 assert.equal((await db.select().from(schema.operationsPromotionDailyMetric)).length,0);
 const before=retired.resumedAt.getTime();await pg.exec(await readFile(new URL('../drizzle/0035_retire_team_promotion_pauses.sql',import.meta.url),'utf8'));
 assert.equal((await db.select().from(schema.operationsPromotionPause).where(eq(schema.operationsPromotionPause.id,pause.id)))[0].resumedAt!.getTime(),before);
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
