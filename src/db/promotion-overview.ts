import {normalizePromotionActualStatus,promotionActualLabels} from './promotion-successors.mjs';
import {promotionStateOn} from './promotion-state.mjs';
/** 生命周期只从现有日度事实计算；缺失、暂停与归档记录不补成投放零值。 */
import type {PromotionTimelineRow} from './promotion-pending';
import type {PromotionContext} from './promotion-state.mjs';
import {campaignPauseWindows,campaignWaitWindows,countPromotionDays,dateInWindows,effectivePromotionStatus,promotionLabels} from './promotion-state.mjs';
import {calculateActualPromotionCosts,nextDateKey,previousDateKey,promotionStageShares} from './promotion-rules.mjs';

export interface PromotionFact {
 id:string;campaignId:string;metricDate:string;dailyStatus:string;stageTypeSnapshot:string;
 spend:string|number;platformOpenCount:number;actualOpenCount:number;platformLeadCount:number;actualLeadCount:number;
 reviewDecision:string;note:string|null;actualStatusSnapshot?:string|null;recordKind?:string;sourceStageStartedOn?:string|null;
}
export interface OverviewCampaign {
 id:string;scheduleId:string;startedOn:string;endedOn:string|null;initialStage:string;currentStage:string|null;currentStatus:string;
}
export interface OverviewStage {campaignId:string;stageType:string;startedOn:string;endedOn:string|null}
export function promotionTotals(metrics:PromotionFact[]){
 const facts=metrics;
 const sum=(key:'spend'|'platformOpenCount'|'actualOpenCount'|'platformLeadCount'|'actualLeadCount')=>facts.length?Math.round(facts.reduce((n,row)=>n+Number(row[key]),0)*100)/100:null;
 const spend=sum('spend'),actualOpenCount=sum('actualOpenCount'),actualLeadCount=sum('actualLeadCount');
 const costs=spend==null?{actualOpenCost:null,actualLeadCost:null}:calculateActualPromotionCosts({spend,actualOpenCount:actualOpenCount??0,actualLeadCount:actualLeadCount??0});
 return {spend,platformOpenCount:sum('platformOpenCount'),actualOpenCount,platformLeadCount:sum('platformLeadCount'),actualLeadCount,...costs,recordedDays:new Set(facts.filter(row=>row.dailyStatus==='active'&&row.recordKind!=='test_residual').map(row=>row.metricDate)).size,from:facts.map(row=>row.metricDate).sort()[0]??null,through:facts.map(row=>row.metricDate).sort().at(-1)??null};
}
export type PromotionTotals=ReturnType<typeof promotionTotals>;
export function promotionOverview(input:{posts:PromotionTimelineRow[];campaigns:OverviewCampaign[];stages:OverviewStage[];metrics:PromotionFact[];context:PromotionContext;today:string;now?:Date;selected?:string|null}){
 const yesterday=previousDateKey(input.today);
 return input.posts.map(post=>{
  const campaigns=input.campaigns.filter(c=>c.scheduleId===post.scheduleId).sort((a,b)=>a.startedOn.localeCompare(b.startedOn));
  const latest=campaigns.at(-1)??null,ids=new Set(campaigns.map(c=>c.id));
  const metrics=input.metrics.filter(row=>ids.has(row.campaignId)).sort((a,b)=>a.metricDate.localeCompare(b.metricDate));
  const state=latest?effectivePromotionStatus(latest.currentStatus,latest.currentStage,latest.id,input.context,input.now??new Date()):post.promotionStatus;
  const status=!post.isPromoted?'none':state;
  const closed=!post.isPromoted||['ended','test_discarded','formal_discarded'].includes(status);
  // 沿用原生命周期的阶段天数比例；截止已登记日，不把比例当作完成率。
  const cutoff=metrics.at(-1)?.metricDate??null;
  const timeline=input.stages.filter(stage=>ids.has(stage.campaignId)&&cutoff&&stage.startedOn<=cutoff)
   .sort((a,b)=>a.startedOn.localeCompare(b.startedOn)).map(stage=>{
    const campaign=campaigns.find(row=>row.id===stage.campaignId)!;
    const through=[stage.endedOn??cutoff!,campaign.endedOn??cutoff!,cutoff!].sort()[0];
    const windows=[...campaignPauseWindows(campaign,input.context),...campaignWaitWindows(campaign,input.context),...input.context.holds.filter(row=>row.campaignId===campaign.id),...metrics.filter(row=>row.campaignId===campaign.id&&row.dailyStatus!=='active').map(row=>({startedOn:row.metricDate,endedOn:row.metricDate}))];
    return {...stage,through,days:countPromotionDays(stage.startedOn,through,windows)};
   }).filter(stage=>stage.days>0);
  const shares=promotionStageShares(timeline.map(stage=>stage.days));
  const stages=['testing','scaling'].flatMap(stageType=>{
   const intervals=input.stages.filter(stage=>ids.has(stage.campaignId)&&stage.stageType===stageType);
   const rows=metrics.filter(row=>row.stageTypeSnapshot===stageType);
   if(!intervals.length&&!rows.length&&latest?.currentStage!==stageType)return [];
   const missing=new Set<string>();
   for(const interval of intervals){
    const campaign=campaigns.find(c=>c.id===interval.campaignId)!;
    const windows=[...campaignPauseWindows(campaign,input.context),...campaignWaitWindows(campaign,input.context),...input.context.holds.filter(h=>h.campaignId===campaign.id)];
    const end=[interval.endedOn??yesterday,campaign.endedOn??yesterday,yesterday].sort()[0];
    const recorded=new Set(rows.filter(row=>row.campaignId===campaign.id&&row.recordKind!=='test_residual').map(row=>row.metricDate));
    for(let day=interval.startedOn;day<=end;day=nextDateKey(day))if(!dateInWindows(day,windows)&&!recorded.has(day))missing.add(day);
   }
   return [{stageType,label:stageType==='testing'?'测试':'放量',metrics:rows,totals:promotionTotals(rows),missingDates:[...missing].sort(),startedOn:intervals.map(s=>s.startedOn).sort()[0]??rows[0]?.metricDate??latest?.startedOn??post.publishedOn,endedOn:intervals.some(s=>!s.endedOn)?null:intervals.map(s=>s.endedOn!).sort().at(-1)??null}];
  });
  const nodeIntervals=input.stages.filter(stage=>ids.has(stage.campaignId)&&stage.startedOn<=input.today).sort((a,b)=>a.startedOn.localeCompare(b.startedOn));
  const nodes=nodeIntervals.map((stage,index)=>({
   ...stage,recordedDays:new Set(metrics.filter(m=>m.campaignId===stage.campaignId&&m.stageTypeSnapshot===stage.stageType&&m.dailyStatus==='active'&&m.metricDate>=stage.startedOn&&(!stage.endedOn||m.metricDate<=stage.endedOn)).map(m=>m.metricDate)).size,
   current:!closed&&stage.campaignId===latest?.id&&index===nodeIntervals.length-1,
  }));
  // 等宽时间单元只表达真实登记或明确的暂停区间，不把未登记日期染成投放记录。
  const recordedDays=new Map(metrics.filter(m=>m.metricDate<=input.today).map(metric=>[metric.metricDate,{date:metric.metricDate,stage:metric.dailyStatus==='active'?metric.stageTypeSnapshot:'paused',registered:true}]));
  if(metrics.length)for(const campaign of campaigns){
   const windows=[...campaignPauseWindows(campaign,input.context),...campaignWaitWindows(campaign,input.context),...input.context.holds.filter(h=>h.campaignId===campaign.id)];
   for(const window of windows){
    const end=[window.endedOn??input.today,campaign.endedOn??input.today,input.today].sort()[0];
    for(let date=window.startedOn;date<=end;date=nextDateKey(date))if(date>=campaign.startedOn&&!recordedDays.has(date))recordedDays.set(date,{date,stage:'paused',registered:false});
   }
  }
  const trace=[...recordedDays.values()].sort((a,b)=>a.date.localeCompare(b.date));
  const events:Array<{key:string;campaignId:string;effectiveOn:string;kind:string;label:string;isCurrent:boolean}>=[];
  for(const campaign of campaigns){
   const dates=new Set([campaign.startedOn,...(input.context.stateChanges??[]).filter(c=>c.campaignId===campaign.id).map(c=>c.businessDate),...(input.context.waitRanges??[]).filter(r=>r.campaignId===campaign.id).flatMap(r=>[r.startedOn,...(r.nextEffectiveOn?[r.nextEffectiveOn]:[])]),...metrics.filter(m=>m.campaignId===campaign.id&&m.recordKind!=='test_residual').map(m=>nextDateKey(m.metricDate)),...(campaign.endedOn?[nextDateKey(campaign.endedOn)]:[])]);
   let previous='';
   for(const effectiveOn of [...dates].filter(d=>d<=input.today).sort()){
    const state=promotionStateOn(campaign,input.context,effectiveOn);if(!state)continue;
    const kind=normalizePromotionActualStatus(state.currentStatus,state.currentStage);if(kind===previous)continue;const preceding=previous;previous=kind;
    const label=kind==='testing'?(preceding?'恢复测试':'开始测试'):kind==='scaling'?(preceding==='scaling_paused'?'恢复放量':'开始放量'):promotionActualLabels[kind]??promotionLabels[kind]??kind;
    events.push({key:`${campaign.id}:${effectiveOn}:${kind}`,campaignId:campaign.id,effectiveOn,kind,label,isCurrent:false});
   }
  }
  if(events.length)events.at(-1)!.isCurrent=true;
  const currentStage=latest?.currentStage??null,currentNode=nodes.at(-1);
  const currentRange=(post.ranges??[]).filter(range=>range.startedOn<=input.today&&range.endedOn>=input.today&&(!range.nextEffectiveOn||range.nextEffectiveOn>input.today)).at(-1);
  const paused=['waiting_action','test_pending','test_paused','scaling_paused','promotion_paused'].includes(status);
  const currentSince=events.at(-1)?.effectiveOn??(paused?(currentRange?.startedOn??input.context.holds.find(h=>h.campaignId===latest?.id&&h.startedOn<=input.today&&h.endedOn>=input.today)?.startedOn??currentNode?.startedOn):currentNode?.startedOn);
  const duration=currentSince?Math.max(1,Math.round((Date.parse(input.today)-Date.parse(currentSince))/86400000)+1):0;
  const currentLabel=closed?(promotionLabels[status]??'已结束'):paused?`${status==='test_pending'?'待定':'暂停'}第 ${duration||1} 天`:currentStage?`${currentStage==='scaling'?'放量':'测试'}第 ${duration||1} 天`:promotionLabels[status]??'待安排';
  const currentKey=latest?`${latest.id}:${status}:${currentSince??latest.startedOn}`:`unstarted:${post.scheduleId}`;
  const key=campaigns.some(c=>c.id===input.selected)?input.selected!:latest?.id??`unstarted:${post.scheduleId}`;
  return {key,events,nodes,trace,currentLabel,currentKey,currentSince,currentStage:paused?'paused':currentStage,scheduleId:post.scheduleId,post,campaigns,latest,status,statusLabel:status==='none'?'已转非推广':status==='scaling'?'放量中':promotionActualLabels[normalizePromotionActualStatus(status,currentStage)]??promotionLabels[status]??status,closed,stages,timeline:timeline.map((stage,index)=>({...stage,share:shares[index]})),cutoff,metrics,totals:promotionTotals(metrics),startedOn:campaigns[0]?.startedOn??post.publishedOn,endedOn:closed?latest?.endedOn??metrics.at(-1)?.metricDate??post.publishedOn:null};
 }).sort((a,b)=>Number(a.closed)-Number(b.closed)||b.startedOn.localeCompare(a.startedOn)||a.post.contentName.localeCompare(b.post.contentName,'zh-CN'));
}
export type PromotionOverview=ReturnType<typeof promotionOverview>[number];
export const promotionDecisionLabels:Record<string,string>={test_continue:'测试继续',test_discarded:'测试淘汰',start_scaling:'测试接放量',scaling_continue:'放量继续',formal_discarded:'放量淘汰',ended:'推广周期结束',wait_continue:'继续当前状态',test_pause:'测试暂停',test_pending:'测试结束待定',scaling_pause:'放量暂停'};
