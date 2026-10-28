/** 可选的真实 PostgreSQL 验收：仅连接显式指定的本机测试服务，创建独立临时库。 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import postgres from 'postgres';
import {generateDrizzleJson,generateMigration} from 'drizzle-kit/api';
import {createDatabase} from '../src/db/client';
import * as schema from '../src/db/schema';
import {subjects,postCategories,subjectCategoryMappings} from '../src/db/taxonomy';
import {provisionAccount} from '../src/auth/provision';
import {admin,employee} from './auth.fixture';
export async function startPostgresFixture(){
 const raw=process.env.TEST_POSTGRES_URL;assert.ok(raw,'请指定本机隔离服务 TEST_POSTGRES_URL');const target=new URL(raw);assert.ok(['127.0.0.1','localhost'].includes(target.hostname),'测试服务只能在本机');
 const name='qiuyun_test_'+randomUUID().replaceAll('-',''),maintenance=postgres(raw,{max:1});await maintenance.unsafe(`create database "${name}"`);target.pathname='/'+name;target.searchParams.set('max','10');
 const database=createDatabase(target.href),db=database.db;
 try{
  for(const statement of await generateMigration(generateDrizzleJson({}),generateDrizzleJson(schema)))await database.db.execute((await import('drizzle-orm')).sql.raw(statement));
  await db.insert(schema.operationsSubject).values(subjects.map((row,index)=>({...row,sortOrder:index*10})));await db.insert(schema.operationsCategory).values(postCategories.map((row,index)=>({...row,sortOrder:index*10})));await db.insert(schema.operationsSubjectCategory).values([...subjectCategoryMappings]);
  await provisionAccount(db,admin);await provisionAccount(db,employee);await provisionAccount(db,{username:'test_other',password:'fictional-other-password',role:'employee'});
 }catch(error){await database.close();await maintenance.unsafe(`drop database "${name}"`);await maintenance.end();throw error;}
 const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const address=probe.address();assert.ok(address&&typeof address==='object');const port=address.port;await new Promise<void>(resolve=>probe.close(()=>resolve()));
 const baseURL=`http://127.0.0.1:${port}`,child=spawn(process.execPath,['dist/server/entry.mjs'],{env:{...process.env,HOST:'127.0.0.1',PORT:String(port),NODE_ENV:'test',DATABASE_URL:target.href,BETTER_AUTH_URL:baseURL,BETTER_AUTH_SECRET:'fictional-browser-secret-at-least-32-characters'},stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',chunk=>logs+=chunk);child.stderr.on('data',chunk=>logs+=chunk);
 const stop=async()=>{if(child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}await database.close();await maintenance.unsafe(`drop database "${name}" with (force)`);await maintenance.end();};
 for(let index=0;index<100;index++){if(child.exitCode!==null){await stop();throw new Error(logs);}try{if((await fetch(baseURL+'/api/auth/get-session')).ok)return {db,baseURL,stop,logs:()=>logs,url:target.href,maintenance};}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 await stop();throw new Error('隔离服务没有启动');
}
