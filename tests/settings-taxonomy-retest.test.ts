import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {eq} from 'drizzle-orm';
import {readFile} from 'node:fs/promises';
import {migrateFixture} from './migrate-fixture';
import * as s from '../src/db/schema';
import {appendTaxonomy,readPostSchemas} from '../src/db/taxonomy-store';
import {writePromotionDaily} from '../src/db/promotion-daily-write';
import {promotionDailySchema} from '../src/db/promotion-validation';
import {promotionNextOptions,nextActualPromotionState} from '../src/db/promotion-successors.mjs';
import {testingCycles} from '../src/db/promotion-cycles.mjs';
import {promotionStateOn} from '../src/db/promotion-state.mjs';
import {readPromotionContext} from '../src/db/promotion-pauses';
import {promotionTotals} from '../src/db/promotion-overview';
import {readWeeklyMaterial} from '../src/db/meeting-weekly-material';
import {meetingNextDecision} from '../src/db/meeting-decision-rules.mjs';
const pg=new PGlite(),db=drizzle(pg,{schema:s});before(()=>migrateFixture(pg));after(()=>pg.close());
const actor={id:'retest-admin',username:'隔离管理员'};
test('字典追加幂等、分类复用并关联当前学科；动态排期校验不再依赖种子',async()=>{
 const subject=await appendTaxonomy(db,{kind:'subject',name:'隔离新学科'});assert.ok(subject.subjectCategoryMappings.some(m=>m.subjectId===subject.item.id&&m.categoryId==='temporary'));
 const repeat=await appendTaxonomy(db,{kind:'subject',name:' 隔离新学科 '});assert.equal(repeat.created,false);assert.equal(repeat.item.id,subject.item.id);
 const category=await appendTaxonomy(db,{kind:'category',name:'隔离新分类',subjectId:subject.item.id});const map=await appendTaxonomy(db,{kind:'category',name:'隔离新分类',subjectId:'tmua'});assert.equal(map.created,false);assert.equal(map.item.id,category.item.id);assert.equal(map.subjectCategoryMappings.filter(m=>m.categoryId===category.item.id).length,2);
 const schemas=await readPostSchemas(db);const body={contentName:'隔离帖子',subjectId:subject.item.id,categoryId:category.item.id,projectDocUrl:null,syncToMoments:false,isPromoted:false,promotionStatus:'none',plannedPublishAt:'2026-10-27T18:00'};assert.equal(schemas.newPostSchema.safeParse(body).success,true);assert.equal(schemas.newPostSchema.safeParse({...body,subjectId:'interview'}).success,false);
 await assert.rejects(appendTaxonomy(db,{kind:'category',name:'不能创建',subjectId:'missing'}),/有效学科/);
});
test('只有结束待定提供独立复测；暂停恢复不允许复测动作',()=>{
 for(const state of ['testing','test_paused','scaling','scaling_paused','test_discarded','ended'])assert.equal(promotionNextOptions(state).some(o=>o.value==='restart_testing'),false);
 assert.equal(nextActualPromotionState('test_pending','restart_testing'),'testing');assert.equal(meetingNextDecision('test_pending','restart_testing'),'restart_testing');assert.equal(meetingNextDecision('testing','restart_testing'),null);
});
async function seed(){const[c]=await db.insert(s.operationsContent).values({platformNoteId:randomUUID().replaceAll('-','').slice(0,24)}).returning();const[v]=await db.insert(s.operationsContentVersion).values({contentId:c.id,versionNumber:0,workType:'new',contentName:'同帖独立复测',subjectId:'tmua',categoryId:'temporary'}).returning();const[p]=await db.insert(s.operationsContentSchedule).values({contentVersionId:v.id,isPromoted:true,promotionStatus:'testing',completionStatus:'on_time',plannedPublishAt:new Date('2026-10-18T10:00:00+08:00'),actualPublishAt:new Date('2026-10-18T10:00:00+08:00')}).returning();const[campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:p.id,startedOn:'2026-10-18',dailyReviewEnabledOn:'2026-10-18',currentStage:'testing',currentStatus:'testing'}).returning();return{campaign,p};}
async function save(id:string,day:number,status:string,decision:string,spend:number){const data=promotionDailySchema.parse({platformNoteId:null,campaignId:id,metricDate:`2026-10-${day}`,actualStatusSnapshot:status,dailyStatus:status==='testing'?'active':'waiting_action',stageTypeSnapshot:'testing',spend,platformOpenCount:spend?2:0,actualOpenCount:spend?2:0,platformLeadCount:spend?1:0,actualLeadCount:spend?1:0,reviewDecision:decision,requestKey:randomUUID()});const result=await db.transaction(tx=>writePromotionDaily(tx,data,actor));assert.equal(result.kind,'saved',JSON.stringify(result));return data;}
test('真实写入旧轮100元/新轮30元，暂停仍在第2轮，例会日度同日去重，周材料分卡且汇总不重复',async()=>{
 const{campaign}=await seed();await save(campaign.id,18,'testing','test_pending',100);await save(campaign.id,19,'test_pending','restart_testing',0);await save(campaign.id,20,'testing','test_pause',30);await save(campaign.id,21,'test_paused','test_continue',0);await save(campaign.id,22,'testing','test_pending',0);await save(campaign.id,23,'test_pending','wait_continue',0);await save(campaign.id,24,'test_pending','wait_continue',0);
 const context=await readPromotionContext(db);const facts=await db.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.campaignId,campaign.id));assert.equal(promotionTotals(facts).spend,130);assert.deepEqual(testingCycles(campaign,context).map(c=>c.startedOn),['2026-10-18','2026-10-20']);assert.equal(facts.find(m=>m.metricDate==='2026-10-20')!.sourceStageStartedOn,'2026-10-20');assert.equal(facts.find(m=>m.metricDate==='2026-10-22')!.sourceStageStartedOn,'2026-10-20');assert.equal(promotionTotals(facts.filter(m=>m.sourceStageStartedOn==='2026-10-20')).spend,30);
 const same={...context,stateChanges:[...context.stateChanges,{campaignId:campaign.id,businessDate:'2026-10-20',actualStatus:'testing',stageType:'testing',action:'restart_testing',meetingDecision:true}]};assert.equal(promotionStateOn(campaign,same,'2026-10-20')?.currentStatus,'testing');assert.equal(testingCycles(campaign,same).length,2);assert.equal(promotionStateOn(campaign,same,'2026-10-19')?.currentStatus,'test_pending');
 const[meeting]=await db.insert(s.operationsReviewMeeting).values({name:'隔离例会',meetingType:'weekly',meetingAt:new Date('2026-10-25T18:00:00+08:00'),periodStart:'2026-10-18',periodEnd:'2026-10-24',createdByLabel:'test'}).returning();const material=await readWeeklyMaterial(db,meeting);const cards=material.promotions.filter(c=>c.campaignId===campaign.id);assert.equal(cards.length,2);assert.deepEqual(cards.map(c=>c.total.spend),[100,30]);assert.notEqual(cards[0].key,cards[1].key);assert.equal(cards[0].key,`${campaign.id}:testing:2026-10-18`);assert.ok(cards[1].ownHistory.some(h=>h.spend===100));assert.equal(material.summary.spend,130);
 const third={...context,metrics:[...facts,{...facts.at(-1)!,metricDate:'2026-10-25',reviewDecision:'restart_testing'}]};assert.equal(testingCycles(campaign,third,'2026-10-25').length,2);assert.equal(testingCycles(campaign,third,'2026-10-26').length,3);assert.equal(promotionStateOn(campaign,third,'2026-10-26')?.currentStatus,'testing');
 await db.update(s.operationsPromotionDailyMetric).set({reviewDecision:'restart_testing'}).where(eq(s.operationsPromotionDailyMetric.id,facts.at(-1)!.id));const oldPeriod=await readWeeklyMaterial(db,meeting);assert.equal(oldPeriod.promotions.find(c=>c.campaignId===campaign.id&&c.testCycleNumber===2)!.testCycleEndedOn,'2026-10-24','本期截止后今天已开新轮，旧卡不能安排新轮');
});
test('复测兼容迁移可以重复约束验证且保留旧事实',async()=>{const count=(await pg.query<{n:number}>('select count(*)::int n from operations_promotion_daily_metric')).rows[0].n;await pg.exec(await readFile(new URL('../drizzle/0037_testing_rounds.sql',import.meta.url),'utf8'));assert.equal((await pg.query<{n:number}>('select count(*)::int n from operations_promotion_daily_metric')).rows[0].n,count);});
