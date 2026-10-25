import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {migrateFixture} from './migrate-fixture';
import * as s from '../src/db/schema';
import {readWeeklyMaterial} from '../src/db/meeting-weekly-material';
test('例会同类包含本期与跨期、零值和本帖；排除未来、其他学科及另一轮',async()=>{
 const pg=new PGlite(),db=drizzle(pg,{schema:s});try{
  await migrateFixture(pg);
  async function post(name:string,published:string,through:string,rate:string,subject='tmua'){
   const[c]=await db.insert(s.operationsContent).values({}).returning();
   const[v]=await db.insert(s.operationsContentVersion).values({contentId:c.id,contentName:name,versionNumber:0,workType:'new',subjectId:subject,categoryId:'temporary'}).returning();
   const[p]=await db.insert(s.operationsContentSchedule).values({contentVersionId:v.id,isPromoted:false,promotionStatus:'none',completionStatus:'on_time',plannedPublishAt:new Date(published+'T18:00:00+08:00'),actualPublishAt:new Date(published+'T18:00:00+08:00')}).returning();
   await db.insert(s.operationsContentPerformanceMetric).values({scheduleId:p.id,checkpointType:'day_7',recordedThrough:through,clickRate:rate,threeSecondReadRate:String(Number(rate)+10)});return p;
  }
  const old=await post('上期零值','2026-09-20','2026-09-27','0'),current=await post('本期','2026-10-14','2026-10-21','10');
  await post('截止之后','2026-10-18','2026-10-25','80');
  const other=(await db.select().from(s.operationsSubject)).find(row=>row.id!=='tmua')!;await post('其他学科','2026-10-14','2026-10-21','60',other.id);
  await db.insert(s.operationsContentPerformanceMetric).values({scheduleId:old.id,checkpointType:'day_15',recordedThrough:'2026-10-05',clickRate:'90',threeSecondReadRate:'95'});
  const[m]=await db.insert(s.operationsReviewMeeting).values({name:'隔离截止',periodStart:'2026-10-17',periodEnd:'2026-10-24',meetingAt:new Date('2026-10-25T18:00:00+08:00'),createdByLabel:'fixture'}).returning();
  const material=await readWeeklyMaterial(db,m),card=material.nonPromotions.find(c=>c.scheduleId===current.id)!;
  assert.equal(card.historical.n,1,'旧历史口径单独保留用于兼容');assert.equal(card.rateComparison?.n,2);assert.equal(card.rateComparison?.clickRate,5);assert.equal(card.rateComparison?.threeSecondReadRate,15);assert.deepEqual(card.rateComparison?.sourceKeys.sort(),[old.id+':day_7',current.id+':day_7'].sort());
 }finally{await pg.close();}
});
