import {readScheduleComparison} from './schedule-baseline';
import {and,eq} from 'drizzle-orm';
import {operationsReviewMeeting} from './schema';
import type {Database} from './client';
import {readMonthlySource,buildMonthlyOperations,buildMonthlyWasteHistory,type MonthlyWasteHistoryPoint,type MonthlyQuery} from './monthly-operations';
import {buildMonthlyPrivate,readMonthlyPrivateContext} from './monthly-private';
import {readMonthlyPlan} from './monthly-plans';
import {adjacentMonth} from './monthly-plan-types';
import {shanghaiDateKey} from './promotion-rules.mjs';
export interface MonthlyCostHistoryPoint {
 month:string;from:string;through:string;inProgress:boolean;
 spend?:number|null;actualOpenCost:number|null;actualLeadCost:number|null;added:number|null;consulted:number|null;converted:number|null;
}
export async function readMonthlyWorkspace(db:Database,query:MonthlyQuery){
 const now=new Date(),source=await readMonthlySource(db),base=buildMonthlyOperations(source,query,now);
 const history:{wasteHistory?:MonthlyWasteHistoryPoint[]}={wasteHistory:buildMonthlyWasteHistory(source,query,now)};
 const full=query.subject||query.category?buildMonthlyOperations(source,{month:query.month,subject:'',category:''},now):base;
 const currentMonth=shanghaiDateKey(now).slice(0,7);
 const months=Array.from({length:6},(_,i)=>adjacentMonth(query.month,i-5));
 const context=await readMonthlyPrivateContext(db,months,true,source.taxonomy);
 const monthly=months.map(month=>{
  const operations=month===query.month?full:buildMonthlyOperations(source,{month,subject:'',category:''},now);
  return {operations,privateData:buildMonthlyPrivate(operations,month===query.month?context:{...context,sourceOptions:[]})};
 });
 const privateData=monthly.at(-1)!.privateData,previous=query.month<currentMonth?monthly.at(-2)!:null;
 const comparison=previous?{month:previous.operations.query.month,spend:previous.operations.spend,privateData:previous.privateData}:null;
 const costHistory:MonthlyCostHistoryPoint[]=monthly.map(({operations,privateData:p})=>({
  month:operations.query.month,from:operations.from,through:operations.through,inProgress:operations.query.month>=currentMonth,
  spend:operations.spend.spend,actualOpenCost:operations.spend.actualOpenCost,actualLeadCost:operations.spend.actualLeadCost,
  added:p.sourceData?p.totalCosts.added:null,consulted:p.sourceData?p.totalCosts.consulted:null,converted:p.sourceData?p.totalCosts.converted:null,
 }));
 const meetings=await db.select({id:operationsReviewMeeting.id,name:operationsReviewMeeting.name,version:operationsReviewMeeting.currentVersionNumber}).from(operationsReviewMeeting).where(and(eq(operationsReviewMeeting.meetingType,'monthly'),eq(operationsReviewMeeting.periodStart,query.month+'-01'),eq(operationsReviewMeeting.status,'completed')));
 const core:{month:string;spend:typeof full.spend;privateData:typeof privateData;comparison:typeof comparison;meetings:typeof meetings;costHistory?:MonthlyCostHistoryPoint[]}={month:query.month,spend:full.spend,privateData,comparison,meetings,costHistory};
 return {...base,...history,core,privateData,scheduleComparison:await readScheduleComparison(db,base.from,base.through,now),planExecution:await readMonthlyPlan(db,query.month)};
}
export type MonthlyWorkspace=Awaited<ReturnType<typeof readMonthlyWorkspace>>;
