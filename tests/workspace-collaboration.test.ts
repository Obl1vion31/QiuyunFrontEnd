import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {eq} from 'drizzle-orm';
import {migrateFixture} from './migrate-fixture';
import * as s from '../src/db/schema';
import {withDatabase} from '../src/db/client';
import {checkpointWindow} from '../src/db/stage-review-rules.mjs';
import {acquireLeases,releaseLeases,verifyLeases} from '../src/db/collaboration';
import {readNonPromotionFingerprint} from '../src/db/non-promotion-record';
import {POST as saveReview} from '../src/pages/api/non-promotion-reviews';
import {GET as readPresence,PUT as putPresence} from '../src/pages/api/collaboration/presence';
import {PATCH as manageAccount} from '../src/pages/api/admin/accounts/[id]';
import {createAuth} from '../src/auth/auth';
import {provisionAccount} from '../src/auth/provision';
const pg=new PGlite(),db=drizzle(pg,{schema:s}),origin='http://localhost:4321';
let admin:any,employee:any,other:any,schedule:any,identity:any,otherIdentity:any;
before(async()=>{
 await migrateFixture(pg);
 for(const username of ['test_admin','test_employee','test_other'])await provisionAccount(db,{username,password:'fictional-old-password',role:username==='test_admin'?'admin':'employee'});
 [admin,employee,other]=await Promise.all(['test_admin','test_employee','test_other'].map(async name=>(await db.select().from(s.authUser).where(eq(s.authUser.username,name)))[0]));
 const sessions=[];for(const user of [employee,other])sessions.push((await db.insert(s.authSession).values({id:randomUUID(),token:randomUUID(),userId:user.id,expiresAt:new Date('2099-01-01')}).returning())[0]);
 identity={userId:employee.id,sessionId:sessions[0].id,tabId:randomUUID()};otherIdentity={userId:other.id,sessionId:sessions[1].id,tabId:randomUUID()};
 const [content]=await db.insert(s.operationsContent).values({platformNoteId:'1234567890abcdef12345678'}).returning();
 const [version]=await db.insert(s.operationsContentVersion).values({contentId:content.id,versionNumber:0,contentName:'隔离并发复盘',workType:'new',subjectId:'tmua',categoryId:'temporary'}).returning();
 [schedule]=await db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,isPromoted:false,plannedPublishAt:new Date('2020-10-01T10:00:00+08:00'),actualPublishAt:new Date('2020-10-01T10:00:00+08:00'),completionStatus:'on_time',promotionStatus:'none'}).returning();
});after(()=>pg.close());
test('日期窗口覆盖上海自然日、目标未开放、超窗历史补录与闰年',()=>{
 const published=new Date('2026-10-01T10:00:00+08:00');
 assert.deepEqual(checkpointWindow(published,'day_7','2026-10-08'),{target:'2026-10-08',min:'2026-10-07',max:'2026-10-07',open:true,defaultValue:''});
 assert.equal(checkpointWindow(published,'day_15','2026-10-28').max,'2026-10-17');
 assert.equal(checkpointWindow(published,'day_7','2026-10-07').open,false);
 assert.equal(checkpointWindow(new Date('2024-02-22T23:00:00+08:00'),'day_7','2024-03-02').target,'2024-02-29');
});
test('同一记录互斥、独立轮次并行、上层操作互斥、同账号双窗口也互斥',async()=>{
 const first=`schedule:${schedule.id}:non:day_7`,second=`schedule:${schedule.id}:non:day_15`;
 const [lease]=await db.transaction(tx=>acquireLeases(tx,identity,[first]));
 await assert.rejects(db.transaction(tx=>acquireLeases(tx,otherIdentity,[first])),/暂时不可编辑/);
 await assert.rejects(db.transaction(tx=>acquireLeases(tx,{...identity,tabId:randomUUID()},[first])),/暂时不可编辑/);
 await db.transaction(tx=>acquireLeases(tx,otherIdentity,[second]));
 await assert.rejects(db.transaction(tx=>acquireLeases(tx,identity,[`schedule:${schedule.id}`])),/暂时不可编辑/);
 await db.transaction(tx=>verifyLeases(tx,identity,[first],{[first]:lease.token}));
 await db.transaction(tx=>releaseLeases(tx,identity,[first]));await db.transaction(tx=>releaseLeases(tx,otherIdentity,[second]));
});
test('过期锁可接续，旧租约不能写入，批量冲突不会取得部分锁',async()=>{
 const now=new Date('2020-01-01'),key=`schedule:${schedule.id}`,second='meeting:'+randomUUID();
 const [old]=await db.transaction(tx=>acquireLeases(tx,identity,[key],now));
 const later=new Date(now.getTime()+61000);await db.transaction(tx=>acquireLeases(tx,otherIdentity,[key],later));
 await assert.rejects(db.transaction(tx=>verifyLeases(tx,identity,[key],{[key]:old.token},later)),/编辑权限已失效/);
 await assert.rejects(db.transaction(tx=>acquireLeases(tx,identity,[key,second],later)),/暂时不可编辑/);
 assert.equal((await db.select().from(s.businessEditLease).where(eq(s.businessEditLease.resource,second))).length,0);
 await db.transaction(tx=>releaseLeases(tx,otherIdentity,[key]));
});
async function record(fingerprint:string,rate:string,date='2020-10-08',conclusion=''){
 const form=new FormData();for(const [key,value]of Object.entries({scheduleId:schedule.id,checkpointType:'day_7',recordedThrough:date,clickRate:rate,threeSecondReadRate:'40',conclusion,fingerprint}))form.set(key,value);
 return withDatabase(db,async()=>saveReview({request:new Request(origin+'/api/non-promotion-reviews',{method:'POST',headers:{Origin:origin},body:form}),url:new URL(origin+'/api/non-promotion-reviews'),locals:{operationsUser:employee.username,user:employee}} as any));
}
test('真实复盘保存拒绝旧页面覆盖与未来日期，保留当前指标和不可变历史',async()=>{
 let baseline=await readNonPromotionFingerprint(db,schedule.id,'day_7');assert.equal((await record(baseline,'5')).status,201);
 baseline=await readNonPromotionFingerprint(db,schedule.id,'day_7');assert.equal((await record(baseline,'9')).status,201);
 assert.equal((await record(baseline,'5','2020-10-08','旧页面结论')).status,409);
 const fresh=await readNonPromotionFingerprint(db,schedule.id,'day_7');assert.equal((await record(fresh,'1','2099-01-01')).status,422);
 const [metric]=await db.select().from(s.operationsContentPerformanceMetric).where(eq(s.operationsContentPerformanceMetric.scheduleId,schedule.id));assert.equal(Number(metric.clickRate),9);
 assert.equal((await db.select().from(s.operationsNonPromotionReviewVersion)).length,2);
});
test('位置接口拒绝输入值，员工不能读取人员位置，管理员响应只有位置元数据',async()=>{
 const payload={tabId:identity.tabId,page:'non-promotion-review',resource:`schedule:${schedule.id}:non:day_7`,field:'点击率',label:'隔离并发复盘',visible:true};
 const request=(data:unknown)=>({request:new Request(origin+'/api/collaboration/presence',{method:'PUT',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(data)}),url:new URL(origin+'/api/collaboration/presence'),locals:{user:employee,session:{id:identity.sessionId}}} as any);
 assert.equal((await withDatabase(db,async()=>putPresence(request({...payload,value:'123'})))).status,422);
 assert.equal((await withDatabase(db,async()=>putPresence(request(payload)))).status,200);
 assert.equal((await withDatabase(db,async()=>readPresence({locals:{user:employee}} as any))).status,403);
 const result=await withDatabase(db,async()=>readPresence({locals:{user:admin}} as any));const data=await result.json();assert.equal(data.rows[0].field,'点击率');assert.ok(!JSON.stringify(data).includes('password'));assert.ok(!('value'in data.rows[0]));
});
test('账号重置撤销旧会话，停用阻止登录，姓名更新保留账号身份',async()=>{
 const manage=async(payload:Record<string,unknown>)=>{
  const [target]=await db.select().from(s.authUser).where(eq(s.authUser.id,other.id));
  return withDatabase(db,async()=>manageAccount({request:new Request(origin+'/api/admin/accounts/'+other.id,{method:'PATCH',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({...payload,expectedUpdatedAt:target.updatedAt.toISOString()})}),url:new URL(origin+'/api/admin/accounts/'+other.id),params:{id:other.id},locals:{user:admin}} as any));
 };
 assert.equal((await manage({action:'rename',name:'运营乙'})).status,200);
 assert.equal((await manage({action:'resetPassword',password:'fictional-new-password'})).status,200);
 assert.equal((await db.select().from(s.authSession).where(eq(s.authSession.userId,other.id))).length,0);
 assert.equal((await manage({action:'status',enabled:false})).status,200);
 const auth=createAuth(db,{secret:'fictional-secret-at-least-32-characters',baseURL:origin,rateLimit:false});
 const login=()=>auth.handler(new Request(origin+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:other.username,password:'fictional-new-password'})}));
 assert.equal((await login()).status,403);assert.equal((await manage({action:'status',enabled:true})).status,200);assert.equal((await login()).status,200);
 const [target]=await db.select().from(s.authUser).where(eq(s.authUser.id,other.id));assert.equal(target.username,'test_other');assert.equal(target.name,'运营乙');
 const audits=await db.select().from(s.accountManagementAudit);assert.ok(audits.length>=4);assert.ok(!JSON.stringify(audits).includes('fictional-new-password'));
});

test('同一窗口旧释放请求不能删除过期后新取得的租约',async()=>{
 const key='meeting:'+randomUUID(),now=new Date('2020-01-01');
 const [old]=await db.transaction(tx=>acquireLeases(tx,identity,[key],now));
 const [fresh]=await db.transaction(tx=>acquireLeases(tx,identity,[key],new Date(now.getTime()+61000)));
 await db.transaction(tx=>releaseLeases(tx,identity,[key],{[key]:old.token}));
 assert.equal((await db.select().from(s.businessEditLease).where(eq(s.businessEditLease.resource,key)))[0].token,fresh.token);
 await db.transaction(tx=>releaseLeases(tx,identity,[key],{[key]:fresh.token}));
});
