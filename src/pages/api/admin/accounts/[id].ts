import type {APIRoute} from 'astro';
import {and,eq,sql} from 'drizzle-orm';
import {z} from 'zod';
import {hashPassword} from 'better-auth/crypto';
import {getDb} from '../../../../db/client';
import {authUser,authSession,authAccount,accountManagementAudit} from '../../../../db/schema';
import {requireAdmin} from '../../../../auth/permissions';
import {WorkflowError} from '../../../../db/schedule-workflow';
import {workflowErrorResponse} from '../../../../db/workflow-api';
export const prerender=false;
const inputSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('rename'),name:z.string().trim().min(1).max(40)}),
 z.object({action:z.literal('status'),enabled:z.boolean()}),
 z.object({action:z.literal('resetPassword'),password:z.string().min(6).max(128)}),
 z.object({action:z.literal('revokeSessions')}),
]).and(z.object({expectedUpdatedAt:z.iso.datetime()}));
export const PATCH:APIRoute=async({request,url,params,locals})=>{
 try{
  requireAdmin(locals.user);
  if(request.headers.get('origin')!==url.origin)throw new WorkflowError('拒绝跨站操作。',403);
  const input=inputSchema.parse(await request.json());
  const password=input.action==='resetPassword'?await hashPassword(input.password):undefined;
  const updatedAt=new Date();
  await getDb().transaction(async tx=>{
   // 账号启停和最后管理员检查在同一把锁内，避免两人同时停用各自看到的“其他管理员”。
   await tx.execute(sql`select pg_advisory_xact_lock(719301)`);
   const [target]=await tx.select().from(authUser).where(eq(authUser.id,params.id!)).for('update');
   if(!target)throw new WorkflowError('没有找到这个账号。',404);
   if(target.updatedAt.toISOString()!==input.expectedUpdatedAt)throw new WorkflowError('账号已被更新，请重新打开核对。输入已保留。',409);
   if(input.action==='status'&&!input.enabled){
    if(target.id===locals.user!.id)throw new WorkflowError('不能停用当前登录账号。',422);
    const admins=await tx.select({id:authUser.id}).from(authUser).where(and(eq(authUser.role,'admin'),eq(authUser.enabled,true)));
    if(target.role==='admin'&&admins.length<=1)throw new WorkflowError('至少需要保留一个有效管理员。',422);
   }
   if(input.action==='rename')await tx.update(authUser).set({name:input.name,updatedAt:new Date()}).where(eq(authUser.id,target.id));
   if(input.action==='status')await tx.update(authUser).set({enabled:input.enabled,updatedAt:new Date()}).where(eq(authUser.id,target.id));
   if(password)await tx.update(authAccount).set({password,updatedAt:new Date()}).where(and(eq(authAccount.userId,target.id),eq(authAccount.providerId,'credential')));
   if(input.action==='revokeSessions'||input.action==='resetPassword'||input.action==='status'&&!input.enabled)await tx.delete(authSession).where(eq(authSession.userId,target.id));
   await tx.update(authUser).set({updatedAt}).where(eq(authUser.id,target.id));
   await tx.insert(accountManagementAudit).values({actorId:locals.user!.id,targetId:target.id,action:input.action==='status'?(input.enabled?'enable':'disable'):input.action});
  });
  return Response.json({ok:true,updatedAt:updatedAt.toISOString(),signedOut:locals.user!.id===params.id&&(input.action==='resetPassword'||input.action==='revokeSessions')});
 }catch(error){if(error instanceof z.ZodError)return Response.json({message:error.issues[0].message},{status:422});return workflowErrorResponse(error);}
};
