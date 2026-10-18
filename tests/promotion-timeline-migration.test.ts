import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {generateDrizzleJson,generateMigration} from 'drizzle-kit/api';

test('推广时间线追加迁移保留事实，补齐待定来源；旧解析帖只跳过未完成节点',async()=>{
 const pg=new PGlite();
 try{
  const snapshot=JSON.parse(await readFile('drizzle/meta/0033_snapshot.json','utf8'));
  for(const statement of await generateMigration(generateDrizzleJson({}),snapshot))await pg.exec(statement);
  await pg.exec(`INSERT INTO operations_subject(id,name,sort_order) VALUES ('tmua','虚构学科',0);
   INSERT INTO operations_category(id,name,sort_order) VALUES ('first-analysis-series','虚构解析帖',0);
   INSERT INTO operations_subject_category(subject_id,category_id) VALUES ('tmua','first-analysis-series');
   INSERT INTO operations_category_policy_version(category_id,version_number,display_name,default_is_promoted,is_selectable,requires_non_promotion_review,effective_on,change_summary,changed_by_label) VALUES ('first-analysis-series',1,'虚构解析帖',false,true,false,'2026-08-31','原规则','虚构管理员');`);
  for(const [index,date] of ['2026-10-13','2026-10-14','2026-10-17'].entries()){
   await pg.exec(`INSERT INTO operations_content(id) VALUES ('10000000-0000-4000-8000-00000000000${index}');
    INSERT INTO operations_content_version(id,content_id,version_number,work_type,content_name,subject_id,category_id) VALUES ('20000000-0000-4000-8000-00000000000${index}','10000000-0000-4000-8000-00000000000${index}',0,'new','虚构迁移帖${index}','tmua','first-analysis-series');
    INSERT INTO operations_content_schedule(id,content_version_id,planned_publish_at,actual_publish_at,is_promoted,promotion_status,promotion_deferred_through,completion_status) VALUES ('30000000-0000-4000-8000-00000000000${index}','20000000-0000-4000-8000-00000000000${index}','${date} 18:00+08','${date} 18:00+08',${index===2},'${index===2?'awaiting_promotion':'none'}',${index===2?"'2026-10-18'":'NULL'},'on_time');`);
  }
  await pg.exec(`INSERT INTO operations_content_performance_metric(schedule_id,checkpoint_type,recorded_through,click_rate,three_second_read_rate) VALUES ('30000000-0000-4000-8000-000000000000','day_7','2026-10-20',12,34);`);
  const original=(await pg.query('SELECT * FROM operations_content_schedule ORDER BY id')).rows;
  await pg.exec(await readFile('drizzle/0034_promotion_business_timeline.sql','utf8'));
  assert.deepEqual((await pg.query('SELECT * FROM operations_content_schedule ORDER BY id')).rows,original);
  assert.deepEqual((await pg.query('SELECT waiting_through::text,planned_on FROM operations_promotion_start_plan')).rows,[{waiting_through:'2026-10-18',planned_on:null}]);
  assert.equal((await pg.query('SELECT * FROM operations_promotion_campaign')).rows.length,0);
  assert.equal((await pg.query<{action:string}>('SELECT action FROM operations_promotion_timeline_audit')).rows[0].action,'legacy_defer');
  assert.deepEqual((await pg.query<{requires_non_promotion_review:boolean}>('SELECT requires_non_promotion_review FROM operations_category_policy_version ORDER BY version_number')).rows.map(row=>row.requires_non_promotion_review),[false,true]);
  assert.deepEqual((await pg.query('SELECT checkpoint_type,action FROM operations_non_promotion_checkpoint_event')).rows,[{checkpoint_type:'day_15',action:'skip'}]);
  assert.equal((await pg.query<{click_rate:string}>('SELECT click_rate FROM operations_content_performance_metric')).rows[0].click_rate,'12.0000');
 }finally{await pg.close();}
});
