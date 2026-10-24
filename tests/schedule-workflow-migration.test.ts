import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';

test('追加迁移补齐历史逐日原因和临时分类，保留旧字段及复盘快照',async()=>{
  const pg=new PGlite();
  try {
    const snapshot=JSON.parse(await readFile('drizzle/meta/0027_snapshot.json','utf8'));
    for(const statement of await generateMigration(generateDrizzleJson({}),snapshot)) await pg.exec(statement);
    await pg.exec(`INSERT INTO operations_subject(id,name,sort_order) VALUES ('interview','面试课',0);
      INSERT INTO operations_content(id) VALUES ('10000000-0000-4000-8000-000000000001');
      INSERT INTO operations_content_version(id,content_id,version_number,work_type,content_name,subject_id)
        VALUES ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',0,'new','虚构旧帖','interview');
      INSERT INTO operations_content_schedule(id,content_version_id,planned_publish_at,actual_publish_at,completion_status,delay_reason)
        VALUES ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','2026-01-01T08:00:00+08:00','2026-01-10T16:00:00+08:00','delayed','需求没给'),
        ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','2026-02-01T08:00:00+08:00','2026-02-01T16:00:00+08:00','on_time',NULL);
      INSERT INTO operations_review_meeting(id,name,period_start,period_end,meeting_at,created_by_label) VALUES ('40000000-0000-4000-8000-000000000001','虚构历史周会','2026-01-01','2026-01-31','2026-01-31T12:00:00+08:00','虚构');
      INSERT INTO operations_review_meeting_version(meeting_id,version_number,snapshot,change_summary,finalized_by_label) VALUES ('40000000-0000-4000-8000-000000000001',0,'{"generated":{"nonPromotions":[{"categoryId":null,"clickRate":12}]}}','虚构快照','虚构');`);
    await pg.exec(await readFile('drizzle/0028_schedule_review_workflows.sql','utf8'));
    const reasons=(await pg.query<{schedule_id:string;reason:string;source:string;responsibility:string}>('SELECT * FROM operations_schedule_delay_reason')).rows;
    assert.equal(reasons.length,11); assert.equal(reasons.filter(row=>row.reason==='需求没给').length,10);
    assert.equal(reasons.filter(row=>row.reason==='未知').length,1); assert.ok(reasons.every(row=>row.source==='historical'&&row.responsibility==='unknown'));
    const rows=(await pg.query<{completion_status:string;delay_reason:string|null}>('SELECT completion_status,delay_reason FROM operations_content_schedule ORDER BY id')).rows;
    assert.equal(rows[1].completion_status,'delayed'); assert.equal(rows[0].delay_reason,'需求没给');
    assert.equal((await pg.query<{category_id:string}>('SELECT category_id FROM operations_content_version')).rows[0].category_id,'temporary');
    assert.equal((await pg.query('SELECT * FROM operations_schedule_plan_history')).rows.length,0);
    assert.deepEqual((await pg.query<{snapshot:unknown}>('SELECT snapshot FROM operations_review_meeting_version')).rows[0].snapshot,{generated:{nonPromotions:[{categoryId:null,clickRate:12}]}});
    await assert.rejects(pg.exec(`INSERT INTO operations_schedule_delay_reason(schedule_id,plan_revision,day_number,due_at,responsibility,reason,changed_by_label) VALUES ('30000000-0000-4000-8000-000000000001',0,1,now(),'self','重复','虚构')`),/unique constraint/);
  } finally { await pg.close(); }
});
