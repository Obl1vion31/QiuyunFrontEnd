import {eq} from 'drizzle-orm';
import type {Database} from '../src/db/client';
import * as s from '../src/db/schema';
import {seedLinkPost} from './monthly-plan-links.fixture';
export const pilotReports={
  11:[{time:'2026-11-15',note_id:'111111111111111111111111',fee:'238.44',impression:'1320',click:'40',initiative_message:'0',msg_leads_num:'0'},
      {time:'2026-11-15',note_id:'222222222222222222222222',fee:'208.60',impression:'618',click:'23',initiative_message:'0',msg_leads_num:'0'},
      {time:'2026-11-15',note_id:'333333333333333333333333',fee:'0',impression:'3',click:'0',initiative_message:'0',msg_leads_num:'0'}],
  22:[],33:[],
};
export async function seedJuguangPilot(db:Database,initialStage:'testing'|'scaling'='testing') {
  const rows=[];
  for(const [i,name] of ['TMUA一月1v1','面试课第一轮②','已结束讲义帖'].entries()) {
    const date=i===2?'2026-11-14':'2026-11-15';
    const stage=i===2?'testing':initialStage;
    const post=await seedLinkPost(db,name,date+'T10:00',{version:i===1?3:0,...(i===1?{subjectId:'interview',categoryId:'success-story'}:{})});
    await db.update(s.operationsContent).set({platformNoteId:String(i+1).repeat(24),operationType:'promotion_then_continuous'}).where(eq(s.operationsContent.id,post.content.id));
    await db.update(s.operationsContentSchedule).set({isPromoted:true,promotionStatus:i===2?'ended':stage,actualPublishAt:new Date(date+'T02:00Z'),completionStatus:'on_time'}).where(eq(s.operationsContentSchedule.id,post.schedule.id));
    const [campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:post.schedule.id,startedOn:date,dailyReviewEnabledOn:date,initialStage:stage,currentStage:i===2?null:stage,currentStatus:i===2?'ended':stage,endedOn:i===2?date:null}).returning();
    await db.insert(s.operationsPromotionStage).values({campaignId:campaign.id,stageType:stage,startedOn:date,endedOn:i===2?date:null});
    const [metric]=await db.insert(s.operationsPromotionDailyMetric).values({campaignId:campaign.id,metricDate:date,dailyStatus:'active',actualStatusSnapshot:stage,stageTypeSnapshot:stage,sourceStageStartedOn:date,spend:i===0?'238.44':i===1?'208.60':'20',platformOpenCount:0,actualOpenCount:i===1?1:0,platformLeadCount:0,actualLeadCount:0,reviewDecision:i===2?'ended':stage==='scaling'?'scaling_continue':'test_continue'}).returning();
    rows.push({post,campaign,metric});
  }
  return rows;
}
