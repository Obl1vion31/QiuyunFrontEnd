import {groupScheduleHistory,type ScheduleExecutionEvent,type SchedulePlanContext} from './schedule-history';
import {operationTypeLabels,type OperationType} from './operation-types';
import {contentRoleLabel} from './content-roles';
import {delayResponsibilityLabels} from './schedule-rules.mjs';
import type * as s from './schema';

export type HistoryCategory='schedule'|'publication'|'settings';
export type HistoryChange={label:string;before:string|null;after:string|null;format?:'datetime'|'date'|'url'};
export type ScheduleBusinessEvent={id:string;categories:HistoryCategory[];title:string;at:string|null;actor:string|null;reason:string;changes:HistoryChange[];evidence:string[];initial?:boolean;delayReasonId?:string};
type Row<K extends keyof typeof s>=(typeof s)[K] extends {$inferSelect:infer R}?R:never;
type DateChange=Parameters<typeof groupScheduleHistory>[1][number]&{id?:string};
type Input={scheduleId:string;execution:ScheduleExecutionEvent[];dateChanges:DateChange[];contexts?:SchedulePlanContext[];publications:Row<'operationsPublicationEvent'>[];applications:Row<'operationsScheduleChangeRequest'>[];reservations:Row<'operationsPublicationReservation'>[];reasons:Row<'operationsScheduleDelayReason'>[];reviewHistory:Record<string,unknown>[];nodes:Row<'operationsNonPromotionCustomCheckpoint'>[];noteEvents:Array<{id:string;createdAt:Date;changedByLabel:string;reason:string;beforeLabel:string;afterLabel:string}>};
const value=(v:unknown)=>v==null||v===''?null:String(v);
const snapshot=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const timestamp=(v:unknown)=>{if(!(typeof v==='string'||v instanceof Date)||!String(v))return null;const d=new Date(v);return Number.isNaN(d.getTime())?null:d.toISOString();};
const technical=(reason:string)=>/^(开发调试|技术维护|数据修复|测试数据清理|脚本修复)[：: ]/.test(reason.trim());
const textFields=[['name','标题'],['subjectName','学科'],['categoryName','分类'],['projectDocUrl','项目资料'],['platformNoteId','笔记 ID'],['operationType','运营类型'],['contentRole','内容职能'],['syncToMoments','同步朋友圈'],['isPromoted','推广身份']] as const;
function fieldValue(key:string,v:unknown){return v==null||v===''?null:key==='operationType'?operationTypeLabels[v as OperationType]??String(v):key==='contentRole'?contentRoleLabel(String(v)):key==='syncToMoments'||key==='isPromoted'?v?'是':'否':String(v);}
const change=(label:string,before:unknown,after:unknown,format?:HistoryChange['format']):HistoryChange=>({label,before:value(before),after:value(after),...(format?{format}:{})});

/** 只投影已有业务事实；同一快照内的跨周、时间与内容变化共同组成一个事件。 */
export function buildScheduleHistoryEvents(input:Input):ScheduleBusinessEvent[]{
 const events:ScheduleBusinessEvent[]=[],matchedDates=new Set<number>(),matchedNodes=new Set<string>();
 const make=(id:string,categories:HistoryCategory[],title:string,at:unknown,actor:unknown,reason:unknown,changes:HistoryChange[]=[],evidence:string[]=[]):ScheduleBusinessEvent=>({id,categories:[...new Set(categories)],title,at:timestamp(at),actor:value(actor),reason:value(reason)??'',changes,evidence});
 for(const [i,entry]of input.execution.entries()){
  if(technical(entry.reason))continue;
  const before=entry.before,after=entry.after,categories:HistoryCategory[]=[],changes:HistoryChange[]=[],evidence:string[]=[];
  const created=!before,cancelled=!!after?.cancelledAt&&!before?.cancelledAt,restored=!!before?.cancelledAt&&!after?.cancelledAt;
  const from=timestamp(before?.plannedAt),to=timestamp(after?.plannedAt),timeChanged=!!from&&!!to&&from!==to;
  if(created||cancelled||restored||timeChanged){categories.push('schedule');if(to)changes.push(change('应发时间',created?null:from,to,'datetime'));}
  if(timeChanged){
   const match=input.dateChanges.findIndex((row,j)=>!matchedDates.has(j)&&timestamp(row.plannedPublishAt)===from&&timestamp(row.newPlannedPublishAt)===to&&row.changedByLabel===entry.actor&&row.reason===entry.reason);
   if(match>=0){matchedDates.add(match);evidence.push(`排期修订 R${input.dateChanges[match].revision} → R${input.dateChanges[match].revision+1}`);}
  }
  for(const[key,label]of textFields){
   const a=fieldValue(key,after?.[key]),b=fieldValue(key,before?.[key]);if(a===b||created&&(a==null||(['syncToMoments','isPromoted'].includes(key)&&!after?.[key])))continue;
   categories.push(key==='platformNoteId'?'publication':'settings');changes.push(change(label,b,a,key==='projectDocUrl'?'url':undefined));
  }
  const groups=groupScheduleHistory([entry],[],input.contexts??[]);
  const execution=groups.find(g=>g.key==='execution')?.items.filter(item=>item.actor===entry.actor&&item.at===entry.at)??[];
  for(const item of execution)if(!['建立排期','取消排期','重新安排'].includes(item.label)){categories.push('schedule');evidence.push(item.label);}
  if(!categories.length)continue;
  const labels=changes.filter(c=>c.label!=='应发时间').map(c=>c.label);
  const title=created?'建立排期':cancelled?'取消排期':restored?'重新安排':timeChanged?`调整应发时间${labels.length?'及'+labels.join('、'):''}`:labels.length?'修改'+labels.join('、'):'调整预排期归属';
  const event=make(`execution:${input.scheduleId}:${i}`,categories,title,entry.at,entry.actor,entry.reason==='首轮排期填写'?'':entry.reason,changes,evidence);event.initial=created;events.push(event);
 }
 for(const[i,row]of input.dateChanges.entries())if(!matchedDates.has(i))events.push(make(`date:${row.id??input.scheduleId+':'+row.revision}`,['schedule'],'调整应发时间',null,row.changedByLabel,row.reason,[change('应发时间',timestamp(row.plannedPublishAt),timestamp(row.newPlannedPublishAt),'datetime')],[`排期修订 R${row.revision} → R${row.revision+1}`]));
 // 预排期归属作为已有排期事件的依据展示，不制造一条新的操作。
 for(const context of input.contexts??[]){const item=events.filter(e=>e.categories.includes('schedule')&&e.at&&e.at>=context.at).at(0);if(item)item.evidence.push(`${context.month} 预排期 · ${context.week?'原授权 W'+context.week:'原授权 Week 未记录'}`);}
 for(const row of input.publications){
  const changes:HistoryChange[]=[];
  if(row.before.actualPublishAt!==row.after.actualPublishAt)changes.push(change('实发时间',row.before.actualPublishAt,row.after.actualPublishAt,'datetime'));
  for(const[key,label]of [['publicationUrl','帖子链接'],['projectDocUrl','项目资料']] as const)if(row.before[key]!==row.after[key])changes.push(change(label,row.before[key],row.after[key],'url'));
  if(row.after.momentsConfirmation&&!row.before.momentsConfirmation)changes.push(change('运营确认',null,'已发送朋友圈 · 已发送对应需求'));
  if(changes.length)events.push(make('publication:'+row.id,['publication'],row.before.actualPublishAt?'更正发布登记':'已登记发布',row.createdAt,row.changedByLabel,row.reason,changes,[`发布修订 R${row.revision}`]));
 }
 for(const row of input.applications){
  if(row.status==='pending')continue;
  const labels={approved:'同意改期申请',rejected:'驳回改期申请',obsolete:'改期申请失效'};
  events.push(make('application:'+row.id,['schedule'],labels[row.status],row.decidedAt,row.decidedByLabel,row.decisionReason??row.reason,[change('申请应发时间',timestamp(row.originalPlannedPublishAt),timestamp(row.requestedPublishAt),'datetime')],[`申请人：${row.requestedByLabel}`,`申请原因：${row.reason}`]));
 }
 for(const row of input.reservations){
  const labels:Record<string,string>={pending:'提交发布预约',approved:'审核发布预约',rejected:'驳回发布预约',cancelled:'取消发布预约',obsolete:'发布预约失效',fulfilled:'发布预约已完成'};
  for(const[i,entry]of row.history.entries())events.push(make(`reservation:${row.id}:${i}`,['publication'],labels[entry.status]??'发布预约记录',entry.at,entry.actorLabel,entry.reason,[change('预约时间',null,timestamp(row.scheduledPublishAt),'datetime')]));
 }
 for(const row of input.reasons){
  const history=[...row.history.map(snapshot),{reason:row.reason,responsibility:row.responsibility,source:row.source,updatedAt:row.updatedAt,changedByLabel:row.changedByLabel}];
  for(const[i,entry]of history.entries()){
   if(entry.source==='historical')continue;
   const before=i?history[i-1]:null,changes=[change('延期日期',timestamp(row.dueAt),timestamp(row.dueAt),'datetime')];
   if(!before||before.responsibility!==entry.responsibility)changes.push(change('责任归属',before?.responsibility?delayResponsibilityLabels[String(before.responsibility) as keyof typeof delayResponsibilityLabels]:null,delayResponsibilityLabels[String(entry.responsibility) as keyof typeof delayResponsibilityLabels]??'未记录'));
   if(!before||before.reason!==entry.reason)changes.push(change('说明',before?.reason,entry.reason));
   const event=make(`reason:${row.id}:${i}`,['schedule'],i?'更正延期说明':'填写延期说明',entry.updatedAt,entry.changedByLabel,'',changes);
   if(i===history.length-1)event.delayReasonId=row.id;events.push(event);
  }
 }
 const reviewFields=[['operationType','运营类型'],['contentRole','内容职能'],['mode','复盘方式'],['day7','7天复盘'],['day15','15天复盘'],['dueOn','复盘截止日'],['draftDueOn','预设复盘截止日'],['finalReviewOn','最终复盘日期']] as const;
 const reviewValue=(key:string,v:unknown)=>key==='mode'?({standard:'常规复盘',instant:'即时复盘',continuous:'持续复盘'}[String(v)]??value(v)):key==='day7'||key==='day15'?v==null?null:v?'启用':'不启用':fieldValue(key,v);
 for(const[i,row]of input.reviewHistory.entries()){
  if(row.scheduleId&&row.scheduleId!==input.scheduleId)continue;
  if(technical(String(row.reason??'')))continue;
  const before={...snapshot(row.before)},after=snapshot(row.after),changes:HistoryChange[]=[],initial=!Object.keys(before).length;let reason=row.reason;
  // 即时计划保存同时留下配置与节点两份记录。截止日前值以节点为准，合为同一业务事件。
  if(after.dueOn){
   const matches=input.nodes.flatMap(node=>node.history.map((entry,index)=>({entry,key:node.id+':'+index}))).filter(({entry,key})=>!matchedNodes.has(key)&&entry.automatic!==true&&entry.actor===row.actor&&snapshot(entry.after).dueOn===after.dueOn&&timestamp(entry.at)&&timestamp(row.at)&&Math.abs(Date.parse(String(entry.at))-Date.parse(String(row.at)))<=1000);
   if(matches.length===1){before.dueOn=snapshot(matches[0].entry.before).dueOn??null;reason=reason||matches[0].entry.reason;matchedNodes.add(matches[0].key);}
  }
  for(const[key,label]of reviewFields){if(!(key in after))continue;const a=reviewValue(key,after[key]),b=reviewValue(key,before[key]);if(a!==b)changes.push(change(label,b,a,['dueOn','draftDueOn','finalReviewOn'].includes(key)?'date':undefined));}
  if(!changes.length)continue;
  // 配置保存与执行快照会分别留痕。仅同操作者、相同字段前后值且同次写入时合并；不按时间单独猜测。
  const at=timestamp(row.at),identityChanges=changes.filter(c=>['运营类型','内容职能'].includes(c.label));
  const same=identityChanges.length?events.filter(e=>e.id.startsWith('execution:')&&e.at&&at&&Math.abs(Date.parse(e.at)-Date.parse(at))<=1000&&e.actor===value(row.actor)&&identityChanges.every(c=>e.changes.some(x=>x.label===c.label&&x.before===c.before&&x.after===c.after))):[];
  if(same.length===1){
   const event=same[0];for(const c of changes)if(!event.changes.some(x=>x.label===c.label&&x.before===c.before&&x.after===c.after))event.changes.push(c);
   if(!event.categories.includes('settings'))event.categories.push('settings');
   if(!event.initial){const labels=event.changes.filter(c=>c.label!=='应发时间').map(c=>c.label);event.title=event.changes.some(c=>c.label==='应发时间')?'调整应发时间及'+labels.join('、'):'修改'+labels.join('、');}
   if(row.reason&&!event.reason)event.reason=String(row.reason);continue;
  }
  const event=make(`review:${input.scheduleId}:${i}`,['settings'],initial?'设置复盘计划':'调整'+changes.map(c=>c.label).join('、'),row.at,row.actor,reason,changes,row.scheduleId?[]:['整篇帖子的复盘配置']);event.initial=initial;events.push(event);
 }
 for(const node of input.nodes)for(const[i,raw]of node.history.entries()){
  if(matchedNodes.has(node.id+':'+i))continue;
  const before=snapshot(raw.before),after=snapshot(raw.after),cancelled=after.action==='cancel';if(!after.dueOn&&!cancelled)continue;
  // 每周派生节点及重排由最终日期事件解释，不冒充一次人工增删操作。
  if(raw.source==='weekly'||raw.automatic===true||['按最终日期重新安排','统计起点更正，原结果只读保留'].includes(String(raw.reason??''))||technical(String(raw.reason??'')))continue;
  const event=make(`node:${node.id}:${i}`,['settings'],cancelled?'取消复盘节点':before.dueOn?'调整复盘截止日':'新增复盘节点',raw.at,raw.actor,raw.reason,[cancelled?change('复盘截止日',before.dueOn,'已取消'):change('复盘截止日',before.dueOn,after.dueOn,'date')],node.scheduleId!==input.scheduleId?['原帖复盘计划']:[]);events.push(event);
 }
 for(const row of input.noteEvents)events.push(make('note:'+row.id,['publication'],'更正笔记 ID',row.createdAt,row.changedByLabel,row.reason,[change('笔记 ID',row.beforeLabel,row.afterLabel)]));
 return events.filter(e=>e.changes.length||e.evidence.length||e.title==='取消排期'||e.title==='重新安排').map(e=>({...e,evidence:[...new Set(e.evidence)]})).reverse().sort((a,b)=>(b.at??'').localeCompare(a.at??''));
}
