import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {readFile} from 'node:fs/promises';
import {generateDrizzleJson,generateMigration} from 'drizzle-kit/api';
import * as schema from '../src/db/schema';
import {migrateFixture} from './migrate-fixture';
import {completionStatus,registrationState,requiresPlanApproval,delayDays} from '../src/db/schedule-rules.mjs';
import {changeSchedulePlan,readScheduleWorkflow,teamScheduleNotifications} from '../src/db/schedule-workflow';
import {registerPublication} from '../src/db/publication-workflow';
const pg=new PGlite(),db=drizzle(pg,{schema});
const employee={id:'fictional-employee',username:'虚构员工',role:'employee' as const};
const planned=new Date('2026-10-17T12:00:00+08:00');
const afterHours=(hours:number)=>new Date(planned.getTime()+hours*3600000);
before(()=>migrateFixture(pg));after(()=>pg.close());
async function seed(actualPublishAt:Date|null=null,delayThresholdHours=2){
  const [content]=await db.insert(schema.operationsContent).values({}).returning();
  const [version]=await db.insert(schema.operationsContentVersion).values({contentId:content.id,versionNumber:0,workType:'new',contentName:'虚构登记门槛验收',subjectId:'tmua',categoryId:'temporary'}).returning();
  return (await db.insert(schema.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:planned,actualPublishAt,delayThresholdHours,completionStatus:completionStatus(planned,actualPublishAt,delayThresholdHours)}).returning())[0];
}
test('2 小时临界点区分正常待发与尚未登记，已登记未来时间不催办',()=>{
  const schedule={plannedPublishAt:planned,actualPublishAt:null};
  assert.equal(registrationState(schedule,new Date(afterHours(2).getTime()-1)),'pending');
  assert.equal(registrationState(schedule,afterHours(2)),'missing');
  assert.equal(requiresPlanApproval(schedule,afterHours(2)),true);
  assert.equal(registrationState({...schedule,actualPublishAt:afterHours(30)},afterHours(4)),'registered');
  assert.equal(requiresPlanApproval({...schedule,actualPublishAt:afterHours(1)},afterHours(4)),false);
  assert.equal(delayDays(planned,afterHours(50)).length,3);
});
test('晚登记但实际按时，不要求延期理由；登记时间与实发时间分别留存',async()=>{
  const s=await seed();const now=afterHours(30);
  const before=await teamScheduleNotifications(db,now);
  assert.ok(before.missingRegistrationIds.includes(s.id));assert.ok(!before.missingReasonIds.includes(s.id));
  await registerPublication(db,s.id,{expectedPlanRevision:0,expectedPublicationRevision:0,actualPublishAt:afterHours(1),publicationUrl:'https://xhslink.cn/o/fixture',projectDocUrl:'https://fictional.example.test/doc'},[],false,employee,now);
  const w=await readScheduleWorkflow(db,s.id,undefined,now);
  assert.equal(w.schedule.completionStatus,'on_time');assert.equal(w.days.length,0);assert.equal(w.registrationState,'registered');
  assert.equal(w.publicationHistory[0].createdAt.getTime(),now.getTime());assert.equal(w.schedule.actualPublishAt?.getTime(),afterHours(1).getTime());
});
test('真实延期按 2 小时核对原因，失败不写入发布事实',async()=>{
  const s=await seed();const now=afterHours(28);
  const input={expectedPlanRevision:0,expectedPublicationRevision:0,actualPublishAt:afterHours(27),publicationUrl:'https://xhslink.cn/o/fixture',projectDocUrl:'https://fictional.example.test/doc'};
  await assert.rejects(registerPublication(db,s.id,input,[],false,employee,now),/每一天延期/);
  const w=await readScheduleWorkflow(db,s.id,input.actualPublishAt,now);assert.equal(w.days.length,2);assert.equal(w.schedule.actualPublishAt,null);
  const reasons=w.days.map(day=>({planRevision:day.planRevision,dayNumber:day.dayNumber,expectedUpdatedAt:null,responsibility:'self' as const,reason:'实际延期'}));
  await registerPublication(db,s.id,input,reasons,false,employee,now);
  assert.equal((await readScheduleWorkflow(db,s.id,undefined,now)).schedule.completionStatus,'delayed');
});
test('员工门槛前直接改期留痕，旧时间超时后不可用新时间绕过审批',async()=>{
  const early=await seed();await db.transaction(tx=>changeSchedulePlan(tx,early,afterHours(24),'提前调整',employee,afterHours(1)));
  const w=await readScheduleWorkflow(db,early.id,undefined,afterHours(1));assert.equal(w.history.length,1);assert.equal(w.history[0].delayThresholdHours,2);
  const late=await seed();await assert.rejects(db.transaction(tx=>changeSchedulePlan(tx,late,afterHours(24),'晚后调整',employee,afterHours(2))),error=>error instanceof Error && 'approvalRequired' in error && error.approvalRequired===true);
  assert.equal((await readScheduleWorkflow(db,late.id,undefined,afterHours(2))).schedule.planRevision,0);
  const registered=await seed(afterHours(1),8);await db.transaction(tx=>changeSchedulePlan(tx,registered,afterHours(-1),'更正应发时间',employee,afterHours(30)));
  assert.equal((await readScheduleWorkflow(db,registered.id,undefined,afterHours(30))).schedule.delayThresholdHours,8);
});
test('历史也按两小时判延期，已保存原因原日期保留',async()=>{
  const old=await seed(afterHours(4),8);const w=await readScheduleWorkflow(db,old.id,undefined,afterHours(30));
  assert.equal(w.schedule.completionStatus,'delayed');assert.equal(w.days.length,1);
  const pending=await seed();const dueAt=afterHours(8);
  await db.insert(schema.operationsScheduleDelayReason).values({scheduleId:pending.id,planRevision:0,dayNumber:1,dueAt,responsibility:'self',reason:'原记录',changedByLabel:'虚构员工'});
  const read=await readScheduleWorkflow(db,pending.id,undefined,afterHours(30));assert.equal(read.days[0].dueAt.getTime(),dueAt.getTime());assert.equal(read.days.length,2);
  // 回填按时实发只归档已有原因，不制造新的原因要求。
  const preview=await readScheduleWorkflow(db,pending.id,afterHours(1),afterHours(30));assert.equal(preview.days.length,1);assert.equal(preview.days[0].archived,true);
});
test('追加迁移只设置门槛快照，不改已登记事实、原因与旧修订',async()=>{
  const isolated=new PGlite();
  try{
    const snapshot=JSON.parse(await readFile('drizzle/meta/0031_snapshot.json','utf8'));
    for(const sql of await generateMigration(generateDrizzleJson({}),snapshot))await isolated.exec(sql);
    await isolated.exec(`INSERT INTO operations_subject(id,name,sort_order) VALUES ('tmua','虚构学科',0);
      INSERT INTO operations_category(id,name,sort_order) VALUES ('temporary','临时帖',0);
      INSERT INTO operations_subject_category(subject_id,category_id) VALUES ('tmua','temporary');
      INSERT INTO operations_content(id) VALUES ('10000000-0000-4000-8000-000000000001');
      INSERT INTO operations_content_version(id,content_id,version_number,work_type,content_name,subject_id,category_id) VALUES ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',0,'new','虚构旧帖','tmua','temporary');
      INSERT INTO operations_content_schedule(id,content_version_id,planned_publish_at,actual_publish_at,completion_status) VALUES
        ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','2026-10-17T12:00:00+08:00','2026-10-17T16:00:00+08:00','on_time'),
        ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','2026-10-17T12:00:00+08:00',NULL,'pending');
      INSERT INTO operations_schedule_plan_history(schedule_id,revision,planned_publish_at,ended_at,new_planned_publish_at,reason,changed_by_id,changed_by_label) VALUES ('30000000-0000-4000-8000-000000000002',0,'2026-10-16T12:00:00+08:00','2026-10-17T10:00:00+08:00','2026-10-17T12:00:00+08:00','原记录','fictional','虚构员工');`);
    const before=(await isolated.query('SELECT id,actual_publish_at,completion_status FROM operations_content_schedule ORDER BY id')).rows;
    await isolated.exec(await readFile('drizzle/0032_schedule_registration_deadline.sql','utf8'));
    assert.deepEqual((await isolated.query('SELECT id,actual_publish_at,completion_status FROM operations_content_schedule ORDER BY id')).rows,before);
    assert.deepEqual((await isolated.query<{delay_threshold_hours:number}>('SELECT delay_threshold_hours FROM operations_content_schedule ORDER BY id')).rows.map(row=>row.delay_threshold_hours),[8,2]);
    assert.equal((await isolated.query<{delay_threshold_hours:number}>('SELECT delay_threshold_hours FROM operations_schedule_plan_history')).rows[0].delay_threshold_hours,8);
  }finally{await isolated.close();}
});
test('统一两小时追加迁移修正旧状态、补齐各修订未知原因，保留人工原因与快照',async()=>{
 const isolated=new PGlite();
 try{
  const snapshot=JSON.parse(await readFile('drizzle/meta/0032_snapshot.json','utf8'));
  for(const statement of await generateMigration(generateDrizzleJson({}),snapshot))await isolated.exec(statement);
  await isolated.exec(`INSERT INTO operations_subject(id,name,sort_order) VALUES ('tmua','虚构学科',0);
   INSERT INTO operations_category(id,name,sort_order) VALUES ('temporary','临时帖',0);
   INSERT INTO operations_subject_category(subject_id,category_id) VALUES ('tmua','temporary');
   INSERT INTO operations_content(id) VALUES ('10000000-0000-4000-8000-000000000001');
   INSERT INTO operations_content_version(id,content_id,version_number,work_type,content_name,subject_id,category_id) VALUES ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',0,'new','虚构历史帖','tmua','temporary');
   INSERT INTO operations_content_schedule(id,content_version_id,planned_publish_at,actual_publish_at,completion_status,delay_threshold_hours,plan_revision,plan_effective_at) VALUES ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','2020-10-17T12:00:00+08:00','2020-10-17T16:00:00+08:00','on_time',8,1,'2020-10-16T16:00:00+08:00');
   INSERT INTO operations_schedule_plan_history(schedule_id,revision,planned_publish_at,ended_at,new_planned_publish_at,reason,changed_by_id,changed_by_label,delay_threshold_hours) VALUES ('30000000-0000-4000-8000-000000000001',0,'2020-10-15T12:00:00+08:00','2020-10-16T16:00:00+08:00','2020-10-17T12:00:00+08:00','原改期理由','fixture','虚构员工',8);
   INSERT INTO operations_schedule_delay_reason(schedule_id,plan_revision,day_number,due_at,responsibility,reason,source,changed_by_label,history) VALUES ('30000000-0000-4000-8000-000000000001',0,1,'2020-10-15T20:00:00+08:00','requester','原人工原因','manual','虚构员工','[{"reason":"原修订"}]');
   INSERT INTO operations_review_meeting(id,name,period_start,period_end,meeting_at,created_by_label) VALUES ('40000000-0000-4000-8000-000000000001','虚构旧会议','2020-10-01','2020-10-17','2020-10-18','虚构账号');
   INSERT INTO operations_review_meeting_version(meeting_id,version_number,snapshot,change_summary,finalized_by_label) VALUES ('40000000-0000-4000-8000-000000000001',0,'{"schemaVersion":2,"draft":{"coreConclusion":"冻结旧结论"}}','虚构快照','虚构账号');`);
  const frozen=(await isolated.query('SELECT * FROM operations_review_meeting_version')).rows;
  const saved=(await isolated.query('SELECT * FROM operations_schedule_delay_reason')).rows[0];
  const fact=(await isolated.query('SELECT planned_publish_at,actual_publish_at FROM operations_content_schedule')).rows[0];
  await isolated.exec(await readFile('drizzle/0033_account_permissions_two_hour_delay.sql','utf8'));
  const row=(await isolated.query<{delay_threshold_hours:number;completion_status:string}>('SELECT delay_threshold_hours,completion_status FROM operations_content_schedule')).rows[0];
  assert.deepEqual(row,{delay_threshold_hours:2,completion_status:'delayed'});
  assert.deepEqual((await isolated.query('SELECT planned_publish_at,actual_publish_at FROM operations_content_schedule')).rows[0],fact);
  assert.deepEqual((await isolated.query('SELECT * FROM operations_schedule_delay_reason WHERE source=\'manual\'')).rows[0],saved);
  const unknown=(await isolated.query<{reason:string;responsibility:string;plan_revision:number}>('SELECT reason,responsibility,plan_revision FROM operations_schedule_delay_reason WHERE source=\'historical\' ORDER BY plan_revision')).rows;
  assert.deepEqual(unknown,[{reason:'未知',responsibility:'unknown',plan_revision:0},{reason:'未知',responsibility:'unknown',plan_revision:1}]);
  assert.deepEqual((await isolated.query('SELECT * FROM operations_review_meeting_version')).rows,frozen);
  assert.equal((await isolated.query<{delay_threshold_hours:number}>('SELECT delay_threshold_hours FROM operations_schedule_plan_history')).rows[0].delay_threshold_hours,2);
 }finally{await isolated.close();}
});
