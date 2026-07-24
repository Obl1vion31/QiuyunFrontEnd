import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { getDb } from '../../../db/client';
import { operationsContentSchedule, operationsContentVersion } from '../../../db/schema';
import {
  editScheduleInputFromForm,
  editScheduleSchema,
  issuesByField,
  normalizeCompletionStatus,
} from '../../../db/validation';

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request, url }) => {
  const origin = request.headers.get('origin');
  if (!origin || origin !== url.origin) return new Response('拒绝跨站写入。', { status: 403 });
  if (!params.id) return Response.json({ message: '缺少排期编号。' }, { status: 400 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ message: '请求必须使用有效的表单格式。' }, { status: 400 });
  }

  const result = editScheduleSchema.safeParse(editScheduleInputFromForm(form));
  if (!result.success) {
    return Response.json({ message: '请检查标记的字段。', fields: issuesByField(result.error.issues) }, { status: 422 });
  }

  try {
    const completionStatus = normalizeCompletionStatus(result.data);
    const updated = await getDb().transaction(async (transaction) => {
      const [schedule] = await transaction.select({ versionId: operationsContentSchedule.contentVersionId })
        .from(operationsContentSchedule)
        .where(eq(operationsContentSchedule.id, params.id!))
        .limit(1);
      if (!schedule) return null;

      await transaction.update(operationsContentVersion).set({
        contentName: result.data.contentName,
        contentType: result.data.contentType,
        projectDocName: result.data.projectDocName,
        projectDocUrl: result.data.projectDocUrl,
        updatedAt: new Date(),
      }).where(eq(operationsContentVersion.id, schedule.versionId));

      const [saved] = await transaction.update(operationsContentSchedule).set({
        syncToMoments: result.data.syncToMoments,
        promotionStatus: result.data.promotionStatus,
        plannedPublishAt: result.data.plannedPublishAt,
        actualPublishAt: result.data.actualPublishAt,
        completionStatus,
        delayReason: completionStatus === 'delayed' ? result.data.delayReason : null,
        updatedAt: new Date(),
      }).where(eq(operationsContentSchedule.id, params.id!)).returning({ id: operationsContentSchedule.id });
      return saved;
    });
    if (!updated) return Response.json({ message: '没有找到这条排期。' }, { status: 404 });
  } catch (error) {
    console.error('operations schedule update failed', error);
    return Response.json({ message: '数据库暂时不可用，请稍后重试。' }, { status: 503 });
  }
  return Response.json({ ok: true });
};
