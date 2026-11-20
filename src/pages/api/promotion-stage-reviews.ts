import {unsafeSubmissionMessage} from '../../db/business-messages';
import {validationMessage} from '../../db/validation-messages';
import type { APIRoute } from 'astro';
import { getDb } from '../../db/client';
import { saveStageSnapshot, stageSnapshotSchema } from '../../db/promotion-stage-reviews';
import { workflowErrorResponse } from '../../db/workflow-api';
export const prerender = false;
export const POST: APIRoute = async ({ request, url, locals }) => {
  if (request.headers.get('origin') !== url.origin) return Response.json({ message: unsafeSubmissionMessage }, { status: 403 });
  try {
    const parsed = stageSnapshotSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ message: validationMessage(parsed.error.issues[0]) }, { status: 422 });
    return Response.json(await saveStageSnapshot(getDb(), parsed.data, locals.user!.username), { status: 201 });
  } catch (error) { return workflowErrorResponse(error); }
};
