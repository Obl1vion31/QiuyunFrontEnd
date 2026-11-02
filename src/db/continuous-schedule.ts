import {eq} from 'drizzle-orm';
import type {Database} from './client';
import {WorkflowError,type Transaction} from './schedule-workflow';
import * as s from './schema';
import {validReviewDate} from './non-promotion-nodes';
import {nextDateKey,shanghaiDateKey} from './promotion-rules.mjs';
import {readPromotionContext} from './promotion-pauses';
import {promotionStateOn} from './promotion-state.mjs';
import type {OperationType} from './operation-types';
type Reader=Database|Transaction;
export function weeklyReviewDates(start:string,final:string){
 if(!validReviewDate(start)||!validReviewDate(final))throw new WorkflowError('请选择有效最终复盘日期。',422);
 if(final<start)return [];
 const dates:string[]=[];let day=start,count=1;
 while(day<=final){if(count%7===0||day===final)dates.push(day);day=nextDateKey(day);count++;}
 return dates;
}
export async function saveFinalReviewDate(db:Reader,scheduleId:string,final:string,expected:number,actor:string,authorize?:()=>Promise<unknown>,type?:OperationType){
 const [row]=await db.select({schedule:s.operationsContentSchedule,content:s.operationsContent}).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentSchedule.contentVersionId,s.operationsContentVersion.id)).innerJoin(s.operationsContent,eq(s.operationsContentVersion.contentId,s.operationsContent.id)).where(eq(s.operationsContentSchedule.id,scheduleId));
 if(!row)throw new WorkflowError('没有找到帖子。',404);
 if((type??row.content.operationType)!=='promotion_then_continuous')return false;
 const [targetVersion]=await db.select().from(s.operationsContentVersion).where(eq(s.operationsContentVersion.id,row.schedule.contentVersionId));
 const siblings=await db.select({version:s.operationsContentVersion.versionNumber,actual:s.operationsContentSchedule.actualPublishAt}).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentSchedule.contentVersionId,s.operationsContentVersion.id)).where(eq(s.operationsContentVersion.contentId,row.content.id));
 if(siblings.some(v=>v.version>targetVersion.versionNumber&&v.actual&&v.actual.getTime()<=Date.now()))throw new WorkflowError('该版本已退出当前持续复盘，请打开当前版本。');
 if(!validReviewDate(final))throw new WorkflowError('请选择有效最终复盘日期。',422);
 if(final===row.schedule.finalReviewOn)return false;
 if(authorize)await authorize();
 await db.select({id:s.operationsContent.id}).from(s.operationsContent).where(eq(s.operationsContent.id,row.content.id)).for('update');
 const [plan]=await db.select().from(s.operationsNonPromotionReviewPlan).where(eq(s.operationsNonPromotionReviewPlan.contentId,row.content.id));
 if((plan?.revision??-1)!==expected)throw new WorkflowError('复盘配置已更新，请刷新核对。');
 const metrics=await db.select().from(s.operationsContentPerformanceMetric).where(eq(s.operationsContentPerformanceMetric.scheduleId,scheduleId));
 if(metrics.some(m=>m.recordedThrough>final))throw new WorkflowError('最终日期不能早于已保存结果的截止日。',422);
 if(!row.schedule.actualPublishAt&&final<shanghaiDateKey(row.schedule.plannedPublishAt))throw new WorkflowError('最终复盘日期不能早于应发日期。',422);
 await db.update(s.operationsContentSchedule).set({finalReviewOn:final,updatedAt:new Date()}).where(eq(s.operationsContentSchedule.id,scheduleId));
 if(plan)await db.update(s.operationsNonPromotionReviewPlan).set({revision:plan.revision+1,updatedAt:new Date(),history:[...plan.history,{at:new Date().toISOString(),actor,before:{finalReviewOn:row.schedule.finalReviewOn},after:{finalReviewOn:final},scheduleId}]}).where(eq(s.operationsNonPromotionReviewPlan.contentId,row.content.id));
 await syncContinuousCheckpoints(db,scheduleId,actor);
 return !!plan;
}
/** 调用方持有推广工作流锁；在业务写入事务内协调，读取不补写节点。 */
export async function syncContinuousCheckpoints(db:Reader,scheduleId:string,actor:string,now=new Date()){
 const [row]=await db.select({schedule:s.operationsContentSchedule,content:s.operationsContent}).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentSchedule.contentVersionId,s.operationsContentVersion.id)).innerJoin(s.operationsContent,eq(s.operationsContentVersion.contentId,s.operationsContent.id)).where(eq(s.operationsContentSchedule.id,scheduleId));
 if(!row||row.content.operationType!=='promotion_then_continuous'||!row.schedule.finalReviewOn)return;
 await db.select({id:s.operationsContent.id}).from(s.operationsContent).where(eq(s.operationsContent.id,row.content.id)).for('update');
 const context=await readPromotionContext(db),campaign=context.campaigns.filter(c=>c.scheduleId===scheduleId).sort((a,b)=>b.startedOn.localeCompare(a.startedOn)||b.createdAt.getTime()-a.createdAt.getTime())[0];
 if(!campaign)return;
 const through=[shanghaiDateKey(now),...context.waitRanges.filter(r=>r.campaignId===campaign.id).flatMap(r=>r.nextEffectiveOn?[r.nextEffectiveOn]:[])].sort().at(-1)!;
 const state=promotionStateOn(campaign,context,through);
 // 撤销结束时沿用原节点，资格读取负责暂缓，重新结束再协调。
 if(state?.currentStatus!=='ended'||!state.endedOn)return;
 const start=nextDateKey(state.endedOn),dates=weeklyReviewDates(start,row.schedule.finalReviewOn);
 const nodes=await db.select().from(s.operationsNonPromotionCustomCheckpoint).where(eq(s.operationsNonPromotionCustomCheckpoint.scheduleId,scheduleId));
 const metrics=await db.select().from(s.operationsContentPerformanceMetric).where(eq(s.operationsContentPerformanceMetric.scheduleId,scheduleId));
 const retired=new Set<string>();
 for(const node of nodes.filter(n=>!n.cancelledAt)){
  const metric=metrics.find(m=>m.customCheckpointId===node.id);
  const replaceScope=!!metric&&metric.statisticsFrom!==start&&dates.includes(node.dueOn);
  if(metric&&!replaceScope)continue;
  if(replaceScope||!dates.includes(node.dueOn)){retired.add(node.id);await db.update(s.operationsNonPromotionCustomCheckpoint).set({cancelledAt:now,revision:node.revision+1,history:[...node.history,{at:now.toISOString(),actor,before:{dueOn:node.dueOn},after:{action:'cancel'},reason:replaceScope?'统计起点更正，原结果只读保留':'按最终日期重新安排'}]}).where(eq(s.operationsNonPromotionCustomCheckpoint.id,node.id));}
 }
 for(const dueOn of dates){
  if(nodes.some(n=>!n.cancelledAt&&!retired.has(n.id)&&n.dueOn===dueOn))continue;
  await db.insert(s.operationsNonPromotionCustomCheckpoint).values({contentId:row.content.id,scheduleId,dueOn,history:[{at:now.toISOString(),actor,after:{dueOn},source:'weekly',statisticsFrom:start}]});
 }
}
