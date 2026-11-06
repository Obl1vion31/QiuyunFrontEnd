import {randomUUID} from 'node:crypto';
import {asc,eq,sql} from 'drizzle-orm';
import {requireAdmin,type OperationsUser} from '../auth/permissions';
import type {Database} from './client';
import {WorkflowError,StaleWriteError} from './schedule-workflow';
import {lockPromotionWorkflow,readPromotionContext} from './promotion-pauses';
import {promotionSnapshot,timelineFingerprint} from './promotion-timeline';
import {promotionMetricStatus,promotionStateOn,promotionReplayOptions} from './promotion-state.mjs';
import {previousDateKey,nextDateKey,shanghaiDateKey,replayPromotionHistory} from './promotion-rules.mjs';
import {promotionActualLabels,normalizePromotionActualStatus,promotionStatusStage} from './promotion-successors.mjs';
import {historicalDayCanFollow,historicalDayBridge} from './promotion-day-rules.mjs';
import {testingCycleOn} from './promotion-cycles.mjs';
import {syncContinuousCheckpoints} from './continuous-schedule';
import * as s from './schema';

export type DayValues={spend:number;platformOpenCount:number;actualOpenCount:number;platformLeadCount:number;actualLeadCount:number;note?:string|null};
export interface HistoricalDayInput {
 metricId:string;targetStatus:string;requestKey?:string;fingerprint?:string;
 confirmDayContext?:boolean;contextFingerprint?:string;values?:DayValues;reason?:string;
}
const label=(status:string|null)=>status?promotionActualLabels[status]??status:'尚未开始推广';
export async function saveHistoricalPromotionDay(db:Database,input:HistoricalDayInput,actor:OperationsUser,now=new Date()){
 return db.transaction(async tx=>{
  await lockPromotionWorkflow(tx);
  const [metric]=await tx.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.id,input.metricId));
  if(!metric)throw new WorkflowError('没有找到这一天的复盘记录。',404);
  if(metric.recordKind==='test_residual')throw new WorkflowError('残留数据只登记指标，不修改当日推广状态。',422);
  await tx.execute(sql`select id from operations_promotion_campaign where id = ${metric.campaignId} for update`);
  const [campaign]=await tx.select().from(s.operationsPromotionCampaign).where(eq(s.operationsPromotionCampaign.id,metric.campaignId));
  if(!campaign)throw new WorkflowError('没有找到这篇帖子的推广活动。',404);
  const signature=JSON.stringify({metricId:input.metricId,targetStatus:input.targetStatus,values:input.values??null,reason:input.reason??''});
  const requestKey=input.requestKey??randomUUID();
  const [repeat]=await tx.select().from(s.operationsPromotionTimelineAudit).where(eq(s.operationsPromotionTimelineAudit.requestKey,requestKey));
  if(repeat){
   if(repeat.changedById!==actor.id||repeat.after.dayEditSignature!==signature)throw new WorkflowError('请求编号已被使用，请重新保存。',422);
   return {ok:true,repeated:true,metricId:metric.id};
  }
  const before=await promotionSnapshot(tx,campaign.scheduleId),context=await readPromotionContext(tx),date=metric.metricDate;
  const current=promotionMetricStatus(campaign,context,metric);
  const target=input.targetStatus;
  if(!Object.hasOwn(promotionActualLabels,target))throw new WorkflowError('请选择有效的当日安排。',422);
  const statusChanged=target!==current;
  if(!input.fingerprint||input.fingerprint!==timelineFingerprint(before))throw new StaleWriteError('这篇帖子的记录已更新，请重新打开当天详情核对后再修改。输入已保留。');
  if(statusChanged){
   if(!(['test_paused','test_pending'].includes(current)&&['test_paused','test_pending'].includes(target)))requireAdmin(actor);
  }
  const rows=before.metrics.filter(m=>m.campaignId===campaign.id&&m.recordKind!=='test_residual');
  const neighbour=(day:string)=>{
   const recorded=rows.find(m=>m.metricDate===day);
   const status=day<campaign.startedOn?null:recorded?promotionMetricStatus(campaign,context,recorded):promotionStateOn(campaign,context,day)?.currentStatus??campaign.currentStatus;
   return {date:day,status,label:label(status),recorded:!!recorded};
  };
  const previous=neighbour(previousDateKey(date)),next=neighbour(nextDateKey(date));
  const restarted=(day:string)=>{const cycle=testingCycleOn(campaign,context,day);return !!cycle&&cycle.number>1&&cycle.startedOn===day;};
  const dayContext={previous,current:{date,before:current,beforeLabel:label(current),after:target,afterLabel:label(target)},next};
  const message='前一天 '+previous.date+'：'+previous.label+(previous.recorded?'':'（既有状态）')+'\n当天 '+date+'：'+label(current)+' → '+label(target)+'\n后一天 '+next.date+'：'+next.label+(next.recorded?'':'（既有状态，尚未登记）')+'\n\n仅修改所选日期，前后日期保持原状。请确认是否修改？';
  if(statusChanged){
   if(!historicalDayCanFollow(previous.status??campaign.initialStage,target,restarted(date)))throw new WorkflowError(previous.date+' 的“'+previous.label+'”不能衔接 '+date+' 的“'+label(target)+'”。请选择能衔接前一天的当日安排，本次未保存。',422);
   if(!historicalDayCanFollow(target,next.status,restarted(next.date)))throw new WorkflowError(date+' 的“'+label(target)+'”不能衔接 '+next.date+' 的“'+next.label+'”。请选择能衔接后一天的当日安排，本次未保存。',422);
   const contextFingerprint=timelineFingerprint({fingerprint:timelineFingerprint(before),dayContext,signature});
   if(!input.confirmDayContext)return {contextRequired:true as const,dayContext,contextFingerprint,message};
   if(input.contextFingerprint!==contextFingerprint)throw new StaleWriteError('前后状态或本次输入已变化，请重新核对三天状态后确认。输入已保留。');
  }
  const targetStage=(promotionStatusStage(target)??(target==='test_discarded'?'testing':'scaling')) as 'testing'|'scaling';
  const bridge=statusChanged?historicalDayBridge(target,next.status,restarted(next.date)):metric.reviewDecision;
  if(!bridge)throw new WorkflowError('当天与后一天无法衔接，本次未保存。',422);
  const values=input.values?{spend:input.values.spend.toFixed(2),platformOpenCount:input.values.platformOpenCount,actualOpenCount:input.values.actualOpenCount,platformLeadCount:input.values.platformLeadCount,actualLeadCount:input.values.actualLeadCount,note:input.values.note??null}:{};
  const reason=input.reason?.trim()||input.values?.note?.trim()||'核对前后状态后更正当日安排';
  if(statusChanged)await tx.insert(s.operationsPromotionDayDecision).values({campaignId:campaign.id,businessDate:date,stageType:targetStage,actualStatus:target,reason}).onConflictDoUpdate({target:[s.operationsPromotionDayDecision.campaignId,s.operationsPromotionDayDecision.businessDate],set:{stageType:targetStage,actualStatus:target,reason}});
  const [saved]=await tx.update(s.operationsPromotionDailyMetric).set({...values,...(statusChanged?{actualStatusSnapshot:target,dailyStatus:['testing','scaling'].includes(target)?'active':'waiting_action',stageTypeSnapshot:targetStage,reviewDecision:bridge}:{}),updatedAt:new Date(Math.max(now.getTime(),metric.updatedAt.getTime()+1))}).where(eq(s.operationsPromotionDailyMetric.id,metric.id)).returning();
  if(statusChanged){
   const fresh=await readPromotionContext(tx),facts=await tx.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.campaignId,campaign.id)).orderBy(asc(s.operationsPromotionDailyMetric.metricDate));
   const through=[shanghaiDateKey(now),...facts.map(m=>nextDateKey(m.metricDate)),...fresh.stateChanges.filter(c=>c.campaignId===campaign.id).map(c=>c.businessDate),...fresh.waitRanges.filter(r=>r.campaignId===campaign.id).flatMap(r=>r.nextEffectiveOn?[r.nextEffectiveOn]:[r.endedOn])].sort().at(-1)!;
   const state=replayPromotionHistory(campaign.startedOn,facts,{...promotionReplayOptions(campaign,fresh),asOf:through});
   if(!state)throw new WorkflowError('这一天与已有历史暂时无法衔接，本次未保存；其他日期及输入已保留。请核对相邻日期的状态或测试轮次。',422);
   const currentState=replayPromotionHistory(campaign.startedOn,facts,{...promotionReplayOptions(campaign,fresh),asOf:shanghaiDateKey(now)})!;
   // 派生阶段重新计算，历史事实与已确认测试轮次不删除、不合并。
   await tx.delete(s.operationsPromotionStage).where(eq(s.operationsPromotionStage.campaignId,campaign.id));
   for(const span of currentState.stages)await tx.insert(s.operationsPromotionStage).values({campaignId:campaign.id,...span});
   const scalingStart=state.stages.find(span=>span.stageType==='scaling')?.startedOn;
   for(const fact of facts){
    if(fact.recordKind==='test_residual')continue;
    const origin=fact.stageTypeSnapshot==='testing'?testingCycleOn(campaign,fresh,fact.metricDate)?.startedOn:scalingStart;
    if(origin&&fact.sourceStageStartedOn!==origin)await tx.update(s.operationsPromotionDailyMetric).set({sourceStageStartedOn:origin}).where(eq(s.operationsPromotionDailyMetric.id,fact.id));
   }
   await tx.update(s.operationsPromotionCampaign).set({currentStatus:currentState.currentStatus,currentStage:currentState.currentStage,endedOn:currentState.endedOn,updatedAt:now}).where(eq(s.operationsPromotionCampaign.id,campaign.id));
   if(before.campaigns.at(-1)?.id===campaign.id)await tx.update(s.operationsContentSchedule).set({promotionStatus:currentState.currentStatus,updatedAt:now}).where(eq(s.operationsContentSchedule.id,campaign.scheduleId));
   await syncContinuousCheckpoints(tx,campaign.scheduleId,actor.username,now);
  }
  const after=await promotionSnapshot(tx,campaign.scheduleId);
  await tx.insert(s.operationsPromotionTimelineAudit).values({scheduleId:campaign.scheduleId,requestKey,businessDate:date,action:statusChanged?'day_status_correction':'metric_values',reason,before:{...before,correctedDayStatus:current},after:{...after,correctedDayStatus:target,dayContext,metricId:metric.id,dayEditSignature:signature},changedById:actor.id,changedByLabel:actor.username,createdAt:now});
  return {ok:true,metricId:saved.id,fingerprint:timelineFingerprint(after)};
 });
}
