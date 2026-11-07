import {operationTypeLabels,type OperationType} from './operation-types';
import {contentRoleLabel} from './content-roles';
import {shanghaiDateKey} from './promotion-rules.mjs';
import {weekOf} from './monthly-plan-types';

export type SchedulePlanContext={planId:string;itemId:string;month:string;week:number|null;kind:'new'|'carry'|'existing';at:string};
export type ScheduleExecutionEvent={at:string;actor:string;reason:string;before:Record<string,unknown>|null;after:Record<string,unknown>|null;planContext?:{before:SchedulePlanContext[];after:SchedulePlanContext[]}};
export type ScheduleHistoryItem={at:string|null;actor:string|null;reason:string;label:string;details?:string[];fromAt?:string;toAt?:string;revision?:number};
export type ScheduleHistoryGroups=Array<{key:'execution'|'schedule'|'content';title:string;items:ScheduleHistoryItem[]}>;
type DateChange={revision:number;plannedPublishAt:Date|string;newPlannedPublishAt:Date|string;endedAt?:Date|string;changedByLabel:string;reason:string};
const iso=(value:Date|string)=>new Date(value).toISOString();
const date=(value:unknown)=>typeof value==='string'||value instanceof Date?shanghaiDateKey(new Date(value)):null;
const fields=[['name','标题'],['subjectName','学科'],['categoryName','分类'],['projectDocUrl','项目文档'],['operationType','运营类型'],['contentRole','内容职能'],['syncToMoments','同步朋友圈'],['isPromoted','推广身份']] as const;
const format=(key:string,value:unknown)=>key==='syncToMoments'||key==='isPromoted'?(value?'是':'否'):value==null||value===''?'未填写':key==='operationType'?operationTypeLabels[value as OperationType]??String(value):key==='contentRole'?contentRoleLabel(String(value)):String(value);

/** 业务历史的共享读模型；原始前后快照继续独立用于截止回放。 */
export function groupScheduleHistory(events:ScheduleExecutionEvent[],changes:DateChange[],contexts:SchedulePlanContext[]=[]):ScheduleHistoryGroups {
 const execution:ScheduleHistoryItem[]=[],schedule:ScheduleHistoryItem[]=changes.map(row=>({label:'应发时间调整',fromAt:iso(row.plannedPublishAt),toAt:iso(row.newPlannedPublishAt),revision:row.revision,at:row.endedAt?iso(row.endedAt):null,actor:row.changedByLabel,reason:row.reason})),content:ScheduleHistoryItem[]=[];
 for(const context of contexts)execution.push({label:`${Number(context.month.slice(5))} 月预排期 · ${context.week?'原授权 W'+context.week:'原授权 Week 未知'}${context.kind==='carry'?' · 上月遗留':context.kind==='existing'?' · 指定帖子':''}`,at:context.at,actor:null,reason:''});
 const matched=new Set<number>();
 for(const entry of events){
  const before=entry.before,after=entry.after,from=date(before?.plannedAt),to=date(after?.plannedAt);
  const available=entry.planContext?.after??contexts.filter(c=>c.at<=entry.at);
  const context=available.find(c=>c.month===to?.slice(0,7));
  const parts:string[]=[];
  if(!before)parts.push('建立排期');
  else if(after?.cancelledAt&&!before.cancelledAt)parts.push('取消排期');
  else if(before.cancelledAt&&!after?.cancelledAt)parts.push('重新安排');
  if(from&&to&&from.slice(0,7)!==to.slice(0,7))parts.push(context?.kind==='carry'?`上月遗留接入 ${Number(to.slice(5,7))} 月`:`${Number(from.slice(5,7))} 月移入 ${Number(to.slice(5,7))} 月`);
  const weekChanged=!!from&&!!to&&(from.slice(0,7)!==to.slice(0,7)||weekOf(from)!==weekOf(to));
  if(weekChanged){
   const origin=context?.week?'原授权 W'+context.week:'原授权 Week 未知';
   parts.push(from!.slice(0,7)===to!.slice(0,7)?`安排 W${weekOf(from!)} → W${weekOf(to!)} · ${origin}`:`${origin} → 安排 W${weekOf(to!)}`);
  }
  if(!parts.length&&entry.planContext){const linked=entry.planContext.after.filter(c=>!entry.planContext!.before.some(b=>b.planId===c.planId&&b.itemId===c.itemId));for(const c of linked)parts.push(`${Number(c.month.slice(5))} 月预排期接入 · ${c.week?'原授权 W'+c.week:'原授权 Week 未知'}`);}
  if(parts.length)execution.push({label:parts.join(' · '),at:entry.at,actor:entry.actor,reason:entry.reason});
  const details=fields.flatMap(([key,label])=>{
   if((before?.[key]??null)===(after?.[key]??null))return [];
   if(!before&&(after?.[key]==null||after[key]===''||(['syncToMoments','isPromoted'].includes(key)&&!after[key])))return [];
   return [label+'：'+(!before?format(key,after?.[key]):format(key,before[key])+' → '+format(key,after?.[key]))];
  });
  if(details.length)content.push({label:before?'内容与设置调整':'初始内容与设置',details,at:entry.at,actor:entry.actor,reason:entry.reason});
  if(before?.plannedAt&&after?.plannedAt&&iso(String(before.plannedAt))!==iso(String(after.plannedAt))){
   const index=schedule.findIndex((row,i)=>!matched.has(i)&&row.fromAt===iso(String(before.plannedAt))&&row.toAt===iso(String(after.plannedAt)));
   if(index>=0)matched.add(index);else schedule.push({label:'应发时间调整',fromAt:iso(String(before.plannedAt)),toAt:iso(String(after.plannedAt)),at:entry.at,actor:entry.actor,reason:entry.reason});
  }
 }
 return ([{key:'execution',title:'排期执行记录',items:execution},{key:'schedule',title:'排期变更记录',items:schedule},{key:'content',title:'内容与设置变更',items:content}] as ScheduleHistoryGroups).filter(group=>group.items.length).map(group=>({...group,items:group.items.reverse().sort((a,b)=>(b.at??'').localeCompare(a.at??''))}));
}
