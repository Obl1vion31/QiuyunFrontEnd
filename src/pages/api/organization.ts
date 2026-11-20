import {validationMessage} from '../../db/validation-messages';
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getDb } from '../../db/client';
import { readOrganization, saveOrganization } from '../../db/organization';
import { WorkflowError } from '../../db/schedule-workflow';
import { workflowErrorResponse } from '../../db/workflow-api';
export const prerender = false;
export const GET: APIRoute = async () => {
  try { return Response.json(await readOrganization(getDb())); }
  catch (error) { return workflowErrorResponse(error); }
};
export const PATCH: APIRoute = async ({ request, url, locals }) => {
  try {
    if (request.headers.get('origin') !== url.origin) throw new WorkflowError('拒绝跨站操作。', 403);
    return Response.json({ ok: true, workspace: await saveOrganization(getDb(), locals.user!, await request.json()) });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ message: validationMessage(error.issues[0]) }, { status: 422 });
    return workflowErrorResponse(error);
  }
};
