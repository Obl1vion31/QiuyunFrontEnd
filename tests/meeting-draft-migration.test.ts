import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {generateDrizzleJson,generateMigration} from 'drizzle-kit/api';
test('0040保留所有旧快照，并把初始草稿和未完成讨论迁入独立版本草稿',async()=>{
 const pg=new PGlite();try{
  const old=JSON.parse(await readFile(new URL('../drizzle/meta/0039_snapshot.json',import.meta.url),'utf8'));
  for(const sql of await generateMigration(generateDrizzleJson({}),old))await pg.exec(sql);
  const base={schemaVersion:4,workflowVersion:5,coreConclusion:'旧内容',nextAction:'行动',promotionInputs:{},issues:[],nonPromotionSelections:[]};
  const frozen={schemaVersion:4,finalizationStage:'post',draft:base,generated:{summary:{spend:123.45},promotions:[],nonPromotions:[]}};
  await pg.query(`INSERT INTO operations_review_meeting(id,name,period_start,period_end,meeting_at,status,current_version_number,draft_snapshot,created_by_label) VALUES ('11111111-1111-4111-8111-111111111111','旧草稿','2026-10-16','2026-10-24',now(),'draft',0,$1,'fixture'),('22222222-2222-4222-8222-222222222222','旧讨论','2026-10-16','2026-10-24',now(),'completed',2,$2,'fixture')`,[JSON.stringify(base),JSON.stringify({...base,hasRevisionDraft:true,coreConclusion:'讨论中的修改'})]);
  await pg.query(`INSERT INTO operations_review_meeting_version(id,meeting_id,version_number,snapshot,change_summary,finalized_by_label) VALUES('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222',2,$1,'旧版','fixture')`,[JSON.stringify(frozen)]);
  await pg.exec((await readFile(new URL('../drizzle/0040_meeting_version_drafts.sql',import.meta.url),'utf8')).replaceAll('--> statement-breakpoint',''));
  const {rows}=await pg.query<any>('SELECT * FROM operations_review_meeting_version ORDER BY version_number');
  assert.equal(rows.length,3);assert.equal(rows[0].lifecycle_status,'draft');assert.equal(rows[0].version_number,0);
  assert.deepEqual(rows[1].snapshot,frozen);assert.equal(rows[1].lifecycle_status,'finalized');assert.ok(rows[1].finalized_at);
  assert.equal(rows[2].version_number,3);assert.equal(rows[2].source_version_id,rows[1].id);assert.equal(rows[2].snapshot.draft.coreConclusion,'讨论中的修改');assert.deepEqual(rows[2].snapshot.generated,frozen.generated);
  await assert.rejects(()=>pg.query(`INSERT INTO operations_review_meeting_version(meeting_id,version_number,snapshot,change_summary,lifecycle_status) VALUES('22222222-2222-4222-8222-222222222222',4,'{}','冲突','draft')`));
 }finally{await pg.close();}
});
