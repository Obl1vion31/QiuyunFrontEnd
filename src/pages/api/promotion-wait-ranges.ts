import type { APIRoute } from 'astro';
import { getDb } from '../../db/client';
import { saveWaitRange, waitRangeSchema } from '../../db/promotion-wait-ranges';
import { workflowErrorResponse } from '../../db/workflow-api';
export const prerender = false;
export const POST: APIRoute = async ({ request, url, locals }) => {
  if (request.headers.get('origin') !== url.origin) return Response.json({ message: '拒绝跨站写入。' }, { status: 403 });
  try {
    const parsed = waitRangeSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ message: parsed.error.issues[0].message }, { status: 422 });
    const result = await saveWaitRange(getDb(), parsed.data, locals.user!);
    return Response.json(result, { status: 'confirmationRequired' in result ? 409 : 201 });
  } catch (error) { return workflowErrorResponse(error); }
};
