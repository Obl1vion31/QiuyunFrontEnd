import type { APIRoute } from 'astro';
import { getDb } from '../../db/client';
import { teamScheduleNotifications } from '../../db/schedule-workflow';
import { readSidebarCounts } from '../../db/business-notifications';
import { workflowErrorResponse } from '../../db/workflow-api';
export const prerender = false;
export const GET: APIRoute = async ({url,locals}) => {
  try {
    const db=getDb(),viewer=locals.user!;
    const counts=url.searchParams.get('view')==='sidebar'
      ? await readSidebarCounts(db,viewer)
      : await teamScheduleNotifications(db,new Date(),viewer);
    return Response.json(counts,{headers:{'Cache-Control':'private, no-store'}});
  }
  catch (error) { return workflowErrorResponse(error); }
};
