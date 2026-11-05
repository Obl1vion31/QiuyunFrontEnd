/** 从0047真实结构迁移，验证旧排期和会议快照不变，旧写入仍可用。 */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import postgres from 'postgres';
import {generateDrizzleJson,generateMigration} from 'drizzle-kit/api';
const target=new URL(process.env.TEST_POSTGRES_URL!);assert(['localhost','127.0.0.1'].includes(target.hostname));
const maintenance=postgres(target.href,{max:1}),name='qiuyun_migrate_'+randomUUID().replaceAll('-','');await maintenance.unsafe('create database "'+name+'"');target.pathname='/'+name;const db=postgres(target.href,{max:1});
try{
 const old=JSON.parse(await readFile('drizzle/meta/0047_snapshot.json','utf8'));
 for(const statement of await generateMigration(generateDrizzleJson({}),old))await db.unsafe(statement);
 const meeting='10000000-0000-4000-8000-000000000001',version='10000000-0000-4000-8000-000000000002',plan='10000000-0000-4000-8000-000000000003';
 await db.unsafe("insert into operations_review_meeting(id,name,meeting_type,period_start,period_end,meeting_at,created_by_label) values($1,'隔离旧会','monthly','2026-10-01','2026-10-31','2026-11-05T16:00+08','fixture')",[meeting]);
 await db.unsafe("insert into operations_review_meeting_version(id,meeting_id,version_number,snapshot,change_summary) values($1,$2,0,$3,'隔离旧快照')",[version,meeting,JSON.stringify({frozen:'旧事实不得改写',value:25})]);
 await db.unsafe("insert into operations_monthly_plan(id,meeting_id,month) values($1,$2,'2026-11')",[plan,meeting]);
 const before=await db.unsafe('select snapshot from operations_review_meeting_version');
 await db.begin(async tx=>{for(const statement of (await readFile('drizzle/0048_open_zarek.sql','utf8')).split('--> statement-breakpoint'))if(statement.trim())await tx.unsafe(statement);});
 assert.deepEqual(await db.unsafe('select snapshot from operations_review_meeting_version'),before);
 const [row]=await db.unsafe('select arrangement_status,arrangement_history,sealed_version_id from operations_monthly_plan where id=$1',[plan]);assert.equal(row.arrangement_status,'editing');assert.deepEqual(row.arrangement_history,[]);assert.equal(row.sealed_version_id,null);
 await db.unsafe("update operations_monthly_plan set updated_at=now() where id=$1",[plan]);
 await assert.rejects(()=>db.unsafe("update operations_monthly_plan set sealed_version_id=$1 where id=$2",[randomUUID(),plan]));
 const dir='.tools/test-artifacts/scheduling-review';await mkdir(dir,{recursive:true});await writeFile(dir+'/migration.json',JSON.stringify({passed:true,from:'0047',to:'0048',snapshotsUnchanged:true,oldWritesCompatible:true}));
 console.log('PASS 0047→0048：旧快照不变、兼容旧写入、封存版本外键有效');
}finally{await db.end();await maintenance.unsafe('drop database "'+name+'" with (force)');await maintenance.end();}
