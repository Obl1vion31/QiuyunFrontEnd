import type { APIRoute } from 'astro';
import { getDb } from '../../../../db/client';
import { changeRequestSchema, createChangeRequest } from '../../../../db/schedule-workflow';
import { workflowErrorResponse, workflowForm } from '../../../../db/workflow-api';
export const prerender = false;
export const POST: APIRoute = async ({ params, request, url, locals }) => {
  try {
    const input = await workflowForm(request, url, changeRequestSchema);
    if (input.error) return input.error;
    const created = await createChangeRequest(getDb(), params.id!, input.data!, locals.user!);
    return Response.json({ ok: true, id: created.id }, { status: 201 });
  } catch (error) { return workflowErrorResponse(error); }
};
