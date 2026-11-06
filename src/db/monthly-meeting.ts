import {createHash} from 'node:crypto';
import type {Database} from './client';
import * as s from './schema';
import {readMonthlyWorkspace} from './monthly-workspace';
import {readMonthlyPrivate} from './monthly-private';
import {readMonthlyPlan,monthlyPlanCandidates} from './monthly-plans';
import {adjacentMonth,monthWeeks} from './monthly-plan-types';
import {shanghaiDateKey} from './promotion-rules.mjs';
import {meetingValueKey} from './meeting-discussion-values';
import {WorkflowError} from './schedule-workflow';
import {and,asc,desc,eq,inArray,isNull,lt,sql} from 'drizzle-orm';

export function preserveMonthlyMeetingIdentity(meeting:Pick<typeof s.operationsReviewMeeting.$inferSelect,'meetingType'|'draftSnapshot'>,draft:s.WeeklyMeetingDraft){
 if(meeting.draftSnapshot.monthlySchemaVersion===1){draft.monthlySchemaVersion=1;draft.monthlyPlan??=structuredClone(meeting.draftSnapshot.monthlyPlan);if(!draft.monthlyPlan)throw new WorkflowError('月计划身份缺失，请重新打开月会。',422);}
 if((draft.monthlySchemaVersion||draft.monthlyPlan||draft.monthlyRefreshFingerprint)&&meeting.meetingType!=='monthly')throw new WorkflowError('月度材料只用于月例会。',422);
 if(draft.monthlyPlanReference&&meeting.meetingType!=='weekly')throw new WorkflowError('月计划执行引用及首次锁定由周例会确认。',422);
}

export function requireNewMonthlyPeriod(start:string,end:string,meetingAt:Date,now=new Date()){
 const month=adjacentMonth(shanghaiDateKey(now).slice(0,7),-1),weeks=monthWeeks(month);
 if(start!==`${month}-01`||end!==weeks.at(-1)!.through||shanghaiDateKey(meetingAt).slice(0,7)!==adjacentMonth(month,1))throw new WorkflowError('月例会只能在下个月召开，统计上一个完整自然月。',422);
}
export async function readMonthlyIssues(db:Database,month:string){
 const meetings=await db.select({id:s.operationsReviewMeeting.id,name:s.operationsReviewMeeting.name,meetingAt:s.operationsReviewMeeting.meetingAt}).from(s.operationsReviewMeeting)
  .where(lt(s.operationsReviewMeeting.meetingAt,new Date(adjacentMonth(month,1)+'-01T00:00:00+08:00')));
 const versions=meetings.length?await db.selectDistinctOn([s.operationsReviewMeetingVersion.meetingId],{
  meetingId:s.operationsReviewMeetingVersion.meetingId,issues:sql<s.WeeklyMeetingDraft['issues']>`${s.operationsReviewMeetingVersion.snapshot}#>'{draft,issues}'`,
 }).from(s.operationsReviewMeetingVersion).where(and(inArray(s.operationsReviewMeetingVersion.meetingId,meetings.map(m=>m.id)),eq(s.operationsReviewMeetingVersion.lifecycleStatus,'finalized'),isNull(s.operationsReviewMeetingVersion.invalidatedAt),sql`${s.operationsReviewMeetingVersion.snapshot}->>'finalizationStage' = 'post'`))
  .orderBy(asc(s.operationsReviewMeetingVersion.meetingId),desc(s.operationsReviewMeetingVersion.versionNumber)):[];
 const eligible=meetings.filter(m=>shanghaiDateKey(m.meetingAt).slice(0,7)<=month).sort((a,b)=>a.meetingAt.getTime()-b.meetingAt.getTime());
 const state=new Map<string,{id:string;problem:string;conclusion:string;status:string;meetingId:string;meetingName:string;recordedOn:string;newThisMonth:boolean;mentioned:boolean}>();
 for(const m of eligible){const version=versions.find(v=>v.meetingId===m.id);if(!version)continue;
  const within=shanghaiDateKey(m.meetingAt).startsWith(month);
  for(const issue of version.issues??[]){if(!issue.id)continue;const old=state.get(issue.id);state.set(issue.id,{...issue,id:issue.id,meetingId:m.id,meetingName:m.name,recordedOn:shanghaiDateKey(m.meetingAt),newThisMonth:old?.newThisMonth??within,mentioned:(old?.mentioned??false)||within});}
 }
 return [...state.values()].filter(i=>i.mentioned||i.status!=='resolved');
}
export async function readMonthlyMeeting(db:Database,meeting:{id:string;periodStart:string;periodEnd:string}){
 const month=meeting.periodStart.slice(0,7),base=await readMonthlyWorkspace(db,{month,subject:'',category:''});
 const privateData=base.privateData,plan=await readMonthlyPlan(db,adjacentMonth(month,1)),previousPlan=base.planExecution,issues=await readMonthlyIssues(db,month),candidates=await monthlyPlanCandidates(db,adjacentMonth(month,1));
 const {generatedAt,core,privateData:_private,planExecution:_plan,...operations}=base;
 const data={layoutVersion:2 as const,core:base.core,month,executionMonth:adjacentMonth(month,1),operations,privateData,issues,previousPlan,executionPlan:plan,plan:plan?{id:plan.id,month:plan.month,revision:plan.revision,lockedAt:plan.lockedAt,lockedByVersionId:plan.lockedByVersionId,firstFinalizedAt:plan.firstFinalizedAt,effectiveBatchIds:plan.additions.map(b=>b.id)}:null,candidates};
 // 月会来源不包含“读取时间”，避免正常刷新永远被误判为业务数据变化。
 return {...data,fingerprint:createHash('sha256').update(meetingValueKey({month,operations,privateData,comparison:base.core.comparison,costHistory:base.core.costHistory,issues,previousPlan,executionPlan:plan})).digest('hex')};
}
export type MonthlyMeetingMaterial=Awaited<ReturnType<typeof readMonthlyMeeting>>;
