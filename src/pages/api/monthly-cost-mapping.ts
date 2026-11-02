import type {APIRoute} from 'astro';
import {getDb} from '../../db/client';
import {readCostMapping,saveCostMapping,mappingInput} from '../../db/monthly-private';
import {workflowErrorResponse} from '../../db/workflow-api';
import {requireAdmin} from '../../auth/permissions';
export const prerender=false;
export const GET:APIRoute=async()=>Response.json(await readCostMapping(getDb()));
export const PATCH:APIRoute=async({request,url,locals})=>{if(request.headers.get('origin')!==url.origin)return new Response('拒绝跨站写入。',{status:403});try{requireAdmin(locals.user);const parsed=mappingInput.safeParse(await request.json());if(!parsed.success)return Response.json({message:'请核对费用归属。'},{status:422});return Response.json({ok:true,...await saveCostMapping(getDb(),parsed.data,locals.user!.username)});}catch(error){return workflowErrorResponse(error);}};
