import {readHistoryPeople,delayDaysWithNames} from '../../db/history-people';
import {readScheduleBusinessHistory} from '../../db/schedule-business-history-read';
import {contentNoteMatch,contentPosts as posts,contentTitleMatch} from '../../db/content-posts';
import type {APIRoute} from 'astro';
import {readVersionNotes} from '../../db/note-identities';
import {noteIdOn} from '../../db/note-identity-rules';
import {shanghaiDateKey} from '../../db/promotion-rules.mjs';
import {and,desc,eq,inArray,isNull,or,sql} from 'drizzle-orm';
import {z} from 'zod';
import {getDb} from '../../db/client';
import * as s from '../../db/schema';
import {promotionTotals} from '../../db/promotion-overview';
import {promotionAuditView} from '../../db/promotion-audit-view';
import {promotionInspectorHistory} from '../../db/inspector-history';
import {readScheduleWorkflow,WorkflowError} from '../../db/schedule-workflow';
import {workflowErrorResponse} from '../../db/workflow-api';
export const prerender=false;
export const GET:APIRoute=async({url,locals})=>{
 try{
  const id=url.searchParams.get('id');
  if(!id){const query=(url.searchParams.get('q')??'').trim().slice(0,120),offset=z.coerce.number().int().min(0).max(100000).parse(url.searchParams.get('offset')??0);if(!query)return Response.json({rows:[],next:null});
   const rows=await posts().where(or(contentTitleMatch(query),contentNoteMatch(query.toLowerCase())))
    .orderBy(desc(s.operationsContentSchedule.plannedPublishAt),s.operationsContentSchedule.id).limit(21).offset(offset);
   const notes=await readVersionNotes(getDb(),rows.map(r=>r.versionId));for(const row of rows)row.noteId=noteIdOn(notes.get(row.versionId)!.periods,shanghaiDateKey(new Date()));
   return Response.json({rows:rows.slice(0,20),next:rows.length>20?offset+20:null});
  }
  z.uuid().parse(id);const [post]=await posts().where(eq(s.operationsContentSchedule.id,id));if(!post)throw new WorkflowError('没有找到这篇帖子。',404);
  const versions=await posts().where(eq(s.operationsContent.id,post.contentId)).orderBy(s.operationsContentVersion.versionNumber);
  const notes=await readVersionNotes(getDb(),versions.map(r=>r.versionId));
  for(const row of [post,...versions])row.noteId=noteIdOn(notes.get(row.versionId)!.periods,shanghaiDateKey(new Date()));
  const campaigns=await getDb().select().from(s.operationsPromotionCampaign).where(eq(s.operationsPromotionCampaign.scheduleId,id));const campaignIds=campaigns.map(row=>row.id);
  const [metrics,stages,non,checkpointEvents,audits,meetingVersions,workflow]=await Promise.all([
   campaignIds.length?getDb().select().from(s.operationsPromotionDailyMetric).where(inArray(s.operationsPromotionDailyMetric.campaignId,campaignIds)).orderBy(s.operationsPromotionDailyMetric.metricDate):[],
   campaignIds.length?getDb().select().from(s.operationsPromotionStage).where(inArray(s.operationsPromotionStage.campaignId,campaignIds)).orderBy(s.operationsPromotionStage.startedOn):[],
   getDb().select().from(s.operationsContentPerformanceMetric).where(inArray(s.operationsContentPerformanceMetric.scheduleId,versions.map(v=>v.id))),
   getDb().select().from(s.operationsNonPromotionCheckpointEvent).where(inArray(s.operationsNonPromotionCheckpointEvent.scheduleId,versions.map(v=>v.id))).orderBy(desc(s.operationsNonPromotionCheckpointEvent.sequence)),
   getDb().select().from(s.operationsPromotionTimelineAudit).where(eq(s.operationsPromotionTimelineAudit.scheduleId,id)).orderBy(desc(s.operationsPromotionTimelineAudit.createdAt)),
   getDb().select({id:s.operationsReviewMeeting.id,name:s.operationsReviewMeeting.name,version:s.operationsReviewMeetingVersion.versionNumber,status:s.operationsReviewMeetingVersion.lifecycleStatus})
    .from(s.operationsReviewMeetingVersion).innerJoin(s.operationsReviewMeeting,eq(s.operationsReviewMeetingVersion.meetingId,s.operationsReviewMeeting.id))
    // strict 保留原来的字符串相等语义，不把 scheduleId 数组自动解包为命中。
    .where(and(isNull(s.operationsReviewMeetingVersion.invalidatedAt),sql`jsonb_path_exists(${s.operationsReviewMeetingVersion.snapshot}, 'strict $.** ? (@.scheduleId.type() == "string" && @.scheduleId == $scheduleId)', jsonb_build_object('scheduleId', ${id}::text), true)`))
    .orderBy(desc(s.operationsReviewMeetingVersion.createdAt)),
   readScheduleWorkflow(getDb(),id,undefined,new Date(),locals.user!),
  ]);
  // 旧标签页仍读取原前后值／时间字段；新详情增补同源的阅读事件。
  const auditViews=audits.map(promotionAuditView).filter(row=>row.visible);
  const person=await readHistoryPeople(getDb());
  const history=promotionInspectorHistory(audits,person).map((event,index)=>({...event,beforeLabel:auditViews[index].beforeLabel,afterLabel:auditViews[index].afterLabel,createdAt:auditViews[index].createdAt}));
  return Response.json({delayDays:delayDaysWithNames(workflow.days,person),historyEvents:await readScheduleBusinessHistory(getDb(),workflow),historyGroups:workflow.historyGroups,executionHistory:workflow.schedule.executionHistory,post,versions,stages,metrics,totals:promotionTotals(metrics),non,checkpointEvents:checkpointEvents.filter((row,index,all)=>all.findIndex(item=>item.checkpointType===row.checkpointType)===index),history,publicationHistory:workflow.publicationHistory,planHistory:workflow.history,meetings:meetingVersions},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){if(error instanceof z.ZodError)return Response.json({message:'查询条件无效。'},{status:422});return workflowErrorResponse(error);}
};
