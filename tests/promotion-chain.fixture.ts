import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import type {Database} from '../src/db/client';
import * as s from '../src/db/schema';
import {seedLinkPost} from './monthly-plan-links.fixture';
import {replayPromotionHistory} from '../src/db/promotion-rules.mjs';
export async function seedPromotionChain(db:Database,name:string,kind:'tail'|'waiting'|'restart'='tail'){
 const post=await seedLinkPost(db,name,'2026-10-29T10:00',{version:1,subjectId:'interview',categoryId:'success-story'});
 await db.update(s.operationsContent).set({platformNoteId:randomUUID().replaceAll('-','').slice(0,24)}).where(eq(s.operationsContent.id,post.content.id));
 const [campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:post.schedule.id,startedOn:'2026-10-29',dailyReviewEnabledOn:'2026-10-29',initialStage:'testing',currentStage:'testing',currentStatus:'testing'}).returning();
 const specs=kind==='tail'?[
 ['2026-10-29','test_paused','wait_continue'],['2026-10-30','test_paused','wait_continue'],['2026-10-31','test_paused','test_continue'],['2026-11-01','testing','test_pending'],['2026-11-02','test_pending','restart_testing'],['2026-11-03','testing','test_continue']
 ]:kind==='waiting'?[
 ['2026-10-29','test_paused','wait_continue'],['2026-10-30','test_paused','wait_continue'],['2026-10-31','test_paused','wait_continue']
 ]:[['2026-10-29','testing','test_pending'],['2026-10-30','test_pending','restart_testing'],['2026-10-31','testing','test_continue']];
 const metrics=await db.insert(s.operationsPromotionDailyMetric).values(specs.map(([metricDate,status,reviewDecision],i)=>({campaignId:campaign.id,metricDate,actualStatusSnapshot:status,dailyStatus:status==='testing'?'active':'waiting_action',stageTypeSnapshot:'testing',sourceStageStartedOn:kind==='restart'&&metricDate==='2026-10-31'?'2026-10-31':kind==='tail'&&metricDate>='2026-11-03'?'2026-11-03':'2026-10-29',reviewDecision,spend:String(20+i*5),platformOpenCount:i+1,actualOpenCount:i+1,platformLeadCount:i,actualLeadCount:i,recordKind:'regular'}))).returning();
 const changes=kind==='restart'?[]:await db.insert(s.operationsPromotionDayDecision).values({campaignId:campaign.id,businessDate:'2026-10-29',stageType:'testing',actualStatus:'test_paused',reason:'测试素材中途暂停'}).returning();
 const state=replayPromotionHistory(campaign.startedOn,metrics,{initialStage:'testing',asOf:'2026-11-06',stateChanges:changes})!;
 for(const stage of state.stages)await db.insert(s.operationsPromotionStage).values({campaignId:campaign.id,...stage});
 await db.update(s.operationsPromotionCampaign).set({currentStatus:state.currentStatus,currentStage:state.currentStage,endedOn:state.endedOn}).where(eq(s.operationsPromotionCampaign.id,campaign.id));
 await db.update(s.operationsContentSchedule).set({isPromoted:true,promotionStatus:state.currentStatus,completionStatus:'on_time',actualPublishAt:new Date('2026-10-29T02:00Z'),publicationUrl:'https://www.xiaohongshu.com/explore/'+String('1').repeat(24)}).where(eq(s.operationsContentSchedule.id,post.schedule.id));
 return {post,campaign,metrics};
}
