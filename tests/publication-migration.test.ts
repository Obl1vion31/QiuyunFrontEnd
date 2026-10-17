import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {generateDrizzleJson,generateMigration} from 'drizzle-kit/api';
test('预约迁移兼容旧记录和旧写入，不补造发布证据或预约',async()=>{
 const pg=new PGlite();try{
  const previous=JSON.parse(await readFile('drizzle/meta/0030_snapshot.json','utf8'));
  for(const statement of await generateMigration(generateDrizzleJson({}),previous))await pg.exec(statement);
  await pg.exec(`INSERT INTO operations_subject VALUES('tmua','TMUA',0); INSERT INTO operations_category VALUES('temporary','临时帖',0); INSERT INTO operations_subject_category(subject_id,category_id) VALUES('tmua','temporary');
  INSERT INTO operations_content(id) VALUES('10000000-0000-4000-8000-000000000001');
  INSERT INTO operations_content_version(id,content_id,version_number,work_type,content_name,subject_id,category_id) VALUES('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',0,'new','虚构历史帖','tmua','temporary');
  INSERT INTO operations_content_schedule(content_version_id,planned_publish_at,actual_publish_at,completion_status) VALUES('10000000-0000-4000-8000-000000000002','2026-10-01 12:00+08','2026-10-01 12:00+08','on_time');`);
  const before=(await pg.query('SELECT actual_publish_at,completion_status FROM operations_content_schedule')).rows;
  await pg.exec(await readFile('drizzle/0031_publication_reservations.sql','utf8'));
  assert.deepEqual((await pg.query('SELECT actual_publish_at,completion_status FROM operations_content_schedule')).rows,before);
  assert.deepEqual((await pg.query('SELECT publication_url,publication_revision FROM operations_content_schedule')).rows,[{publication_url:null,publication_revision:0}]);
  await pg.exec(`INSERT INTO operations_content_schedule(content_version_id,planned_publish_at,completion_status) VALUES('10000000-0000-4000-8000-000000000002','2026-11-01 12:00+08','pending')`);
  for(const name of ['operations_publication_event','operations_publication_reservation'])assert.equal((await pg.query(`SELECT * FROM ${name}`)).rows.length,0);
 }finally{await pg.close()}
});
