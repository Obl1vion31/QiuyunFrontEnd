import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import type {PlanContent} from '../src/db/monthly-plan-types';
import type {Database} from '../src/db/client';
import {discussionFromDraft} from '../src/db/meeting-discussion-values';
import * as s from '../src/db/schema';
export async function prepareMonthlyArrangement(db:Database,baseURL:string,cookie:string,options:{content?:PlanContent}={}){
 async function call(path:string,body:any,form=false){const values=new FormData();if(form)for(const[k,v]of Object.entries(body))values.set(k,String(v));const response=await fetch(baseURL+path,{method:form?'POST':'PATCH',headers:{Cookie:cookie,Origin:baseURL,Accept:'application/json',...(!form?{'Content-Type':'application/json'}:{})},body:form?values:JSON.stringify(body)});const result=await response.json();assert(response.ok,JSON.stringify(result));return result;}
 await call('/api/monthly-private-data',{month:'2026-10',expectedRevision:-1,data:{schemaVersion:2,promotion:[{subjectId:'tmua',demand:'handout',added:20,consulted:12,converted:2}],nonPromotion:[],note:'隔离验收数据'}});
 const meeting=await call('/api/meeting-reviews',{meetingType:'monthly',meetingAt:'2026-11-05T16:00',periodStart:'2026-10-01',periodEnd:'2026-10-31'},true);
 const [row]=await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,meeting.id)),[initial]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId,meeting.id));
 const draft:any=structuredClone(row.draftSnapshot),groupId=randomUUID();
 Object.assign(draft,{situation:'隔离样本：完整月度核对',strategy:'按预排期落实内容',coreConclusion:'确认本月安排并保留变更',nextAction:'完成首轮排期后交管理员核对'});
 draft.monthlyPlan.content=options.content??{groups:[{id:groupId,annualPlanId:null,annualVersion:null,name:'TMUA 讲义',subjectId:'tmua',categoryId:'promotional-handout',quantity:2,note:'隔离验收来源',reason:'月会确认'}],items:[{id:randomUUID(),groupId,kind:'new',week:2,scheduleId:null},{id:randomUUID(),groupId,kind:'new',week:3,scheduleId:null}]};draft.monthlyPlan.editorSteps={original:'confirmed'};
 await call('/api/meeting-reviews/'+meeting.id,{action:'finalize_version_draft',stage:'pre',draftVersionId:initial.id,draft,expectedUpdatedAt:row.updatedAt.toISOString()});
 const [fresh]=await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,meeting.id)),[pre]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId,meeting.id));
 await call('/api/meeting-reviews/'+meeting.id,{action:'finalize_version_draft',stage:'post',sourceVersionId:pre.id,discussion:discussionFromDraft(fresh.draftSnapshot),expectedUpdatedAt:fresh.updatedAt.toISOString()});
 return {meetingId:meeting.id,planId:draft.monthlyPlan.id};
}
