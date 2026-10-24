/** 会后决定保存在不可变例会版本中；日度事实与会前草稿不产生决定。 */
import { asc, eq } from 'drizzle-orm';
import type { Database } from './client';
import { operationsReviewMeetingVersion as versions, operationsPromotionTimelineAudit as audits } from './schema';
import { resolveMeetingDecisions } from './meeting-decision-rules.mjs';
export interface MeetingDecision {
  id:string; campaignId:string; scheduleId:string; effectiveOn:string; targetStatus:string;
  stageType:'testing'|'scaling'; meetingId:string; versionNumber:number; label:string;
}
export async function readMeetingDecisions(db:Database) {
  const [rows, corrections]=await Promise.all([
    db.select().from(versions).orderBy(asc(versions.createdAt),asc(versions.versionNumber)),
    db.select().from(audits).where(eq(audits.action,'meeting_decision_correction')).orderBy(asc(audits.createdAt)),
  ]);
  return resolveMeetingDecisions(rows,corrections) as MeetingDecision[];
}
