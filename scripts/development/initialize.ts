import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import postgres from 'postgres';
import {readMigrationFiles} from 'drizzle-orm/migrator';
import {loadDevelopmentEnvironment,privateDevelopmentDirectory} from './environment';
import {ensureDevelopmentTunnel} from './tunnel';
import {developmentCatalog} from './catalog';
try {
 const url=loadDevelopmentEnvironment('maintenance');await ensureDevelopmentTunnel(url);
 const directory=resolve(privateDevelopmentDirectory(),'development-baseline');
 const ddl=await readFile(resolve(directory,'schema.sql'),'utf8');
 const snapshot=JSON.parse(await readFile(resolve(directory,'snapshot.json'),'utf8'));
 assert.equal(createHash('sha256').update(ddl).digest('hex'),snapshot.schemaSha256,'结构基线校验失败。');
 const files=readMigrationFiles({migrationsFolder:'./drizzle'});
 assert(files.length>=snapshot.migrations.length,'源码迁移版本早于结构基线。');
 for(const [index,row] of snapshot.migrations.entries())assert.equal(files[index].folderMillis,Number(row.created_at),'结构基线与源码版本顺序不同。');
 const client=postgres(url,{max:1,prepare:false,connect_timeout:8,idle_timeout:2});
 try{
  const [{count}]=await client`select count(*)::int as count from pg_tables where schemaname in ('public','drizzle')`;
  if(count===0){
   const tunnel=JSON.parse(await readFile(resolve(privateDevelopmentDirectory(),'development-tunnel.json'),'utf8'));
   // 整个DDL在服务器本地同一事务执行，避免每条语句跨网络往返；所有对象归开发维护账号。
   const command='sudo -n -u postgres psql -X -v ON_ERROR_STOP=1 --single-transaction --dbname=qiuyun_dev -c "SET ROLE qiuyun_dev_migrator;" '+(/^CREATE SCHEMA public;/m.test(ddl)?'-c "DROP SCHEMA public;" ':'')+'-f -';
   execFileSync('ssh',['-i',tunnel.identityFile,'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+tunnel.knownHostsFile,'-o','ConnectTimeout=8',tunnel.user+'@'+tunnel.host,command],{input:ddl,stdio:['pipe','ignore','pipe'],timeout:90000});
  }
  assert.deepEqual(JSON.parse(JSON.stringify(await developmentCatalog(client))),snapshot.catalog,'源库与开发库结构不一致，已停止初始化。');
  await client.begin(async tx=>{
   const rows=await tx`select id,hash,created_at from drizzle.__drizzle_migrations order by created_at,id`;
   if(rows.length)assert.deepEqual([...rows],snapshot.migrations,'开发库已有不同的迁移记录，拒绝覆盖。');
   else{
    await tx`insert into drizzle.__drizzle_migrations ${tx(snapshot.migrations,'id','hash','created_at')}`;
    await tx`select setval(pg_get_serial_sequence('drizzle.__drizzle_migrations','id'),(select max(id) from drizzle.__drizzle_migrations),true)`;
   }
   await tx.unsafe('REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO qiuyun_dev_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO qiuyun_dev_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO qiuyun_dev_app; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO qiuyun_dev_app; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO qiuyun_dev_app;');
  });
  console.log(JSON.stringify({database:'qiuyun_dev',structureMatched:true,tables:count||60,migrationRecords:snapshot.migrations.length}));
 }finally{await client.end({timeout:2});}
}catch(error){console.error(error instanceof Error?error.message.split('\n')[0]:'开发结构初始化失败。');process.exitCode=1;}
