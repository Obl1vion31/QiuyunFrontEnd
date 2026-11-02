import type {APIRoute} from 'astro';
import {getDb} from '../../db/client';
import {savePrivate,privateInput} from '../../db/monthly-private';
import {workflowErrorResponse} from '../../db/workflow-api';
export const prerender=false;
export const PATCH:APIRoute=async({request,url,locals})=>{if(request.headers.get('origin')!==url.origin)return new Response('拒绝跨站写入。',{status:403});try{const parsed=privateInput.safeParse(await request.json());if(!parsed.success)return Response.json({message:'请核对月份及人数，人数须为非负整数，未知请留空。'},{status:422});return Response.json({ok:true,...await savePrivate(getDb(),parsed.data,locals.user!.username)});}catch(error){return workflowErrorResponse(error);}};
