import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
test('暂停迁移兼容旧应用写入，识别历史首阶段并保持原事实',async()=>{
  const pg=new PGlite();
  try {
    const snapshot=JSON.parse(await readFile('drizzle/meta/0028_snapshot.json','utf8'));
    for(const statement of await generateMigration(generateDrizzleJson({}),snapshot))await pg.exec(statement);
    await pg.exec(`INSERT INTO operations_subject(id,name,sort_order) VALUES ('tmua','虚构学科',0);
      INSERT INTO operations_category(id,name,sort_order) VALUES ('temporary','虚构分类',0);
      INSERT INTO operations_subject_category(subject_id,category_id) VALUES ('tmua','temporary');
      INSERT INTO operations_content(id) VALUES ('10000000-0000-4000-8000-000000000001');
      INSERT INTO operations_content_version(id,content_id,version_number,work_type,content_name,subject_id,category_id) VALUES ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',0,'new','虚构历史帖','tmua','temporary');
      INSERT INTO operations_content_schedule(id,content_version_id,planned_publish_at,is_promoted,promotion_status,completion_status) VALUES ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','2026-01-01',true,'scaling','pending');
      INSERT INTO operations_promotion_campaign(id,schedule_id,started_on,current_stage,current_status) VALUES ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2026-01-01','scaling','scaling');
      INSERT INTO operations_promotion_stage(campaign_id,stage_type,started_on) VALUES ('40000000-0000-4000-8000-000000000001','scaling','2026-01-01');`);
    await pg.exec(await readFile('drizzle/0029_promotion_pauses.sql','utf8'));
    assert.equal((await pg.query<{initial_stage:string}>('SELECT initial_stage FROM operations_promotion_campaign')).rows[0].initial_stage,'scaling');
    await pg.exec(`INSERT INTO operations_promotion_campaign(schedule_id,started_on,current_stage,current_status) VALUES ('30000000-0000-4000-8000-000000000001','2026-02-01','testing','testing');`);
    const states=(await pg.query<{current_status:string;initial_stage:string}>('SELECT current_status, initial_stage FROM operations_promotion_campaign ORDER BY started_on')).rows;
    assert.deepEqual(states,[{current_status:'scaling',initial_stage:'scaling'},{current_status:'testing',initial_stage:'testing'}]);
    assert.equal((await pg.query('SELECT * FROM operations_promotion_pause')).rows.length,0);
    assert.equal((await pg.query('SELECT * FROM operations_promotion_daily_metric')).rows.length,0);
  } finally {await pg.close();}
});
