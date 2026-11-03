import {promotionTotals,type PromotionFact} from './promotion-overview';
import type {readPromotionContext} from './promotion-pauses';
import {requiredPromotionStage} from './promotion-review-required';
import {previousDateKey,shanghaiDateKey} from './promotion-rules.mjs';

export function shiftReportDate(date:string,days:number){const value=new Date(date+'T00:00:00Z');value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}
type Context=Awaited<ReturnType<typeof readPromotionContext>>;
/** 全量事实口径独立于阶段候选；原阶段卡与历史汇总保持原义。 */
export function weeklyReportMetrics(context:Context,facts:PromotionFact[],from:string,through:string,now=new Date()){
 const campaigns=new Map(context.campaigns.map(c=>[c.id,c]));
 function period(start:string,end:string){
  const rows=facts.filter(f=>campaigns.has(f.campaignId)&&f.metricDate>=start&&f.metricDate<=end);
  const ids=new Set(rows.filter(f=>f.recordKind!=='test_residual'&&f.dailyStatus==='active'||Number(f.spend)>0).map(f=>campaigns.get(f.campaignId)!.scheduleId));
  const recorded=new Set(rows.filter(f=>f.recordKind!=='test_residual').map(f=>`${f.campaignId}:${f.metricDate}`));
  const missing:Array<{scheduleId:string;date:string}>=[];
  const cutoff=[end,previousDateKey(shanghaiDateKey(now))].sort()[0];
  for(const c of campaigns.values())for(let day=[start,c.startedOn].sort().at(-1)!;day<=[cutoff,c.endedOn??cutoff].sort()[0];day=shiftReportDate(day,1))if(!recorded.has(`${c.id}:${day}`)&&requiredPromotionStage(c,context,day))missing.push({scheduleId:c.scheduleId,date:day});
  return {...promotionTotals(rows),from:start,through:end,posts:ids.size,scheduleIds:[...ids].sort(),missing};
 }
 const days=Math.round((Date.parse(through)-Date.parse(from))/86400000)+1;
 return {scope:'all-promotion-facts' as const,current:period(from,through),previous:period(shiftReportDate(from,-days),shiftReportDate(from,-1)),weeks:Array.from({length:4},(_,i)=>{const end=shiftReportDate(through,-(3-i)*7);return period(shiftReportDate(end,-6),end);})};
}
export type WeeklyReportMetrics=ReturnType<typeof weeklyReportMetrics>;
