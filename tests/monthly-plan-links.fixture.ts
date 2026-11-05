import {randomUUID} from 'node:crypto';
import type {Database} from '../src/db/client';
import * as s from '../src/db/schema';
import type {PlanGroup,PlanItem} from '../src/db/monthly-plan-types';
export async function seedLinkPlan(db:Database,options:{month?:string;final?:boolean;groups?:Array<{name:string;quantity:number;week:number;subjectId?:string;categoryId?:string}>}={}){
 const month=options.month??'2026-11';
 const [meeting]=await db.insert(s.operationsReviewMeeting).values({name:month+' 隔离月会',meetingType:'monthly',periodStart:'2026-10-01',periodEnd:'2026-10-31',meetingAt:new Date('2026-11-03T08:00Z'),createdByLabel:'fixture'}).returning();
 const snapshot={sample:'隔离冻结材料，关联不得改写'};
 const [version]=await db.insert(s.operationsReviewMeetingVersion).values({meetingId:meeting.id,versionNumber:1,snapshot,changeSummary:'隔离冻结基线'}).returning();
 const groups:PlanGroup[]=[],items:PlanItem[]=[];
 for(const spec of options.groups??[{name:'TMUA 讲义',quantity:2,week:2}]){
  const id=randomUUID();groups.push({id,annualPlanId:null,annualVersion:null,name:spec.name,quantity:spec.quantity,subjectId:spec.subjectId??'tmua',categoryId:spec.categoryId??'promotional-handout',note:'',reason:'隔离样本'});
  for(let i=0;i<spec.quantity;i++)items.push({id:randomUUID(),groupId:id,week:spec.week,kind:'new',scheduleId:null});
 }
 const [plan]=await db.insert(s.operationsMonthlyPlan).values({month,meetingId:meeting.id,content:{groups,items},sourceVersionId:version.id,revision:1,...(options.final===false?{}:{firstFinalizedAt:new Date('2026-11-03T04:00Z'),lockedAt:new Date('2026-11-04T04:00Z'),lockedByVersionId:version.id})}).returning();
 return {plan,groups,items,meeting,version,snapshot};
}
export async function seedLinkPost(db:Database,name:string,date='2026-11-10T10:00',options:{categoryId?:string;subjectId?:string;version?:number}={}){
 const createdAt=new Date('2026-11-01T02:00Z');
 const [content]=await db.insert(s.operationsContent).values({createdAt,updatedAt:createdAt,operationType:'non_promotion_standard'}).returning();
 const [version]=await db.insert(s.operationsContentVersion).values({contentId:content.id,contentName:name,subjectId:options.subjectId??'tmua',categoryId:options.categoryId??'promotional-handout',versionNumber:options.version??0,workType:'new',createdAt,updatedAt:createdAt}).returning();
 const [schedule]=await db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:new Date(date+':00+08:00'),completionStatus:'pending',createdAt,updatedAt:createdAt}).returning();
 return {content,version,schedule};
}
