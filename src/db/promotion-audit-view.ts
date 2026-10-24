import {promotionActualLabels} from './promotion-successors.mjs';
/** 只分类和翻译审计；不更改、删除底层记录。未知操作须确认后再接入业务历史。 */
import {promotionDecisionLabels} from './promotion-overview';
import {promotionLabels} from './promotion-state.mjs';
import {nextDateKey} from './promotion-rules.mjs';
import {businessDateTime} from '../scripts/business-date';
import type {operationsPromotionTimelineAudit} from './schema';

type Audit=typeof operationsPromotionTimelineAudit.$inferSelect;
type Snapshot={
 waitingThrough?:string;promotionDeferredThrough?:string;
 schedule?:{promotionStatus?:string;isPromoted?:boolean;actualPublishAt?:string;promotionDeferredThrough?:string};
 plan?:{waitingThrough?:string;plannedOn?:string;plannedStage?:string}|null;
 campaigns?:Array<{id:string;startedOn:string;initialStage:string;endedOn?:string;currentStatus?:string}>;
 metrics?:Array<{id:string;campaignId:string;metricDate:string;stageTypeSnapshot:string;dailyStatus:string;actualStatusSnapshot?:string|null;recordKind?:string;reviewDecision:string;spend:string;platformOpenCount:number;actualOpenCount:number;platformLeadCount:number;actualLeadCount:number}>;
 ranges?:Array<{startedOn:string;endedOn:string;stageType:string;nextDecision?:string;nextEffectiveOn?:string}>;
 decisions?:Array<{businessDate:string;stageType:string;actualStatus?:string|null}>;
 auditCategory?:string;
 meetingDecision?:{targetStatus:string;effectiveOn:string;versionNumber:number};
};
const actions:Record<string,string>={meeting_decision_correction:'例会安排更正',status:'修改当日状态',test_residual:'补录淘汰后残留',wait:'首次推广安排',start_testing:'推广安排更正',start_scaling:'推广安排更正',plan:'安排下一步',pause:'当日暂停',next:'调整待定与下一步',metric_correction:'复盘决定更正',publication_reset:'发布时间更正',usage_change:'推广身份变更',legacy_defer:'首次推广安排'};
const stageLabel=(stage?:string)=>stage==='scaling'?'放量':'测试';

export function promotionSnapshotLabel(value:Record<string,unknown>,date:string,action:string){
 const snapshot=value as Snapshot,{plan,schedule}=snapshot;
 if(action==='meeting_decision_correction'&&snapshot.meetingDecision){const d=snapshot.meetingDecision;return `${d.effectiveOn} 的安排：${promotionActualLabels[d.targetStatus]??d.targetStatus}（例会决定 V${d.versionNumber}）`;}
 if(action==='metric_correction'){
  const metric=snapshot.metrics?.find(row=>row.metricDate===date);
  if(metric)return `${nextDateKey(date)} 的安排：${promotionDecisionLabels[metric.reviewDecision]??metric.reviewDecision}`;
 }
 const range=snapshot.ranges?.filter(row=>row.startedOn<=date&&row.endedOn>=date).at(-1);
 let state:string;
 if(range)state=`${range.stageType==='testing'?'测试待定':'推广暂停'}至 ${range.endedOn}${range.nextDecision&&range.nextEffectiveOn?`；${range.nextEffectiveOn} ${promotionDecisionLabels[range.nextDecision]??range.nextDecision}`:''}`;
 else if(!snapshot.campaigns?.length){
  const waitingThrough=plan?.waitingThrough??schedule?.promotionDeferredThrough??snapshot.waitingThrough??snapshot.promotionDeferredThrough;
  state=waitingThrough?`待定至 ${waitingThrough}`:schedule?.promotionStatus&& !['awaiting_promotion','pending'].includes(schedule.promotionStatus)?promotionLabels[schedule.promotionStatus]??schedule.promotionStatus:'尚未开始';
  if(plan?.plannedOn)state+=`；${plan.plannedOn} 开始${stageLabel(plan.plannedStage)}`;
 }else{
  const campaign=[...snapshot.campaigns].sort((a,b)=>a.startedOn.localeCompare(b.startedOn)).at(-1)!;
  const metric=snapshot.metrics?.find(row=>row.metricDate===date);
  const change=snapshot.decisions?.filter(row=>row.businessDate<=date).sort((a,b)=>a.businessDate.localeCompare(b.businessDate)).at(-1);
  state=metric?`${date} ${metric.recordKind==='test_residual'?'淘汰后残留':metric.actualStatusSnapshot?promotionActualLabels[metric.actualStatusSnapshot]??metric.actualStatusSnapshot:metric.dailyStatus==='waiting_action'?(metric.stageTypeSnapshot==='testing'?'测试待定':'推广暂停'):stageLabel(metric.stageTypeSnapshot)}`:change?`${change.businessDate} 起${change.actualStatus?promotionActualLabels[change.actualStatus]??change.actualStatus:stageLabel(change.stageType)}`:`${campaign.startedOn} 开始${stageLabel(campaign.initialStage)}`;
  if(campaign.endedOn&&campaign.endedOn<=date)state+=`；${campaign.endedOn} ${promotionLabels[campaign.currentStatus??'ended']??'推广结束'}`;
 }
 if(action==='usage_change'){const identity=schedule?.isPromoted===false?'非推广':'推广帖';state=state===identity?identity:`${identity}；${state}`;}
 if(action==='publication_reset'&&schedule?.actualPublishAt)state=`发布时间 ${businessDateTime(schedule.actualPublishAt)}；${state}`;
 return state;
}

export function promotionAuditView(audit:Audit){
 const beforeSnapshot=(audit.before&&typeof audit.before==='object'?audit.before:{}) as Snapshot;
 const afterSnapshot=(audit.after&&typeof audit.after==='object'?audit.after:{}) as Snapshot;
 const technical=beforeSnapshot.auditCategory==='technical'||afterSnapshot.auditCategory==='technical'
  ||/^(technical[:_]|dev_|debug|maintenance_|data_repair|manual_reset|user_requested_reset|reset_for_testing)/.test(audit.action)
  ||/^(按用户要求|根据用户要求).*撤销此前推广操作|^(开发调试|技术维护|数据修复|测试数据清理|脚本修复)[：: ]/.test(audit.reason.trim());
 const initial=['wait','legacy_defer'].includes(audit.action)||['start_testing','start_scaling','plan'].includes(audit.action)&&!beforeSnapshot.campaigns?.length;
 const category=technical?'technical':actions[audit.action]?(initial?'initial':'business'):'unclassified';
 if(category==='technical'||category==='unclassified')return {...audit,category,visible:false,title:'',beforeLabel:'',afterLabel:'',reason:'',archived:[]};
 const before=promotionSnapshotLabel(audit.before,audit.businessDate,audit.action),after=promotionSnapshotLabel(audit.after,audit.businessDate,audit.action);
 const oldMetrics=(audit.before as Snapshot).metrics??[],newMetrics=(audit.after as Snapshot).metrics??[];
 const archived=oldMetrics.filter(row=>!newMetrics.some(kept=>kept.id===row.id));
 const visible=['initial','business'].includes(category)&&(audit.action==='legacy_defer'?after!=='尚未开始':before!==after||archived.length>0);
 return {...audit,category,visible,title:initial?'首次推广安排':actions[audit.action],beforeLabel:before,afterLabel:after,
  reason:audit.action==='legacy_defer'||['首次推广安排','更正历史复盘决定'].includes(audit.reason)?'':audit.reason,archived};
}
