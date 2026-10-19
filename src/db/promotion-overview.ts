/** 生命周期只从现有日度事实计算；缺失、暂停与归档记录不补成投放零值。 */
import type {PromotionTimelineRow} from './promotion-pending';
import type {PromotionContext} from './promotion-state.mjs';
import {campaignPauseWindows,campaignWaitWindows,dateInWindows,effectivePromotionStatus,promotionLabels} from './promotion-state.mjs';
import {calculateActualPromotionCosts,nextDateKey,previousDateKey} from './promotion-rules.mjs';

export interface PromotionFact {
 id:string;campaignId:string;metricDate:string;dailyStatus:string;stageTypeSnapshot:string;
 spend:string|number;platformOpenCount:number;actualOpenCount:number;platformLeadCount:number;actualLeadCount:number;
 reviewDecision:string;note:string|null;
}
export interface OverviewCampaign {
 id:string;scheduleId:string;startedOn:string;endedOn:string|null;initialStage:string;currentStage:string|null;currentStatus:string;
}
export interface OverviewStage {campaignId:string;stageType:string;startedOn:string;endedOn:string|null}
export function promotionTotals(metrics:PromotionFact[]){
 const facts=metrics.filter(row=>row.dailyStatus==='active');
 const sum=(key:'spend'|'platformOpenCount'|'actualOpenCount'|'platformLeadCount'|'actualLeadCount')=>facts.length?Math.round(facts.reduce((n,row)=>n+Number(row[key]),0)*100)/100:null;
 const spend=sum('spend'),actualOpenCount=sum('actualOpenCount'),actualLeadCount=sum('actualLeadCount');
 const costs=spend==null?{actualOpenCost:null,actualLeadCost:null}:calculateActualPromotionCosts({spend,actualOpenCount:actualOpenCount??0,actualLeadCount:actualLeadCount??0});
 return {spend,platformOpenCount:sum('platformOpenCount'),actualOpenCount,platformLeadCount:sum('platformLeadCount'),actualLeadCount,...costs,recordedDays:new Set(facts.map(row=>row.metricDate)).size,from:facts.map(row=>row.metricDate).sort()[0]??null,through:facts.map(row=>row.metricDate).sort().at(-1)??null};
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
  const stages=['testing','scaling'].flatMap(stageType=>{
   const intervals=input.stages.filter(stage=>ids.has(stage.campaignId)&&stage.stageType===stageType);
   const rows=metrics.filter(row=>row.stageTypeSnapshot===stageType);
   if(!intervals.length&&!rows.length&&latest?.currentStage!==stageType)return [];
   const missing=new Set<string>();
   for(const interval of intervals){
    const campaign=campaigns.find(c=>c.id===interval.campaignId)!;
    const windows=[...campaignPauseWindows(campaign,input.context),...campaignWaitWindows(campaign,input.context),...input.context.holds.filter(h=>h.campaignId===campaign.id)];
    const end=[interval.endedOn??yesterday,campaign.endedOn??yesterday,yesterday].sort()[0];
    const recorded=new Set(rows.filter(row=>row.campaignId===campaign.id&&row.dailyStatus==='active').map(row=>row.metricDate));
    for(let day=interval.startedOn;day<=end;day=nextDateKey(day))if(!dateInWindows(day,windows)&&!recorded.has(day))missing.add(day);
   }
   return [{stageType,label:stageType==='testing'?'测试':'放量',metrics:rows,totals:promotionTotals(rows),missingDates:[...missing].sort(),startedOn:intervals.map(s=>s.startedOn).sort()[0]??rows[0]?.metricDate??latest?.startedOn??post.publishedOn,endedOn:intervals.some(s=>!s.endedOn)?null:intervals.map(s=>s.endedOn!).sort().at(-1)??null}];
  });
  const key=campaigns.some(c=>c.id===input.selected)?input.selected!:latest?.id??`unstarted:${post.scheduleId}`;
  return {key,scheduleId:post.scheduleId,post,campaigns,latest,status,statusLabel:status==='none'?'已转非推广':status==='scaling'?'放量中':promotionLabels[status]??status,closed,stages,metrics,totals:promotionTotals(metrics),startedOn:campaigns[0]?.startedOn??post.publishedOn,endedOn:closed?latest?.endedOn??metrics.at(-1)?.metricDate??post.publishedOn:null};
 }).sort((a,b)=>Number(a.closed)-Number(b.closed)||b.startedOn.localeCompare(a.startedOn)||a.post.contentName.localeCompare(b.post.contentName,'zh-CN'));
}
export type PromotionOverview=ReturnType<typeof promotionOverview>[number];
export const promotionDecisionLabels:Record<string,string>={test_continue:'测试继续',test_discarded:'测试淘汰',start_scaling:'测试接放量',scaling_continue:'放量继续',formal_discarded:'放量淘汰',ended:'推广周期结束',wait_continue:'待定／暂停'};
