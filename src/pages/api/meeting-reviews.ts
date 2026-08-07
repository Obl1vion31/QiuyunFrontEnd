import type { APIRoute } from 'astro';
import { inArray } from 'drizzle-orm';
import { getDb } from '../../db/client';
import { operationsReviewMeeting } from '../../db/schema';
import { formObject, issuesByField, meetingReviewSchema } from '../../db/stage-review-validation';

export const prerender = false;

const shortDate = (key: string, includeYear = false) => {
  const [year, month, day] = key.split('-');
  return includeYear ? `${year}.${month}.${day}` : `${month}.${day}`;
};

export const POST: APIRoute = async ({ request, url, locals }) => {
  if (request.headers.get('origin') !== url.origin) return new Response('拒绝跨站写入。', { status: 403 });
  let form: FormData;
  try { form = await request.formData(); } catch { return Response.json({ message: '请求必须使用有效表单。' }, { status: 400 }); }
  const result = meetingReviewSchema.safeParse(formObject(form));
  if (!result.success) return Response.json({ message: '请检查会议信息。', fields: issuesByField(result.error.issues) }, { status: 422 });
  const name = result.data.name || `${shortDate(result.data.periodStart, true)}—${shortDate(result.data.periodEnd)} 周度业务复盘`;
  try {
    const [meeting] = await getDb().insert(operationsReviewMeeting).values({
      ...result.data, name, meetingType: 'weekly', createdByLabel: locals.operationsUser || 'unknown',
    }).returning({ id: operationsReviewMeeting.id });
    return Response.json({ ok: true, id: meeting.id }, { status: 201 });
  } catch (error) {
    console.error('meeting review create failed', error);
    return Response.json({ message: '数据库暂时不可用，请稍后重试。' }, { status: 503 });
  }
};

export const DELETE: APIRoute = async ({ request, url }) => {
  if (request.headers.get('origin') !== url.origin) return new Response('拒绝跨站写入。', { status: 403 });
  let payload: { ids?: unknown };
  try { payload = await request.json(); } catch { return Response.json({ message: '请求格式无效。' }, { status: 400 }); }
  const ids = Array.isArray(payload.ids) ? [...new Set(payload.ids.filter((id): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 100) : [];
  if (!ids.length) return Response.json({ message: '请选择要删除的草稿。' }, { status: 422 });
  try {
    const deleted = await getDb().transaction(async (transaction) => {
      const meetings = await transaction.select({ id: operationsReviewMeeting.id, status: operationsReviewMeeting.status })
        .from(operationsReviewMeeting).where(inArray(operationsReviewMeeting.id, ids));
      if (meetings.length !== ids.length) throw new Error('meeting-missing');
      if (meetings.some((meeting) => meeting.status !== 'draft')) throw new Error('finalized-meeting');
      return transaction.delete(operationsReviewMeeting).where(inArray(operationsReviewMeeting.id, ids)).returning({ id: operationsReviewMeeting.id });
    });
    return Response.json({ ok: true, deleted: deleted.length });
  } catch (error) {
    if ((error as Error).message === 'meeting-missing') return Response.json({ message: '部分草稿已不存在，请刷新后重试。' }, { status: 404 });
    if ((error as Error).message === 'finalized-meeting') return Response.json({ message: '已定稿会议不允许删除。' }, { status: 409 });
    console.error('meeting review delete failed', error);
    return Response.json({ message: '草稿删除失败，请稍后重试。' }, { status: 503 });
  }
};
