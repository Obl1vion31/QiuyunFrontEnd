import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { migrateFixture } from './migrate-fixture';
import * as schema from '../src/db/schema';
import { delayDayCount, delayDays, isDelayed } from '../src/db/schedule-rules.mjs';
import { backfillHistoricalDelayReasons, changeSchedulePlan, createChangeRequest, decideChangeRequest,
  lockSchedule, readScheduleWorkflow, reasonSchema, saveDelayReason, teamScheduleNotifications } from '../src/db/schedule-workflow';
import { changeCheckpointState, readCheckpointEvents } from '../src/db/non-promotion-workflow';
import { stageReviewItemSchema } from '../src/db/stage-review-validation';
import { shanghaiDateTime } from '../src/db/validation';

const pg = new PGlite(); const db = drizzle(pg, { schema });
const employee = { id:'fictional-employee',username:'虚构员工',role:'employee' as const };
const admin = { id:'fictional-admin',username:'虚构管理员',role:'admin' as const };
const now = new Date('2026-10-15T16:00:00+08:00');
before(() => migrateFixture(pg)); after(() => pg.close());
async function seed(plannedAt: Date, actualAt: Date | null = null, reason: string | null = null) {
  const [content] = await db.insert(schema.operationsContent).values({}).returning();
  const [version] = await db.insert(schema.operationsContentVersion).values({ contentId:content.id,versionNumber:0,workType:'new',contentName:'虚构流程测试帖',subjectId:'tmua',categoryId:'temporary' }).returning();
  const [schedule] = await db.insert(schema.operationsContentSchedule).values({ contentVersionId:version.id,plannedPublishAt:plannedAt,actualPublishAt:actualAt,delayReason:reason,completionStatus:actualAt?'delayed':'pending' }).returning();
  return schedule;
}
test('满8小时开始第1天，此后每24小时增加一天，跨月跨年不变', () => {
  const planned = new Date('2026-12-31T08:00:00+08:00');
  assert.equal(isDelayed(planned,new Date('2026-12-31T15:59:59+08:00')),false);
  assert.equal(delayDayCount(planned,new Date('2026-12-31T16:00:00+08:00')),1);
  assert.equal(delayDayCount(planned,new Date('2027-01-01T15:59:59+08:00')),1);
  assert.equal(delayDayCount(planned,new Date('2027-01-01T16:00:00+08:00')),2);
  assert.equal(delayDayCount(planned,new Date('2027-01-09T16:00:00+08:00')),10);
  assert.equal(delayDays(planned,new Date('2027-01-01T16:00:00+08:00'))[1].dueAt.toISOString(),'2027-01-01T08:00:00.000Z');
  assert.equal(shanghaiDateTime.safeParse('2026-02-30T08:00').success,false);
});
test('历史原因逐日复制，空原因填未知，重复补齐保留人工更正', async () => {
  const schedule = await seed(new Date('2026-10-06T08:00:00+08:00'),now,'需求没给');
  await db.transaction(tx => backfillHistoricalDelayReasons(tx,schedule.id,now));
  let workflow = await readScheduleWorkflow(db,schedule.id,undefined,now);
  assert.equal(workflow.days.length,10); assert.ok(workflow.days.every(day => day.saved?.reason==='需求没给'&&day.saved.source==='historical'));
  await db.transaction(async tx => saveDelayReason(tx,await lockSchedule(tx,schedule.id),{ planRevision:0,dayNumber:1,responsibility:'requester',reason:'人工核对后的说明',expectedUpdatedAt:workflow.days[0].saved!.updatedAt.toISOString(),expectedHistoryLength:0 },employee,now));
  await assert.rejects(db.transaction(tx => saveDelayReason(tx,schedule,{planRevision:0,dayNumber:1,responsibility:'self',reason:'同毫秒的过期更正',expectedUpdatedAt:now.toISOString(),expectedHistoryLength:0},employee,now)),/已被更新/);
  await db.transaction(tx => backfillHistoricalDelayReasons(tx,schedule.id,now));
  workflow = await readScheduleWorkflow(db,schedule.id,undefined,now);
  assert.equal(workflow.days[0].saved?.reason,'人工核对后的说明'); assert.equal(workflow.days[0].saved?.history.length,1);
  const empty = await seed(new Date('2026-10-15T08:00:00+08:00'),now);
  await db.transaction(tx => backfillHistoricalDelayReasons(tx,empty.id,now));
  assert.equal((await readScheduleWorkflow(db,empty.id,undefined,now)).days[0].saved?.reason,'未知');
});
test('提交不改排期，重复申请被拒绝，同意后重计时并保留旧欠填', async () => {
  const schedule = await seed(new Date('2026-10-14T08:00:00+08:00'));
  const future = new Date('2026-10-17T08:00:00+08:00');
  const input = { plannedPublishAt:future,expectedPlanRevision:0,reason:'需求侧调整发布节奏' };
  const request = await createChangeRequest(db,schedule.id,input,employee,now);
  assert.equal((await readScheduleWorkflow(db,schedule.id,undefined,now)).schedule.plannedPublishAt.getTime(),schedule.plannedPublishAt.getTime());
  await assert.rejects(createChangeRequest(db,schedule.id,input,employee,now),/待审批申请/);
  await assert.rejects(decideChangeRequest(db,schedule.id,request.id,{action:'approve',reason:''},employee,now),/管理员/);
  await decideChangeRequest(db,schedule.id,request.id,{action:'approve',reason:''},admin,now);
  const workflow = await readScheduleWorkflow(db,schedule.id,undefined,now);
  assert.equal(workflow.schedule.planRevision,1); assert.equal(workflow.overdueDays,0);
  assert.equal(workflow.days.filter(day=>!day.saved).length,2); assert.equal(workflow.history.length,1);
  assert.equal(workflow.applications[0].decidedByLabel,admin.username);
  assert.equal((await readScheduleWorkflow(db,schedule.id,undefined,new Date('2026-10-17T16:00:00+08:00'))).overdueDays,1);
  await assert.rejects(decideChangeRequest(db,schedule.id,request.id,{action:'approve',reason:''},admin,now),/申请已处理/);
});
test('员工不能直接改期，管理员改期使旧申请失效', async () => {
  const schedule=await seed(new Date('2026-10-14T08:00:00+08:00'));
  const input={plannedPublishAt:new Date('2026-10-18T08:00:00+08:00'),expectedPlanRevision:0,reason:'虚构申请'};
  const request=await createChangeRequest(db,schedule.id,input,employee,now);
  await assert.rejects(db.transaction(tx=>changeSchedulePlan(tx,schedule,input.plannedPublishAt,'虚构直接修改',employee,now)),/管理员/);
  await db.transaction(tx=>changeSchedulePlan(tx,schedule,new Date('2026-10-19T08:00:00+08:00'),'管理员改期',admin,now));
  assert.equal((await readScheduleWorkflow(db,schedule.id,undefined,now)).applications[0].status,'obsolete');
  await assert.rejects(decideChangeRequest(db,schedule.id,request.id,{action:'approve',reason:''},admin,now),/申请已处理/);
});
test('逐日理由只接受到期日期，必填责任方与文字，拒绝覆盖并发更正', async () => {
  const schedule=await seed(new Date('2026-10-15T08:00:00+08:00'));
  const input={planRevision:0,dayNumber:1,responsibility:'self' as const,reason:'今日正在修改中',expectedUpdatedAt:null};
  assert.equal(reasonSchema.safeParse({...input,responsibility:'unknown'}).success,false);
  assert.equal(reasonSchema.safeParse({...input,reason:'  '}).success,false);
  await assert.rejects(db.transaction(tx=>saveDelayReason(tx,schedule,{...input,dayNumber:2},employee,now)),/尚未进入延期/);
  await db.transaction(tx=>saveDelayReason(tx,schedule,input,employee,now));
  await assert.rejects(db.transaction(tx=>saveDelayReason(tx,schedule,input,employee,now)),/已被更新/);
  const notifications=await teamScheduleNotifications(db,now);
  assert.ok(notifications.overdueIds.includes(schedule.id)); assert.ok(!notifications.missingReasonIds.includes(schedule.id));
});
test('按节点跳过不需要笔记ID或指标，首轮跳过后二轮开放，恢复保留后续状态', async () => {
  const schedule=await seed(new Date('2026-09-20T08:00:00+08:00'),new Date('2026-09-20T08:00:00+08:00'));
  const action={scheduleId:schedule.id,checkpointType:'day_7' as const,action:'skip' as const,reason:'平台数据无法获取',expectedEventId:null};
  await assert.rejects(changeCheckpointState(db,{...action,checkpointType:'day_15'},employee,now),/顺序/);
  await changeCheckpointState(db,action,employee,now);
  const first=(await readCheckpointEvents(db,schedule.id)).get(`${schedule.id}:day_7`)!;
  await changeCheckpointState(db,{...action,checkpointType:'day_15'},employee,now);
  await changeCheckpointState(db,{...action,action:'restore',reason:'数据已恢复',expectedEventId:first.id},employee,now);
  const states=await readCheckpointEvents(db,schedule.id);
  assert.equal(states.get(`${schedule.id}:day_7`)?.action,'restore'); assert.equal(states.get(`${schedule.id}:day_15`)?.action,'skip');
  assert.equal((await db.select().from(schema.operationsContentPerformanceMetric).where(eq(schema.operationsContentPerformanceMetric.scheduleId,schedule.id))).length,0);
  await assert.rejects(db.delete(schema.operationsContentSchedule).where(eq(schema.operationsContentSchedule.id,schedule.id)), (error: unknown) => /foreign key/.test((error as {cause?:{message?:string}}).cause?.message ?? ''));
});
test('缺失指标不能被转换成零', () => {
  const input={scheduleId:'10000000-0000-4000-8000-000000000001',checkpointType:'day_7',recordedThrough:'2026-10-15',clickRate:'',threeSecondReadRate:'',conclusion:''};
  assert.equal(stageReviewItemSchema.safeParse(input).success,false);
  assert.equal(stageReviewItemSchema.safeParse({...input,clickRate:'0',threeSecondReadRate:'0'}).success,true);
});
