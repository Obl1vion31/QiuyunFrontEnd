import {promotionStatusStage,promotionNextOptions} from './promotion-successors.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './client';
import { requireAdmin, type OperationsUser } from '../auth/permissions';
import { lockSchedule, WorkflowError, type Transaction } from './schedule-workflow';
import { lockPromotionWorkflow, readPromotionContext, guardPromotionStart, attachPromotionToActivePause } from './promotion-pauses';
import { businessDate } from './promotion-wait-ranges';
import { nextDateKey, previousDateKey, shanghaiDateKey, replayPromotionHistory } from './promotion-rules.mjs';
import { campaignPauseWindows, campaignWaitWindows, dateInWindows, fullPauseRange, firstMissingPromotionDate, promotionReplayOptions, promotionStateOn, promotionDayStatusEdit } from './promotion-state.mjs';
import * as s from './schema';

export const timelineSchema = z.object({
  scheduleId: z.uuid(), reviewDate: businessDate,
  action: z.enum(['wait','start_testing','start_scaling','plan','pause','next','status']),
  targetStatus:z.enum(['testing','test_paused','test_pending','scaling','scaling_paused','test_discarded','formal_discarded','ended']).optional(),
  target: z.enum(['initial','day']).default('day'),
  waitingThrough: businessDate.optional(), rangeId: z.uuid().optional(),
  nextDecision: z.enum(['test_continue','start_testing','start_scaling','test_discarded','scaling_continue','formal_discarded','ended','wait_continue']).optional(),
  reason: z.string().trim().max(2000).default(''),
  requestKey: z.uuid().default(() => randomUUID()), fingerprint: z.string().optional(), confirmImpact: z.boolean().default(false),
});
export type TimelineInput = z.infer<typeof timelineSchema>;
type Reader = Database | Transaction;

export async function promotionSnapshot(db: Reader, scheduleId: string) {
  const [schedule] = await db.select().from(s.operationsContentSchedule).where(eq(s.operationsContentSchedule.id,scheduleId));
  if (!schedule) throw new WorkflowError('没有找到这条排期。',404);
  const campaigns = await db.select().from(s.operationsPromotionCampaign).where(eq(s.operationsPromotionCampaign.scheduleId,scheduleId)).orderBy(asc(s.operationsPromotionCampaign.startedOn));
  const ids = campaigns.map(c=>c.id);
  const [plans, metrics, ranges, stages, decisions, holds] = await Promise.all([
    db.select().from(s.operationsPromotionStartPlan).where(eq(s.operationsPromotionStartPlan.scheduleId,scheduleId)),
    ids.length?db.select().from(s.operationsPromotionDailyMetric).where(inArray(s.operationsPromotionDailyMetric.campaignId,ids)).orderBy(asc(s.operationsPromotionDailyMetric.metricDate)):[],
    ids.length?db.select().from(s.operationsPromotionWaitRange).where(inArray(s.operationsPromotionWaitRange.campaignId,ids)).orderBy(asc(s.operationsPromotionWaitRange.startedOn)):[],
    ids.length?db.select().from(s.operationsPromotionStage).where(inArray(s.operationsPromotionStage.campaignId,ids)).orderBy(asc(s.operationsPromotionStage.startedOn)):[],
    ids.length?db.select().from(s.operationsPromotionDayDecision).where(inArray(s.operationsPromotionDayDecision.campaignId,ids)).orderBy(asc(s.operationsPromotionDayDecision.businessDate)):[],
    ids.length?db.select().from(s.operationsPromotionHold).where(inArray(s.operationsPromotionHold.campaignId,ids)).orderBy(asc(s.operationsPromotionHold.startedOn)):[],
  ]);
  return {schedule,plan:plans[0]??null,campaigns,metrics,ranges,stages,decisions,holds};
}
export const timelineFingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value,(_key,item)=>Array.isArray(item)&&item.every(row=>row&&typeof row==='object'&&'id' in row)?[...item].sort((a,b)=>String(a.id).localeCompare(String(b.id))):item&&typeof item==='object'&&!Array.isArray(item)&&!(item instanceof Date)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item)).digest('hex');

export async function readPromotionTimeline(db: Reader, now = new Date(), onlySchedule?: string) {
  const [rows, plans, context, schedules, allMetrics, allStages] = await Promise.all([
    db.select({scheduleId:s.operationsContentSchedule.id,contentId:s.operationsContentVersion.contentId,platformNoteId:s.operationsContent.platformNoteId,categoryName:s.operationsCategory.name,projectDocUrl:s.operationsContentVersion.projectDocUrl,contentName:s.operationsContentVersion.contentName,versionNumber:s.operationsContentVersion.versionNumber,subjectName:s.operationsSubject.name,actualPublishAt:s.operationsContentSchedule.actualPublishAt,plannedPublishAt:s.operationsContentSchedule.plannedPublishAt,publicationUrl:s.operationsContentSchedule.publicationUrl,isPromoted:s.operationsContentSchedule.isPromoted,promotionStatus:s.operationsContentSchedule.promotionStatus,promotionDeferredThrough:s.operationsContentSchedule.promotionDeferredThrough}).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentSchedule.contentVersionId,s.operationsContentVersion.id)).innerJoin(s.operationsSubject,eq(s.operationsContentVersion.subjectId,s.operationsSubject.id)).innerJoin(s.operationsContent,eq(s.operationsContentVersion.contentId,s.operationsContent.id)).leftJoin(s.operationsCategory,eq(s.operationsContentVersion.categoryId,s.operationsCategory.id)).where(onlySchedule?eq(s.operationsContentSchedule.id,onlySchedule):undefined).orderBy(asc(s.operationsContentSchedule.actualPublishAt)),
    db.select().from(s.operationsPromotionStartPlan), readPromotionContext(db), db.select().from(s.operationsContentSchedule), db.select().from(s.operationsPromotionDailyMetric).orderBy(asc(s.operationsPromotionDailyMetric.metricDate)), db.select().from(s.operationsPromotionStage).orderBy(asc(s.operationsPromotionStage.startedOn)),
  ]);
  const today=shanghaiDateKey(now), yesterday=previousDateKey(today);
  return rows.filter(row=>row.actualPublishAt&&(row.isPromoted||context.campaigns.some(c=>c.scheduleId===row.scheduleId)||plans.some(p=>p.scheduleId===row.scheduleId))).map(row=>{
    const publishedOn=shanghaiDateKey(row.actualPublishAt!), plan=plans.find(p=>p.scheduleId===row.scheduleId);
    const campaign=context.campaigns.filter(c=>c.scheduleId===row.scheduleId).sort((a,b)=>a.startedOn.localeCompare(b.startedOn)).at(-1);
    const waitingThrough=!campaign&&row.promotionDeferredThrough?row.promotionDeferredThrough:plan?.waitingThrough??(plan?null:row.promotionDeferredThrough);
    const date=campaign?campaign.startedOn:plan?.plannedOn??(waitingThrough?waitingThrough<yesterday?waitingThrough:yesterday:publishedOn);
    const owned=context.campaigns.filter(c=>c.scheduleId===row.scheduleId),ids=new Set(owned.map(c=>c.id));
    const pausedRanges=context.waitRanges.filter(r=>r.campaignId===campaign?.id);
    const snapshot={schedule:schedules.find(record=>record.id===row.scheduleId),plan:plan??null,campaigns:owned,metrics:allMetrics.filter(m=>ids.has(m.campaignId)),ranges:context.waitRanges.filter(r=>ids.has(r.campaignId)),stages:allStages.filter(r=>ids.has(r.campaignId)),decisions:context.stateChanges.filter(r=>ids.has(r.campaignId)),holds:context.holds.filter(r=>ids.has(r.campaignId))};
    const canArrangeInitial=row.isPromoted&&row.promotionStatus==='awaiting_promotion'&&!campaign;
    return {...row,publishedOn,plan:plan??null,campaign:campaign??null,waitingThrough,date,canArrangeInitial,
      pending:canArrangeInitial&&publishedOn<=yesterday&&!dateInWindows(date,context.pauses.flatMap(p=>{const r=fullPauseRange(p);return r?[r]:[];})),
      ranges:pausedRanges, hasMetrics:snapshot.metrics.length>0, fingerprint:timelineFingerprint(snapshot)};
  });
}

class ImpactPreview extends Error { constructor(public result:{confirmationRequired:true;impact:{dailyMetrics:number;dates:string[];message:string}}){super('preview');} }

/** 所有状态写入显式使用业务日期；点击时间只用于审计。 */
export async function changePromotionTimeline(db: Database, input: TimelineInput, actor: OperationsUser, now=new Date()) {
  try {return await db.transaction(async tx=>{
    await lockPromotionWorkflow(tx);
    const schedule=await lockSchedule(tx,input.scheduleId);
    const [repeat]=await tx.select().from(s.operationsPromotionTimelineAudit).where(eq(s.operationsPromotionTimelineAudit.requestKey,input.requestKey));
    if(repeat){if(repeat.scheduleId!==schedule.id||repeat.changedById!==actor.id||input.action==='status'&&(repeat.action!=='status'||repeat.businessDate!==input.reviewDate||repeat.reason!==input.reason||!(repeat.after.decisions as Array<{businessDate:string;actualStatus?:string}>|undefined)?.some(c=>c.businessDate===input.reviewDate&&c.actualStatus===input.targetStatus)))throw new WorkflowError('请求已被使用。');return {ok:true,businessDate:repeat.businessDate,repeated:true};}
    if(!schedule.isPromoted||!schedule.actualPublishAt)throw new WorkflowError('只能处理已发布的推广帖。',422);
    const before=await promotionSnapshot(tx,schedule.id),fingerprint=timelineFingerprint(before);
    if(!before.campaigns.length&&schedule.promotionStatus!=='awaiting_promotion')throw new WorkflowError('该帖已有历史推广状态，不能作为首次安排重新开始。');
    if(input.fingerprint&&input.fingerprint!==fingerprint)throw new WorkflowError('推广记录已变化，请刷新后核对。');
    if(input.confirmImpact&&!input.fingerprint)throw new WorkflowError('请重新预览本次修改的影响。');
    const publishedOn=shanghaiDateKey(schedule.actualPublishAt),today=shanghaiDateKey(now),date=input.reviewDate;
    if(date<publishedOn)throw new WorkflowError('业务日期不能早于实际发布日期。',422);
    if(date>today&&input.action!=='plan'&&input.action!=='wait'&&!(input.action==='next'&&input.nextDecision==='wait_continue'))throw new WorkflowError('未来日期只能保存安排，不能确认实际投放。',422);
    let campaign=before.campaigns.at(-1);
    const context=await readPromotionContext(tx);
    const removedRanges=new Set<string>();
    const existingPlan=before.plan;
    const waitingThrough=!campaign&&schedule.promotionDeferredThrough?schedule.promotionDeferredThrough:existingPlan?.waitingThrough??(existingPlan?null:schedule.promotionDeferredThrough);
    const savePlan=async(values:Partial<typeof s.operationsPromotionStartPlan.$inferInsert>)=>{
      await tx.insert(s.operationsPromotionStartPlan).values({scheduleId:schedule.id,waitingThrough,...values,revision:(existingPlan?.revision??-1)+1,updatedAt:now}).onConflictDoUpdate({target:s.operationsPromotionStartPlan.scheduleId,set:{...values,revision:(existingPlan?.revision??-1)+1,updatedAt:now}});
    };
    if(before.metrics.some(m=>m.metricDate>=date))requireAdmin(actor);
    if(!input.reason&&['start_testing','start_scaling'].includes(input.action)&&(campaign||before.plan&&date<(waitingThrough??publishedOn)))throw new WorkflowError('请填写历史更正原因。',422);
    if(input.action==='status'){
      if(!campaign)throw new WorkflowError('尚未开始的帖子请先选择首次安排。');
      if(!input.reason)throw new WorkflowError('请填写跟进原因。',422);
      const edit=promotionDayStatusEdit(campaign,context,date);
      if(!edit)throw new WorkflowError('无法读取该日状态。');
      if(!input.targetStatus||!edit.options.some(option=>option.value===input.targetStatus))throw new WorkflowError('请选择原状态允许衔接的后继状态，或恢复该日原状态。',422);
      const targetStage=promotionStatusStage(input.targetStatus)??edit.originalStage;
      if(!targetStage)throw new WorkflowError('已结束活动不能修改为进行中。');
      await tx.insert(s.operationsPromotionDayDecision).values({campaignId:campaign.id,businessDate:date,stageType:targetStage as 'testing'|'scaling',actualStatus:input.targetStatus,reason:input.reason}).onConflictDoUpdate({target:[s.operationsPromotionDayDecision.campaignId,s.operationsPromotionDayDecision.businessDate],set:{stageType:targetStage as 'testing'|'scaling',actualStatus:input.targetStatus,reason:input.reason}});
      for(const metric of before.metrics.filter(m=>m.campaignId===campaign!.id&&m.metricDate===date&&m.recordKind!=='test_residual')){
        const legal=promotionNextOptions(input.targetStatus);
        // 终态的固定提交值表示“无需后续动作”，恢复后不能将它误当作次日再次淘汰。
        const decision=promotionStatusStage(edit.currentStatus)&&legal.some(o=>o.value===metric.reviewDecision)?metric.reviewDecision:legal[0]?.value??input.targetStatus;
        const sourceStageStartedOn=targetStage===metric.stageTypeSnapshot?metric.sourceStageStartedOn:targetStage==='testing'?campaign.startedOn:[date,...before.metrics.filter(m=>m.stageTypeSnapshot==='scaling').flatMap(m=>m.sourceStageStartedOn?[m.sourceStageStartedOn]:[])].sort()[0];
        await tx.update(s.operationsPromotionDailyMetric).set({sourceStageStartedOn,actualStatusSnapshot:input.targetStatus,dailyStatus:['testing','scaling'].includes(input.targetStatus)?'active':'waiting_action',stageTypeSnapshot:targetStage,reviewDecision:decision,updatedAt:now}).where(eq(s.operationsPromotionDailyMetric.id,metric.id));
      }
    }else if(input.action==='wait'){
      if(campaign)throw new WorkflowError('已开始的活动请使用当日暂停。');
      const end=input.waitingThrough??date;
      if(end<date)throw new WorkflowError('待定截止日不能早于该行日期。',422);
      const expected=waitingThrough??publishedOn;
      if(date>expected&&date!==nextDateKey(expected))throw new WorkflowError(`请先处理 ${expected} 的首次推广安排。`);
      await savePlan({waitingThrough:end,plannedOn:null,plannedStage:null});
      await tx.update(s.operationsContentSchedule).set({promotionDeferredThrough:end,updatedAt:now}).where(eq(s.operationsContentSchedule.id,schedule.id));
    }else if(input.action==='plan'){
      if(campaign||!waitingThrough||date!==waitingThrough)throw new WorkflowError('请在待定区间末日选择下一步。');
      if(!['start_testing','start_scaling'].includes(input.nextDecision??''))throw new WorkflowError('请选择下一步。',422);
      const plannedOn=nextDateKey(date);await guardPromotionStart(tx,plannedOn,now);
      const stage=input.nextDecision==='start_scaling'?'scaling':'testing';
      await savePlan({waitingThrough,plannedOn,plannedStage:stage});
      [campaign]=await tx.insert(s.operationsPromotionCampaign).values({scheduleId:schedule.id,startedOn:plannedOn,initialStage:stage,currentStage:stage,currentStatus:stage}).returning();
      await attachPromotionToActivePause(tx,campaign.id,stage,now);
    }else if(input.action==='start_testing'||input.action==='start_scaling'){
      if(dateInWindows(date,context.pauses.flatMap(p=>{const r=fullPauseRange(p);return r?[r]:[];})))throw new WorkflowError('该日期属于团队整日暂停，请先核对团队暂停安排。');
      await guardPromotionStart(tx,date,now);
      const stage=input.action==='start_scaling'?'scaling':'testing';
      const initialChanged=!campaign||date<=campaign.startedOn||input.target==='initial';
      if(!campaign){
        if(date>publishedOn&&(!waitingThrough||waitingThrough<previousDateKey(date)))throw new WorkflowError(`请先明确 ${publishedOn} 至 ${previousDateKey(date)} 的待定安排。`);
        [campaign]=await tx.insert(s.operationsPromotionCampaign).values({scheduleId:schedule.id,startedOn:date,initialStage:stage,currentStage:stage,currentStatus:stage}).returning();
        await attachPromotionToActivePause(tx,campaign.id,stage,now);
      }else if(date<=campaign.startedOn||input.target==='initial'){
        await tx.update(s.operationsPromotionCampaign).set({startedOn:date,initialStage:stage,updatedAt:now}).where(eq(s.operationsPromotionCampaign.id,campaign.id));
        for(const decision of before.decisions.filter(row=>row.campaignId===campaign!.id&&row.businessDate<date))await tx.delete(s.operationsPromotionDayDecision).where(eq(s.operationsPromotionDayDecision.id,decision.id));
        for(const range of before.ranges.filter(row=>row.campaignId===campaign!.id&&row.startedOn<date)){
          await tx.delete(s.operationsPromotionWaitRange).where(eq(s.operationsPromotionWaitRange.id,range.id));removedRanges.add(range.id);
        }
      }else{
        const state=promotionStateOn(campaign,context,date);
        if(!state?.currentStage)throw new WorkflowError('活动已结束，不能直接恢复。');
        if(state.currentStatus==='test_pending'&&stage==='testing')throw new WorkflowError('测试结束待定后只能继续待定、转放量或淘汰。');
        if(state.currentStage==='scaling'&&stage==='testing')throw new WorkflowError('放量后重新测试需要创建改帖版本。');
        await tx.insert(s.operationsPromotionDayDecision).values({campaignId:campaign.id,businessDate:date,stageType:stage}).onConflictDoUpdate({target:[s.operationsPromotionDayDecision.campaignId,s.operationsPromotionDayDecision.businessDate],set:{stageType:stage}});
      }
      for(const range of before.ranges.filter(r=>!removedRanges.has(r.id)&&r.campaignId===campaign!.id&&r.startedOn<=date&&(!r.nextEffectiveOn||r.nextEffectiveOn>date))){
        if(range.startedOn<date)await tx.update(s.operationsPromotionWaitRange).set({endedOn:previousDateKey(date),nextDecision:stage==='scaling'?(range.stageType==='testing'?'start_scaling':'scaling_continue'):'test_continue',nextEffectiveOn:date,revision:range.revision+1,updatedAt:now}).where(eq(s.operationsPromotionWaitRange.id,range.id));
        else await tx.delete(s.operationsPromotionWaitRange).where(eq(s.operationsPromotionWaitRange.id,range.id));
        for(const future of before.ranges.filter(r=>r.campaignId===campaign!.id&&r.startedOn>date&&r.startedOn<=range.endedOn))await tx.delete(s.operationsPromotionWaitRange).where(eq(s.operationsPromotionWaitRange.id,future.id));
      }
      const firstOn=initialChanged?date:campaign.startedOn;
      await savePlan({waitingThrough:firstOn>publishedOn?previousDateKey(firstOn):null,plannedOn:null,plannedStage:null});
      await tx.update(s.operationsContentSchedule).set({promotionDeferredThrough:null,updatedAt:now}).where(eq(s.operationsContentSchedule.id,schedule.id));
    }else{
      if(!campaign)throw new WorkflowError('尚未开始的帖子请先选择首次安排。');
      const facts=before.metrics.filter(m=>m.campaignId===campaign!.id);
      const windows=[...campaignPauseWindows(campaign,context),...campaignWaitWindows(campaign,context),...context.holds.filter(h=>h.campaignId===campaign!.id)];
      if(input.action==='pause'){
        const expected=firstMissingPromotionDate(facts,campaign.startedOn,windows);
        if(date!==expected)requireAdmin(actor);
        if(!input.reason)throw new WorkflowError('请填写暂停原因。',422);
        const state=promotionStateOn(campaign,context,date);
        if(!state?.currentStage)throw new WorkflowError('该日没有可暂停的推广阶段。');
        const end=input.waitingThrough??date;if(end<date)throw new WorkflowError('暂停截止日无效。',422);
        if(before.ranges.some(r=>r.campaignId===campaign!.id&&r.startedOn<=end&&(!r.nextEffectiveOn||r.nextEffectiveOn>date)))throw new WorkflowError('该日期已有待定安排，请编辑原区间。');
        const next=input.nextDecision&&input.nextDecision!=='wait_continue'?input.nextDecision:null;
        if(next&&!(state.currentStage==='testing'?['test_continue','start_scaling','test_discarded']:['scaling_continue','formal_discarded','ended']).includes(next))throw new WorkflowError('下一步与原阶段不匹配。',422);
        if(next&&['test_continue','start_scaling','scaling_continue'].includes(next))await guardPromotionStart(tx,nextDateKey(end),now);
        await tx.insert(s.operationsPromotionWaitRange).values({campaignId:campaign.id,requestKey:input.requestKey,startedOn:date,endedOn:end,stageType:state.currentStage,reason:input.reason,nextDecision:next,nextEffectiveOn:next?nextDateKey(end):null,updatedByLabel:actor.username,updatedAt:now});
      }else{
        const range=before.ranges.find(r=>r.id===input.rangeId&&r.campaignId===campaign!.id);
        if(!range||date!==range.endedOn)throw new WorkflowError('请在待定末日处理下一步。');
        const next=input.nextDecision;if(!next)throw new WorkflowError('请选择下一步。',422);
        if(next==='wait_continue'){
          if(!input.waitingThrough||input.waitingThrough<range.startedOn)throw new WorkflowError('截止日不能早于暂停开始日。',422);
          await tx.update(s.operationsPromotionWaitRange).set({endedOn:input.waitingThrough,nextDecision:null,nextEffectiveOn:null,revision:range.revision+1,updatedByLabel:actor.username,updatedAt:now}).where(eq(s.operationsPromotionWaitRange.id,range.id));
        }else{
          if(!(range.stageType==='testing'?['test_continue','start_scaling','test_discarded']:['scaling_continue','formal_discarded','ended']).includes(next))throw new WorkflowError('下一步与阶段不匹配。',422);
          if(['test_continue','start_scaling','scaling_continue'].includes(next))await guardPromotionStart(tx,nextDateKey(date),now);
          await tx.update(s.operationsPromotionWaitRange).set({nextDecision:next,nextEffectiveOn:nextDateKey(date),revision:range.revision+1,updatedByLabel:actor.username,updatedAt:now}).where(eq(s.operationsPromotionWaitRange.id,range.id));
        }
      }
    }
    const removed:string[]=[];
    if(campaign){
      const [fresh]=await tx.select().from(s.operationsPromotionCampaign).where(eq(s.operationsPromotionCampaign.id,campaign.id));
      const changedContext=await readPromotionContext(tx), options=promotionReplayOptions(fresh,changedContext);
      const kept:Array<typeof s.operationsPromotionDailyMetric.$inferSelect>=[];
      const freshMetrics=await tx.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.campaignId,fresh.id)).orderBy(asc(s.operationsPromotionDailyMetric.metricDate));
      for(const metric of freshMetrics){
        if(metric.recordKind==='test_residual'){kept.push(metric);continue;}
        if(metric.metricDate<fresh.startedOn||!replayPromotionHistory(fresh.startedOn,[...kept,metric],{...options,asOf:nextDateKey(metric.metricDate)}))removed.push(metric.id);else kept.push(metric);
      }
      const state=replayPromotionHistory(fresh.startedOn,kept,{...options,asOf:today});
      if(!state)throw new WorkflowError('修改与后续安排冲突，请先核对待定区间。');
      if(removed.length){requireAdmin(actor);if(!input.confirmImpact)throw new ImpactPreview({confirmationRequired:true,impact:{dailyMetrics:removed.length,dates:before.metrics.filter(m=>removed.includes(m.id)).map(m=>m.metricDate),message:'这些指标与更正后的状态冲突，将归档并重新开放补录。'}});
        await tx.delete(s.operationsPromotionDailyMetric).where(inArray(s.operationsPromotionDailyMetric.id,removed));}
      await tx.delete(s.operationsPromotionStage).where(eq(s.operationsPromotionStage.campaignId,fresh.id));
      for(const stage of state.stages)await tx.insert(s.operationsPromotionStage).values({campaignId:fresh.id,...stage});
      await tx.update(s.operationsPromotionCampaign).set({currentStage:state.currentStage,currentStatus:state.currentStatus,endedOn:state.endedOn,updatedAt:now}).where(eq(s.operationsPromotionCampaign.id,fresh.id));
      await tx.update(s.operationsContentSchedule).set({promotionStatus:state.currentStatus,updatedAt:now}).where(eq(s.operationsContentSchedule.id,schedule.id));
    }
    const after=await promotionSnapshot(tx,schedule.id);
    await tx.insert(s.operationsPromotionTimelineAudit).values({scheduleId:schedule.id,requestKey:input.requestKey,businessDate:date,action:input.action,reason:input.reason||'首次推广安排',before,after,changedById:actor.id,changedByLabel:actor.username,createdAt:now});
    return {ok:true,businessDate:date,archived:removed.length};
  });}catch(error){if(error instanceof ImpactPreview)return error.result;throw error;}
}
