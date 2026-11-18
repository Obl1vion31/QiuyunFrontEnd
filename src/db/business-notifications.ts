import type {OperationsUser} from '../auth/permissions';
import type {Database} from './client';
import {readNonPromotionDueCount} from './non-promotion-read-model';
import {readPromotionContext} from './promotion-pauses';
import {promotionReviewDays,promotionReviewQueue} from './promotion-review-days';
import {readPromotionQueueRows} from './promotion-timeline';
import {readPendingScheduleRequestKeys} from './schedule-pending-requests';
import {readMissingRegistrationCount} from './schedule-workflow';

export type SidebarCounts=Partial<Record<'pendingApprovals'|'promotionPending'|'overdue'|'nonPromotionDue',number>>;

export async function readSidebarCounts(db:Database,viewer:OperationsUser,now=new Date()):Promise<SidebarCounts> {
 if(viewer.role==='admin')return {pendingApprovals:(await readPendingScheduleRequestKeys(db,viewer)).count};

 const promotionContext=readPromotionContext(db);
 const [promotionPending,overdue,nonPromotionDue]=await Promise.all([
  readPromotionQueueRows(db,now,promotionContext).then(async rows=>
   promotionReviewQueue(promotionReviewDays(rows,await promotionContext,now)).ready.length),
  readMissingRegistrationCount(db,now),
  readNonPromotionDueCount(db,now,promotionContext),
 ]);
 return {promotionPending,overdue,nonPromotionDue};
}
