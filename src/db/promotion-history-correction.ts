import {randomUUID} from 'node:crypto';
import {asc,eq,inArray} from 'drizzle-orm';
import {requireAdmin,type OperationsUser} from '../auth/permissions';
import {WorkflowError,type Transaction} from './schedule-workflow';
import {readPromotionContext} from './promotion-pauses';
import {promotionReplayOptions,promotionStateOn} from './promotion-state.mjs';
import {replayPromotionHistory,nextDateKey,shanghaiDateKey} from './promotion-rules.mjs';
import {testingCycleOn} from './promotion-cycles.mjs';
import {promotionNextOptions,nextActualPromotionState} from './promotion-successors.mjs';
import * as s from './schema';

type Snapshot=Awaited<ReturnType<typeof import('./promotion-timeline').promotionSnapshot>>;
export interface HistoryImpact {
 dailyMetrics:number; dates:string[]; arrangements:number; waitRanges:number; dayDecisions:number; holds:number;
 from:string; through:string; message:string; dayAdjustment?:string; originCorrection?:boolean;
}
export class PromotionHistoryPreview extends Error {
 constructor(public impact:HistoryImpact){super('promotion-history-preview');}
}

/** 两个历史入口共用：回放不合法或已登记轮次改变时，从更正次日起整段退出活动历史。 */
export async function correctPromotionHistory(tx:Transaction,input:{
 before:Snapshot;campaign:typeof s.operationsPromotionCampaign.$inferSelect;date:string;
 actor:OperationsUser;reason:string;confirmed:boolean;now:Date;
}){
 const {before,campaign,date,actor,reason,confirmed,now}=input;
 let context=await readPromotionContext(tx);
 const metrics=await tx.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.campaignId,campaign.id)).orderBy(asc(s.operationsPromotionDailyMetric.metricDate));
 const previousCampaign=before.campaigns.find(c=>c.id===campaign.id);
 // 首次起投日期／阶段的既有更正单独保留：它不等同于某日之后的状态链重置。
 if(previousCampaign&&(previousCampaign.startedOn!==campaign.startedOn||previousCampaign.initialStage!==campaign.initialStage)){
  const kept:typeof metrics=[],removed:typeof metrics=[];
  for(const m of metrics){
   if(m.recordKind==='test_residual'||m.metricDate>=campaign.startedOn&&replayPromotionHistory(campaign.startedOn,[...kept,m],{...promotionReplayOptions(campaign,context),asOf:nextDateKey(m.metricDate)}))kept.push(m);else removed.push(m);
  }
  const state=replayPromotionHistory(campaign.startedOn,kept,{...promotionReplayOptions(campaign,context),asOf:shanghaiDateKey(now)});
  if(!state)throw new WorkflowError('首次起投更正与已有安排无法衔接，本次未保存。',422);
  if(removed.length){
   requireAdmin(actor);if(!reason.trim())throw new WorkflowError('请填写首次起投更正原因。',422);
   const dates=removed.map(m=>m.metricDate).sort();
   const impact:HistoryImpact={originCorrection:true,dailyMetrics:removed.length,dates,arrangements:0,waitRanges:0,dayDecisions:0,holds:0,from:dates[0],through:dates.at(-1)!,message:'首次起投日期或阶段更正，将归档与新起点不兼容的记录，保留其余指标。'};
   if(!confirmed)throw new PromotionHistoryPreview(impact);
   await tx.delete(s.operationsPromotionDailyMetric).where(inArray(s.operationsPromotionDailyMetric.id,removed.map(m=>m.id)));
   return {state,archived:removed.length,impact};
  }
  return {state,archived:0,impact:null};
 }
 const decisions=context.stateChanges.filter(d=>d.campaignId===campaign.id&&d.businessDate>date);
 const ranges=context.waitRanges.filter(r=>r.campaignId===campaign.id&&(r.endedOn>date||!r.nextEffectiveOn||r.nextEffectiveOn>date));
 const holds=context.holds.filter(h=>h.campaignId===campaign.id&&h.endedOn>date);
 const through=[shanghaiDateKey(now),...metrics.map(m=>nextDateKey(m.metricDate)),...decisions.map(d=>d.businessDate),...ranges.flatMap(r=>r.nextEffectiveOn?[r.nextEffectiveOn]:[r.endedOn]),...holds.map(h=>nextDateKey(h.endedOn))].sort().at(-1)!;
 const replay=(facts:typeof metrics,strict=true)=>replayPromotionHistory(campaign.startedOn,facts,{...promotionReplayOptions(campaign,context),asOf:through,...(strict?{strictFrom:date}:{})});
 let state=replay(metrics);
 const originalCampaign=before.campaigns.find(c=>c.id===campaign.id)??campaign;
 const originalContext={metrics:before.metrics,stateChanges:before.decisions,waitRanges:before.ranges};
 const roundChanged=metrics.some(m=>m.metricDate>date&&m.recordKind!=='test_residual'&&m.stageTypeSnapshot==='testing'&&testingCycleOn(originalCampaign,originalContext,m.metricDate)?.startedOn!==testingCycleOn(campaign,context,m.metricDate)?.startedOn);
 const dayState=promotionStateOn(campaign,context,date);
 const invalidResume=holds.some(h=>h.startedOn<=date&&h.endedOn>date&&dayState&&!nextActualPromotionState(dayState.currentStatus,h.resumeStage==='testing'?'test_continue':'scaling_continue'));
 if(state&&!roundChanged&&!invalidResume)return {state:replayPromotionHistory(campaign.startedOn,metrics,{...promotionReplayOptions(campaign,context),asOf:shanghaiDateKey(now)})!,archived:0,impact:null};
 const tail=metrics.filter(m=>m.metricDate>date);
 requireAdmin(actor);
 if(!reason.trim())throw new WorkflowError('请填写更正后续推广记录的原因。',422);
 // 移除的是活动执行关系；完整旧值保留在调用方同事务的 before/after 审计。
 for(const d of decisions){
  if(d.meetingDecision){
   const original=context.meetingDecisions.find(m=>m.id===d.id)!;
   await tx.insert(s.operationsPromotionTimelineAudit).values({scheduleId:campaign.scheduleId,requestKey:randomUUID(),businessDate:original.effectiveOn,action:'meeting_decision_correction',reason,before:{meetingDecision:original},after:{meetingDecision:{...original,cancelled:true}},changedById:actor.id,changedByLabel:actor.username,createdAt:now});
  }else await tx.delete(s.operationsPromotionDayDecision).where(eq(s.operationsPromotionDayDecision.id,d.id));
 }
 for(const r of ranges){
  if(r.startedOn>date)await tx.delete(s.operationsPromotionWaitRange).where(eq(s.operationsPromotionWaitRange.id,r.id));
  else await tx.update(s.operationsPromotionWaitRange).set({endedOn:r.endedOn>date?date:r.endedOn,nextDecision:null,nextEffectiveOn:null,revision:r.revision+1,updatedAt:now}).where(eq(s.operationsPromotionWaitRange.id,r.id));
 }
 for(const h of holds){
  if(h.startedOn>date)await tx.delete(s.operationsPromotionHold).where(eq(s.operationsPromotionHold.id,h.id));
  else await tx.update(s.operationsPromotionHold).set({endedOn:date}).where(eq(s.operationsPromotionHold.id,h.id));
 }
 context=await readPromotionContext(tx);
 state=replay(metrics.filter(m=>m.metricDate<=date));
 if(!state)throw new WorkflowError('更正当天或更早的推广记录仍无法衔接，本次未保存。请核对该日状态与次日安排。',422);
 const dates=[...new Set([...tail.map(m=>m.metricDate),...decisions.map(d=>d.businessDate),...ranges.flatMap(r=>[r.startedOn>date?r.startedOn:nextDateKey(date),r.endedOn,...(r.nextEffectiveOn?[r.nextEffectiveOn]:[])]),...holds.flatMap(h=>[h.startedOn>date?h.startedOn:nextDateKey(date),h.endedOn])].filter(d=>d>date))].sort();
 // 不允许用清空历史掩盖更正当天本身不合法的操作。
 if(!dates.length)throw new WorkflowError('所选安排不符合该日状态，本次未保存。',422);
 const changed=metrics.find(m=>m.metricDate===date&&m.recordKind!=='test_residual'),old=before.metrics.find(m=>m.id===changed?.id);
 const dayAdjustment=changed&&old&&changed.reviewDecision!==old.reviewDecision?'更正当天的次日安排将改为“'+(promotionNextOptions(changed.actualStatusSnapshot??changed.stageTypeSnapshot).find(o=>o.value===changed.reviewDecision)?.label??'无后续安排')+'”。':undefined;
 const impact:HistoryImpact={dailyMetrics:tail.length,dates,arrangements:decisions.length+ranges.length+holds.length,waitRanges:ranges.length,dayDecisions:decisions.length,holds:holds.length,from:nextDateKey(date),through:dates.at(-1)!,dayAdjustment,message:'从 '+nextDateKey(date)+' 起至 '+dates.at(-1)+'，本次推广活动的全部后续记录与安排将退出执行，旧内容归档保留；其他帖子、发布事实及冻结例会不变。'};
 if(!confirmed)throw new PromotionHistoryPreview(impact);
 if(tail.length)await tx.delete(s.operationsPromotionDailyMetric).where(inArray(s.operationsPromotionDailyMetric.id,tail.map(m=>m.id)));
 return {state:replayPromotionHistory(campaign.startedOn,metrics.filter(m=>m.metricDate<=date),{...promotionReplayOptions(campaign,context),asOf:shanghaiDateKey(now)})!,archived:tail.length,impact};
}
