/**
 * 实发登记与更正：项目文档和实发事实原子保存；修改已有推广帖实发时间时受控重置 Campaign。
 */
import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../../auth/permissions';
import { and, count, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { lockSchedule, readScheduleWorkflow, reasonSchema, saveDelayReason, WorkflowError } from '../../../../db/schedule-workflow';
import { workflowErrorResponse } from '../../../../db/workflow-api';
import { getDb } from '../../../../db/client';
import { lockPromotionWorkflow } from '../../../../db/promotion-pauses';
import {
  operationsContentSchedule,
  operationsContentVersion,
  operationsPromotionCampaign,
  operationsPromotionDailyMetric,
  operationsPromotionHold,
  operationsPromotionWaitRange,
  operationsScheduleChangeRequest,
} from '../../../../db/schema';
import {
  issuesByField,
  normalizeCompletionStatus,
  publicationInputFromForm,
  publicationSchema,
} from '../../../../db/validation';

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request, url, locals }) => {
  if (request.headers.get('origin') !== url.origin) return new Response('拒绝跨站写入。', { status: 403 });
  if (!params.id) return Response.json({ message: '缺少排期编号。' }, { status: 400 });
  let form: FormData;
  try { form = await request.formData(); } catch { return Response.json({ message: '请求必须使用有效表单。' }, { status: 400 }); }
  const parsed = publicationSchema.safeParse(publicationInputFromForm(form));
  if (!parsed.success) return Response.json({ message: '请检查实发登记。', fields: issuesByField(parsed.error.issues) }, { status: 422 });
  if (parsed.data.actualPublishAt > new Date()) return Response.json({ message: '实发时间不能晚于当前时间。' }, { status: 422 });
  let dailyReasons;
  try { dailyReasons = z.array(reasonSchema).parse(JSON.parse(String(form.get('dailyReasons') || '[]'))); }
  catch { return Response.json({ message: '请检查逐日延期理由。' }, { status: 422 }); }

  try {
    const result = await getDb().transaction(async (transaction) => {
      await lockPromotionWorkflow(transaction);
      const schedule = await lockSchedule(transaction, params.id!);
      if (form.get('expectedPlanRevision') !== null && Number(form.get('expectedPlanRevision')) !== schedule.planRevision) throw new WorkflowError('排期已更新，请刷新后重新登记实发。');

      const actualChanged = schedule.actualPublishAt?.getTime() !== parsed.data.actualPublishAt.getTime();
      const campaigns = await transaction.select({ id: operationsPromotionCampaign.id })
        .from(operationsPromotionCampaign).where(eq(operationsPromotionCampaign.scheduleId, params.id!));
      if (actualChanged && campaigns.length) requireAdmin(locals.user);
      if (actualChanged && campaigns.length && form.get('confirmPromotionReset') !== '1') {
        const [metricCount] = await transaction.select({ value: count() }).from(operationsPromotionDailyMetric)
          .where(inArray(operationsPromotionDailyMetric.campaignId, campaigns.map((campaign) => campaign.id)));
        return { kind: 'reset-required' as const, campaigns: campaigns.length, dailyMetrics: Number(metricCount?.value ?? 0) };
      }
      // 在任何事实变更前校验和补齐全部计时段的理由；失败必须回滚整次登记。
      for (const reason of dailyReasons) await saveDelayReason(transaction, schedule, reason, locals.user!, new Date(), parsed.data.actualPublishAt);
      const workflow = await readScheduleWorkflow(transaction, params.id!, parsed.data.actualPublishAt);
      if (workflow.days.some(day => !day.saved && !day.archived)) {
        throw new WorkflowError('请为每一天延期选择责任方并填写原因，再保存实发登记。', 422);
      }
      if (actualChanged && campaigns.length) {
        await transaction.delete(operationsPromotionWaitRange).where(inArray(operationsPromotionWaitRange.campaignId, campaigns.map(campaign => campaign.id)));
        await transaction.delete(operationsPromotionHold).where(inArray(operationsPromotionHold.campaignId, campaigns.map(campaign => campaign.id)));
        await transaction.delete(operationsPromotionCampaign).where(eq(operationsPromotionCampaign.scheduleId, params.id!));
      }

      await transaction.update(operationsContentVersion).set({
        projectDocUrl: parsed.data.projectDocUrl,
        updatedAt: new Date(),
      }).where(eq(operationsContentVersion.id, schedule.contentVersionId));
      const completionStatus = normalizeCompletionStatus({ plannedPublishAt: schedule.plannedPublishAt, actualPublishAt: parsed.data.actualPublishAt });
      const promotionStatus = !schedule.isPromoted
        ? 'none'
        : actualChanged || campaigns.length === 0
          ? 'awaiting_promotion'
          : schedule.promotionStatus;
      await transaction.update(operationsContentSchedule).set({
        actualPublishAt: parsed.data.actualPublishAt,
        completionStatus,
        promotionStatus,
        promotionDeferredThrough: promotionStatus === 'awaiting_promotion' && actualChanged ? null : undefined,
        updatedAt: new Date(),
      }).where(eq(operationsContentSchedule.id, params.id!));
      await transaction.update(operationsScheduleChangeRequest).set({ status: 'obsolete', decidedAt: new Date(), decisionReason: '帖子已经实发' })
        .where(and(eq(operationsScheduleChangeRequest.scheduleId, params.id!), eq(operationsScheduleChangeRequest.status, 'pending')));
      return { kind: 'saved' as const };
    });
    if (result.kind === 'reset-required') return Response.json({
      message: '更正实发时间会重置这条排期的推广活动、日度事实及待定区间。',
      resetRequired: true,
      impact: { campaigns: result.campaigns, dailyMetrics: result.dailyMetrics },
    }, { status: 409 });
    return Response.json({ ok: true });
  } catch (error) {
    return workflowErrorResponse(error);
  }
};
