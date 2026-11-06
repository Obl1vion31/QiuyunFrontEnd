import type {DemandType,PrivateCounts,PrivateData,SourcePrivateData,StoredPrivateData} from './monthly-plan-types';
import {emptyCounts} from './monthly-plan-types';

export const privateFields=['added','consulted','converted'] as const;
export const isSourcePrivateData=(data:StoredPrivateData):data is SourcePrivateData=>'schemaVersion' in data&&data.schemaVersion===2;
export const emptySourcePrivateData=():SourcePrivateData=>({schemaVersion:2,promotion:[],nonPromotion:[],note:''});
export function sumPrivateCounts(rows:PrivateCounts[]):PrivateCounts{
 return Object.fromEntries(privateFields.map(key=>[key,rows.some(row=>row[key]===null)?null:rows.reduce((n,row)=>n+(row[key]??0),0)])) as PrivateCounts;
}
export function sourceCountsProjection(data:SourcePrivateData):PrivateData{
 const subjects=[...new Set(data.promotion.map(row=>row.subjectId))];
 return {total:sumPrivateCounts(data.promotion),rows:subjects.flatMap(subjectId=>{
  const rows=data.promotion.filter(row=>row.subjectId===subjectId);
  return [{subjectId,demand:'total' as const,...sumPrivateCounts(rows)},...rows];
 }),note:data.note};
}
export function privateUnitCosts(spend:number|null,counts:PrivateCounts){
 return Object.fromEntries(privateFields.map(key=>[key,spend!==null&&counts[key]!==null&&counts[key]!>0?Math.round(spend/counts[key]!*100)/100:null])) as PrivateCounts;
}
export function sourcePromotionRows(data:SourcePrivateData,scope:Array<{subjectId:string;demand:DemandType}>){
 const keys=new Map(scope.map(row=>[`${row.subjectId}:${row.demand}`,row]));
 for(const row of data.promotion)if(privateFields.some(key=>row[key]!==null))keys.set(`${row.subjectId}:${row.demand}`,row);
 return [...keys.values()].map(row=>({...row,...(data.promotion.find(value=>value.subjectId===row.subjectId&&value.demand===row.demand)??emptyCounts())}));
}
export function privateCostChange(value:number|null,previous:number|null){
 if(value===null||previous===null)return null;
 const amount=Math.round((value-previous)*100)/100;
 return {amount,percent:previous===0?null:Math.round(amount/previous*1000)/10};
}
