import type {APIRoute} from 'astro';
import {z} from 'zod';
import {getDb} from '../../db/client';
import {lockPromotionWorkflow,readPromotionContext} from '../../db/promotion-pauses';
import {promotionStateOn,promotionReplayOptions} from '../../db/promotion-state.mjs';
import {meetingNextDecision} from '../../db/meeting-decision-rules.mjs';
import {shanghaiDateKey,replayPromotionHistory} from '../../db/promotion-rules.mjs';
import {WorkflowError} from '../../db/schedule-workflow';
import {workflowErrorResponse} from '../../db/workflow-api';
import {operationsPromotionTimelineAudit as audits,operationsPromotionDailyMetric as metrics,operationsPromotionCampaign as campaigns,operationsPromotionStage as stages,operationsContentSchedule as schedules} from '../../db/schema';
import {eq,and} from 'drizzle-orm';
export const prerender=false;
const schema=z.object({id:z.string().min(1).max(160),targetStatus:z.string(),expectedTargetStatus:z.string(),expectedVersionNumber:z.number().int().min(0),reason:z.string().trim().min(1,'请填写修改理由').max(500),requestKey:z.uuid()});
export const POST:APIRoute=async({request,url,locals})=>{
 if(request.headers.get('origin')!==url.origin)return new Response('拒绝跨站写入。',{status:403});
 let payload;try{payload=await request.json();}catch{return Response.json({message:'请求格式无效'},{status:400});}
 const parsed=schema.safeParse(payload);if(!parsed.success)return Response.json({message:parsed.error.issues[0].message},{status:422});
 try{await getDb().transaction(async tx=>{
  await lockPromotionWorkflow(tx);
  const [repeat]=await tx.select().from(audits).where(eq(audits.requestKey,parsed.data.requestKey));
  if(repeat){if(repeat.changedById!==locals.user!.id||repeat.reason!==parsed.data.reason||((repeat.after as any).meetingDecision?.action==='restart_testing'?'restart_testing':(repeat.after as any).meetingDecision?.targetStatus)!==parsed.data.targetStatus||(repeat.after as any).meetingDecision?.id!==parsed.data.id)throw new WorkflowError('请求已被使用。');return;}
  const context=await readPromotionContext(tx),decision=context.meetingDecisions.find(d=>d.id===parsed.data.id);
  if(!decision)throw new WorkflowError('例会决定已变化，请刷新后核对。');
  if((decision.action==='restart_testing'?'restart_testing':decision.targetStatus)!==parsed.data.expectedTargetStatus||decision.versionNumber!==parsed.data.expectedVersionNumber)throw new WorkflowError('例会安排已被更新，请刷新后核对。');
  const today=shanghaiDateKey(new Date());
  if(decision.effectiveOn<today||context.metrics.some(m=>m.campaignId===decision.campaignId&&m.metricDate>=decision.effectiveOn))throw new WorkflowError('该安排已有历史事实，请通过历史更正入口核对，不能覆盖指标。',422);
  const campaign=context.campaigns.find(c=>c.id===decision.campaignId)!;
  const day=new Date(decision.effectiveOn+'T00:00:00Z');day.setUTCDate(day.getUTCDate()-1);
  const state=promotionStateOn(campaign,context,day.toISOString().slice(0,10));
  const next=state&&meetingNextDecision(state.currentStatus,parsed.data.targetStatus);
  if(!next)throw new WorkflowError('请选择当前阶段允许的下一步。',422);
  const [priorMetric]=await tx.select().from(metrics).where(and(eq(metrics.campaignId,decision.campaignId),eq(metrics.metricDate,day.toISOString().slice(0,10))));
  if(priorMetric)await tx.update(metrics).set({reviewDecision:next,updatedAt:new Date()}).where(eq(metrics.id,priorMetric.id));
  await tx.insert(audits).values({scheduleId:decision.scheduleId,requestKey:parsed.data.requestKey,businessDate:decision.effectiveOn,action:'meeting_decision_correction',reason:parsed.data.reason,before:{meetingDecision:decision,previousDayPlan:priorMetric?{id:priorMetric.id,reviewDecision:priorMetric.reviewDecision}:null},after:{meetingDecision:{...decision,targetStatus:parsed.data.targetStatus==='restart_testing'?'testing':parsed.data.targetStatus,action:parsed.data.targetStatus==='restart_testing'?'restart_testing':undefined},previousDayPlan:priorMetric?{id:priorMetric.id,reviewDecision:next}:null},changedById:locals.user!.id,changedByLabel:locals.operationsUser||'unknown'});
  // 次日安排是状态事件，更正后同步派生状态；原始指标保留。
  const fresh=await readPromotionContext(tx);
  const replayed=replayPromotionHistory(campaign.startedOn,fresh.metrics.filter(m=>m.campaignId===campaign.id),{...promotionReplayOptions(campaign,fresh),asOf:today});
  if(!replayed)throw new WorkflowError('更正与已有事实冲突，请核对后重试。');
  await tx.delete(stages).where(eq(stages.campaignId,campaign.id));
  for(const stage of replayed.stages)await tx.insert(stages).values({campaignId:campaign.id,...stage});
  await tx.update(campaigns).set({currentStatus:replayed.currentStatus,currentStage:replayed.currentStage,endedOn:replayed.endedOn,updatedAt:new Date()}).where(eq(campaigns.id,campaign.id));
  await tx.update(schedules).set({promotionStatus:replayed.currentStatus,updatedAt:new Date()}).where(eq(schedules.id,campaign.scheduleId));
 });return Response.json({ok:true});}catch(e){return workflowErrorResponse(e);}
};
