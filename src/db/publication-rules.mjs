/** 发布方式与完成情况独立；预约到点也不生成实发事实。 */
export const publicationLabels = { unpublished:'待发布',awaiting_approval:'预约待审',scheduled:'已预约',needs_confirmation:'到点待确认',rejected:'预约已驳回',published:'已发送' };
export function publicationState(schedule,reservation,now=new Date()) {
  if(schedule.actualPublishAt)return 'published';
  if(!reservation || reservation.planRevision!==schedule.planRevision)return 'unpublished';
  if(['pending','approved'].includes(reservation.status)) {
    if(new Date(reservation.scheduledPublishAt)<=now)return 'needs_confirmation';
    return reservation.status==='pending'?'awaiting_approval':'scheduled';
  }
  return reservation.status==='rejected'?'rejected':'unpublished';
}
