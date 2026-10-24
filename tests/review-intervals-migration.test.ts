import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
test('阶段复盘迁移只增加结构，保留既有会议快照并兼容旧应用写入',async()=>{
  const pg=new PGlite();try{
    const previous=JSON.parse(await readFile('drizzle/meta/0029_snapshot.json','utf8'));
    for(const statement of await generateMigration(generateDrizzleJson({}),previous))await pg.exec(statement);
    await pg.exec(`INSERT INTO operations_review_meeting(id,name,period_start,period_end,meeting_at,created_by_label) VALUES ('10000000-0000-4000-8000-000000000001','虚构旧会议','2026-10-01','2026-10-02','2026-10-03','虚构账号'); INSERT INTO operations_review_meeting_version(meeting_id,version_number,snapshot,change_summary,finalized_by_label) VALUES ('10000000-0000-4000-8000-000000000001',0,'{"schemaVersion":2,"draft":{"coreConclusion":"虚构旧结论"}}','虚构','虚构');`);
    const before=(await pg.query('SELECT snapshot FROM operations_review_meeting_version')).rows;
    await pg.exec(await readFile('drizzle/0030_review_intervals_snapshots.sql','utf8'));
    assert.deepEqual((await pg.query('SELECT snapshot FROM operations_review_meeting_version')).rows,before);
    await pg.exec(`INSERT INTO operations_review_meeting(name,period_start,period_end,meeting_at,created_by_label) VALUES ('虚构旧应用新建','2026-10-01','2026-10-02','2026-10-03','虚构账号')`);
    for(const name of ['operations_promotion_wait_range','operations_promotion_stage_review','operations_promotion_stage_review_version','operations_meeting_attachment'])assert.equal((await pg.query(`SELECT * FROM ${name}`)).rows.length,0);
  }finally{await pg.close()}
});
