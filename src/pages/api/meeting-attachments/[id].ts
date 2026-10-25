import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../../db/client';
import { operationsMeetingAttachment as attachments } from '../../../db/schema';
export const prerender = false;
export const GET: APIRoute = async ({ params,url }) => {
  if (!z.uuid().safeParse(params.id).success) return new Response('没有找到文件。', { status: 404 });
  try {
    const [image] = await getDb().select().from(attachments).where(eq(attachments.id, params.id!));
    if (!image) return new Response('没有找到文件。', { status: 404 });
    return new Response(new Uint8Array(Buffer.from(image.base64, 'base64')), { headers: { 'Content-Type': image.mimeType, 'Content-Length': String(image.byteLength), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Content-Disposition': `${url.searchParams.get('download')==='1'?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(image.name).replace(/'/g,'%27')}` } });
  } catch { return new Response('文件暂时不可用。', { status: 503 }); }
};
