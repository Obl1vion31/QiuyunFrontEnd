import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import {cleanDelayRequest,pruneScheduleDelayReasons} from '../src/db/schedule-delay-cleanup';
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
test('满2小时开始第1天，此后每24小时增加一天，跨月跨年不变', () => {
  const planned = new Date('2026-12-31T08:00:00+08:00');
  assert.equal(isDelayed(planned,new Date('2026-12-31T09:59:59+08:00')),false);
  assert.equal(delayDayCount(planned,new Date('2026-12-31T10:00:00+08:00')),1);
  assert.equal(delayDayCount(planned,new Date('2027-01-01T09:59:59+08:00')),1);
  assert.equal(delayDayCount(planned,new Date('2027-01-01T10:00:00+08:00')),2);
  assert.equal(delayDayCount(planned,new Date('2027-01-09T10:00:00+08:00')),10);
  assert.equal(delayDays(planned,new Date('2027-01-01T10:00:00+08:00'))[1].dueAt.toISOString(),'2027-01-01T02:00:00.000Z');
  assert.equal(shanghaiDateTime.safeParse('2026-02-30T08:00').success,false);
});
test('历史补齐仅生成当前排期未知原因，不复制旧文本，重复补齐保留人工更正', async () => {
  const schedule = await seed(new Date('2026-10-06T08:00:00+08:00'),now,'需求没给');
  await db.transaction(tx => backfillHistoricalDelayReasons(tx,schedule.id,now));
  let workflow = await readScheduleWorkflow(db,schedule.id,undefined,now);
  assert.equal(workflow.days.length,10); assert.ok(workflow.days.every(day => day.saved?.reason==='未知'&&day.saved.source==='historical'));
  await db.transaction(async tx => saveDelayReason(tx,await lockSchedule(tx,schedule.id),{ planRevision:0,dayNumber:1,responsibility:'requester',reason:'人工核对后的说明',expectedUpdatedAt:workflow.days[0].saved!.updatedAt.toISOString(),expectedHistoryLength:0 },employee,now));
  await assert.rejects(db.transaction(tx => saveDelayReason(tx,schedule,{planRevision:0,dayNumber:1,responsibility:'self',reason:'同毫秒的过期更正',expectedUpdatedAt:now.toISOString(),expectedHistoryLength:0},employee,now)),/已被更新/);
  await db.transaction(tx => backfillHistoricalDelayReasons(tx,schedule.id,now));
  workflow = await readScheduleWorkflow(db,schedule.id,undefined,now);
  assert.equal(workflow.days[0].saved?.reason,'人工核对后的说明'); assert.equal(workflow.days[0].saved?.history.length,1);
  const empty = await seed(new Date('2026-10-15T08:00:00+08:00'),now);
  await db.transaction(tx => backfillHistoricalDelayReasons(tx,empty.id,now));
  assert.equal((await readScheduleWorkflow(db,empty.id,undefined,now)).days[0].saved?.reason,'未知');
});
test('提交不改排期，重复申请被拒绝，同意后只按新排期计时并删除旧欠填', async () => {
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
  assert.equal(workflow.days.filter(day=>!day.saved).length,0); assert.equal(workflow.history.length,1);
  assert.equal(workflow.applications[0].decidedByLabel,admin.username);
  assert.equal((await readScheduleWorkflow(db,schedule.id,undefined,new Date('2026-10-17T16:00:00+08:00'))).overdueDays,1);
  await assert.rejects(decideChangeRequest(db,schedule.id,request.id,{action:'approve',reason:''},admin,now),/申请已处理/);
});
test('员工不能直接改期，管理员改期使旧申请失效', async () => {
  const schedule=await seed(new Date('2026-10-14T08:00:00+08:00'));
  const input={plannedPublishAt:new Date('2026-10-18T08:00:00+08:00'),expectedPlanRevision:0,reason:'虚构申请'};
  const request=await createChangeRequest(db,schedule.id,input,employee,now);
  await assert.rejects(db.transaction(tx=>changeSchedulePlan(tx,schedule,input.plannedPublishAt,'虚构直接修改',employee,now)),/管理员审核/);
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
test('整篇不复盘覆盖未到期轮次，恢复有并发保护并保留原始指标',async()=>{
 const schedule=await seed(now,now);
 const input={scheduleId:schedule.id,checkpointType:'day_7' as const,scope:'schedule' as const,action:'skip' as const,reason:'该篇不复盘',expectedEventId:null,expectedEvents:{day_7:null,day_15:null}};
 await changeCheckpointState(db,input,employee,now);
 let states=await readCheckpointEvents(db,schedule.id);assert.equal(states.size,2);assert.ok([...states.values()].every(row=>row.action==='skip'));
 await assert.rejects(changeCheckpointState(db,{...input,action:'restore'},employee,now),/已更新/);
 await changeCheckpointState(db,{...input,action:'restore',expectedEventId:states.get(`${schedule.id}:day_7`)!.id,expectedEvents:Object.fromEntries([...states.values()].map(row=>[row.checkpointType,row.id]))},employee,now);
 states=await readCheckpointEvents(db,schedule.id);assert.ok([...states.values()].every(row=>row.action==='restore'));
 await db.insert(schema.operationsContentPerformanceMetric).values({scheduleId:schedule.id,checkpointType:'day_7',recordedThrough:'2026-10-15',clickRate:'10',threeSecondReadRate:'20'});
 await changeCheckpointState(db,{...input,expectedEventId:states.get(`${schedule.id}:day_7`)!.id,expectedEvents:Object.fromEntries([...states.values()].map(row=>[row.checkpointType,row.id]))},employee,now);
 states=await readCheckpointEvents(db,schedule.id);assert.equal(states.get(`${schedule.id}:day_7`)!.action,'restore');assert.equal(states.get(`${schedule.id}:day_15`)!.action,'skip');
});


test('改期清空已填原因及更正历史，无变更、失败、驳回保留原原因，旧页面提交被拒绝',async()=>{
 const schedule=await seed(new Date('2026-10-14T08:00:00+08:00'),null,'不应复用的旧文字');
 const input={planRevision:0,dayNumber:1,responsibility:'self' as const,reason:'旧原因',expectedUpdatedAt:null};
 await db.transaction(tx=>saveDelayReason(tx,schedule,input,employee,now));
 await db.transaction(tx=>changeSchedulePlan(tx,schedule,schedule.plannedPublishAt,'',admin,now));
 assert.equal((await db.select().from(schema.operationsScheduleDelayReason).where(eq(schema.operationsScheduleDelayReason.scheduleId,schedule.id))).length,1);
 const future=new Date('2026-10-17T08:00:00+08:00');
 const request=await createChangeRequest(db,schedule.id,{plannedPublishAt:future,expectedPlanRevision:0,reason:'申请调整'},employee,now);
 await decideChangeRequest(db,schedule.id,request.id,{action:'reject',reason:'暂不调整'},admin,now);
 assert.equal((await readScheduleWorkflow(db,schedule.id,undefined,now)).days[0].saved?.reason,'旧原因');
 await assert.rejects(db.transaction(async tx=>{await changeSchedulePlan(tx,schedule,future,'调整日期',admin,now);throw new Error('事务回滚')}),/事务回滚/);
 assert.equal((await readScheduleWorkflow(db,schedule.id,undefined,now)).days[0].saved?.reason,'旧原因');
 await db.transaction(tx=>changeSchedulePlan(tx,schedule,future,'调整日期',admin,now));
 assert.equal((await db.select().from(schema.operationsScheduleDelayReason).where(eq(schema.operationsScheduleDelayReason.scheduleId,schedule.id))).length,0);
 const latest=(await readScheduleWorkflow(db,schedule.id,undefined,now)).schedule;
 assert.equal(latest.delayReason,null);
 await assert.rejects(db.transaction(tx=>saveDelayReason(tx,latest,input,employee,now)),/排期已更新/);
 assert.equal((await readScheduleWorkflow(db,schedule.id,undefined,now)).days.length,0);
});

test('实发后更正应发仍按最新应发时间计算，不受改期操作时间截断',async()=>{
 const actual=new Date('2026-10-23T18:00:00+08:00'),at=new Date('2026-10-24T12:00:00+08:00');
 const schedule=await seed(new Date('2026-10-20T18:00:00+08:00'),actual);
 await db.transaction(tx=>changeSchedulePlan(tx,schedule,new Date('2026-10-22T18:00:00+08:00'),'核对应发',admin,at));
 const workflow=await readScheduleWorkflow(db,schedule.id,undefined,at);
 assert.equal(workflow.days.length,1);assert.equal(workflow.days[0].planRevision,1);
 assert.equal(workflow.days[0].dueAt.toISOString(),'2026-10-22T12:00:00.000Z');assert.equal(workflow.delayLabel,'较最新排期晚发布 1 天');
});

test('原因清理覆盖审批与推广快照及multipart请求，保留其他业务字段并且幂等',async()=>{
 const schedule=await seed(new Date('2026-10-14T08:00:00+08:00'));
 await db.insert(schema.authUser).values({id:employee.id,name:'虚构员工',username:'fixture-delay',email:'fixture-delay@example.test'}).onConflictDoNothing();
 const [reason]=await db.insert(schema.operationsScheduleDelayReason).values({scheduleId:schedule.id,planRevision:0,dayNumber:1,dueAt:now,responsibility:'self',reason:'旧的私有原因',changedByLabel:'虚构员工',history:[{reason:'更旧的原因'}]}).returning();
 const before={schedule:{...schedule,delayReason:'旧的私有原因'},reasons:[reason],metrics:[{spend:'123'}]};
 const form=new FormData();form.set('dailyReasons',JSON.stringify([{planRevision:0,dayNumber:1,reason:'旧的私有原因'}]));form.set('publicationUrl','https://xhslink.cn/o/fixture');
 const response=new Response(form),body=await response.text(),contentType=response.headers.get('content-type')!;
 const [proposal]=await db.insert(schema.operationsChangeProposal).values({requestedById:employee.id,requestedByLabel:'虚构员工',module:'schedule',target:`schedule:${schedule.id}`,operations:['schedule.correctPublication'],path:`/api/operations-content/${schedule.id}/publication`,method:'PATCH',contentType,body,fingerprint:'fixture',requestKey:crypto.randomUUID(),before:before as any,after:before as any}).returning();
 await db.insert(schema.operationsPromotionTimelineAudit).values({scheduleId:schedule.id,requestKey:crypto.randomUUID(),businessDate:'2026-10-15',action:'fixture',reason:'保留推广原因',before:before as any,after:before as any,changedById:employee.id,changedByLabel:'虚构员工'});
 await db.transaction(tx=>changeSchedulePlan(tx,schedule,new Date('2026-10-17T08:00:00+08:00'),'保留改期原因',admin,now));
 const [clean]=await db.select().from(schema.operationsChangeProposal).where(eq(schema.operationsChangeProposal.id,proposal.id));
 assert.equal(clean.status,'obsolete');assert.equal(JSON.stringify(clean).includes('旧的私有原因'),false);assert.equal(JSON.stringify(clean.before.metrics),JSON.stringify(before.metrics));
 const parsed=await new Request('http://fixture.test',{method:'POST',headers:{'Content-Type':clean.contentType},body:clean.body}).formData();
 assert.equal(parsed.get('dailyReasons'),'[]');assert.equal(parsed.get('publicationUrl'),'https://xhslink.cn/o/fixture');
 const latest=(await readScheduleWorkflow(db,schedule.id,undefined,now)).schedule;
 assert.deepEqual(await db.transaction(tx=>pruneScheduleDelayReasons(tx,latest,now)),{deleted:0,snapshots:0,legacyCleared:false});
 const audit=(await db.select().from(schema.operationsPromotionTimelineAudit).where(eq(schema.operationsPromotionTimelineAudit.scheduleId,schedule.id)))[0];assert.equal(audit.reason,'保留推广原因');assert.equal(JSON.stringify(audit).includes('旧的私有原因'),false);
 const json=await cleanDelayRequest(JSON.stringify({planRevision:0,dayNumber:1,reason:'旧原因'}),'application/json','/api/operations-content/id/delay-reasons',1,new Set());assert.equal(json.body.includes('旧原因'),false);
});
