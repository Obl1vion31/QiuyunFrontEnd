import type { APIRoute } from 'astro';
import { getDb } from '../../../db/client';
import { pauseUpdateSchema, updatePromotionPause } from '../../../db/promotion-pauses';
import { workflowErrorResponse, workflowForm } from '../../../db/workflow-api';
export const prerender = false;
export const PATCH: APIRoute = async ({ request, url, locals, params }) => {
  try {
    const parsed = await workflowForm(request, url, pauseUpdateSchema);
    if (parsed.error) return parsed.error;
    await updatePromotionPause(getDb(), params.id!, parsed.data!, locals.user!);
    return Response.json({ ok: true });
  } catch (error) { return workflowErrorResponse(error); }
};
