import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {eq} from 'drizzle-orm';
import {migrateFixture} from './migrate-fixture';
import * as s from '../src/db/schema';
import {readWeeklyMaterial} from '../src/db/meeting-weekly-material';
import {readWeeklyPostDetails} from '../src/db/meeting-note-ids';
import {meetingNonPromotionSelections,nonPromotionDueOn} from '../src/db/meeting-non-promotion';
const pg=new PGlite(),db=drizzle(pg,{schema:s});
before(()=>migrateFixture(pg));after(()=>pg.close());
async function seed(name:string,publishedOn:string){
 const [content]=await db.insert(s.operationsContent).values({}).returning();
 const [version]=await db.insert(s.operationsContentVersion).values({contentId:content.id,contentName:name,versionNumber:0,workType:'new',subjectId:'tmua',categoryId:'temporary',projectDocUrl:'https://example.test/doc'}).returning();
 const [schedule]=await db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,isPromoted:false,promotionStatus:'none',completionStatus:'on_time',plannedPublishAt:new Date(publishedOn+'T23:59:00+08:00'),actualPublishAt:new Date(publishedOn+'T23:59:00+08:00'),publicationUrl:'https://www.xiaohongshu.com/explore/aaaaaaaaaaaaaaaaaaaaaaaa'}).returning();
 return {content,version,schedule};
}
test('非推广待填使用实发日加7/15天，二轮前置首轮使用自己的日期',async()=>{
 const first=await seed('首轮节点','2026-10-14'),second=await seed('二轮节点','2026-10-07');
 const [meeting]=await db.insert(s.operationsReviewMeeting).values({name:'隔离会议',periodStart:'2026-10-17',periodEnd:'2026-10-22',meetingAt:new Date('2026-10-24T23:00:00+08:00'),createdByLabel:'test'}).returning();
 const material=await readWeeklyMaterial(db,meeting);
 const node=(id:string,checkpointType:string)=>material.pending.find(p=>p.scheduleId===id&&p.checkpointType===checkpointType)!;
 assert.equal(node(first.schedule.id,'day_7').recordedThrough,'2026-10-21');
 assert.equal(node(first.schedule.id,'day_7').publishedOn,'2026-10-14');
 assert.equal(node(second.schedule.id,'day_7').recordedThrough,'2026-10-14');
 assert.equal(node(second.schedule.id,'day_15').recordedThrough,'2026-10-22');
 await db.insert(s.operationsContentPerformanceMetric).values({scheduleId:first.schedule.id,checkpointType:'day_7',recordedThrough:'2026-10-22',clickRate:'8',threeSecondReadRate:'42'});
 const saved=await readWeeklyMaterial(db,meeting);
 assert.equal(saved.nonPromotions.find(p=>p.scheduleId===first.schedule.id)!.recordedThrough,'2026-10-22','保留实际截止而非回写默认日期');
 assert.equal(saved.nonPromotions.find(p=>p.scheduleId===first.schedule.id)!.dueOn,'2026-10-21');
 assert.ok(meetingNonPromotionSelections(saved).some(p=>p.scheduleId===first.schedule.id),'本期已有数据自动纳入');
 const before=await readWeeklyPostDetails(db,saved);
 await db.update(s.operationsContentVersion).set({projectDocUrl:'https://example.test/corrected'}).where(eq(s.operationsContentVersion.id,first.version.id));
 const after=await readWeeklyPostDetails(db,saved);
 assert.notEqual(before.postReferences[first.schedule.id].projectDocUrl,after.postReferences[first.schedule.id].projectDocUrl);
 assert.equal((await readWeeklyMaterial(db,meeting)).fingerprint,saved.fingerprint,'资料更正不改变指标指纹');
});
test('默认日期跨月、跨年与闰年按上海自然日计算',()=>{
 assert.equal(nonPromotionDueOn('2026-12-28','day_7'),'2027-01-04');
 assert.equal(nonPromotionDueOn('2026-12-28','day_15'),'2027-01-12');
 assert.equal(nonPromotionDueOn('2028-02-23','day_7'),'2028-03-01');
 assert.equal(nonPromotionDueOn(null,'day_7'),'');
});
