import type { APIRoute } from 'astro';
import { getDb } from '../../db/client';
import { saveStageSnapshot, stageSnapshotSchema } from '../../db/promotion-stage-reviews';
import { workflowErrorResponse } from '../../db/workflow-api';
export const prerender = false;
export const POST: APIRoute = async ({ request, url, locals }) => {
  if (request.headers.get('origin') !== url.origin) return Response.json({ message: '拒绝跨站写入。' }, { status: 403 });
  try {
    const parsed = stageSnapshotSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ message: parsed.error.issues[0].message }, { status: 422 });
    return Response.json(await saveStageSnapshot(getDb(), parsed.data, locals.user!.username), { status: 201 });
  } catch (error) { return workflowErrorResponse(error); }
};
