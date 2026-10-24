/** 浏览器与事务共用的本期非推广引用；历史补充只保留已经纳入的项。 */
import type {WeeklyMaterial} from './meeting-weekly-material';
import {checkpointsForPublishDate} from './stage-review-rules.mjs';
type Selection={scheduleId:string;checkpointType:'day_7'|'day_15'};
export function meetingNonPromotionSelections(material:Pick<WeeklyMaterial,'nonPromotions'>,selected:Selection[]=[]):Selection[]{
  const retained=new Set(selected.map(row=>`${row.scheduleId}:${row.checkpointType}`));
  return material.nonPromotions.filter(row=>row.kind==='current'||retained.has(row.key)).map(({scheduleId,checkpointType})=>({scheduleId,checkpointType}));
}
export function nonPromotionDueOn(publishedOn:string|undefined|null,checkpointType:string):string{
  if(!publishedOn)return '';
  return checkpointsForPublishDate(new Date(`${publishedOn}T00:00:00+08:00`)).find(row=>row.type===checkpointType)?.dueOn??'';
}
