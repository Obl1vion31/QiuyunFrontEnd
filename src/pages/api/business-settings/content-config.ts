import type {APIRoute} from 'astro';
import {getDb} from '../../../db/client';
import {requireAdmin} from '../../../auth/permissions';
import {contentConfigurationInput,readContentConfigurations,saveContentConfiguration} from '../../../db/content-config';
import {workflowErrorResponse} from '../../../db/workflow-api';
export const prerender=false;
export const GET:APIRoute=async({locals})=>{
 try{requireAdmin(locals.user);return Response.json(await readContentConfigurations(getDb()),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return workflowErrorResponse(error);}
};
export const PATCH:APIRoute=async({request,url,locals})=>{
 if(request.headers.get('origin')!==url.origin)return Response.json({message:'拒绝跨站写入。'},{status:403});
 try{requireAdmin(locals.user);const parsed=contentConfigurationInput.safeParse(await request.json());if(!parsed.success)return Response.json({message:parsed.error.issues[0].message},{status:422});return Response.json({ok:true,...await saveContentConfiguration(getDb(),parsed.data,locals.user!)});}catch(error){return workflowErrorResponse(error);}
};
