import type { APIRoute } from 'astro';
import { getDb } from '../../../../db/client';
import { createReservation,reservationSchema } from '../../../../db/publication-workflow';
import { workflowForm,workflowErrorResponse } from '../../../../db/workflow-api';
export const prerender=false;
export const POST: APIRoute = async({params,request,url,locals})=>{
  try{const parsed=await workflowForm(request,url,reservationSchema);if(parsed.error)return parsed.error;return Response.json(await createReservation(getDb(),params.id!,parsed.data,locals.user!),{status:201})}
  catch(error){return workflowErrorResponse(error)}
};
