import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client';
import { operationsMeetingAttachment as attachments, operationsReviewMeeting as meetings } from '../../db/schema';
import { workflowErrorResponse } from '../../db/workflow-api';
import { z } from 'zod';
export const prerender = false;
export const POST: APIRoute = async ({ request, url, locals }) => {
  if (request.headers.get('origin') !== url.origin) return Response.json({ message: '拒绝跨站写入。' }, { status: 403 });
  if (Number(request.headers.get('content-length')) > 3400000) return Response.json({ message: '每张图片最多 3 MB。' }, { status: 413 });
  try {
    const form = await request.formData(); const meetingId = z.uuid().safeParse(form.get('meetingId')); const file = form.get('image');
    if (!meetingId.success || !(file instanceof File)) return Response.json({ message: '请选择当前会议和图片。' }, { status: 422 });
    if (!file.size || file.size > 3145728) return Response.json({ message: '每张图片最多 3 MB。' }, { status: 413 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const mimeType = bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png' : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg' : bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP' ? 'image/webp' : null;
    if (!mimeType || mimeType !== file.type) return Response.json({ message: '只支持 PNG、JPEG 或 WebP 图片。' }, { status: 422 });
    const db = getDb();
    const [meeting] = await db.select({ id: meetings.id }).from(meetings).where(eq(meetings.id, meetingId.data));
    if (!meeting) return Response.json({ message: '没有找到会议。' }, { status: 404 });
    const [saved] = await db.insert(attachments).values({ meetingId: meeting.id, name: file.name.slice(0,200), mimeType, byteLength: bytes.length, base64: bytes.toString('base64'), createdByLabel: locals.user!.username }).returning({ id: attachments.id, name: attachments.name });
    return Response.json(saved, { status: 201 });
  } catch (error) { return workflowErrorResponse(error); }
};
