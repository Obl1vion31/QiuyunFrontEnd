import type {WeeklyMeetingDraft} from './schema';
import {nextDateKey} from './promotion-rules.mjs';

export type ActualDataRange={from:string;through:string}|null;
type RangeFact={metricDate:string;spend:string|number;platformOpenCount:number;actualOpenCount:number;platformLeadCount:number;actualLeadCount:number;impressionCount?:number|null;clickCount?:number|null};
type RangeCard={key:string;facts:RangeFact[];dataRange?:ActualDataRange;missingDates?:string[]};
export type MeetingClickRateBasis=NonNullable<WeeklyMeetingDraft['promotionInputs'][string]['clickRateBasis']>;
export function actualDataRange(facts:RangeFact[]):ActualDataRange {
 const dates=facts.filter(f=>[f.spend,f.platformOpenCount,f.actualOpenCount,f.platformLeadCount,f.actualLeadCount].some(v=>Number.isFinite(Number(v))&&Number(v)!==0)).map(f=>f.metricDate).sort();
 return dates.length?{from:dates[0],through:dates.at(-1)!}:null;
}
export function cardDataRange(card:RangeCard):ActualDataRange {return card.dataRange===undefined?actualDataRange(card.facts):card.dataRange;}
export function sameDataRange(a:ActualDataRange,b:ActualDataRange){return a?.from===b?.from&&a?.through===b?.through;}
/** 同卡、同轮次现有统计区间内汇总原始计数；缺数不补零，也不平均日点击率。 */
export function meetingClickRate(card:RangeCard):{clickRate:number|null;basis:MeetingClickRateBasis}{
 const range=cardDataRange(card),missing=new Set<string>();let impressionCount=0,clickCount=0;
 if(range){
  for(const date of card.missingDates??[])if(date>=range.from&&date<=range.through)missing.add(date);
  for(const fact of card.facts.filter(f=>f.metricDate>=range.from&&f.metricDate<=range.through)){
   if(fact.impressionCount==null||fact.clickCount==null)missing.add(fact.metricDate);
   else{impressionCount+=fact.impressionCount;clickCount+=fact.clickCount;}
  }
 }
 const mode:MeetingClickRateBasis['mode']=!range?'unavailable':missing.size?'manual':impressionCount>0?'auto':'unavailable';
 return {clickRate:mode==='auto'?clickCount/impressionCount*100:null,basis:{mode,impressionCount,clickCount,missingDates:[...missing].sort()}};
}
export function missingClickRateDateRanges(dates:string[]){
 const ranges:Array<{from:string;through:string}>=[];
 for(const date of [...new Set(dates)].sort()){const last=ranges.at(-1);if(last&&nextDateKey(last.through)===date)last.through=date;else ranges.push({from:date,through:date});}
 return ranges.map(r=>r.from===r.through?r.from:r.from+' 至 '+r.through).join('、');
}
/** 共享于编辑与保存：自动数值由事实决定，缺数才保留人工值及原区间确认。 */
export function reconcileClickRateRanges(inputs:WeeklyMeetingDraft['promotionInputs'],before:RangeCard[],after:RangeCard[],previousInputs=inputs):WeeklyMeetingDraft['promotionInputs']{
 const result={...inputs};
 for(const card of after){
  const input=result[card.key]??{clickRate:null,recordedThrough:'',currentSituation:'',activeAction:''},range=cardDataRange(card),calculated=meetingClickRate(card);
  if(calculated.basis.mode!=='manual'){
   result[card.key]={...input,clickRate:calculated.clickRate,clickRateBasis:calculated.basis,rateRange:range,rateNeedsReview:false,recordedThrough:range?.through??''};continue;
  }
  const previous=before.find(p=>p.key===card.key);
  const clickRate=input.clickRateBasis&&input.clickRateBasis.mode!=='manual'?null:input.clickRate;
  const original=input.rateRange!==undefined?input.rateRange:previousInputs[card.key]?.clickRate!=null?cardDataRange(previous??card):range;
  const needsReview=clickRate!=null&&(input.rateNeedsReview===true||!sameDataRange(original,range));
  result[card.key]={...input,clickRate,clickRateBasis:calculated.basis,rateRange:original,rateNeedsReview:needsReview,...(needsReview||clickRate==null?{confirmed:false}:{})};
 }
 return result;
}
type DatedNon={key:string;scheduleId?:string;publishedOn?:string;actualPublishAt?:Date|string|null;checkpointType:string};
export function sortMeetingNonPromotions<T extends DatedNon>(rows:T[]):T[]{
 const id=(r:T)=>r.scheduleId??r.key.split(':')[0],known=new Map<string,string>();
 for(const row of rows)if(row.actualPublishAt&&Number.isFinite(new Date(row.actualPublishAt).getTime()))known.set(id(row),new Date(row.actualPublishAt).toISOString());
 const date=(r:T)=>known.get(id(r))??(r.publishedOn?`${r.publishedOn}T00:00:00.000Z`:'9999');
 return [...rows].sort((a,b)=>date(a).localeCompare(date(b))||(a.scheduleId??a.key.split(':')[0]).localeCompare(b.scheduleId??b.key.split(':')[0])||(a.checkpointType==='day_7'?0:1)-(b.checkpointType==='day_7'?0:1)||a.key.localeCompare(b.key));
}
type NamedMeeting={name:string;periodStart:string;periodEnd:string;meetingType?:string};
export function defaultMeetingName(from:string,to:string,type='weekly'){
 const short=(value:string,year=false)=>year?value.replaceAll('-','.'):value.slice(5).replace('-','.');
 return `${short(from,true)}—${short(to,from.slice(0,4)!==to.slice(0,4))} ${type==='monthly'?'月度':'周度'}业务复盘`;
}
export function refreshedMeetingName(meeting:NamedMeeting,from:string,to:string){
 // 兼容旧编辑器只保存区间、未同步标题的草稿；完整标准标题仍属于自动名称。
 const suffix=meeting.meetingType==='monthly'?'月度':'周度';
 const generated=new RegExp(`^\\d{4}\\.\\d{2}\\.\\d{2}—(?:\\d{4}\\.)?\\d{2}\\.\\d{2} ${suffix}业务复盘$`).test(meeting.name);
 return generated?defaultMeetingName(from,to,meeting.meetingType):meeting.name;
}
export function hasMeetingIssueContent(issue:WeeklyMeetingDraft['issues'][number]){return !!(issue.id||issue.problem.trim()||issue.conclusion.trim()||issue.status!=='pending');}
