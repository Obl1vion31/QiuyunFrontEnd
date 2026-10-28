/** 受控维护与管理员入口共用账号创建；公开注册保持关闭。 */
import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { eq, sql } from 'drizzle-orm';
import { authUser, authAccount, accountManagementAudit } from '../db/schema';
import type { Database } from '../db/client';
import type { Role } from './permissions';
import { accountIdentifier, accountName, accountPassword } from './identifiers';
import { WorkflowError } from '../db/schedule-workflow';

export async function provisionAccount(db: Database, input: { username: string; name?: string; password: string; role: Role }, actorId?:string) {
 const username=accountIdentifier.parse(input.username),name=accountName.parse(input.name??username);
 accountPassword.parse(input.password);
 if(!['admin','employee'].includes(input.role))throw new Error('请选择有效角色。');
 const password=await hashPassword(input.password);
 return db.transaction(async tx=>{
  await tx.execute(sql`select pg_advisory_xact_lock(719301)`);
  const [existing]=await tx.select().from(authUser).where(eq(authUser.username,username));
  if(existing){
   if(actorId)throw new WorkflowError('账号已被使用，请换一个。',409);
   if(existing.role!==input.role)throw new Error('账号已存在且角色不同；本操作不会覆盖已有角色。');
   return {id:existing.id,created:false};
  }
  const id=randomUUID();
  const [account]=await tx.insert(authUser).values({id,username,displayUsername:username,name,email:`${id}@qiuyun.invalid`,role:input.role}).returning();
  await tx.insert(authAccount).values({id:randomUUID(),userId:id,accountId:id,providerId:'credential',password});
  if(actorId)await tx.insert(accountManagementAudit).values({actorId,targetId:id,action:'create'});
  return {id,created:true,account:{id,username,name,role:account.role,enabled:account.enabled,updatedAt:account.updatedAt.toISOString()}};
 });
}
