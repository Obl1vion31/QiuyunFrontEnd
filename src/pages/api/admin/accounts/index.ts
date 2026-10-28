import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getDb } from '../../../../db/client';
import { requireAdmin } from '../../../../auth/permissions';
import { provisionAccount } from '../../../../auth/provision';
import { accountIdentifier,accountName,accountPassword,accountConflict } from '../../../../auth/identifiers';
import { WorkflowError } from '../../../../db/schedule-workflow';
import { workflowErrorResponse } from '../../../../db/workflow-api';
export const prerender=false;
const inputSchema=z.object({username:accountIdentifier,name:accountName,password:accountPassword,role:z.enum(['employee','admin'])});
export const POST:APIRoute=async({request,url,locals})=>{
 try{
  requireAdmin(locals.user);
  if(request.headers.get('origin')!==url.origin)throw new WorkflowError('拒绝跨站操作。',403);
  const result=await provisionAccount(getDb(),inputSchema.parse(await request.json()),locals.user!.id);
  return Response.json({ok:true,account:result.account},{status:201});
 }catch(error){if(error instanceof z.ZodError)return Response.json({message:error.issues[0].message},{status:422});return workflowErrorResponse(accountConflict(error)??error);}
};
