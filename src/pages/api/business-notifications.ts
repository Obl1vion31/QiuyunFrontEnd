import type { APIRoute } from 'astro';
import { getDb } from '../../db/client';
import { teamScheduleNotifications } from '../../db/schedule-workflow';
import { workflowErrorResponse } from '../../db/workflow-api';
export const prerender = false;
export const GET: APIRoute = async () => {
  try { return Response.json(await teamScheduleNotifications(getDb()), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return workflowErrorResponse(error); }
};
