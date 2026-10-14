import type { APIRoute } from 'astro';
import { getDb } from '../../../../db/client';
import { lockSchedule, reasonSchema, saveDelayReason } from '../../../../db/schedule-workflow';
import { workflowErrorResponse, workflowForm } from '../../../../db/workflow-api';
export const prerender = false;
export const POST: APIRoute = async ({ params, request, url, locals }) => {
  try {
    const input = await workflowForm(request, url, reasonSchema);
    if (input.error) return input.error;
    await getDb().transaction(async transaction => {
      const schedule = await lockSchedule(transaction, params.id!);
      await saveDelayReason(transaction, schedule, input.data!, locals.user!);
    });
    return Response.json({ ok: true });
  } catch (error) { return workflowErrorResponse(error); }
};
