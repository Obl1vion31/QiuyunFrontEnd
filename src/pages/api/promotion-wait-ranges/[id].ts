import {unsafeSubmissionMessage} from '../../../db/business-messages';
import {validationMessage} from '../../../db/validation-messages';
import type { APIRoute } from 'astro';
import { getDb } from '../../../db/client';
import { saveWaitRange, waitRangeSchema } from '../../../db/promotion-wait-ranges';
import { workflowErrorResponse } from '../../../db/workflow-api';
export const prerender = false;
export const PATCH: APIRoute = async ({ request, url, locals, params }) => {
  if (request.headers.get('origin') !== url.origin) return Response.json({ message: unsafeSubmissionMessage }, { status: 403 });
  try {
    const parsed = waitRangeSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ message: validationMessage(parsed.error.issues[0]) }, { status: 422 });
    const result = await saveWaitRange(getDb(), parsed.data, locals.user!, params.id);
    return Response.json(result, { status: 'confirmationRequired' in result ? 409 : 200 });
  } catch (error) { return workflowErrorResponse(error); }
};
