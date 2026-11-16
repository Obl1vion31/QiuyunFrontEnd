import {and,eq} from 'drizzle-orm';
import type {Database} from './client';
import type {readScheduleWorkflow} from './schedule-workflow';
import {buildScheduleHistoryEvents} from './schedule-business-history';
import {promotionAuditView} from './promotion-audit-view';
import * as s from './schema';

/** 仅详情GET补读当前帖子的历史；保存校验不承担这组展示查询。 */
export async function readScheduleBusinessHistory(db:Database,workflow:Awaited<ReturnType<typeof readScheduleWorkflow>>){
 const {schedule}=workflow;
 const [version]=await db.select({contentId:s.operationsContentVersion.contentId,operationType:s.operationsContent.operationType}).from(s.operationsContentVersion).innerJoin(s.operationsContent,eq(s.operationsContent.id,s.operationsContentVersion.contentId)).where(eq(s.operationsContentVersion.id,schedule.contentVersionId));
 const [plan]=await db.select().from(s.operationsNonPromotionReviewPlan).where(eq(s.operationsNonPromotionReviewPlan.contentId,version.contentId));
 const [nodes,audits]=await Promise.all([
  db.select().from(s.operationsNonPromotionCustomCheckpoint).where(and(eq(s.operationsNonPromotionCustomCheckpoint.contentId,version.contentId),...(version.operationType==='promotion_then_continuous'?[eq(s.operationsNonPromotionCustomCheckpoint.scheduleId,schedule.id)]:[]))),
  db.select().from(s.operationsPromotionTimelineAudit).where(and(eq(s.operationsPromotionTimelineAudit.scheduleId,schedule.id),eq(s.operationsPromotionTimelineAudit.action,'note_id_correction'))),
 ]);
 return buildScheduleHistoryEvents({scheduleId:schedule.id,execution:schedule.executionHistory,dateChanges:workflow.history,contexts:workflow.historyContexts,publications:workflow.publicationHistory,applications:workflow.applications,reservations:workflow.publicationReservations,reasons:workflow.historyReasons,reviewHistory:plan?.history??[],nodes,noteEvents:audits.map(promotionAuditView).filter(row=>row.visible)});
}
