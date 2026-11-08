import {createHash} from 'node:crypto';
import {and,asc,eq,gte,inArray,isNull,lt} from 'drizzle-orm';
import {z} from 'zod';
import type {Database} from './client';
import type {OperationsUser} from '../auth/permissions';
import {effectiveBusinessPermissions,requireBusinessOperation} from '../auth/business-permissions';
import {lockPromotionWorkflow} from './promotion-pauses';
import {businessDate} from './promotion-wait-ranges';
import {shanghaiDateKey} from './promotion-rules.mjs';
import {requiresPlanApproval} from './schedule-rules.mjs';
import {changeSchedulePlan,StaleWriteError,WorkflowError} from './schedule-workflow';
import {schedulePlanReasons,requireSchedulePlanReason} from './schedule-plan-reason';
import {appendScheduleExecution,assertScheduleMonthRules,captureScheduleExecution} from './schedule-edit-policy';
import * as s from './schema';

const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const placementSchema=z.object({
 action:z.enum(['move','swap']),day:businessDate,targetScheduleId:z.uuid().optional(),
 time:time.optional(),returnTime:time.optional(),fingerprint:z.string().length(64),
 expectedPlanRevision:z.number().int().min(0),targetPlanRevision:z.number().int().min(0).optional(),
 reason:z.string().trim().max(2000).default(''),requestKey:z.uuid(),
}).refine(v=>v.action!=='swap'||!!v.targetScheduleId&&v.targetPlanRevision!==undefined,{message:'请选择要对换的帖子。'});
type Input=z.infer<typeof placementSchema>;
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const selected={id:s.operationsContentSchedule.id,plannedPublishAt:s.operationsContentSchedule.plannedPublishAt,planRevision:s.operationsContentSchedule.planRevision,actualPublishAt:s.operationsContentSchedule.actualPublishAt,cancelledAt:s.operationsContentSchedule.cancelledAt,name:s.operationsContentVersion.contentName,version:s.operationsContentVersion.versionNumber};
type Row={id:string;plannedPublishAt:Date;planRevision:number;actualPublishAt:Date|null;cancelledAt:Date|null;name:string;version:number};
const publicRow=(r:Row)=>({id:r.id,name:r.name,version:r.version,at:r.plannedPublishAt.toISOString(),planRevision:r.planRevision,published:!!r.actualPublishAt});
export function placedTime(day:string,original:Date,clock?:string){
 if(clock)return new Date(day+'T'+clock+':00+08:00');
 const originalMidnight=new Date(shanghaiDateKey(original)+'T00:00:00+08:00');
 return new Date(new Date(day+'T00:00:00+08:00').getTime()+original.getTime()-originalMidnight.getTime());
}
const operation=(row:Row,now:Date)=>requiresPlanApproval(row,now)?'schedule.overdueReschedule':'schedule.reschedule';
async function monthGate(db:Database,row:Row,next:Date,reason:string){
 const from=shanghaiDateKey(row.plannedPublishAt).slice(0,7),to=shanghaiDateKey(next).slice(0,7);
 await assertScheduleMonthRules(db,{months:[...new Set([from,to])],current:row,newMonth:to,creating:false,moving:from!==to,reason});
}
async function rowById(db:Database,id:string){
 return (await db.select(selected).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentVersion.id,s.operationsContentSchedule.contentVersionId)).where(eq(s.operationsContentSchedule.id,id)))[0];
}
export async function previewPlacement(db:Database,id:string,day:string,actor:OperationsUser,now=new Date()){
 if(!businessDate.safeParse(day).success)throw new WorkflowError('请选择有效的目标日期。',422);
 const source=await rowById(db,id);
 if(!source||source.cancelledAt)throw new WorkflowError('这篇排期已不存在或已取消，请重新选择。',404);
 if(source.actualPublishAt)throw new WorkflowError('这篇帖子已登记发布，请在原入口核对实发记录。',422);
 await requireBusinessOperation(db,actor,operation(source,now));
 const start=new Date(day+'T00:00:00+08:00'),end=new Date(start.getTime()+86400000);
 const candidates=await db.select(selected).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentVersion.id,s.operationsContentSchedule.contentVersionId)).where(and(isNull(s.operationsContentSchedule.cancelledAt),gte(s.operationsContentSchedule.plannedPublishAt,start),lt(s.operationsContentSchedule.plannedPublishAt,end))).orderBy(asc(s.operationsContentSchedule.plannedPublishAt),asc(s.operationsContentSchedule.id));
 const next=placedTime(day,source.plannedPublishAt);
 await monthGate(db,source,next,'预览');
 const permissions=await effectiveBusinessPermissions(db,actor);
 const reasons=await schedulePlanReasons(db,[{schedule:source,next},...candidates.filter(row=>row.id!==id).map(row=>({schedule:row,next:source.plannedPublishAt}))]);
 const items=await Promise.all(candidates.filter(r=>r.id!==id).map(async row=>{
  let unavailableReason=row.actualPublishAt?'已登记发布，不能对换。':permissions[operation(row,now)]==='disabled'?'当前账号没有这篇帖子的改期权限。':'';
  if(!unavailableReason)try{await monthGate(db,row,source.plannedPublishAt,'预览');}catch(error){unavailableReason=error instanceof Error?error.message:'当前月份不能对换。';}
  return {...publicRow(row),unavailableReason,reasonMessage:unavailableReason?null:reasons.get(row.id)??null};
 }));
 return {source:publicRow(source),day,items,reasonMessage:reasons.get(id)??null,fingerprint:digest([publicRow(source),candidates.filter(r=>r.id!==id).map(publicRow)]),serverNow:now.toISOString()};
}
export class PlacementChanged extends WorkflowError{
 override readonly code='PLACEMENT_CHANGED';
 constructor(){super('目标日或排期已变化，本次未保存。请重新核对，已填写的原因会保留。',409);}
}
export async function savePlacement(db:Database,id:string,input:Input,actor:OperationsUser,now=new Date()){
 return db.transaction(async tx=>{
  await lockPromotionWorkflow(tx);
  const ids=[...new Set([id,...(input.action==='swap'&&input.targetScheduleId?[input.targetScheduleId]:[])])].sort();
  const locked=await tx.select().from(s.operationsContentSchedule).where(inArray(s.operationsContentSchedule.id,ids)).orderBy(asc(s.operationsContentSchedule.id)).for('update');
  const source=locked.find(r=>r.id===id);
  if(!source)throw new WorkflowError('没有找到这篇排期。',404);
  const inputHash=digest(input),receipt=source.executionHistory.find(e=>e.placement?.requestKey===input.requestKey)?.placement;
  if(receipt){if(receipt.actorId!==actor.id||receipt.inputHash!==inputHash)throw new WorkflowError('本次请求编号已用于其他调整，请重新操作。',422);return {ok:true,ids:receipt.ids,repeated:true};}
  if(source.planRevision!==input.expectedPlanRevision)throw new StaleWriteError('这篇帖子的应发时间已更新，本次未保存。请重新核对。');
  const preview=await previewPlacement(tx,id,input.day,actor,now);
  if(preview.fingerprint!==input.fingerprint)throw new PlacementChanged();
  if(input.day===shanghaiDateKey(source.plannedPublishAt)&&input.action==='move'&&!input.time)return {ok:true,ids:[id],unchanged:true};
  const target=input.action==='swap'?locked.find(r=>r.id===input.targetScheduleId):undefined;
  if(input.action==='swap'&&(!target||target.id===id||target.cancelledAt||target.actualPublishAt||shanghaiDateKey(target.plannedPublishAt)!==input.day))throw new PlacementChanged();
  if(target&&target.planRevision!==input.targetPlanRevision)throw new StaleWriteError('对换帖子的应发时间已更新，本次未保存。请重新核对。');
  const next=placedTime(input.day,target?.plannedPublishAt??source.plannedPublishAt,input.time);
  const back=target?placedTime(shanghaiDateKey(source.plannedPublishAt),source.plannedPublishAt,input.returnTime):undefined;
  if(next<=now||back&&back<=now)throw new WorkflowError('调整后的应发时间已经过去，请为对应帖子选择未来的时刻。',422);
  const sourceRow=await rowById(tx,id);
  await monthGate(tx,sourceRow,next,input.reason);
  await requireSchedulePlanReason(tx,source,next,input.reason);
  if(target){const targetRow=await rowById(tx,target.id);await requireBusinessOperation(tx,actor,operation(targetRow,now));await monthGate(tx,targetRow,back!,input.reason);await requireSchedulePlanReason(tx,target,back!,input.reason);}
  const captured=await captureScheduleExecution(tx,ids);
  const targetName=target?preview.items.find(item=>item.id===target.id)?.name:'';
  const reason=(target?'对换「'+preview.source.name+'」与「'+targetName+'」的排期':'移动排期')+(input.reason?'：'+input.reason:'');
  await changeSchedulePlan(tx,source,next,reason,actor,now);
  if(target)await changeSchedulePlan(tx,target,back!,reason,actor,now);
  await appendScheduleExecution(tx,captured,actor,reason,{requestKey:input.requestKey,inputHash,actorId:actor.id,action:input.action,sourceId:id,...(target?{targetId:target.id}:{}),ids});
  return {ok:true,ids};
 });
}
