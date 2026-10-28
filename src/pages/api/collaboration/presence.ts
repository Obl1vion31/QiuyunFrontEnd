import type {APIRoute} from 'astro';
import {and,eq,gt} from 'drizzle-orm';
import {z} from 'zod';
import {getDb} from '../../../db/client';
import {authUser,businessPresence} from '../../../db/schema';
import {cleanExpiredCollaboration,canonicalResources} from '../../../db/collaboration';
import {workflowErrorResponse} from '../../../db/workflow-api';
import {WorkflowError} from '../../../db/schedule-workflow';
export const prerender=false;
const pages=['annual-plan','operations-schedule','daily-promotion-review','non-promotion-review','meeting-review','settings'] as const;
const input=z.object({tabId:z.uuid(),page:z.enum(pages),resource:z.string().max(240).nullable(),field:z.string().max(80).nullable(),label:z.string().max(120).nullable(),visible:z.boolean()}).strict();
export const PUT:APIRoute=async({request,url,locals})=>{
 try{
  if(request.headers.get('origin')!==url.origin)throw new WorkflowError('拒绝跨站操作。',403);
  const data=input.parse(await request.json());
  if(data.page!=='annual-plan'){
   const resource=data.resource?(await canonicalResources(getDb(),[data.resource]))[0]??null:null;
   await getDb().insert(businessPresence).values({...data,resource,id:`${locals.session!.id}:${data.tabId}`,userId:locals.user!.id,sessionId:locals.session!.id,expiresAt:new Date(Date.now()+60_000)})
    .onConflictDoUpdate({target:businessPresence.id,set:{...data,resource,expiresAt:new Date(Date.now()+60_000)}});
  }
  return Response.json({ok:true});
 }catch(error){if(error instanceof z.ZodError)return Response.json({message:'位置请求无效。'},{status:422});return workflowErrorResponse(error);}
};
export const GET:APIRoute=async({url,locals})=>{
 const meeting=url.searchParams.get('meeting');
 if(locals.user!.role!=='admin'&&!meeting)return Response.json({message:'需要管理员权限。'},{status:403});
 try{
  if(meeting&&!z.uuid().safeParse(meeting).success)throw new WorkflowError('会议无效。',422);
  await cleanExpiredCollaboration(getDb());
  const rows=await getDb().select({name:authUser.name,role:authUser.role,page:businessPresence.page,resource:businessPresence.resource,field:businessPresence.field,label:businessPresence.label,visible:businessPresence.visible}).from(businessPresence).innerJoin(authUser,eq(authUser.id,businessPresence.userId)).where(and(eq(authUser.enabled,true),gt(businessPresence.expiresAt,new Date())));
  return Response.json({rows:rows.filter(row=>row.page!=='annual-plan'&&(meeting?row.page==='meeting-review'&&row.resource?.startsWith(`meeting:${meeting}`):row.role==='employee')).map(row=>({...row,name:row.role==='admin'?'Admin':row.name}))},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return workflowErrorResponse(error);}
};
