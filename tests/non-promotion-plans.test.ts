import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {eq} from 'drizzle-orm';
import {migrateFixture} from './migrate-fixture';
import * as s from '../src/db/schema';
import {reviewNodes,reviewNodeWindow,nodeCanRecord,customCheckpointId} from '../src/db/non-promotion-nodes';
import {anchorReviewPosts,saveReviewPlan,reviewIdentity,addCustomNode,mutateCustomNode} from '../src/db/non-promotion-plan';
import {nonPromotionItemSchema} from '../src/db/stage-review-validation';
import {nonPromotionFingerprint,nonPromotionSource} from '../src/db/non-promotion-record';
const actual=new Date('2026-11-02T10:00:00+08:00'),customId='00000000-0000-4000-8000-000000000001';
test('兼容指纹保留旧未填写状态，新增空列不冒充来源变化',()=>{
 assert.equal(nonPromotionFingerprint(undefined,undefined,undefined),'44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a');
 const original={id:'legacy',clickRate:'12.3000'};assert.deepEqual(nonPromotionSource({...original,readCount:null,exposureCount:null,customCheckpointId:null}),original);
 assert.equal(nonPromotionSource(undefined),undefined);
});
test('即时两天含发布日，目标次日开放；标准7/15保留原日期与窗口',()=>{
 const nodes=reviewNodes(actual,{mode:'instant',day7:false,day15:true},[{id:customId,dueOn:'2026-11-03',cancelledAt:null}]);
 assert.deepEqual(nodes.map(n=>[n.type,n.days,n.dueOn]),[['custom:'+customId,2,'2026-11-03'],['day_15',15,'2026-11-17']]);
 const early=reviewNodeWindow(actual,nodes[0],'2026-11-03'),open=reviewNodeWindow(actual,nodes[0],'2026-11-04');assert.equal(early.open,false);assert.equal(open.open,true);assert.equal(open.min,open.max);assert.equal(nodeCanRecord(nodes,nodes[1],[],'2026-11-18'),true);
 const standard=reviewNodes(actual,undefined,[]);assert.equal(nodeCanRecord(standard,standard[1],[],'2026-11-18'),false);assert.equal(nodeCanRecord(standard,standard[1],['day_7'],'2026-11-18'),true);
});
test('计数入口忽略客户端点击率，零分母与真实零不同',()=>{
 const input={scheduleId:customId,checkpointType:'day_7',recordedThrough:'2026-11-09',threeSecondReadRate:50,conclusion:null,exposureCount:1000,readCount:123,clickRate:99};
 const parsed=nonPromotionItemSchema.parse(input);assert.equal(parsed.clickRate,12.3);
 assert.equal(nonPromotionItemSchema.parse({...input,exposureCount:0,readCount:0}).clickRate,null);assert.equal(nonPromotionItemSchema.parse({...input,readCount:0}).clickRate,0);
 assert.equal(nonPromotionItemSchema.safeParse({...input,readCount:1001}).success,false);assert.equal(nonPromotionItemSchema.safeParse({...input,exposureCount:undefined}).success,false);
});
test('原帖跨版本只保留一个锚点，未发布V0不冒充实发起点',()=>{
 const rows=[{id:'v0',contentId:'a',versionNumber:0,actualPublishAt:null,isPromoted:false},{id:'v1',contentId:'a',versionNumber:1,actualPublishAt:actual,isPromoted:false},{id:'v2',contentId:'a',versionNumber:2,actualPublishAt:new Date('2026-11-03'),isPromoted:false}];
 assert.equal(anchorReviewPosts(rows,[])[0].id,'v1');assert.equal(anchorReviewPosts(rows,[]).length,1);
});
test('真实节点归属、追加、改期、取消和兼容唯一键均由正式结构保护',async()=>{
 const pg=new PGlite();try{
  await migrateFixture(pg);const db=drizzle(pg,{schema:s});
  const [content]=await db.insert(s.operationsContent).values({}).returning();
  const [version]=await db.insert(s.operationsContentVersion).values({contentId:content.id,versionNumber:0,workType:'new',contentName:'隔离持续复盘帖',subjectId:'tmua',categoryId:'temporary'}).returning();
  const [post]=await db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:actual,actualPublishAt:actual,completionStatus:'on_time'}).returning();
  await db.transaction(tx=>saveReviewPlan(tx,post.id,{mode:'continuous',day7:false,day15:false,expectedRevision:-1},'test_admin'));
  const a=await addCustomNode(db,post.id,'2026-11-03','test_admin'),b=await addCustomNode(db,post.id,'2026-11-08','test_admin');assert.notEqual(a.id,b.id);
  await assert.rejects(()=>addCustomNode(db,post.id,'2026-11-08','test_admin'),/已有/);
  await mutateCustomNode(db,post.id,{action:'reschedule',nodeId:b.id,dueOn:'2026-11-10',expectedRevision:0,reason:'隔离调整'},'test_admin');
  await mutateCustomNode(db,post.id,{action:'cancel',nodeId:b.id,expectedRevision:1,reason:'隔离取消'},'test_admin');
  assert.equal((await reviewIdentity(db,post.id)).nodes.length,1);
  await db.insert(s.operationsContentPerformanceMetric).values({scheduleId:post.id,checkpointType:'custom:'+a.id,customCheckpointId:a.id,recordedThrough:a.dueOn,exposureCount:0,readCount:0,clickRate:null,threeSecondReadRate:'0'});
  await assert.rejects(()=>mutateCustomNode(db,post.id,{action:'cancel',nodeId:a.id,expectedRevision:0,reason:'不能覆盖'},'test_admin'),/已有复盘数据/);
  await assert.rejects(()=>db.insert(s.operationsContentPerformanceMetric).values({scheduleId:post.id,checkpointType:'custom:broken',recordedThrough:a.dueOn,clickRate:'10',threeSecondReadRate:'20'}));
  // 标准节点原upsert继续匹配完整唯一索引，旧记录不需写入新计数。
  await db.insert(s.operationsContentPerformanceMetric).values({scheduleId:post.id,checkpointType:'day_7',recordedThrough:'2026-11-09',clickRate:'10',threeSecondReadRate:'20'}).onConflictDoUpdate({target:[s.operationsContentPerformanceMetric.scheduleId,s.operationsContentPerformanceMetric.checkpointType],set:{clickRate:'11'}});
  assert.equal((await db.select().from(s.operationsContentPerformanceMetric).where(eq(s.operationsContentPerformanceMetric.checkpointType,'day_7')))[0].readCount,null);
  assert.equal(customCheckpointId('custom:'+a.id),a.id);
 }finally{await pg.close();}
});
