import type { APIRoute } from 'astro';
import { getDb } from '../../db/client';
import { createPromotionPause, pauseCreateSchema, pauseSummary } from '../../db/promotion-pauses';
import { workflowErrorResponse, workflowForm } from '../../db/workflow-api';
export const prerender = false;
export const GET: APIRoute = async () => {
  try { return Response.json(await pauseSummary(getDb())); } catch (error) { return workflowErrorResponse(error); }
};
export const POST: APIRoute = async ({ request, url, locals }) => {
  try {
    const parsed = await workflowForm(request, url, pauseCreateSchema);
    if (parsed.error) return parsed.error;
    return Response.json({ ok: true, ...await createPromotionPause(getDb(), parsed.data!, locals.user!) }, { status: 201 });
  } catch (error) { return workflowErrorResponse(error); }
};
