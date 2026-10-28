import type {WeeklyMaterial} from './meeting-weekly-material';

export interface MeetingGap {key:string;name:string;version:number;kind:string;dates:string[];href:string}
/** 与汇总同源；未勾选但贡献本期结果的阶段也必须完整。 */
export function meetingReadiness(material:WeeklyMaterial):MeetingGap[]{
 const promotion=material.promotions.filter(row=>row.missingDates.length).map(row=>({key:row.key,name:row.contentName,version:row.versionNumber,kind:row.stageType==='testing'?`测试第${row.testCycleNumber??1}轮`:'本期放量',dates:row.missingDates,
  href:`/business/daily-promotion-review?focus=${encodeURIComponent(row.scheduleId)}&date=${row.missingDates[0]}#daily-table`}));
 const non=material.pending.map(row=>({key:row.key,name:row.contentName,version:row.versionNumber??0,kind:row.checkpointType==='day_7'?'首轮复盘':'二轮复盘',dates:[row.dueOn??row.recordedThrough??''],
  href:`/business/non-promotion-review?view=pending&row=${encodeURIComponent(row.key)}`}));
 return [...promotion,...non];
}
