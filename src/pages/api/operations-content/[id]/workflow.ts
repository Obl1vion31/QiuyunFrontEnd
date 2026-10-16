import type { APIRoute } from 'astro';
import { getDb } from '../../../../db/client';
import { readScheduleWorkflow, WorkflowError } from '../../../../db/schedule-workflow';
import { shanghaiDateTime } from '../../../../db/validation';
import { workflowErrorResponse } from '../../../../db/workflow-api';
export const prerender = false;
export const GET: APIRoute = async ({ params, url }) => {
  try {
    let actual: Date | undefined;
    if (url.searchParams.has('actual')) {
      const parsed = shanghaiDateTime.safeParse(url.searchParams.get('actual'));
      if (!parsed.success) throw new WorkflowError('请选择有效的发布时间。', 422);
      actual = parsed.data;
    }
    return Response.json(await readScheduleWorkflow(getDb(), params.id!, actual), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return workflowErrorResponse(error); }
};
