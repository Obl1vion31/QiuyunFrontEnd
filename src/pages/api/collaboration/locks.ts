import type {APIRoute} from 'astro';
import {z} from 'zod';
import {getDb} from '../../../db/client';
import {acquireLeases,releaseLeases,renewLeases} from '../../../db/collaboration';
import {workflowErrorResponse} from '../../../db/workflow-api';
import {effectiveBusinessPermissions} from '../../../auth/business-permissions';
import {canonicalResources} from '../../../db/collaboration';
import {WorkflowError} from '../../../db/schedule-workflow';
export const prerender=false;
const input=z.object({tabId:z.uuid(),resources:z.array(z.string().min(1).max(240)).max(200).default([]),tokens:z.record(z.string(),z.uuid()).default({})}).strict();
const handle:APIRoute=async({request,url,locals})=>{
 try{
  if(request.headers.get('origin')!==url.origin)throw new WorkflowError('拒绝跨站操作。',403);
  const data=input.parse(await request.json());
  if(request.method==='POST'&&locals.user!.role!=='admin'){
   const resources=await canonicalResources(getDb(),data.resources);
   if(resources.some(r=>r.startsWith('account:')||r==='taxonomy'))throw new WorkflowError('需要管理员权限。',403);
   if(resources.some(r=>r.startsWith('year:'))){const permissions=await effectiveBusinessPermissions(getDb(),locals.user!);if(!Object.entries(permissions).some(([key,mode])=>key.startsWith('annual.')&&mode!=='disabled'))throw new WorkflowError('当前账号未开放规划编辑。',403);}
  }
  const identity={userId:locals.user!.id,sessionId:locals.session!.id,tabId:data.tabId};
  const leases=await getDb().transaction(async tx=>request.method==='POST'?acquireLeases(tx,identity,data.resources):request.method==='PATCH'?renewLeases(tx,identity,data.tokens):releaseLeases(tx,identity,data.resources,data.tokens));
  return Response.json({ok:true,leases:leases??[]},{headers:{'Cache-Control':'no-store'}});
 }catch(error){if(error instanceof z.ZodError)return Response.json({message:'编辑请求无效。'},{status:422});return workflowErrorResponse(error);}
};
export const POST=handle,PATCH=handle,DELETE=handle;
