import type { APIRoute } from 'astro';
import { getDb } from '../../db/client';
import { operationsStageReviewMeeting } from '../../db/schema';
import { formObject, issuesByField, stageReviewMeetingSchema } from '../../db/stage-review-validation';

export const prerender = false;

export const POST: APIRoute = async ({ request, url, locals }) => {
  if (request.headers.get('origin') !== url.origin) return new Response('拒绝跨站写入。', { status: 403 });
  let form: FormData;
  try { form = await request.formData(); } catch { return Response.json({ message: '请求必须使用有效表单。' }, { status: 400 }); }
  const result = stageReviewMeetingSchema.safeParse(formObject(form));
  if (!result.success) return Response.json({ message: '请检查会议信息。', fields: issuesByField(result.error.issues) }, { status: 422 });
  try {
    const [meeting] = await getDb().insert(operationsStageReviewMeeting).values({
      ...result.data,
      createdByLabel: locals.operationsUser || 'unknown',
    }).returning({ id: operationsStageReviewMeeting.id });
    return Response.json({ ok: true, id: meeting.id }, { status: 201 });
  } catch (error) {
    console.error('stage review meeting create failed', error);
    return Response.json({ message: '数据库暂时不可用，请稍后重试。' }, { status: 503 });
  }
};
