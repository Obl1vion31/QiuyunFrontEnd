import {StaleWriteError} from '../../../db/schedule-workflow';
import {saveContentRole} from '../../../db/content-role-workflow';
import {monthlyScheduleInput,claimMonthlySchedule} from '../../../db/monthly-plans';
import {saveOperationSetup} from '../../../db/operation-setup';
import {readPostSchemas} from '../../../db/taxonomy-store';
import type { APIRoute } from 'astro';
import { lockPromotionWorkflow } from '../../../db/promotion-pauses';
import {promotionSnapshot} from '../../../db/promotion-timeline';
import {randomUUID} from 'node:crypto';
import {shanghaiDateKey} from '../../../db/promotion-rules.mjs';
import { changeSchedulePlan, WorkflowError } from '../../../db/schedule-workflow';
import { workflowErrorResponse } from '../../../db/workflow-api';
import {requireBusinessOperation} from '../../../auth/business-permissions';
import {reviewPlanSchema,reviewPlanFromForm} from '../../../db/non-promotion-plan-input';
import {saveReviewPlan,reviewIdentity} from '../../../db/non-promotion-plan';
import { and, count, eq, inArray, isNull,sql } from 'drizzle-orm';
import { getDb } from '../../../db/client';
import {
  operationsContent, operationsNonPromotionReviewPlan,operationsNonPromotionCustomCheckpoint,
  operationsContentPerformanceMetric,
  operationsContentSchedule,
  operationsContentVersion,
  operationsNonPromotionReview,
  operationsPromotionCampaign,
  operationsPromotionDailyMetric,
  operationsPromotionStage,
  operationsScheduleUsageEvent,
  operationsSchedulePlanHistory,
  operationsScheduleChangeRequest,
  operationsScheduleDelayReason,
  operationsNonPromotionCheckpointEvent,
  operationsPublicationReservation,operationsPublicationEvent,operationsPromotionStartPlan,operationsPromotionTimelineAudit,
  operationsChangeProposal,
} from '../../../db/schema';
import {
  editScheduleInputFromForm,
  issuesByField,
} from '../../../db/validation';

export const prerender = false;

export const DELETE: APIRoute = async ({params,request,url,locals})=>{
 if(request.headers.get('origin')!==url.origin)return new Response('拒绝跨站写入。',{status:403});
 try{
  const {requireAdmin}=await import('../../../auth/permissions');requireAdmin(locals.user);
  const body=await request.json().catch(()=>({}));if(!String(body.reason??'').trim())throw new WorkflowError('请填写取消排期的原因。',422);
  return await getDb().transaction(async tx=>{
   await lockPromotionWorkflow(tx);
   const [row]=await tx.select().from(operationsContentSchedule).where(eq(operationsContentSchedule.id,params.id!)).for('update');
   if(!row)return Response.json({message:'排期不存在。'},{status:404});
   if(row.actualPublishAt)throw new WorkflowError('已发布内容保留实发记录，不能取消排期。',422);
   if(row.cancelledAt)return Response.json({ok:true,id:row.id,repeated:true});
   const now=new Date();
   await tx.update(operationsContentSchedule).set({cancelledAt:now,updatedAt:now}).where(eq(operationsContentSchedule.id,row.id));
   await tx.update(operationsPublicationReservation).set({status:'obsolete',decisionReason:'排期已取消：'+body.reason,updatedAt:now}).where(and(eq(operationsPublicationReservation.scheduleId,row.id),inArray(operationsPublicationReservation.status,['pending','approved'])));
   await tx.update(operationsChangeProposal).set({status:'obsolete',decisionReason:'排期已取消：'+body.reason,decidedAt:now}).where(and(eq(operationsChangeProposal.target,'schedule:'+row.id),eq(operationsChangeProposal.status,'pending')));
   await tx.update(operationsScheduleChangeRequest).set({status:'obsolete',decisionReason:'排期已取消：'+body.reason,decidedAt:now}).where(and(eq(operationsScheduleChangeRequest.scheduleId,row.id),eq(operationsScheduleChangeRequest.status,'pending')));
   return Response.json({ok:true,id:row.id});
  });
 }catch(error){return workflowErrorResponse(error);}
};

export const PATCH: APIRoute = async ({ params, request, url, locals }) => {
  const origin = request.headers.get('origin');
  if (!origin || origin !== url.origin) return new Response('拒绝跨站写入。', { status: 403 });
  if (!params.id) return Response.json({ message: '缺少排期编号。' }, { status: 400 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ message: '请求必须使用有效的表单格式。' }, { status: 400 });
  }

  if(form.get('action')==='reviewPlan'){
    const parsed=reviewPlanSchema.safeParse(reviewPlanFromForm(form));
    if(!parsed.success)return Response.json({message:'请核对复盘计划。',fields:issuesByField(parsed.error.issues)},{status:422});
    try{await getDb().transaction(async tx=>{await requireBusinessOperation(tx,locals.user!,'schedule.edit');await lockPromotionWorkflow(tx);await saveReviewPlan(tx,params.id!,parsed.data,locals.user!.username);});return Response.json({ok:true});}catch(error){return workflowErrorResponse(error);}
  }
  const result = (await readPostSchemas(getDb())).editScheduleSchema.safeParse(editScheduleInputFromForm(form));
  if (!result.success) {
    return Response.json({ message: '请检查标记的字段。', fields: issuesByField(result.error.issues) }, { status: 422 });
  }

  try {
    const confirmPromotionReset = form.get('confirmPromotionReset') === '1';
    const usageChangeReason = String(form.get('usageChangeReason') ?? '').trim();
    const updated = await getDb().transaction(async (transaction) => {
      await lockPromotionWorkflow(transaction);
      const [schedule] = await transaction.select({
        versionId: operationsContentSchedule.contentVersionId,
        isPromoted: operationsContentSchedule.isPromoted,
        promotionStatus: operationsContentSchedule.promotionStatus,
        actualPublishAt: operationsContentSchedule.actualPublishAt,
        id: operationsContentSchedule.id, plannedPublishAt: operationsContentSchedule.plannedPublishAt,
        planRevision: operationsContentSchedule.planRevision, planEffectiveAt: operationsContentSchedule.planEffectiveAt,
      })
        .from(operationsContentSchedule)
        .where(eq(operationsContentSchedule.id, params.id!))
        .limit(1).for('update');
      if (!schedule) return null;
      const planChanged = schedule.plannedPublishAt.getTime() !== result.data.plannedPublishAt.getTime();
      if (planChanged) {
        if (form.get('expectedPlanRevision') === null || Number(form.get('expectedPlanRevision')) !== schedule.planRevision) throw new StaleWriteError('排期已更新，请刷新后重试。');
      }

      const [campaignCountRow] = await transaction.select({ value: count() })
        .from(operationsPromotionCampaign)
        .where(eq(operationsPromotionCampaign.scheduleId, params.id!));
      const campaignCount = Number(campaignCountRow?.value ?? 0);
      const oldTimeline=schedule.isPromoted!==result.data.isPromoted?await promotionSnapshot(transaction,schedule.id):null;
      const endCampaigns = campaignCount > 0 && schedule.isPromoted && !result.data.isPromoted;
      if (endCampaigns) await requireBusinessOperation(transaction,locals.user!,'schedule.endPromotion');

      if (endCampaigns && !confirmPromotionReset) {
        const campaigns = await transaction.select({ id: operationsPromotionCampaign.id })
          .from(operationsPromotionCampaign)
          .where(eq(operationsPromotionCampaign.scheduleId, params.id!));
        const ids = campaigns.map((campaign) => campaign.id);
        const [metricCountRow] = ids.length
          ? await transaction.select({ value: count() }).from(operationsPromotionDailyMetric)
            .where(inArray(operationsPromotionDailyMetric.campaignId, ids))
          : [{ value: 0 }];
        return {
          resetRequired: true as const,
          preserveHistory: true,
          impact: { campaigns: campaignCount, dailyMetrics: Number(metricCountRow?.value ?? 0) },
        };
      }
      if (endCampaigns && !usageChangeReason) return { usageReasonRequired: true as const };

      await transaction.update(operationsContentVersion).set({
        contentName: result.data.contentName,
        subjectId: result.data.subjectId,
        categoryId: result.data.categoryId,
        projectDocUrl: result.data.projectDocUrl,
        updatedAt: sql`greatest(clock_timestamp(), ${operationsContentVersion.updatedAt} + interval '1 millisecond')`,
      }).where(eq(operationsContentVersion.id, schedule.versionId));

      if (endCampaigns) {
        const effectiveOn = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
        const openCampaigns = await transaction.select({
          id: operationsPromotionCampaign.id,
          currentStage: operationsPromotionCampaign.currentStage,
          startedOn: operationsPromotionCampaign.startedOn,
        }).from(operationsPromotionCampaign).where(and(
          eq(operationsPromotionCampaign.scheduleId, params.id!),
          isNull(operationsPromotionCampaign.endedOn),
        ));
        for (const campaign of openCampaigns) {
          const endedOn = effectiveOn < campaign.startedOn ? campaign.startedOn : effectiveOn;
          const finalStatus = campaign.currentStage === 'testing' ? 'test_discarded' : 'ended';
          await transaction.update(operationsPromotionStage).set({
            endedOn,
            outcome: campaign.currentStage === 'testing' ? 'test_discarded' : 'ended',
            updatedAt: new Date(),
          }).where(and(eq(operationsPromotionStage.campaignId, campaign.id), isNull(operationsPromotionStage.endedOn)));
          await transaction.update(operationsPromotionCampaign).set({
            endedOn,
            currentStage: null,
            currentStatus: finalStatus,
            updatedAt: new Date(),
          }).where(eq(operationsPromotionCampaign.id, campaign.id));
        }
        await transaction.insert(operationsScheduleUsageEvent).values({
          scheduleId: params.id!,
          fromUsage: 'promotion',
          toUsage: 'non_promotion',
          effectiveOn,
          reason: usageChangeReason,
          changedByLabel: locals.operationsUser || 'unknown',
        });
      }

      const promotionStatus = !result.data.isPromoted
        ? 'none'
        : !schedule.actualPublishAt
          ? 'pending'
          : campaignCount === 0
            ? 'awaiting_promotion'
            : schedule.promotionStatus;
      if (planChanged) {
        const [fullSchedule] = await transaction.select().from(operationsContentSchedule).where(eq(operationsContentSchedule.id, params.id!));
        await changeSchedulePlan(transaction, fullSchedule, result.data.plannedPublishAt, String(form.get('planChangeReason')||form.get('changeReason')||form.get('monthlyPlanReason')||''), locals.user!);
      }
      const [saved] = await transaction.update(operationsContentSchedule).set({
        cancelledAt:null,
        syncToMoments: result.data.syncToMoments,
        isPromoted: result.data.isPromoted,
        promotionStatus,
        promotionDeferredThrough: promotionStatus === 'awaiting_promotion'
          ? schedule.promotionStatus === 'awaiting_promotion'
            ? undefined
            : null
          : null,
        updatedAt: sql`greatest(clock_timestamp(), ${operationsContentSchedule.updatedAt} + interval '1 millisecond')`,
      }).where(eq(operationsContentSchedule.id, params.id!)).returning({ id: operationsContentSchedule.id });
      if(!result.data.operationType&&schedule.isPromoted&&!result.data.isPromoted&&schedule.actualPublishAt){
        const post=await reviewIdentity(transaction,schedule.id);
        await saveReviewPlan(transaction,post.id,{mode:'continuous',day7:false,day15:false,expectedRevision:post.plan?.revision??-1},locals.user!.username);
      }
      if(oldTimeline?.plan){
        await transaction.delete(operationsPromotionStartPlan).where(eq(operationsPromotionStartPlan.scheduleId,schedule.id));
        await transaction.insert(operationsPromotionTimelineAudit).values({scheduleId:schedule.id,requestKey:randomUUID(),businessDate:shanghaiDateKey(new Date()),action:'usage_change',reason:usageChangeReason||'调整推广身份',before:oldTimeline,after:await promotionSnapshot(transaction,schedule.id),changedById:locals.user!.id,changedByLabel:locals.user!.username});
      }
      await saveOperationSetup(transaction,saved.id,result.data,locals.user!.username,()=>requireBusinessOperation(transaction,locals.user!,'schedule.edit'));
      await saveContentRole(transaction,saved.id,result.data,locals.user!.username);
      await claimMonthlySchedule(transaction,monthlyScheduleInput(form),saved.id,locals.user!.username);
      return saved;
    });
    if (!updated) return Response.json({ message: '没有找到这条排期。' }, { status: 404 });
    if ('resetRequired' in updated) {
      return Response.json({
        message: updated.preserveHistory
          ? '改为非推广会结束仍开放的推广阶段；已有推广活动和日度数据将完整保留。'
          : '排期变更需要确认。',
        resetRequired: true,
        preserveHistory: updated.preserveHistory,
        impact: updated.impact,
      }, { status: 409 });
    }
    if ('usageReasonRequired' in updated) return Response.json({ message: '请填写改为非推广的原因。', fields: { usageChangeReason: ['请填写用途变更原因'] } }, { status: 422 });
  } catch (error) {
    return workflowErrorResponse(error);
  }
  return Response.json({ ok: true });
};
