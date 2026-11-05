import {contentRoleLabel} from './content-roles';
import {operationTypeLabels,type OperationType} from './operation-types';
import {businessDateTime} from '../scripts/business-date';
import {operationLabels,type BusinessOperation} from '../auth/business-capabilities';
import {subjects,postCategories} from './taxonomy';
import {delayResponsibilityLabels} from './schedule-rules.mjs';
import {formatSlotRange,blockPromotionLabel,type PlanBlock} from './annual-plan-rules.mjs';
type Snapshot=Record<string,unknown>;
const display=(value:unknown)=>value==null||value===''?'—':typeof value==='boolean'?value?'是':'否':String(value);
function fields(snapshot:Snapshot,taxonomy:{subjects:ReadonlyArray<{id:string;name:string}>;postCategories:ReadonlyArray<{id:string;name:string}>}):Record<string,string>{
  const {subjects,postCategories}=taxonomy;
  const result:Record<string,string>={};
  if(snapshot.monthlyLinks){const links=snapshot.monthlyLinks as {name:string;week:number;bindings:Array<{name:string;scheduleId:string|null}>};result['月计划']=links.name+' · Week '+links.week;result['关联排期']=links.bindings.filter(b=>b.scheduleId).map(b=>b.name).join('\n')||'未关联';}
  const schedule=snapshot.schedule as Record<string,unknown>|undefined;
  const versions=snapshot.versions as Array<Record<string,unknown>>|undefined;
  if(schedule){
    const version=versions?.find(row=>row.id===schedule.contentVersionId);
    for(const [key,label] of [['contentName','内容名称'],['subjectId','学科'],['categoryId','帖子分类'],['projectDocUrl','项目文档']])result[label]=display(key==='subjectId'?subjects.find(row=>row.id===version?.[key])?.name:key==='categoryId'?postCategories.find(row=>row.id===version?.[key])?.name:version?.[key]);
    for(const [key,label] of [['plannedPublishAt','应发时间'],['actualPublishAt','实发时间']])result[label]=schedule[key]?businessDateTime(String(schedule[key])):'—';
    for(const [key,label] of [['isPromoted','推广帖'],['syncToMoments','同步朋友圈'],['publicationUrl','帖子链接']])result[label]=display(schedule[key]);
  }
  if(schedule?.finalReviewOn)result['最终复盘日期']=String(schedule.finalReviewOn);
  if(snapshot.contentRole)result['内容职能']=contentRoleLabel(String(snapshot.contentRole));
  if(snapshot.operationType)result['运营类型']=operationTypeLabels[snapshot.operationType as OperationType];
  if(snapshot.momentsConfirmation){result['已发送朋友圈']='已确认';result['已发送对应需求']='已确认';}
  if(snapshot.reviewPlan){const plan=snapshot.reviewPlan as Record<string,unknown>;if(plan.draftDueOn)result['复盘截止日期']=String(plan.draftDueOn);result['复盘方式']=({standard:'常规复盘',instant:'即时复盘',continuous:'持续复盘'} as Record<string,string>)[String(plan.mode)]??String(plan.mode);result['7天复盘']=plan.day7?'启用':'关闭';result['15天复盘']=plan.day15?'启用':'关闭';}
  if(snapshot.customReviewNodes)result['自定义复盘日期']=(snapshot.customReviewNodes as Array<Record<string,unknown>>).map(n=>`${n.dueOn}${n.cancelledAt?'（已取消）':''}`).join('\n')||'—';
  for(const row of snapshot.rows as Array<Record<string,unknown>>??[]){
    const prefix=`${row.rowName} · `;
    for(const [key,label] of [['rowName','名称'],['year','年度'],['isActive','启用'],['note','备注'],['sectionLabel','分区'],['categoryId','帖子分类']])result[prefix+label]=display(key==='categoryId'?postCategories.find(category=>category.id===row[key])?.name:row[key]);
    const blocks=(snapshot.blocks as Array<Record<string,unknown>>??[]).filter(block=>block.planId===row.id);
    result[prefix+'时间块']=blocks.map(block=>`${formatSlotRange(block as unknown as PlanBlock)} · ${blockPromotionLabel(block as unknown as PlanBlock)}${block.note?' · '+block.note:''}`).join('\n')||'—';
    result[prefix+'链接']=(snapshot.links as Array<Record<string,unknown>>??[]).filter(link=>link.planId===row.id).map(link=>`${link.label}：${link.url}`).join('\n')||'—';
  }
  for(const row of snapshot.years as Array<Record<string,unknown>>??[])result[`${row.year} 年度说明`]=display(row.instructions);
  for(const row of snapshot.reasons as Array<Record<string,unknown>>??[])result[`延期原因 R${row.planRevision} / ${row.dayNumber}`]=`${(delayResponsibilityLabels as Record<string,string>)[String(row.responsibility)]}：${row.reason}`;
  for(const [key,label] of [['campaigns','推广活动'],['metrics','推广日度记录'],['reviews','非推广复盘']] as const)if(snapshot[key])result[label]=`${(snapshot[key] as unknown[]).length} 条`;
  return result;
}
export function proposalDiff(before:Snapshot,after:Snapshot,taxonomy:{subjects:ReadonlyArray<{id:string;name:string}>;postCategories:ReadonlyArray<{id:string;name:string}>}={subjects,postCategories}){
  const left=fields(before,taxonomy),right=fields(after,taxonomy);
  return [...new Set([...Object.keys(left),...Object.keys(right)])].filter(key=>left[key]!==right[key]).map(label=>({label,before:left[label]??'—',after:right[label]??'—'}));
}
export const proposalTitle=(operations:string[])=>operations.map(key=>operationLabels[key as BusinessOperation]??key).join('、');
