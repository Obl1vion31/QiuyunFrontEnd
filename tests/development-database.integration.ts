import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {parse} from 'dotenv';
import postgres from 'postgres';
import {readMigrationFiles} from 'drizzle-orm/migrator';
import {privateDevelopmentDirectory} from '../scripts/development/environment';
import {validateDatabaseTarget} from '../src/db/database-target';
const privatePath=privateDevelopmentDirectory(),appEnv=parse(await readFile(resolve(privatePath,'development.env'),'utf8')),maintenanceEnv=parse(await readFile(resolve(privatePath,'development-maintenance.env'),'utf8'));
const appURL=validateDatabaseTarget(appEnv.DATABASE_URL,appEnv),ownerURL=validateDatabaseTarget(maintenanceEnv.DATABASE_URL,maintenanceEnv,'maintenance');
const app=postgres(appURL,{max:1,prepare:false,connect_timeout:5,idle_timeout:2}),owner=postgres(ownerURL,{max:1,prepare:false,connect_timeout:5,idle_timeout:2});
const checks:string[]=[];
try{
 const [identity]=await app`select current_database() as database,current_user as role`;
 assert.equal(identity.database,'qiuyun_dev');assert.equal(identity.role,'qiuyun_dev_app');
 const roles=await owner`select rolname,rolsuper,rolcreatedb,rolcreaterole,rolconnlimit from pg_roles where rolname in ('qiuyun_dev_app','qiuyun_dev_migrator') order by rolname`;
 assert.equal(roles.length,2);for(const role of roles){assert.equal(role.rolsuper,false);assert.equal(role.rolcreatedb,false);assert.equal(role.rolcreaterole,false);assert.equal(role.rolconnlimit,role.rolname.endsWith('_app')?3:2);}
 checks.push('两个独立开发账号均无实例管理权限，连接上限分别为3和2。');
 const otherURL=new URL(appURL);otherURL.pathname='/formward_primary';const other=postgres(otherURL.href,{max:1,connect_timeout:5,prepare:false});
 try{await assert.rejects(other`select 1`,(error:any)=>error.code==='28000');}finally{await other.end({timeout:1});}
 await assert.rejects(app`create table public.qiuyun_development_forbidden(id int)`,(error:any)=>error.code==='42501');
 await owner`create table public.qiuyun_development_permission_probe(id int)`;
 try{await assert.rejects(app`drop table public.qiuyun_development_permission_probe`,(error:any)=>error.code==='42501');}finally{await owner`drop table public.qiuyun_development_permission_probe`;}
 checks.push('实际拒绝开发账号连接Formward，也拒绝建表及删除维护账号拥有的表。');
 const [before]=await owner`select (select count(*) from auth_user)::int as users,(select count(*) from operations_content)::int as posts,(select count(*) from operations_review_meeting)::int as meetings`;
 const [sample]=await owner`select id,content_name from operations_content_version where content_id='10000000-0000-4000-8000-000000000001'`;
 await owner`update operations_content_version set content_name='开发样例·幂等保持检查' where id=${sample.id}`;
 try{
  const seeded=spawnSync(process.execPath,['--import','tsx','scripts/development/seed.ts'],{env:{...process.env,APP_ENV:'development',DATABASE_URL:ownerURL},encoding:'utf8',timeout:45000});
  assert.equal(seeded.status,0,'样例幂等检查失败。');
  const [current]=await owner`select content_name from operations_content_version where id=${sample.id}`;assert.equal(current.content_name,'开发样例·幂等保持检查');
 }finally{await owner`update operations_content_version set content_name=${sample.content_name} where id=${sample.id}`;}
 const [after]=await owner`select (select count(*) from auth_user)::int as users,(select count(*) from operations_content)::int as posts,(select count(*) from operations_review_meeting)::int as meetings`;
 assert.deepEqual(after,before);checks.push('重复初始化保留已编辑样例，账号／帖子／会议数量不变。');
 for(const target of ['postgres://fictional:never-real@formal.example/production','']){
  const launch=spawnSync(process.execPath,['--import','tsx','scripts/development/dev.ts'],{env:{...process.env,APP_ENV:'development',DATABASE_URL:target},encoding:'utf8',timeout:15000});
  assert.equal(launch.status,1);assert.match(launch.stderr,/被拦截|缺少 DATABASE_URL/);
 }
 checks.push('真实启动命令拒绝正式地址和空连接配置，未启动网站或访问替代数据库。');
 const migrated=spawnSync(process.execPath,['--import','tsx','scripts/migrate.ts'],{env:{...process.env,APP_ENV:'development',DATABASE_URL:ownerURL},encoding:'utf8',timeout:45000});
 assert.equal(migrated.status,0,'现有迁移入口检查失败。');
 const records=await owner`select id,hash,created_at from drizzle.__drizzle_migrations order by created_at,id`;
 const baseline=JSON.parse(await readFile(resolve(privatePath,'development-baseline/snapshot.json'),'utf8'));
 assert.deepEqual(records.slice(0,baseline.migrations.length),baseline.migrations);
 const source=readMigrationFiles({migrationsFolder:'./drizzle'});assert.equal(records.length,source.length);
 for(let index=baseline.migrations.length;index<records.length;index++){assert.equal(records[index].hash,source[index].hash);assert.equal(Number(records[index].created_at),source[index].folderMillis);}
 checks.push(`现有迁移入口执行为空操作，${records.length}条版本记录保持一致，原始基线包括已有0009历史差异。`);
 const directory=resolve('.tools/test-artifacts/development-database');await mkdir(directory,{recursive:true});await writeFile(resolve(directory,'database-result.json'),JSON.stringify({passed:true,checks,counts:after},null,2));
 console.log(checks.join('\n'));
}finally{await app.end({timeout:2});await owner.end({timeout:2});}
