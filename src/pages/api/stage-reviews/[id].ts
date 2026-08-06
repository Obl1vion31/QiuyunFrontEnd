import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { getDb } from '../../../db/client';
import { operationsStageReviewMeeting } from '../../../db/schema';

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request, url }) => {
  if (request.headers.get('origin') !== url.origin) return new Response('拒绝跨站写入。', { status: 403 });
  if (!params.id) return Response.json({ message: '缺少会议编号。' }, { status: 400 });
  try {
    const [meeting] = await getDb().update(operationsStageReviewMeeting).set({ status: 'completed', updatedAt: new Date() })
      .where(eq(operationsStageReviewMeeting.id, params.id)).returning({ id: operationsStageReviewMeeting.id });
    if (!meeting) return Response.json({ message: '没有找到这场会议。' }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    console.error('stage review meeting complete failed', error);
    return Response.json({ message: '数据库暂时不可用，请稍后重试。' }, { status: 503 });
  }
};
