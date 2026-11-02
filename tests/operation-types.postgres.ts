/** 0044在真实本机PostgreSQL上从0043结构迁移；不接共享库。 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import postgres from 'postgres';
import {generateDrizzleJson,generateMigration} from 'drizzle-kit/api';
import {createDatabase} from '../src/db/client';
import {eq} from 'drizzle-orm';
import * as s from '../src/db/schema';
import {saveOperationSetup} from '../src/db/operation-setup';
import {saveReviewPlan,addCustomNode,reviewIdentity} from '../src/db/non-promotion-plan';
const raw=process.env.TEST_POSTGRES_URL;assert(raw);const target=new URL(raw);assert(['127.0.0.1','localhost'].includes(target.hostname));
const maintenance=postgres(raw,{max:1}),name='qiuyun_non_plan_'+randomUUID().replaceAll('-','');await maintenance.unsafe(`create database "${name}"`);target.pathname='/'+name;
const sql=postgres(target.href,{max:1}),database=createDatabase(target.href),db=database.db;
try{
 const previous=JSON.parse(await readFile('drizzle/meta/0043_snapshot.json','utf8'));
 for(const statement of await generateMigration(generateDrizzleJson({}),previous))await sql.unsafe(statement);
 await sql.unsafe(`INSERT INTO operations_subject VALUES('tmua','TMUA',0); INSERT INTO operations_category VALUES('temporary','临时帖',0); INSERT INTO operations_subject_category(subject_id,category_id) VALUES('tmua','temporary');
 INSERT INTO operations_content(id,platform_note_id) VALUES('10000000-0000-4000-8000-000000000001','100000000000000000000001');
 INSERT INTO operations_content_version(id,content_id,version_number,work_type,content_name,subject_id,category_id) VALUES('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',0,'new','隔离迁移历史帖','tmua','temporary');
 INSERT INTO operations_content_schedule(id,content_version_id,planned_publish_at,actual_publish_at,completion_status) VALUES('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','2026-11-02 10:00+08','2026-11-02 10:00+08','on_time');
 INSERT INTO operations_content_performance_metric(schedule_id,checkpoint_type,recorded_through,click_rate,three_second_read_rate) VALUES('10000000-0000-4000-8000-000000000003','day_7','2026-11-09',12.3,45);`);
 const before=await sql`select to_jsonb(m) data from operations_content_performance_metric m`;
 await sql.begin(async tx=>{for(const statement of (await readFile('drizzle/0044_hard_molecule_man.sql','utf8')).split('--> statement-breakpoint'))if(statement.trim())await tx.unsafe(statement);});
 assert.deepEqual(await sql`select to_jsonb(m) data from operations_content_performance_metric m`,before);
 await sql`insert into operations_content_performance_metric(schedule_id,checkpoint_type,recorded_through,click_rate,three_second_read_rate) values('10000000-0000-4000-8000-000000000003','day_7','2026-11-09',13.1,46) on conflict(schedule_id,checkpoint_type) do update set click_rate=excluded.click_rate`;
 const scheduleId='10000000-0000-4000-8000-000000000003';
 await db.transaction(tx=>saveReviewPlan(tx,scheduleId,{mode:'continuous',day7:false,day15:false,expectedRevision:-1},'fixture'));
 const attempts=await Promise.allSettled([1,2].map(()=>db.transaction(async tx=>{await tx.select().from(s.operationsContent).where(eq(s.operationsContent.id,'10000000-0000-4000-8000-000000000001')).for('update');return addCustomNode(tx,scheduleId,'2026-11-03','fixture');})));
 assert.equal(attempts.filter(a=>a.status==='fulfilled').length,1,'真实并发仅建一个同日节点');
 const node=(await reviewIdentity(db,scheduleId)).nodes[0];
 await sql`insert into operations_content_performance_metric(schedule_id,checkpoint_type,custom_checkpoint_id,recorded_through,exposure_count,read_count,click_rate,three_second_read_rate) values(${scheduleId},${node.type},${node.nodeId},'2026-11-03',0,0,null,0)`;
 for(const [exposure,reads]of [[null,0],[1,null],[1,2],[-1,0]])await assert.rejects(()=>sql`update operations_content_performance_metric set exposure_count=${exposure},read_count=${reads} where custom_checkpoint_id=${node.nodeId}`);
 await assert.rejects(()=>sql`update operations_content_performance_metric set custom_checkpoint_id=null where checkpoint_type=${node.type}`);
 assert.equal((await db.select().from(s.operationsContentPerformanceMetric)).length,2);
 const changes=await Promise.allSettled((['non_promotion_standard','non_promotion_instant'] as const).map(operationType=>db.transaction(tx=>saveOperationSetup(tx,scheduleId,{operationType,reviewDueOn:'2026-11-03',reviewDay7:false,reviewDay15:false,expectedReviewRevision:0},'fixture'))));assert.equal(changes.filter(r=>r.status==='fulfilled').length,1,'运营配置真实并发只允许一个版本保存');
 assert.equal((await db.select().from(s.operationsContentPerformanceMetric)).length,2);
 console.log(JSON.stringify({passed:true,checks:['0043→0044真实PostgreSQL兼容迁移','旧指标逐字段保留与原唯一键upsert','真实并发追加去重与运营配置版本保护','空原始量/非法数量/节点身份约束','零曝光可保存空点击率']}));
}finally{await database.close();await sql.end();await maintenance.unsafe(`drop database "${name}" with (force)`);await maintenance.end();}
