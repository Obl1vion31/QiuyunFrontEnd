import type { APIRoute } from 'astro';
import { getDb } from '../../db/client';
import {
  operationsContent,
  operationsContentSchedule,
  operationsContentVersion,
  operationsPromotionCampaign,
  operationsPromotionStage,
} from '../../db/schema';
import { shanghaiDateKey } from '../../db/promotion-rules.mjs';
import {
  issuesByField,
  newPostInputFromForm,
  newPostSchema,
  normalizeCompletionStatus,
} from '../../db/validation';

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect, url }) => {
  const origin = request.headers.get('origin');
  if (!origin || origin !== url.origin) return new Response('拒绝跨站写入。', { status: 403 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ message: '请求必须使用有效的表单格式。' }, { status: 400 });
  }
  const result = newPostSchema.safeParse(newPostInputFromForm(form));
  const wantsJson = request.headers.get('accept')?.includes('application/json');
  if (!result.success) {
    return Response.json({ message: '请检查标记的字段。', fields: issuesByField(result.error.issues) }, { status: 422 });
  }

  try {
    const completionStatus = normalizeCompletionStatus(result.data);
    const promotionStatus = result.data.isPromoted
      ? result.data.actualPublishAt ? 'testing' : 'pending'
      : 'none';
    const created = await getDb().transaction(async (transaction) => {
      const [content] = await transaction.insert(operationsContent).values({}).returning({ id: operationsContent.id });
      const [version] = await transaction.insert(operationsContentVersion).values({
        contentId: content.id,
        versionNumber: 0,
        workType: 'new',
        contentName: result.data.contentName,
        subjectId: result.data.subjectId,
        categoryId: result.data.categoryId,
        projectDocName: result.data.projectDocName,
        projectDocUrl: result.data.projectDocUrl,
      }).returning({ id: operationsContentVersion.id });
      const [schedule] = await transaction.insert(operationsContentSchedule).values({
        contentVersionId: version.id,
        syncToMoments: result.data.syncToMoments,
        isPromoted: result.data.isPromoted,
        promotionStatus,
        plannedPublishAt: result.data.plannedPublishAt,
        actualPublishAt: result.data.actualPublishAt,
        completionStatus,
        delayReason: completionStatus === 'delayed' ? result.data.delayReason : null,
      }).returning({ id: operationsContentSchedule.id });
      if (result.data.isPromoted && result.data.actualPublishAt) {
        const startedOn = shanghaiDateKey(result.data.actualPublishAt);
        const [campaign] = await transaction.insert(operationsPromotionCampaign).values({
          scheduleId: schedule.id,
          startedOn,
          currentStage: 'testing',
          currentStatus: 'testing',
        }).returning({ id: operationsPromotionCampaign.id });
        await transaction.insert(operationsPromotionStage).values({
          campaignId: campaign.id,
          stageType: 'testing',
          startedOn,
        });
      }
      return schedule;
    });
    return wantsJson ? Response.json({ ok: true, id: created.id, version: 0 }, { status: 201 }) : redirect('/business/operations-schedule?created=1', 303);
  } catch (error) {
    console.error('operations content insert failed', error);
    const response = { message: '数据库暂时不可用，请检查连接配置后重试。' };
    return wantsJson ? Response.json(response, { status: 503 }) : new Response(response.message, { status: 503 });
  }
};
