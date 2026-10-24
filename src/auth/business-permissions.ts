import {AsyncLocalStorage} from 'node:async_hooks';
import {and,eq,inArray,sql} from 'drizzle-orm';
import type {Database} from '../db/client';
import {operationsAccountPermission as permissions,operationsPermissionAudit as audit,operationsChangeProposal as proposals,operationsScheduleChangeRequest as legacy,authUser} from '../db/schema';
import {AccessDenied,requireAdmin,type OperationsUser} from './permissions';
import {businessOperations,defaultBusinessPermissions,type BusinessOperation,type BusinessPermissions} from './business-capabilities';
type Reader=Pick<Database,'select'|'insert'|'update'|'delete'|'execute'>;
const execution=new AsyncLocalStorage<{userId:string;operations:BusinessOperation[]}>();
export const withBusinessExecution=<T>(user:OperationsUser,operations:BusinessOperation[],action:()=>Promise<T>)=>execution.run({userId:user.id,operations},action);
export const hasBusinessExecution=(user:OperationsUser,operation:BusinessOperation)=>{const context=execution.getStore();return context?.userId===user.id&&context.operations.includes(operation);};
export async function effectiveBusinessPermissions(db:Reader,user:OperationsUser):Promise<BusinessPermissions>{
  const result=defaultBusinessPermissions();
  if(user.role==='admin'){for(const [key] of businessOperations)result[key]='direct';return result;}
  for(const row of await db.select().from(permissions).where(eq(permissions.userId,user.id))){if(row.operation in result)result[row.operation as BusinessOperation]=row.mode;}
  return result;
}
export async function requireBusinessOperation(db:Reader,user:OperationsUser,operation:BusinessOperation){
  const mode=(await effectiveBusinessPermissions(db,user))[operation];
  if(mode==='disabled'||mode==='review'&&!hasBusinessExecution(user,operation))throw new AccessDenied(mode==='review'?'这项修改需要提交管理员审核。':'当前账号未开放这项操作。');
}
export const lockBusinessWrites=(db:Reader)=>db.execute(sql`select pg_advisory_xact_lock(69742,0)`);
export async function updateAccountPermissions(db:Database,actor:OperationsUser,userId:string,next:BusinessPermissions,expected:BusinessPermissions){
  requireAdmin(actor);
  return db.transaction(async tx=>{
    await lockBusinessWrites(tx);
    const [user]=await tx.select({id:authUser.id,username:authUser.username,role:authUser.role}).from(authUser).where(eq(authUser.id,userId));
    if(!user||user.role!=='employee')throw new AccessDenied('仅能配置现有员工账号的业务权限。');
    const before=await effectiveBusinessPermissions(tx,user);
    if(JSON.stringify(before)!==JSON.stringify(expected))return false;
    for(const [operation] of businessOperations)if(before[operation]!==next[operation])await tx.insert(permissions).values({userId,operation,mode:next[operation]}).onConflictDoUpdate({target:[permissions.userId,permissions.operation],set:{mode:next[operation],updatedAt:new Date()}});
    await tx.insert(audit).values({userId,before,after:next,changedById:actor.id,changedByLabel:actor.username});
    const changed=businessOperations.filter(([key])=>before[key]!==next[key]).map(([key])=>key);
    if(changed.length){
      const pending=await tx.select().from(proposals).where(and(eq(proposals.requestedById,userId),eq(proposals.status,'pending')));
      const ids=pending.filter(row=>row.operations.some(key=>changed.includes(key as BusinessOperation))).map(row=>row.id);
      if(ids.length)await tx.update(proposals).set({status:'obsolete',decisionReason:'账号权限已调整，请重新提交。',decidedAt:new Date(),decidedById:actor.id,decidedByLabel:actor.username}).where(inArray(proposals.id,ids));
      if(changed.some(key=>key==='schedule.overdueReschedule'||key==='schedule.reschedule'))await tx.update(legacy).set({status:'obsolete',decisionReason:'账号权限已调整，请重新提交。',decidedAt:new Date(),decidedById:actor.id,decidedByLabel:actor.username}).where(and(eq(legacy.requestedById,userId),eq(legacy.status,'pending')));
    }
    return true;
  });
}
