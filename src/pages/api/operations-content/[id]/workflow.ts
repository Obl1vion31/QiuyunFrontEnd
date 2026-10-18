import type { APIRoute } from 'astro';
import { getDb } from '../../../../db/client';
import { readScheduleWorkflow, WorkflowError } from '../../../../db/schedule-workflow';
import { shanghaiDateTime } from '../../../../db/validation';
import { workflowErrorResponse } from '../../../../db/workflow-api';
import {effectiveBusinessPermissions} from '../../../../auth/business-permissions';
import {readScheduleApprovals} from '../../../../db/schedule-approvals';
export const prerender = false;
export const GET: APIRoute = async ({ params, url,locals }) => {
  try {
    let actual: Date | undefined;
    if (url.searchParams.has('actual')) {
      const parsed = shanghaiDateTime.safeParse(url.searchParams.get('actual'));
      if (!parsed.success) throw new WorkflowError('请选择有效的发布时间。', 422);
      actual = parsed.data;
    }
    const workflow=await readScheduleWorkflow(getDb(), params.id!, actual);
    const permissions=await effectiveBusinessPermissions(getDb(),locals.user!);
    return Response.json({...workflow,changeProposals:await readScheduleApprovals(getDb(),locals.user!,params.id!),permissions,requiresPlanApproval:workflow.requiresPlanApproval&&permissions['schedule.overdueReschedule']==='review'}, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return workflowErrorResponse(error); }
};
