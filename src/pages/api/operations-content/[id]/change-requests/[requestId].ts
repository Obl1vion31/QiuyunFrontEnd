import type { APIRoute } from 'astro';
import { getDb } from '../../../../../db/client';
import { decideChangeRequest, decisionSchema } from '../../../../../db/schedule-workflow';
import { workflowErrorResponse, workflowForm } from '../../../../../db/workflow-api';
export const prerender = false;
export const PATCH: APIRoute = async ({ params, request, url, locals }) => {
  try {
    const input = await workflowForm(request, url, decisionSchema);
    if (input.error) return input.error;
    const result = await decideChangeRequest(getDb(), params.id!, params.requestId!, input.data!, locals.user!);
    if (result.obsolete) return Response.json({ message: '排期已变化或已实发，申请已标记失效。' }, { status: 409 });
    return Response.json({ ok: true });
  } catch (error) { return workflowErrorResponse(error); }
};
