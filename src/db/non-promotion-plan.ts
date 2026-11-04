import {StaleWriteError} from './schedule-workflow';
import {readPromotionContext} from './promotion-pauses';
import {promotionStateOn} from './promotion-state.mjs';
import {nextDateKey} from './promotion-rules.mjs';
import {operationMode,type OperationType} from './operation-types';
import {and,eq,isNotNull} from 'drizzle-orm';
import type {Database} from './client';
import {WorkflowError,type Transaction} from './schedule-workflow';
import * as s from './schema';
import {reviewNodes,validReviewDate,type ReviewMode} from './non-promotion-nodes';
import {type ReviewPlanInput} from './non-promotion-plan-input';
export {reviewPlanSchema} from './non-promotion-plan-input';
import {shanghaiDateKey} from './stage-review-rules.mjs';

export type Plan=typeof s.operationsNonPromotionReviewPlan.$inferSelect;
export type CustomNode=typeof s.operationsNonPromotionCustomCheckpoint.$inferSelect;
type Reader=Database|Transaction;
export function anchorReviewPosts<T extends {id:string;contentId:string;versionNumber:number;actualPublishAt:Date|null;isPromoted:boolean;operationType?:OperationType|null}>(rows:T[],plans:Plan[],context?:Awaited<ReturnType<typeof readPromotionContext>>,today=shanghaiDateKey(new Date()),now=new Date()){
 const groups=new Map<string,T[]>();for(const row of rows)if(row.actualPublishAt&&(row.operationType!=='promotion_then_continuous'||row.actualPublishAt.getTime()<=now.getTime()))groups.set(row.contentId,[...(groups.get(row.contentId)??[]),row]);
 return [...groups.values()].map(group=>{
  group.sort((a,b)=>a.actualPublishAt!.getTime()-b.actualPublishAt!.getTime()||a.versionNumber-b.versionNumber||a.id.localeCompare(b.id));
  const plan=plans.find(p=>p.contentId===group[0].contentId),latest=[...group].sort((a,b)=>b.versionNumber-a.versionNumber)[0];
  const operationType=group[0].operationType??null,segmented=operationType==='promotion_then_continuous';
  // 普通非推广沿用最早实发计划；推广后持续复盘只由已实际生效的最新版承接。
  const anchor=segmented?latest:group.find(p=>p.id===plan?.anchorScheduleId)??group[0];
  const mode:ReviewMode=segmented?'continuous':plan?.mode??(group[0].isPromoted&&!latest.isPromoted?'continuous':'standard');
  const campaign=context?.campaigns.filter(c=>c.scheduleId===latest.id).sort((a,b)=>b.startedOn.localeCompare(a.startedOn)||b.createdAt.getTime()-a.createdAt.getTime())[0];
  const state=campaign&&promotionStateOn(campaign,context,today);
  const activatedOn=segmented&&state?.currentStatus==='ended'&&state.endedOn?nextDateKey(state.endedOn):null;
  const reviewActive=operationType==='promotion_only'?false:segmented?!!activatedOn&&activatedOn<=today:operationType==='non_promotion_standard'||operationType==='non_promotion_instant'||!latest.isPromoted;
  return {...anchor,standardCohortEligible:reviewActive&&!anchor.isPromoted,operationType,reviewActive,activatedOn,statisticsFrom:segmented?activatedOn:null,latestScheduleId:latest.id,actualPublishAt:anchor.actualPublishAt!,isPromoted:latest.isPromoted,plan,mode,enabledPlan:segmented?{mode,day7:false,day15:false}:plan??{mode,day7:mode==='standard',day15:mode==='standard'}};
 });
}
/** 与实发登记同一事务记录周期切换。未来登记先记录生效时间，读写资格按真实时刻切换。 */
export async function switchContinuousReviewCycle(db:Reader,contentId:string,scheduleId:string,actualPublishAt:Date,actor:string){
 const [content]=await db.select().from(s.operationsContent).where(eq(s.operationsContent.id,contentId));if(content.operationType!=='promotion_then_continuous')return;
 const [plan]=await db.select().from(s.operationsNonPromotionReviewPlan).where(eq(s.operationsNonPromotionReviewPlan.contentId,contentId));
 const candidates=await db.select({id:s.operationsContentSchedule.id,version:s.operationsContentVersion.versionNumber}).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentSchedule.contentVersionId,s.operationsContentVersion.id)).where(and(eq(s.operationsContentVersion.contentId,contentId),isNotNull(s.operationsContentSchedule.actualPublishAt)));
 if(candidates.some(p=>p.version>candidates.find(p=>p.id===scheduleId)!.version)||plan?.anchorScheduleId===scheduleId)return;
 const history=[...(plan?.history??[]),{at:new Date().toISOString(),actor,before:{anchorScheduleId:plan?.anchorScheduleId??null},after:{anchorScheduleId:scheduleId,effectiveAt:actualPublishAt.toISOString()}}];
 if(plan)await db.update(s.operationsNonPromotionReviewPlan).set({anchorScheduleId:scheduleId,mode:'continuous',day7:false,day15:false,revision:plan.revision+1,history,updatedAt:new Date()}).where(eq(s.operationsNonPromotionReviewPlan.contentId,contentId));
 else await db.insert(s.operationsNonPromotionReviewPlan).values({contentId,anchorScheduleId:scheduleId,mode:'continuous',day7:false,day15:false,history});
}
export async function readReviewPlanning(db:Reader,existingContext?:Awaited<ReturnType<typeof readPromotionContext>>){const [plans,custom,context]=await Promise.all([db.select().from(s.operationsNonPromotionReviewPlan),db.select().from(s.operationsNonPromotionCustomCheckpoint),existingContext??readPromotionContext(db)]);return {plans,custom,context};}
export async function standardCohortAnchorIds(db:Reader){
 const [rows,plans]=await Promise.all([db.select({id:s.operationsContentSchedule.id,contentId:s.operationsContentVersion.contentId,versionNumber:s.operationsContentVersion.versionNumber,actualPublishAt:s.operationsContentSchedule.actualPublishAt,isPromoted:s.operationsContentSchedule.isPromoted,operationType:s.operationsContent.operationType}).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentSchedule.contentVersionId,s.operationsContentVersion.id)).innerJoin(s.operationsContent,eq(s.operationsContentVersion.contentId,s.operationsContent.id)),db.select().from(s.operationsNonPromotionReviewPlan)]);
 return new Set(anchorReviewPosts(rows,plans,await readPromotionContext(db)).filter(p=>p.standardCohortEligible).map(p=>p.id));
}
export async function reviewIdentity(db:Reader,scheduleId:string){
 const [version]=await db.select({contentId:s.operationsContentVersion.contentId}).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentSchedule.contentVersionId,s.operationsContentVersion.id)).where(eq(s.operationsContentSchedule.id,scheduleId));
 if(!version)throw new WorkflowError('没有找到帖子。',404);
 const rows=await db.select({id:s.operationsContentSchedule.id,contentId:s.operationsContentVersion.contentId,versionNumber:s.operationsContentVersion.versionNumber,actualPublishAt:s.operationsContentSchedule.actualPublishAt,isPromoted:s.operationsContentSchedule.isPromoted,operationType:s.operationsContent.operationType}).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentSchedule.contentVersionId,s.operationsContentVersion.id)).innerJoin(s.operationsContent,eq(s.operationsContentVersion.contentId,s.operationsContent.id)).where(and(eq(s.operationsContentVersion.contentId,version.contentId),isNotNull(s.operationsContentSchedule.actualPublishAt)));
 const {plans,custom,context}=await readReviewPlanning(db),post=anchorReviewPosts(rows,plans,context)[0];
 if(!post)throw new WorkflowError('请先登记实际发布时间。');
 const nodes=reviewNodes(post.actualPublishAt,post.enabledPlan,custom.filter(n=>n.contentId===post.contentId&&(post.operationType!=='promotion_then_continuous'||n.scheduleId===post.id))).filter(n=>!post.activatedOn||n.dueOn>=post.activatedOn);
 return {...post,nodes,custom:custom.filter(n=>n.contentId===post.contentId&&(post.operationType!=='promotion_then_continuous'||n.scheduleId===post.id))};
}
const stamp=(actor:string,before:unknown,after:unknown,reason='')=>({at:new Date().toISOString(),actor,before,after,reason});
export async function saveReviewPlan(db:Reader,scheduleId:string,input:ReviewPlanInput,actor:string){
 const post=await reviewIdentity(db,scheduleId);
 if(post.id!==scheduleId)throw new WorkflowError('改帖沿用原帖计划，请在原帖复盘计划中管理。');
 await db.select({id:s.operationsContent.id}).from(s.operationsContent).where(eq(s.operationsContent.id,post.contentId)).for('update');
 const [current]=await db.select().from(s.operationsNonPromotionReviewPlan).where(eq(s.operationsNonPromotionReviewPlan.contentId,post.contentId));
 if(!post.reviewActive)throw new WorkflowError('当前推广阶段尚未转入非推广复盘。',422);
 if(post.operationType&&input.mode!==operationMode(post.operationType))throw new WorkflowError('请通过编辑排期调整运营类型。',422);
 if(post.operationType==='promotion_then_continuous'&&(input.day7||input.day15))throw new WorkflowError('推广后持续复盘使用自定义截止日期。',422);
 if((current?.revision??-1)!==input.expectedRevision)throw new StaleWriteError('复盘计划已更新，请刷新核对；当前输入已保留。');
 const dueOn=input.dueOn||null;
 if(dueOn&&dueOn<(post.activatedOn??shanghaiDateKey(post.actualPublishAt)))throw new WorkflowError('截止日期不能早于原帖实际发布日期。',422);
 const values={mode:input.mode,day7:input.mode==='standard'||input.day7,day15:input.mode==='standard'||input.day15};
 const oldCustom=post.custom.filter(n=>!n.cancelledAt),instant=oldCustom[0];
 if(input.mode==='instant'&&oldCustom.length>1)throw new WorkflowError('已有多个自定义节点，请使用持续复盘。',422);
 const history=[...(current?.history??[]),stamp(actor,current?{mode:current.mode,day7:current.day7,day15:current.day15}:null,{...values,dueOn})];
 if(current)await db.update(s.operationsNonPromotionReviewPlan).set({...values,revision:current.revision+1,history,updatedAt:new Date()}).where(eq(s.operationsNonPromotionReviewPlan.contentId,post.contentId));
 else await db.insert(s.operationsNonPromotionReviewPlan).values({contentId:post.contentId,anchorScheduleId:post.id,...values,history});
 if(input.mode==='standard'){
  const saved=await db.select({id:s.operationsContentPerformanceMetric.customCheckpointId}).from(s.operationsContentPerformanceMetric).where(eq(s.operationsContentPerformanceMetric.scheduleId,post.id));
  for(const node of oldCustom.filter(n=>!saved.some(m=>m.id===n.id)))await mutateCustomNode(db,post.id,{action:'cancel',nodeId:node.id,expectedRevision:node.revision,reason:'切换为常规复盘'},actor);
 }
 if(dueOn){
  if(input.mode==='instant'&&instant&&instant.dueOn!==dueOn)await mutateCustomNode(db,post.id,{action:'reschedule',nodeId:instant.id,dueOn,expectedRevision:instant.revision,reason:'调整即时复盘日期'},actor);
  else if(!oldCustom.some(n=>n.dueOn===dueOn))await addCustomNode(db,post.id,dueOn,actor);
 }
}
export async function addCustomNode(db:Reader,scheduleId:string,dueOn:string,actor:string){
 const post=await reviewIdentity(db,scheduleId);
 const [configuration]=await db.select({finalReviewOn:s.operationsContentSchedule.finalReviewOn}).from(s.operationsContentSchedule).where(eq(s.operationsContentSchedule.id,scheduleId));
 if(post.operationType==='promotion_then_continuous'&&configuration?.finalReviewOn)throw new WorkflowError('自动复盘节点请通过最终复盘日期调整。',422);
 if(post.id!==scheduleId)throw new WorkflowError('该版本已退出当前持续复盘，请打开当前版本。');
 if(!post.reviewActive)throw new WorkflowError('推广阶段不能新增非推广复盘。',422);
 if(post.mode==='standard')throw new WorkflowError('请先选择即时或持续复盘。',422);
 if(!validReviewDate(dueOn)||dueOn<(post.activatedOn??shanghaiDateKey(post.actualPublishAt)))throw new WorkflowError('请选择不早于原帖发布日期的有效截止日。',422);
 if(post.mode==='instant'&&post.custom.some(n=>!n.cancelledAt))throw new WorkflowError('即时复盘已有一个截止日；需要多次复盘时请选择持续复盘。',422);
 if(post.nodes.some(n=>n.dueOn===dueOn))throw new WorkflowError('该截止日已有复盘节点，请直接使用已有节点。',422);
 return (await db.insert(s.operationsNonPromotionCustomCheckpoint).values({scheduleId:post.id,contentId:post.contentId,dueOn,history:[stamp(actor,null,{dueOn})]}).returning())[0];
}
export async function mutateCustomNode(db:Reader,scheduleId:string,input:{action:'reschedule'|'cancel';nodeId:string;dueOn?:string;expectedRevision:number;reason:string},actor:string){
 const [configuration]=await db.select({finalReviewOn:s.operationsContentSchedule.finalReviewOn}).from(s.operationsContentSchedule).where(eq(s.operationsContentSchedule.id,scheduleId));
 const post=await reviewIdentity(db,scheduleId),node=post.custom.find(n=>n.id===input.nodeId);
 if(post.operationType==='promotion_then_continuous'&&configuration?.finalReviewOn)throw new WorkflowError('自动复盘节点请通过最终复盘日期调整。',422);

 if(post.id!==scheduleId||!post.reviewActive||!node||node.scheduleId!==post.id||node.cancelledAt)throw new WorkflowError('该节点不属于当前可编辑的非推广复盘。');
 if(node.revision!==input.expectedRevision)throw new StaleWriteError('节点已更新，请刷新核对。');
 const saved=await db.select({id:s.operationsContentPerformanceMetric.id}).from(s.operationsContentPerformanceMetric).where(eq(s.operationsContentPerformanceMetric.customCheckpointId,node.id));
 if(saved.length)throw new WorkflowError('已有复盘数据，截止日只读保留；请使用指标更正。');
 if(!input.reason.trim())throw new WorkflowError('请填写调整或取消原因。',422);
 if(input.action==='reschedule'&&(!input.dueOn||!validReviewDate(input.dueOn)||input.dueOn<(post.activatedOn??shanghaiDateKey(post.actualPublishAt))))throw new WorkflowError('请选择有效截止日。',422);
 if(input.action==='reschedule'&&post.nodes.some(n=>n.nodeId!==node.id&&n.dueOn===input.dueOn))throw new WorkflowError('该日已有复盘节点。',422);
 await db.update(s.operationsNonPromotionCustomCheckpoint).set({dueOn:input.dueOn??node.dueOn,cancelledAt:input.action==='cancel'?new Date():null,revision:node.revision+1,history:[...node.history,stamp(actor,{dueOn:node.dueOn},{action:input.action,dueOn:input.dueOn},input.reason)]}).where(eq(s.operationsNonPromotionCustomCheckpoint.id,node.id));
}
