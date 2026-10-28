import type {APIRoute} from 'astro';
import {z} from 'zod';
import {getDb} from '../../../db/client';
import {acquireLeases,releaseLeases,renewLeases,canonicalResources,leaseOccupants} from '../../../db/collaboration';
import {workflowErrorResponse} from '../../../db/workflow-api';
import {effectiveBusinessPermissions} from '../../../auth/business-permissions';
import {WorkflowError} from '../../../db/schedule-workflow';
export const prerender=false;
const resourcesSchema=z.array(z.string().min(1).max(240)).max(200);
const input=z.object({tabId:z.uuid(),resources:resourcesSchema.default([]),tokens:z.record(z.string(),z.uuid()).default({}),takeover:z.record(z.string(),z.string().regex(/^[a-f0-9]{64}$/)).optional()}).strict();
const handle:APIRoute=async({request,url,locals})=>{
 try{
  if(request.headers.get('origin')!==url.origin)throw new WorkflowError('拒绝跨站操作。',403);
  const data=input.parse(await request.json());
  if(request.method==='POST'&&locals.user!.role!=='admin'){
   const resources=await canonicalResources(getDb(),data.resources);
   if(resources.some(r=>r.startsWith('account:')||r==='taxonomy'))throw new WorkflowError('需要管理员权限。',403);
   const permissions=await effectiveBusinessPermissions(getDb(),locals.user!);
   for(const prefix of ['year:','schedule:'])if(resources.some(r=>r.startsWith(prefix)&&!(r.includes(':non:')||r.includes(':campaign:')))){
    const group=prefix==='year:'?'annual.':'schedule.';
    if(!Object.entries(permissions).some(([key,mode])=>key.startsWith(group)&&mode!=='disabled'))throw new WorkflowError('当前账号未开放这项编辑。',403);
   }
  }
  const identity={userId:locals.user!.id,sessionId:locals.session!.id,tabId:data.tabId};
  const result=await getDb().transaction(async tx=>{
   if(request.method==='POST')return {leases:await acquireLeases(tx,identity,data.resources,new Date(),data.takeover)};
   if(request.method==='PATCH')return renewLeases(tx,identity,data.tokens);
   await releaseLeases(tx,identity,data.resources,data.tokens);return {leases:[]};
  });
  return Response.json({ok:true,...result},{headers:{'Cache-Control':'no-store'}});
 }catch(error){if(error instanceof z.ZodError)return Response.json({message:'编辑请求无效。'},{status:422});return workflowErrorResponse(error);}
};
export const GET:APIRoute=async({url,locals})=>{
 try{
  const resources=resourcesSchema.parse(url.searchParams.getAll('resource')),tabId=z.uuid().parse(url.searchParams.get('tabId'));
  if(locals.user!.role!=='admin'&&resources.some(value=>value.startsWith('account:')||value==='taxonomy'))throw new WorkflowError('需要管理员权限。',403);
  const rows=await leaseOccupants(getDb(),{userId:locals.user!.id,sessionId:locals.session!.id,tabId},resources);
  return Response.json({rows},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){if(error instanceof z.ZodError)return Response.json({message:'编辑对象无效。'},{status:422});return workflowErrorResponse(error);}
};
export const POST=handle,PATCH=handle,DELETE=handle;
