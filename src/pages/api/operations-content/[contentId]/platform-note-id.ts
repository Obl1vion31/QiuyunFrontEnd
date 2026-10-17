/**
 * 统一更正小红书笔记 ID。ID 属于帖子主体，因此一次更正会被全部版本、排期和复盘读取。
 */
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../../../db/client';
import { operationsContent } from '../../../../db/schema';
import { platformNoteIdSchema } from '../../../../db/platform-note-id';

export const prerender = false;

const schema = z.object({
  platformNoteId: platformNoteIdSchema,
  confirmSharedUpdate: z.literal('true', { error: '请先确认更正影响' }),
});

export const POST: APIRoute = async ({ request, url, params }) => {
  if (request.headers.get('origin') !== url.origin) return new Response('拒绝跨站写入。', { status: 403 });
  let form: FormData;
  try { form = await request.formData(); } catch { return Response.json({ message: '请求必须使用有效表单。' }, { status: 400 }); }
  const parsed = schema.safeParse({
    platformNoteId: form.get('platformNoteId'),
    confirmSharedUpdate: form.get('confirmSharedUpdate'),
  });
  if (!parsed.success) return Response.json({ message: parsed.error.issues[0]?.message ?? '请检查笔记 ID。' }, { status: 422 });

  try {
    const [current] = await getDb().select({ id: operationsContent.id, platformNoteId: operationsContent.platformNoteId })
      .from(operationsContent).where(eq(operationsContent.id, params.contentId!)).limit(1);
    if (!current) return Response.json({ message: '没有找到这篇帖子。' }, { status: 404 });
    if (current.platformNoteId === parsed.data.platformNoteId) return Response.json({ ok: true, platformNoteId: current.platformNoteId });
    await getDb().update(operationsContent).set({
      platformNoteId: parsed.data.platformNoteId,
      updatedAt: new Date(),
    }).where(eq(operationsContent.id, current.id));
    return Response.json({ ok: true, oldValue: current.platformNoteId, platformNoteId: parsed.data.platformNoteId });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') return Response.json({ message: '这个笔记 ID 已属于另一篇帖子，请核对后重试。' }, { status: 409 });
    console.error('platform note id correction failed', error);
    return Response.json({ message: '笔记 ID 更正失败，请稍后重试。' }, { status: 503 });
  }
};
