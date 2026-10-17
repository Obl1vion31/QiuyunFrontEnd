import type { APIRoute } from 'astro';
import { getDb } from '../../db/client';
import { changeCheckpointState, checkpointActionSchema } from '../../db/non-promotion-workflow';
import { workflowErrorResponse, workflowForm } from '../../db/workflow-api';
export const prerender = false;
export const POST: APIRoute = async ({ request, url, locals }) => {
  try {
    const input = await workflowForm(request, url, checkpointActionSchema);
    if (input.error) return input.error;
    await changeCheckpointState(getDb(), input.data!, locals.user!);
    return Response.json({ ok: true });
  } catch (error) { return workflowErrorResponse(error); }
};
