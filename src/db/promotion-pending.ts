/** 待办展示模型：区间中的日期由已保存区间覆盖，不创建日度指标或推算操作时间。 */
import type {readPromotionTimeline} from './promotion-timeline';
import {nextDateKey,previousDateKey,shanghaiDateKey} from './promotion-rules.mjs';
export type PromotionTimelineRow=Awaited<ReturnType<typeof readPromotionTimeline>>[number];
export const inclusiveDays=(from:string,to:string)=>Math.round((Date.parse(to)-Date.parse(from))/86400000)+1;
export function promotionIntervalPreview(from:string,to:string,state='待定'){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))||to<from)return null;
 return `${from} 至 ${to}（含首尾，共 ${inclusiveDays(from,to)} 天）记录为${state}区间；${nextDateKey(to)} 复盘时处理 ${to} 的下一步。`;
}
export function pendingPromotionPeriod(row:PromotionTimelineRow,now=new Date()){
 const yesterday=previousDateKey(shanghaiDateKey(now));
 if(!row.isPromoted||['ended','test_discarded','formal_discarded'].includes(row.campaign?.currentStatus??row.promotionStatus))return null;
 const range=row.ranges.filter(item=>item.startedOn<=yesterday&&!item.nextDecision).at(-1);
 const initial=row.canArrangeInitial&&row.waitingThrough&&!row.plan?.plannedOn;
 if(!range&&!initial)return null;
 const startedOn=range?.startedOn??row.publishedOn,endedOn=range?.endedOn??row.waitingThrough!;
 if(startedOn>yesterday)return null;
 const paused=range?.stageType==='scaling';
 return {range,startedOn,endedOn,days:inclusiveDays(startedOn,endedOn),reviewOn:nextDateKey(endedOn),due:endedOn<=yesterday,
  status:range?(paused?'推广暂停中':'测试待定中'):'待定中',state:paused?'暂停':'待定',untilLabel:paused?'暂停至':'待定至',
  context:range?(paused?'放量阶段':'测试阶段'):'尚未开始推广'};
}
export function isPendingPromotionRow(row:PromotionTimelineRow,now=new Date()){
 return row.isPromoted&&(row.pending||!!pendingPromotionPeriod(row,now));
}
/** 短区间逐日呈现；长区间保留首尾和连续范围，避免展开数百个节点。 */
export function promotionPeriodRecords(period:NonNullable<ReturnType<typeof pendingPromotionPeriod>>,now=new Date()){
 const today=shanghaiDateKey(now);
 const dates:string[]=[];
 for(let date=period.startedOn;date<=period.endedOn;date=nextDateKey(date)){
  dates.push(date);
  if(dates.length===7&&period.days>14)break;
 }
 if(period.days>14)dates.push(previousDateKey(previousDateKey(period.endedOn)),previousDateKey(period.endedOn),period.endedOn);
 return dates.map(date=>({date,label:date===period.endedOn?`${period.state}末日${period.due?' · 下一步待安排':''}`:date===period.startedOn?`${period.state}起始`:date>today?`${period.state}安排`:`${period.state}中`,gapBefore:period.days>14&&date===previousDateKey(previousDateKey(period.endedOn))?{from:nextDateKey(dates[6]),to:previousDateKey(date)}:null}));
}
