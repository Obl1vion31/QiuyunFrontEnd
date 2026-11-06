import {and,eq} from 'drizzle-orm';
import {operationsReviewMeeting} from './schema';
import type {Database} from './client';
import {readMonthlySource,buildMonthlyOperations,buildMonthlyWasteHistory,type MonthlyWasteHistoryPoint,type MonthlyQuery} from './monthly-operations';
import {readMonthlyPrivate} from './monthly-private';
import {readMonthlyPlan} from './monthly-plans';
import {adjacentMonth} from './monthly-plan-types';
import {shanghaiDateKey} from './promotion-rules.mjs';
export async function readMonthlyWorkspace(db:Database,query:MonthlyQuery){
 const now=new Date(),source=await readMonthlySource(db),base=buildMonthlyOperations(source,query,now);
 const history:{wasteHistory?:MonthlyWasteHistoryPoint[]}={wasteHistory:buildMonthlyWasteHistory(source,query,now)};
 const full=query.subject||query.category?buildMonthlyOperations(source,{month:query.month,subject:'',category:''},now):base;
 const privateData=await readMonthlyPrivate(db,full,true);
 const previous=query.month<shanghaiDateKey(now).slice(0,7)?buildMonthlyOperations(source,{month:adjacentMonth(query.month,-1),subject:'',category:''},now):null;
 const comparison=previous?{month:previous.query.month,spend:previous.spend,privateData:await readMonthlyPrivate(db,previous)}:null;
 const meetings=await db.select({id:operationsReviewMeeting.id,name:operationsReviewMeeting.name,version:operationsReviewMeeting.currentVersionNumber}).from(operationsReviewMeeting).where(and(eq(operationsReviewMeeting.meetingType,'monthly'),eq(operationsReviewMeeting.periodStart,query.month+'-01'),eq(operationsReviewMeeting.status,'completed')));
 return {...base,...history,core:{month:query.month,spend:full.spend,privateData,comparison,meetings},privateData,planExecution:await readMonthlyPlan(db,query.month)};
}
export type MonthlyWorkspace=Awaited<ReturnType<typeof readMonthlyWorkspace>>;
