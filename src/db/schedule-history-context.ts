import {and,desc,eq,inArray,isNull,sql} from 'drizzle-orm';
import type {Database} from './client';
import type {PlanContent} from './monthly-plan-types';
import type {SchedulePlanContext} from './schedule-history';
import * as s from './schema';

/** 预排期来源只能来自对应版本；封存后的实际 Week 不能反充原授权 Week。 */
export async function readSchedulePlanContexts(db:Database,scheduleIds:string[]){
 const result=new Map<string,SchedulePlanContext[]>();if(!scheduleIds.length)return result;
 const links=await db.select({scheduleId:s.operationsMonthlyPlanAssignment.scheduleId,itemId:s.operationsMonthlyPlanAssignment.itemId,planId:s.operationsMonthlyPlan.id,month:s.operationsMonthlyPlan.month,meetingId:s.operationsMonthlyPlan.meetingId,firstAt:s.operationsMonthlyPlan.firstFinalizedAt,sealedAt:s.operationsMonthlyPlan.lockedAt,content:s.operationsMonthlyPlan.content,additions:s.operationsMonthlyPlan.additions})
 .from(s.operationsMonthlyPlanAssignment).innerJoin(s.operationsMonthlyPlan,eq(s.operationsMonthlyPlan.id,s.operationsMonthlyPlanAssignment.planId)).where(inArray(s.operationsMonthlyPlanAssignment.scheduleId,scheduleIds));
 const meetings=[...new Set(links.filter(l=>l.sealedAt).map(l=>l.meetingId))];
 const versions=meetings.length?await db.select({meetingId:s.operationsReviewMeetingVersion.meetingId,plan:sql<{content:PlanContent;additions?:Array<{content:PlanContent}>}|null>`${s.operationsReviewMeetingVersion.snapshot}#>'{draft,monthlyPlan}'`})
 .from(s.operationsReviewMeetingVersion).where(and(inArray(s.operationsReviewMeetingVersion.meetingId,meetings),eq(s.operationsReviewMeetingVersion.lifecycleStatus,'finalized'),isNull(s.operationsReviewMeetingVersion.invalidatedAt),sql`coalesce(${s.operationsReviewMeetingVersion.snapshot}->>'arrangementSealed','false') <> 'true'`)).orderBy(desc(s.operationsReviewMeetingVersion.versionNumber)):[];
 for(const link of links){
  if(!link.scheduleId||!link.firstAt)continue;
  const source=link.sealedAt?versions.find(v=>v.meetingId===link.meetingId&&v.plan?.content?.items)?.plan:link;
  const items=source?[...source.content.items,...(source.additions??[]).flatMap(b=>b.content.items)]:[];
  const item=items.find(i=>i.scheduleId===link.scheduleId)??items.find(i=>i.id===link.itemId&&!i.scheduleId);
  const context:SchedulePlanContext={planId:link.planId,itemId:link.itemId,month:link.month,week:item?.week??null,kind:item?.kind??'existing',at:link.firstAt.toISOString()};
  result.set(link.scheduleId,[...(result.get(link.scheduleId)??[]),context]);
 }
 return result;
}
