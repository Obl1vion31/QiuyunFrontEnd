import type {WeeklyMeetingDraft} from './schema';

export type ActualDataRange={from:string;through:string}|null;
type RangeFact={metricDate:string;spend:string|number;platformOpenCount:number;actualOpenCount:number;platformLeadCount:number;actualLeadCount:number};
type RangeCard={key:string;facts:RangeFact[];dataRange?:ActualDataRange};
export function actualDataRange(facts:RangeFact[]):ActualDataRange {
 const dates=facts.filter(f=>[f.spend,f.platformOpenCount,f.actualOpenCount,f.platformLeadCount,f.actualLeadCount].some(v=>Number.isFinite(Number(v))&&Number(v)!==0)).map(f=>f.metricDate).sort();
 return dates.length?{from:dates[0],through:dates.at(-1)!}:null;
}
export function cardDataRange(card:RangeCard):ActualDataRange {return card.dataRange===undefined?actualDataRange(card.facts):card.dataRange;}
export function sameDataRange(a:ActualDataRange,b:ActualDataRange){return a?.from===b?.from&&a?.through===b?.through;}
/** 保留人工值；只有日期边界改变才要求重新核对，不把中间零值日拆成多段。 */
export function reconcileClickRateRanges(inputs:WeeklyMeetingDraft['promotionInputs'],before:RangeCard[],after:RangeCard[],previousInputs=inputs):WeeklyMeetingDraft['promotionInputs']{
 const result={...inputs};
 for(const card of after){
  const input=result[card.key];if(!input)continue;
  const previous=before.find(p=>p.key===card.key);
  const original=input.rateRange!==undefined?input.rateRange:previousInputs[card.key]?.clickRate!=null?cardDataRange(previous??card):cardDataRange(card);
  const needsReview=input.clickRate!=null&&(input.rateNeedsReview===true||!sameDataRange(original,cardDataRange(card)));
  result[card.key]={...input,rateRange:original,rateNeedsReview:needsReview,...(needsReview?{confirmed:false}:{})};
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
 return meeting.name===defaultMeetingName(meeting.periodStart,meeting.periodEnd,meeting.meetingType)?defaultMeetingName(from,to,meeting.meetingType):meeting.name;
}
export function hasMeetingIssueContent(issue:WeeklyMeetingDraft['issues'][number]){return !!(issue.id||issue.problem.trim()||issue.conclusion.trim()||issue.status!=='pending');}
