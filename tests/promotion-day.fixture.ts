import {eq} from 'drizzle-orm';
import {randomUUID} from 'node:crypto';
import type {Database} from '../src/db/client';
import {seedLinkPost} from './monthly-plan-links.fixture';
import {replayPromotionHistory} from '../src/db/promotion-rules.mjs';
import * as s from '../src/db/schema';
export async function seedHistoricalDay(db:Database,name:string,states:string[],options:{decisions?:string[];explicit?:Array<{day:number;status:string}>}={}){
 const post=await seedLinkPost(db,name,'2026-10-29T10:00',{version:1,subjectId:'interview',categoryId:'success-story'});
 await db.update(s.operationsContent).set({platformNoteId:randomUUID().replaceAll('-','').slice(0,24)}).where(eq(s.operationsContent.id,post.content.id));
 const stage:'testing'|'scaling'=states[0].startsWith('scaling')?'scaling':'testing';
 const [campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:post.schedule.id,startedOn:'2026-10-29',dailyReviewEnabledOn:'2026-10-29',initialStage:stage,currentStage:stage,currentStatus:states.at(-1)!}).returning();
 const dates=['2026-10-29','2026-10-30','2026-10-31','2026-11-01','2026-11-02','2026-11-03'];
 const changes=await db.insert(s.operationsPromotionDayDecision).values((options.explicit??[{day:0,status:states[0]}]).map(c=>({campaignId:campaign.id,businessDate:dates[c.day],stageType:stage,actualStatus:c.status,reason:'已保存的当日决定'}))).returning();
 const metrics=await db.insert(s.operationsPromotionDailyMetric).values(states.map((status,i)=>({campaignId:campaign.id,metricDate:dates[i],dailyStatus:status==='testing'||status==='scaling'?'active':'waiting_action',actualStatusSnapshot:status,stageTypeSnapshot:stage,recordKind:'regular',sourceStageStartedOn:'2026-10-29',spend:String(20+i*5),platformOpenCount:3+i,actualOpenCount:2+i,platformLeadCount:1+i,actualLeadCount:1+i,reviewDecision:options.decisions?.[i]??(status==='testing'?'test_continue':status==='scaling'?'scaling_continue':'wait_continue'),note:'当日真实数据 '+dates[i]}))).returning();
 const state=replayPromotionHistory(campaign.startedOn,metrics,{initialStage:stage,stateChanges:changes,asOf:'2026-11-06'})!;
 if(!state)throw new Error('fixture invalid '+name);
 for(const span of state.stages)await db.insert(s.operationsPromotionStage).values({campaignId:campaign.id,...span});
 await db.update(s.operationsPromotionCampaign).set({currentStatus:state.currentStatus,currentStage:state.currentStage,endedOn:state.endedOn}).where(eq(s.operationsPromotionCampaign.id,campaign.id));
 await db.update(s.operationsContentSchedule).set({isPromoted:true,promotionStatus:state.currentStatus,actualPublishAt:new Date('2026-10-29T02:00Z'),completionStatus:'on_time'}).where(eq(s.operationsContentSchedule.id,post.schedule.id));
 return {post,campaign,metrics};
}
