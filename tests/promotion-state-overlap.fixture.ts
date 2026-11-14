import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import type {Database} from '../src/db/client';
import {seedLinkPost} from './monthly-plan-links.fixture';
import * as s from '../src/db/schema';

export const overlapStates=[
 {status:'testing',label:'测试中',stage:'testing',prior:'test_continue',next:'test_continue',terminal:false},
 {status:'test_paused',label:'测试暂停',stage:'testing',prior:'test_pause',next:'wait_continue',terminal:false},
 {status:'test_pending',label:'测试结束待定',stage:'testing',prior:'test_pending',next:'wait_continue',terminal:false},
 {status:'scaling',label:'放量中',stage:'scaling',prior:'scaling_continue',next:'scaling_continue',terminal:false},
 {status:'scaling_paused',label:'放量暂停',stage:'scaling',prior:'scaling_pause',next:'wait_continue',terminal:false},
 {status:'test_discarded',label:'测试淘汰',stage:'testing',prior:'test_discarded',next:'test_discarded',terminal:true},
 {status:'formal_discarded',label:'放量淘汰',stage:'scaling',prior:'formal_discarded',next:'formal_discarded',terminal:true},
 {status:'ended',label:'推广结束',stage:'scaling',prior:'ended',next:'ended',terminal:true},
] as const;
export const overlapSources=['day_record','same_day_meeting','next_day_record','next_day_meeting'] as const;
export type OverlapSource=typeof overlapSources[number];
export type OverlapState={status:string;label:string;stage:'testing'|'scaling';prior:string;next:string;terminal:boolean};
/** 11日当天才结束，保留真实收尾；默认样本则为10日已安排停止。 */
export const closingOverlapStates:OverlapState[]=overlapStates.map(spec=>spec.terminal?{...spec,prior:spec.stage==='testing'?'test_continue':'scaling_continue'}:spec);
export async function seedStateOverlap(db:Database,spec:OverlapState,source:OverlapSource,name=spec.label){
 const post=await seedLinkPost(db,name,'2026-11-10T10:00',{subjectId:'interview',categoryId:'promotional-handout'});
 const noteId=randomUUID().replaceAll('-','').slice(0,24);
 await db.update(s.operationsContent).set({operationType:'promotion_only',platformNoteId:noteId}).where(eq(s.operationsContent.id,post.content.id));
 await db.update(s.operationsContentSchedule).set({isPromoted:true,promotionStatus:spec.status,completionStatus:'on_time',actualPublishAt:new Date('2026-11-10T02:00Z'),publicationUrl:'https://www.xiaohongshu.com/explore/'+noteId}).where(eq(s.operationsContentSchedule.id,post.schedule.id));
 const endedOn=spec.terminal?(['test_discarded','formal_discarded','ended'].includes(spec.prior)||source==='same_day_meeting'?'2026-11-10':'2026-11-11'):null;
 const [campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:post.schedule.id,startedOn:'2026-11-10',dailyReviewEnabledOn:'2026-11-10',initialStage:spec.stage,currentStage:spec.terminal?null:spec.stage,currentStatus:spec.status,endedOn}).returning();
 const resumed=spec.status===spec.stage&&['test_pause','test_pending','scaling_pause'].includes(spec.prior);
 const stages=await db.insert(s.operationsPromotionStage).values(resumed?[
  {campaignId:campaign.id,stageType:spec.stage,startedOn:'2026-11-10',endedOn:'2026-11-10',outcome:'paused'},
  {campaignId:campaign.id,stageType:spec.stage,startedOn:'2026-11-11',endedOn:null,outcome:null},
 ]:[{campaignId:campaign.id,stageType:spec.stage,startedOn:'2026-11-10',endedOn:spec.status===spec.stage?null:spec.terminal?endedOn:'2026-11-10',outcome:spec.status===spec.stage?null:spec.terminal?spec.status:'paused'}]).returning();
 const [prior]=await db.insert(s.operationsPromotionDailyMetric).values({campaignId:campaign.id,metricDate:'2026-11-10',dailyStatus:'active',actualStatusSnapshot:spec.stage,stageTypeSnapshot:spec.stage,sourceStageStartedOn:'2026-11-10',reviewDecision:spec.prior,recordKind:'regular',spend:'80',platformOpenCount:3,actualOpenCount:2,platformLeadCount:1,actualLeadCount:1}).returning();
 const [today]=await db.insert(s.operationsPromotionDayDecision).values({campaignId:campaign.id,businessDate:'2026-11-11',stageType:spec.stage,actualStatus:spec.status,reason:'隔离样本：当天明确记录，与前日安排相同'}).returning();
 if(source==='next_day_record')await db.insert(s.operationsPromotionDayDecision).values({campaignId:campaign.id,businessDate:'2026-11-12',stageType:spec.stage,actualStatus:spec.status,reason:'隔离样本：后一天相同状态记录'});
 let frozen:{id:string;snapshot:Record<string,unknown>}|undefined;
 if(source==='same_day_meeting'||source==='next_day_meeting'){
  const effectiveOn=source==='same_day_meeting'?'2026-11-11':'2026-11-12';
  const [meeting]=await db.insert(s.operationsReviewMeeting).values({name:'隔离周会 · 重叠状态',meetingType:'weekly',periodStart:'2026-11-01',periodEnd:'2026-11-07',meetingAt:new Date('2026-11-10T12:00Z'),status:'completed',createdByLabel:'fixture'}).returning();
  const snapshot={schemaVersion:4,finalizationStage:'post',decisionPolicy:'replace',decisionEffectiveOn:effectiveOn,marker:'保存指标不能改会议',generated:{meetingDecisions:[{id:randomUUID(),campaignId:campaign.id,scheduleId:post.schedule.id,effectiveOn,targetStatus:spec.status,stageType:spec.stage,meetingId:meeting.id,versionNumber:0,label:'隔离例会同状态安排'}]}};
  const [version]=await db.insert(s.operationsReviewMeetingVersion).values({meetingId:meeting.id,versionNumber:0,snapshot,finalizedAt:new Date('2026-11-10T12:00Z'),createdAt:new Date('2026-11-10T12:00Z'),changeSummary:'隔离会后决定'}).returning();frozen={id:version.id,snapshot};
 }
 return {post,campaign,prior,stages,today,noteId,frozen,spec,source};
}
