export interface LeadCostPoint {
 key:string;from:string;through:string;value:number|null;versionNumber:number;
 meetingId?:string;meetingVersion?:number;current?:boolean;
}
export interface LeadCostReview extends LeadCostPoint {
 contentId:string;stageType:string;scheduleId:string;finalizedAt:string;
}

/** 相同版本、阶段和统计区间的修订只留最后定稿，不采用往期累计摘要。 */
export function promotionLeadCostTrend(current:LeadCostReview,history:LeadCostReview[]):LeadCostPoint[]{
 const unique=new Map<string,LeadCostReview>();
 for(const row of history){
  if(row.contentId!==current.contentId||row.stageType!==current.stageType||row.through>current.through||row.value==null)continue;
  if(row.scheduleId===current.scheduleId&&row.from===current.from&&row.through===current.through)continue;
  const key=[row.scheduleId,row.stageType,row.from,row.through].join(':');
  const previous=unique.get(key);
  if(!previous||row.finalizedAt>previous.finalizedAt)unique.set(key,row);
 }
 const points:LeadCostPoint[]=[...unique.values()].sort((a,b)=>a.through.localeCompare(b.through)||a.from.localeCompare(b.from)||a.versionNumber-b.versionNumber).slice(-4).map(({key,from,through,value,versionNumber,meetingId,meetingVersion})=>({key,from,through,value,versionNumber,meetingId,meetingVersion}));
 points.push({key:current.key,from:current.from,through:current.through,value:current.value,versionNumber:current.versionNumber,current:true});
 return points;
}
