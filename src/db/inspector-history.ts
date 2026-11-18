import type {ScheduleBusinessEvent,HistoryCategory} from './schedule-business-history';
import {promotionAuditView} from './promotion-audit-view';
import {noteIdOn,type NoteIdPeriod} from './note-identity-rules';

export type InspectorHistoryCategory=HistoryCategory|'promotion';
export type InspectorHistoryEvent=Omit<ScheduleBusinessEvent,'categories'>&{categories:InspectorHistoryCategory[];summary?:string};

/** 只投影已有审计供详情阅读，不改变审计分类、保存或回放规则。 */
export function promotionInspectorHistory(audits:Parameters<typeof promotionAuditView>[0][],name?:(label:string,id?:string|null)=>string):InspectorHistoryEvent[]{
 return audits.map(promotionAuditView).filter(row=>row.visible).map(row=>{
 const identity=row.after.noteIdentity as {scope:'version'|'from_date';effectiveOn:string;periods:NoteIdPeriod[]}|undefined;
 return {
  // 笔记更正已被排期历史读取；同一来源 ID 由显示层合并，其他事件各自保留。
  id:(row.action==='note_id_correction'?'note:':'promotion:')+row.id,
  categories:['promotion'],title:row.title,at:row.createdAt.toISOString(),actor:name?name(row.changedByLabel,audits.find(a=>a.id===row.id)?.changedById):row.changedByLabel,
  reason:row.reason,changes:[{label:row.businessDate,before:row.category==='initial'?null:row.beforeLabel,after:row.afterLabel}],
  initial:row.category==='initial',
  ...(row.action==='note_id_correction'&&identity?{summary:`${identity.scope==='version'?'本版本全部阶段':identity.effectiveOn+' 起'}使用 ${noteIdOn(identity.periods,identity.effectiveOn)??'未填写'}`}:{}),
  evidence:row.archived.map(metric=>`${metric.metricDate} 已归档原始指标：消耗 ¥${metric.spend}；曝光量 ${metric.impressionCount??'未记录'}；点击量 ${metric.clickCount??'未记录'}；平台开口 ${metric.platformOpenCount}，实际开口 ${metric.actualOpenCount}；平台留资 ${metric.platformLeadCount}，实际留资 ${metric.actualLeadCount}`)
 };});
}
