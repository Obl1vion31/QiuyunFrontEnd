import assert from 'node:assert/strict';
import test from 'node:test';
import { databaseIdentity, validateDatabaseTarget } from '../src/db/database-target';
const development={APP_ENV:'development'};
const application='postgres://qiuyun_dev_app:fictional@127.0.0.1:15432/qiuyun_dev';
const maintenance=application.replace('qiuyun_dev_app','qiuyun_dev_migrator');
test('开发只接受通道、专用库及对应账号；错误信息不包含凭据',()=>{
 assert.equal(validateDatabaseTarget(application,development),application);
 assert.equal(validateDatabaseTarget(maintenance,development,'maintenance'),maintenance);
 for(const invalid of [application.replace('127.0.0.1','production.example'),application.replace('15432','5432'),application.replace('/qiuyun_dev','/formward_primary'),maintenance,application.replace(':fictional','')]){
  assert.throws(()=>validateDatabaseTarget(invalid,development),error=>error instanceof Error&&!error.message.includes('fictional'));
 }
 assert.throws(()=>validateDatabaseTarget(application,development,'maintenance'));
});
test('缺失配置及未声明环境均停止，不回退到任何默认数据库',()=>{
 assert.throws(()=>validateDatabaseTarget(undefined,development));
 assert.throws(()=>validateDatabaseTarget(application,{}));
 assert.throws(()=>validateDatabaseTarget('not-a-url',development));
});
test('正式运行兼容现有 Vercel 变量；测试必须是本机隔离库',()=>{
 const formal='postgres://runtime:fictional@formal.example/production';
 assert.equal(validateDatabaseTarget(formal,{VERCEL_ENV:'production'}),formal);
 assert.throws(()=>validateDatabaseTarget(formal,{NODE_ENV:'test'}));
 assert.throws(()=>validateDatabaseTarget(application,{NODE_ENV:'test'}));
 const isolated='postgres://fixture@127.0.0.1:55445/qiuyun_test_example';
 assert.equal(validateDatabaseTarget(isolated,{NODE_ENV:'test'}),isolated);
 const memory='postgresql://postgres:fictional@127.0.0.1:41001/postgres?max=1';
 assert.equal(validateDatabaseTarget(memory,{NODE_ENV:'test',APP_ENV:'development'}),memory);
});
test('恢复身份比较统一识别 Neon 连接池与直连地址',()=>{
 assert.equal(databaseIdentity('postgres://a:x@ep-example-pooler.region.neon.tech/neondb?sslmode=require'),databaseIdentity('postgres://b:y@ep-example.region.neon.tech:5432/neondb'));
});
