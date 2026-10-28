import type {APIRoute} from 'astro';
import {desc,eq,ilike,inArray,or} from 'drizzle-orm';
import {z} from 'zod';
import {getDb} from '../../db/client';
import * as s from '../../db/schema';
import {promotionTotals} from '../../db/promotion-overview';
import {promotionAuditView} from '../../db/promotion-audit-view';
import {readScheduleWorkflow,WorkflowError} from '../../db/schedule-workflow';
import {workflowErrorResponse} from '../../db/workflow-api';
export const prerender=false;
const selection={id:s.operationsContentSchedule.id,contentId:s.operationsContent.id,name:s.operationsContentVersion.contentName,version:s.operationsContentVersion.versionNumber,subject:s.operationsSubject.name,category:s.operationsCategory.name,planned:s.operationsContentSchedule.plannedPublishAt,actual:s.operationsContentSchedule.actualPublishAt,promoted:s.operationsContentSchedule.isPromoted,status:s.operationsContentSchedule.promotionStatus,noteId:s.operationsContent.platformNoteId,document:s.operationsContentVersion.projectDocUrl,publication:s.operationsContentSchedule.publicationUrl,revision:s.operationsContentVersion.revisionSummary};
function posts(){return getDb().select(selection).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentVersion.id,s.operationsContentSchedule.contentVersionId)).innerJoin(s.operationsContent,eq(s.operationsContent.id,s.operationsContentVersion.contentId)).innerJoin(s.operationsSubject,eq(s.operationsSubject.id,s.operationsContentVersion.subjectId)).leftJoin(s.operationsCategory,eq(s.operationsCategory.id,s.operationsContentVersion.categoryId));}
function references(value:unknown,ids:Set<string>):boolean{
 if(!value||typeof value!=='object')return false;
 if(Array.isArray(value))return value.some(item=>references(item,ids));
 const record=value as Record<string,unknown>;return typeof record.scheduleId==='string'&&ids.has(record.scheduleId)||Object.values(record).some(item=>references(item,ids));
}
export const GET:APIRoute=async({url})=>{
 try{
  const id=url.searchParams.get('id');
  if(!id){const query=(url.searchParams.get('q')??'').trim().slice(0,120),offset=z.coerce.number().int().min(0).max(100000).parse(url.searchParams.get('offset')??0);if(!query)return Response.json({rows:[],next:null});
   const pattern='%'+query.replace(/[\\%_]/g,'\\$&')+'%';
   const rows=await posts().where(or(ilike(s.operationsContentVersion.contentName,pattern),eq(s.operationsContent.platformNoteId,query.toLowerCase()))).orderBy(desc(s.operationsContentSchedule.plannedPublishAt),s.operationsContentSchedule.id).limit(21).offset(offset);
   return Response.json({rows:rows.slice(0,20),next:rows.length>20?offset+20:null});
  }
  z.uuid().parse(id);const [post]=await posts().where(eq(s.operationsContentSchedule.id,id));if(!post)throw new WorkflowError('没有找到这篇帖子。',404);
  const versions=await posts().where(eq(s.operationsContent.id,post.contentId)).orderBy(s.operationsContentVersion.versionNumber);
  const campaigns=await getDb().select().from(s.operationsPromotionCampaign).where(eq(s.operationsPromotionCampaign.scheduleId,id));const campaignIds=campaigns.map(row=>row.id);
  const [metrics,stages,non,checkpointEvents,audits,meetingVersions,workflow]=await Promise.all([
   campaignIds.length?getDb().select().from(s.operationsPromotionDailyMetric).where(inArray(s.operationsPromotionDailyMetric.campaignId,campaignIds)).orderBy(s.operationsPromotionDailyMetric.metricDate):[],
   campaignIds.length?getDb().select().from(s.operationsPromotionStage).where(inArray(s.operationsPromotionStage.campaignId,campaignIds)).orderBy(s.operationsPromotionStage.startedOn):[],
   getDb().select().from(s.operationsContentPerformanceMetric).where(eq(s.operationsContentPerformanceMetric.scheduleId,id)),
   getDb().select().from(s.operationsNonPromotionCheckpointEvent).where(eq(s.operationsNonPromotionCheckpointEvent.scheduleId,id)).orderBy(desc(s.operationsNonPromotionCheckpointEvent.sequence)),
   getDb().select().from(s.operationsPromotionTimelineAudit).where(eq(s.operationsPromotionTimelineAudit.scheduleId,id)).orderBy(desc(s.operationsPromotionTimelineAudit.createdAt)),
   getDb().select({id:s.operationsReviewMeeting.id,name:s.operationsReviewMeeting.name,version:s.operationsReviewMeetingVersion.versionNumber,status:s.operationsReviewMeetingVersion.lifecycleStatus,snapshot:s.operationsReviewMeetingVersion.snapshot,invalidatedAt:s.operationsReviewMeetingVersion.invalidatedAt}).from(s.operationsReviewMeetingVersion).innerJoin(s.operationsReviewMeeting,eq(s.operationsReviewMeetingVersion.meetingId,s.operationsReviewMeeting.id)).orderBy(desc(s.operationsReviewMeetingVersion.createdAt)),
   readScheduleWorkflow(getDb(),id),
  ]);
  const history=audits.map(promotionAuditView).filter(row=>row.visible).map(({title,beforeLabel,afterLabel,reason,createdAt})=>({title,beforeLabel,afterLabel,reason,createdAt}));
  return Response.json({post,versions,stages,metrics,totals:promotionTotals(metrics),non,checkpointEvents:checkpointEvents.filter((row,index,all)=>all.findIndex(item=>item.checkpointType===row.checkpointType)===index),history,publicationHistory:workflow.publicationHistory,planHistory:workflow.history,meetings:meetingVersions.filter(row=>!row.invalidatedAt&&references(row.snapshot,new Set([id]))).map(({snapshot,invalidatedAt,...row})=>row)},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){if(error instanceof z.ZodError)return Response.json({message:'查询条件无效。'},{status:422});return workflowErrorResponse(error);}
};
