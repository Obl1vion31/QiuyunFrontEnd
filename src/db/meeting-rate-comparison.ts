/** 新例会使用截止日内的同学科／分类／轮次样本；旧快照不补算。 */
import type {WeeklyMeetingDraft} from './schema';
import {cardDataRange,sameDataRange} from './meeting-card-rules';
export type RateSample={key:string;clickRate:number;threeSecondReadRate?:number;through:string;sourceVersionId?:string;sourceHash?:string};
export type RateComparison={asOf:string;n:number;clickRate:number|null;threeSecondReadRate:number|null;sourceKeys:string[];samples:RateSample[]};
export function rateComparison(samples:RateSample[],asOf:string):RateComparison{
 const valid=[...new Map(samples.filter(s=>s.through<=asOf&&Number.isFinite(s.clickRate)&&s.clickRate>=0&&s.clickRate<=100).map(s=>[s.key,s])).values()].sort((a,b)=>a.key.localeCompare(b.key));
 const read=valid.filter(s=>s.threeSecondReadRate!=null&&Number.isFinite(s.threeSecondReadRate));
 return {asOf,n:valid.length,clickRate:valid.length?valid.reduce((a,s)=>a+s.clickRate,0)/valid.length:null,threeSecondReadRate:read.length?read.reduce((a,s)=>a+s.threeSecondReadRate!,0)/read.length:null,sourceKeys:valid.map(s=>s.key),samples:valid};
}
export function rateDifference(value:number|null|undefined,comparison:RateComparison|undefined,field:'clickRate'|'threeSecondReadRate'='clickRate'){
 const mean=comparison?.[field];return value==null||mean==null||comparison!.n<2?null:value-mean;
}

/** 旧定稿仅从自身冻结样本补展示，不读取实时业务，也不修改传入快照。 */
export function withFrozenRateComparisons<T extends Record<string,any>>(snapshot:T):T{
 if(snapshot.schemaVersion!==4)return snapshot;
 const result=structuredClone(snapshot),generated=result.generated??{},draft=result.draft??{};
 const asOf=result.meeting?.periodEnd??draft.materialSnapshot?.periodEnd;
 if(!asOf)return result;
 generated.promotions=(generated.promotions??[]).map((row:any)=>{
  if(row.rateComparison)return row;
  const samples:RateSample[]=[...(row.rateSamples??[])];
  for(const peer of generated.promotions??[]){
   if(peer.subjectId!==row.subjectId||peer.categoryId!==row.categoryId||peer.stageType!==row.stageType)continue;
   const input=draft.promotionInputs?.[peer.key],range=cardDataRange(peer);
   if(input?.confirmed!==false&&input?.clickRate!=null&&!input.rateNeedsReview&&range&&(input.rateRange===undefined||sameDataRange(input.rateRange,range)))samples.push({key:peer.originKey??peer.key,clickRate:input.clickRate,through:range.through});
  }
  return {...row,rateComparison:rateComparison(samples,asOf)};
 });
 generated.nonPromotions=(generated.nonPromotions??[]).map((row:any)=>{
  if(row.rateComparison)return row;
  const samples:RateSample[]=[...(row.historical?.samples??[]),...(row.peers?.samples??[])].map((s:any)=>({...s,through:s.recordedThrough??s.through}));
  for(const peer of generated.nonPromotions??[]){
   if(peer.subjectId!==row.subjectId||peer.categoryId!==row.categoryId||peer.checkpointType!==row.checkpointType||peer.clickRate==null||peer.threeSecondReadRate==null)continue;
   samples.push({key:peer.key,clickRate:peer.clickRate,threeSecondReadRate:peer.threeSecondReadRate,through:peer.recordedThrough});
  }
  return {...row,rateComparison:rateComparison(samples,asOf)};
 });
 return result;
}
export function promotionRateComparison(row:any,input:WeeklyMeetingDraft['promotionInputs'][string]|undefined):RateComparison|undefined{
 if(row.rateComparison)return row.rateComparison;
 if(!row.rateSamples)return undefined;
 const range=cardDataRange(row),samples:RateSample[]=row.rateSamples.filter((s:RateSample)=>s.key!==row.originKey);
 if(input?.clickRate!=null&&input.confirmed&&!input.rateNeedsReview&&range&&(input.rateRange===undefined||sameDataRange(input.rateRange,range)))samples.push({key:row.originKey,clickRate:input.clickRate,through:range.through,sourceHash:row.sourceHash});
 return rateComparison(samples,row.rateAsOf);
}
export function freezeRateComparisons<T extends {promotions:any[]}>(generated:T,draft:Pick<WeeklyMeetingDraft,'promotionInputs'>):T{
 return {...generated,promotions:generated.promotions.map(row=>{
  if(row.rateComparison||!row.rateSamples)return row;
  const current:RateSample[]=generated.promotions.filter(peer=>peer.subjectId===row.subjectId&&peer.categoryId===row.categoryId&&peer.stageType===row.stageType).flatMap(peer=>{
   const input=draft.promotionInputs[peer.key],range=cardDataRange(peer);
   return input?.clickRate!=null&&input.confirmed&&!input.rateNeedsReview&&range&&(input.rateRange===undefined||sameDataRange(input.rateRange,range))?[{key:peer.originKey,clickRate:input.clickRate,through:range.through,sourceHash:peer.sourceHash}]:[];
  });
  const overridden=new Set(current.map(s=>s.key));
  return {...row,rateComparison:rateComparison([...row.rateSamples.filter((s:RateSample)=>!overridden.has(s.key)),...current],row.rateAsOf)};
 })};
}
