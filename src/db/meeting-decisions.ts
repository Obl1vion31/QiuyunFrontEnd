/** 会后决定保存在不可变例会版本中；日度事实与会前草稿不产生决定。 */
import { asc, eq, sql } from 'drizzle-orm';
import type { Database } from './client';
import { operationsReviewMeetingVersion as versions, operationsPromotionTimelineAudit as audits } from './schema';
import { resolveMeetingDecisions } from './meeting-decision-rules.mjs';
export interface MeetingDecision {
  action?:'restart_testing'; id:string; campaignId:string; scheduleId:string; effectiveOn:string; targetStatus:string;
  stageType:'testing'|'scaling'; meetingId:string; versionNumber:number; label:string;
}
export async function readMeetingDecisions(db:Database) {
  const [rows, corrections]=await Promise.all([
    // 回放仍包含失效版与草稿的撤销事件，只在数据库侧裁掉无关材料。
    db.select({
      meetingId:versions.meetingId,createdAt:versions.createdAt,finalizedAt:versions.finalizedAt,
      invalidatedAt:versions.invalidatedAt,lifecycleStatus:versions.lifecycleStatus,
      businessEffects:sql`jsonb_path_query_array(${versions.businessEffects}, '$[*] ? (@.type == "meeting_decisions_reset")')`,
      snapshot:sql`jsonb_build_object(
        'decisionPolicy', ${versions.snapshot}->'decisionPolicy',
        'decisionEffectiveOn', ${versions.snapshot}->'decisionEffectiveOn',
        'finalizationStage', ${versions.snapshot}->'finalizationStage',
        'generated', jsonb_build_object('meetingDecisions', ${versions.snapshot}#>'{generated,meetingDecisions}'))`,
    }).from(versions).orderBy(asc(versions.createdAt),asc(versions.versionNumber)),
    db.select({createdAt:audits.createdAt,after:sql`jsonb_build_object('meetingDecision', ${audits.after}->'meetingDecision')`})
      .from(audits).where(eq(audits.action,'meeting_decision_correction')).orderBy(asc(audits.createdAt)),
  ]);
  return resolveMeetingDecisions(rows,corrections) as MeetingDecision[];
}
