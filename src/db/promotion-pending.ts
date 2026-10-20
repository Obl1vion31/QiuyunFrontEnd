/** 待办展示模型：区间中的日期由已保存区间覆盖，不创建日度指标或推算操作时间。 */
import type {readPromotionTimeline} from './promotion-timeline';
import {nextDateKey,previousDateKey,shanghaiDateKey} from './promotion-rules.mjs';
export type PromotionTimelineRow=Awaited<ReturnType<typeof readPromotionTimeline>>[number];
export const inclusiveDays=(from:string,to:string)=>Math.round((Date.parse(to)-Date.parse(from))/86400000)+1;
export function pendingPromotionPeriod(row:PromotionTimelineRow,now=new Date(),includeToday=false){
 const yesterday=previousDateKey(shanghaiDateKey(now)),cutoff=includeToday?shanghaiDateKey(now):yesterday;
 if(!row.isPromoted||['ended','test_discarded','formal_discarded'].includes(row.campaign?.currentStatus??row.promotionStatus))return null;
 const range=row.ranges.filter(item=>item.startedOn<=cutoff&&!item.nextDecision).at(-1);
 const initial=row.canArrangeInitial&&row.waitingThrough&&!row.plan?.plannedOn;
 if(!range&&!initial)return null;
 const startedOn=range?.startedOn??row.publishedOn,endedOn=range?.endedOn??row.waitingThrough!;
 if(startedOn>cutoff)return null;
 const paused=range?.stageType==='scaling';
 return {range,startedOn,endedOn,days:inclusiveDays(startedOn,endedOn),reviewOn:nextDateKey(endedOn),due:endedOn<=yesterday,
  status:range?(paused?'推广暂停中':'测试待定中'):'待定中',state:paused?'暂停':'待定',untilLabel:paused?'暂停至':'待定至',
  context:range?(paused?'放量阶段':'测试阶段'):'尚未开始推广'};
}
export function isPendingPromotionRow(row:PromotionTimelineRow,now=new Date()){
 return row.isPromoted&&(row.pending||!!pendingPromotionPeriod(row,now));
}
