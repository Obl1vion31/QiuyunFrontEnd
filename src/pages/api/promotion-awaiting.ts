import type { APIRoute } from 'astro';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../db/client';
import {
  operationsContentSchedule,
  operationsPromotionCampaign,
  operationsPromotionStage,
} from '../../db/schema';
import { shanghaiDateKey } from '../../db/promotion-rules.mjs';

export const prerender = false;

const inputSchema = z.object({
  scheduleId: z.uuid('排期无效'),
  reviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式无效'),
  action: z.enum(['defer', 'start_testing']),
});

export const POST: APIRoute = async ({ request, url }) => {
  const origin = request.headers.get('origin');
  if (!origin || origin !== url.origin) return new Response('拒绝跨站写入。', { status: 403 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ message: '请求必须使用有效的表单格式。' }, { status: 400 });
  }

  const parsed = inputSchema.safeParse({
    scheduleId: form.get('scheduleId'),
    reviewDate: form.get('reviewDate'),
    action: form.get('action'),
  });
  if (!parsed.success) return Response.json({ message: '待推广操作无效。' }, { status: 422 });

  const today = shanghaiDateKey(new Date());
  if (parsed.data.reviewDate >= today) {
    return Response.json({ message: '只能处理今天以前的待推广日期。' }, { status: 422 });
  }

  try {
    const result = await getDb().transaction(async (transaction) => {
      await transaction.execute(
        sql`select id from operations_content_schedule where id = ${parsed.data.scheduleId} for update`,
      );
      const [schedule] = await transaction.select({
        id: operationsContentSchedule.id,
        actualPublishAt: operationsContentSchedule.actualPublishAt,
        promotionStatus: operationsContentSchedule.promotionStatus,
        promotionDeferredThrough: operationsContentSchedule.promotionDeferredThrough,
      }).from(operationsContentSchedule)
        .where(eq(operationsContentSchedule.id, parsed.data.scheduleId))
        .limit(1);
      if (!schedule) return { kind: 'missing' as const };
      if (schedule.promotionStatus !== 'awaiting_promotion' || !schedule.actualPublishAt) {
        return { kind: 'state-changed' as const };
      }
      const publishedOn = shanghaiDateKey(schedule.actualPublishAt);
      if (parsed.data.reviewDate < publishedOn) return { kind: 'before-publish' as const };

      if (parsed.data.action === 'defer') {
        if (schedule.promotionDeferredThrough && schedule.promotionDeferredThrough >= parsed.data.reviewDate) {
          return { kind: 'already-completed' as const };
        }
        await transaction.update(operationsContentSchedule).set({
          promotionDeferredThrough: parsed.data.reviewDate,
          updatedAt: new Date(),
        }).where(eq(operationsContentSchedule.id, schedule.id));
        return { kind: 'deferred' as const };
      }

      const [campaign] = await transaction.insert(operationsPromotionCampaign).values({
        scheduleId: schedule.id,
        startedOn: parsed.data.reviewDate,
        currentStage: 'testing',
        currentStatus: 'testing',
      }).returning({ id: operationsPromotionCampaign.id });
      await transaction.insert(operationsPromotionStage).values({
        campaignId: campaign.id,
        stageType: 'testing',
        startedOn: parsed.data.reviewDate,
      });
      await transaction.update(operationsContentSchedule).set({
        promotionStatus: 'testing',
        promotionDeferredThrough: null,
        updatedAt: new Date(),
      }).where(eq(operationsContentSchedule.id, schedule.id));
      return { kind: 'started' as const };
    });

    if (result.kind === 'missing') return Response.json({ message: '没有找到这条排期。' }, { status: 404 });
    if (result.kind === 'state-changed') {
      return Response.json({ message: '推广状态已经变化，请刷新后查看。' }, { status: 409 });
    }
    if (result.kind === 'before-publish') {
      return Response.json({ message: '待推广日期不能早于实发日期。' }, { status: 422 });
    }
    if (result.kind === 'already-completed') {
      return Response.json({ message: '这一天已经确认暂不推广。' }, { status: 409 });
    }
    return Response.json({ ok: true, status: result.kind }, { status: 201 });
  } catch (error) {
    console.error('promotion awaiting action failed', error);
    return Response.json({ message: '待推广状态保存失败，请稍后重试。' }, { status: 503 });
  }
};
