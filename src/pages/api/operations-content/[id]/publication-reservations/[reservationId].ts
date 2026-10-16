import type { APIRoute } from 'astro';
import { getDb } from '../../../../../db/client';
import { decideReservation,reservationDecisionSchema } from '../../../../../db/publication-workflow';
import { workflowForm,workflowErrorResponse } from '../../../../../db/workflow-api';
export const prerender=false;
export const PATCH: APIRoute = async({params,request,url,locals})=>{
  try{const parsed=await workflowForm(request,url,reservationDecisionSchema);if(parsed.error)return parsed.error;return Response.json(await decideReservation(getDb(),params.id!,params.reservationId!,parsed.data,locals.user!))}
  catch(error){return workflowErrorResponse(error)}
};
