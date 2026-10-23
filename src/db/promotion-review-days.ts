import {normalizePromotionActualStatus,promotionActualLabels} from './promotion-successors.mjs';
import type {PromotionTimelineRow} from './promotion-pending';
import {pendingPromotionPeriod} from './promotion-pending';
import type {PromotionContext} from './promotion-state.mjs';
import {campaignPauseWindows,campaignWaitWindows,dateInWindows,firstMissingPromotionDate,promotionStateOn,promotionDayStatusEdit} from './promotion-state.mjs';
import {nextDateKey,previousDateKey,shanghaiDateKey} from './promotion-rules.mjs';
import {meetingDecisionOn,meetingNextDecision} from './meeting-decision-rules.mjs';
import type {MeetingDecision} from './meeting-decisions';

export interface ReviewDay {
 meetingDecision?:MeetingDecision;meetingNext?:string|null;
 date:string;campaignId?:string;kind:'metric'|'arrangement'|'preview';stage:string|null;status:string;
 actualStatus?:string;statusEditOptions?:Array<{value:string;label:string}>;defaultZero?:boolean;waitingThrough?:string;editable:boolean;blockedBy:string|null;opensAt:string;due:boolean;
}
/** 展示到今天，填写止于昨天；连续区间只保留当前状态及到期安排，不伪造指标。 */
export function promotionReviewDays(rows:PromotionTimelineRow[],context:PromotionContext,now=new Date()){
 const today=shanghaiDateKey(now),yesterday=previousDateKey(today);
 return rows.flatMap(row=>{
  if(!row.isPromoted||row.publishedOn>today)return [];
  const campaign=row.campaign,days:ReviewDay[]=[];
  const period=pendingPromotionPeriod(row,now);
  if(row.pending||((!row.campaign||!row.campaign.dailyReviewEnabledOn)&&period?.due)){const date=period?.endedOn??row.date;days.push({date,kind:'arrangement',stage:period?.range?.stageType??null,status:period?.state??'待安排',editable:true,blockedBy:null,opensAt:`${nextDateKey(date)}T00:00:00+08:00`,due:true});}
  const owned=(context.campaigns??[]).filter(item=>'scheduleId' in item&&item.scheduleId===row.scheduleId).sort((a,b)=>a.startedOn.localeCompare(b.startedOn));
  for(const active of owned.length?owned:campaign?[campaign]:[]){
   const campaign=active;
   const facts=(context.metrics??[]).filter(m=>m.campaignId===campaign.id);
   const windows=[...campaignPauseWindows(campaign,context),...campaignWaitWindows(campaign,context),...context.holds.filter(h=>h.campaignId===campaign.id)];
   const expected=firstMissingPromotionDate(facts,campaign.startedOn,windows);
   for(let date=expected;date<=yesterday;date=nextDateKey(date)){
    if(facts.some(m=>m.metricDate===date)||dateInWindows(date,windows))continue;
    const state=promotionStateOn(campaign,context,date);const terminal=(context.stateChanges??[]).find(c=>c.campaignId===campaign.id&&c.businessDate===date&&!c.meetingDecision&&['test_discarded','formal_discarded','ended'].includes(c.actualStatus??''));if(!state||(!state.currentStage&&!terminal))continue;
    days.push({date,campaignId:campaign.id,kind:'metric',stage:date===expected?(state.currentStage??terminal?.stageType??null):null,actualStatus:normalizePromotionActualStatus(state.currentStatus,state.currentStage),statusEditOptions:date===expected?promotionDayStatusEdit(campaign,context,date)?.options:undefined,defaultZero:['test_paused','test_pending','scaling_paused'].includes(normalizePromotionActualStatus(state.currentStatus,state.currentStage)),status:date===expected?(promotionActualLabels[normalizePromotionActualStatus(state.currentStatus,state.currentStage)]??'待安排'):'待安排',editable:date===expected,blockedBy:date===expected?null:expected,opensAt:`${nextDateKey(date)}T00:00:00+08:00`,due:true});
   }
  }
  days.sort((a,b)=>a.date.localeCompare(b.date));
  const firstDue=days.find(day=>day.due)?.date;
  for(const day of days)if(day.kind==='metric'){const decision=meetingDecisionOn(context.meetingDecisions??[],day.campaignId,nextDateKey(day.date));if(decision){day.meetingDecision=decision;day.meetingNext=meetingNextDecision(day.actualStatus??'testing',decision.targetStatus);}}
  for(const day of days)if(day.kind==='metric'&&day.date!==firstDue){day.editable=false;day.blockedBy=firstDue??null;day.stage=null;day.status='待安排';}
  const state=campaign?promotionStateOn(campaign,context,today):null;
  const ended=!row.isPromoted||['ended','test_discarded','formal_discarded'].includes(state?.currentStatus??campaign?.currentStatus??row.promotionStatus);
  if(!ended&&!days.some(d=>d.date===today)){
   const earlier=days.find(d=>d.kind==='metric'||d.kind==='arrangement');
   const range=row.ranges.find(r=>r.startedOn<=today&&(!r.nextEffectiveOn||r.nextEffectiveOn>today));
   const waiting=!!range&&range.endedOn>=today&&(!campaign?.dailyReviewEnabledOn||today<campaign.dailyReviewEnabledOn)||!campaign&&!!row.waitingThrough&&row.waitingThrough>=today;
   const explicit=campaign?.startedOn===today||(context.stateChanges??[]).some(d=>d.campaignId===campaign?.id&&d.businessDate===today);
   const known=waiting||explicit||!earlier;
   days.push({date:today,campaignId:campaign?.id,kind:'preview',actualStatus:state?normalizePromotionActualStatus(state.currentStatus,state.currentStage):undefined,waitingThrough:waiting?(range?.endedOn??row.waitingThrough??undefined):undefined,stage:known?state?.currentStage??null:null,status:waiting?(range?.stageType==='scaling'?'暂停':'待定'):known&&state?.currentStage?(state.currentStage==='scaling'?'放量':'测试'):'待安排',editable:false,blockedBy:earlier?.date??null,opensAt:`${nextDateKey(today)}T00:00:00+08:00`,due:false});
  }
  return days.length?[{row,days:days.sort((a,b)=>a.date.localeCompare(b.date))}]:[];
 }).sort((a,b)=>(a.days.find(d=>d.due)?.date??today).localeCompare(b.days.find(d=>d.due)?.date??today)||a.row.contentName.localeCompare(b.row.contentName,'zh-CN'));
}

/** 统计可录入的数据，不把推广安排、待开放和被前日阻挡的记录混入待填写数。 */
export function promotionReviewQueue(posts:ReturnType<typeof promotionReviewDays>){
 const records=posts.flatMap(({row,days})=>days.map(day=>({row,day})))
  .sort((a,b)=>a.day.date.localeCompare(b.day.date)||a.row.contentName.localeCompare(b.row.contentName,'zh-CN'));
 const ready=records.filter(({day})=>day.kind==='metric'&&day.editable);
 const upcoming=records.filter(({day})=>day.kind==='preview'&&!day.waitingThrough);
 const openingTimes=[...new Set(upcoming.map(({day})=>day.opensAt))].sort();
 return {ready,upcoming,openingGroups:openingTimes.map(opensAt=>({opensAt,records:upcoming.filter(({day})=>day.opensAt===opensAt)})),
  arrangements:records.filter(({day})=>day.kind==='arrangement'),
  continuing:records.filter(({day})=>day.kind==='preview'&&day.waitingThrough),
  blocked:records.filter(({day})=>day.kind==='metric'&&!day.editable)};
}
