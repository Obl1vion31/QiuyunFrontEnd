import {and,eq,inArray,asc} from 'drizzle-orm';
import type {Database} from './client';
import {anchorReviewPosts} from './non-promotion-plan';
import type {readPromotionContext} from './promotion-pauses';
import {shanghaiDateKey} from './promotion-rules.mjs';
import * as s from './schema';

type Context=Awaited<ReturnType<typeof readPromotionContext>>;
type Identity={id:string;activatedOn:string|null;reviewActive:boolean;actualPublishAt:Date;finalReviewOn:string|null};
type Node=Pick<typeof s.operationsNonPromotionCustomCheckpoint.$inferSelect,'id'|'scheduleId'|'dueOn'|'cancelledAt'>;
type Metric=Pick<typeof s.operationsContentPerformanceMetric.$inferSelect,'id'|'scheduleId'|'checkpointType'|'recordedThrough'|'statisticsFrom'>;
type Review=Pick<typeof s.operationsNonPromotionReview.$inferSelect,'scheduleId'|'checkpointType'|'metricId'>;
type Event=Pick<typeof s.operationsNonPromotionCheckpointEvent.$inferSelect,'scheduleId'|'checkpointType'|'action'>;
export function promotionContinuations(posts:Identity[],nodes:Node[],metrics:Metric[],reviews:Review[],events:Event[],today:string){
 const lastEvents=new Map(events.map(e=>[`${e.scheduleId}:${e.checkpointType}`,e.action]));
 return new Map(posts.filter(p=>p.reviewActive&&p.activatedOn).map(post=>{
  const start=post.activatedOn!;
  const checkpoints=nodes.filter(n=>n.scheduleId===post.id&&!n.cancelledAt&&n.dueOn>=start).sort((a,b)=>a.dueOn.localeCompare(b.dueOn)).map((node,index)=>{
   const type='custom:'+node.id,metric=metrics.find(m=>m.scheduleId===post.id&&m.checkpointType===type),review=reviews.find(r=>r.scheduleId===post.id&&r.checkpointType===type&&r.metricId===metric?.id);
   const recorded=!!review&&!!metric,historical=recorded&&(metric.statisticsFrom!==start||metric.recordedThrough!==node.dueOn);
   const skipped=!recorded&&lastEvents.get(`${post.id}:${type}`)==='skip';
   const state=historical?'historical':recorded?'recorded':skipped?'skipped':node.dueOn<today?'due':'upcoming';
   const label={historical:'历史口径',recorded:'已复盘',skipped:'已跳过',due:'待复盘',upcoming:'未到期'}[state];
   const href='/business/non-promotion-review?'+new URLSearchParams({mode:'continuous',view:recorded?'history':skipped?'skipped':'pending',row:`${post.id}:${type}`});
   return {id:node.id,index:index+1,dueOn:node.dueOn,state,label,href};
  });
  const next=checkpoints.find(n=>n.state==='due'||n.state==='upcoming');
  const completed=checkpoints.length>0&&!next;
  return [post.id,{start,checkpoints,completed,next,finalReviewOn:post.finalReviewOn,href:next?.href??checkpoints.at(-1)?.href??'/business/non-promotion-review?mode=continuous',label:completed?'持续复盘已完成':'持续复盘',detail:next?`${next.state==='due'?'待复盘':'下次截止'} ${next.dueOn}`:completed?`共 ${checkpoints.length} 次已处理`:'待安排复盘日期'}] as const;
 }));
}
export type PromotionContinuation=ReturnType<typeof promotionContinuations> extends Map<string,infer T>?T:never;

/** 仅补读当前持续复盘版本的节点摘要，不读取完整复盘／例会快照，不创建任务。 */
export async function readPromotionContinuations(db:Database,contentIds:string[],context:Context,now=new Date()){
 if(!contentIds.length)return new Map<string,PromotionContinuation>();
 const versions=await db.select({id:s.operationsContentSchedule.id,contentId:s.operationsContentVersion.contentId,versionNumber:s.operationsContentVersion.versionNumber,actualPublishAt:s.operationsContentSchedule.actualPublishAt,isPromoted:s.operationsContentSchedule.isPromoted,operationType:s.operationsContent.operationType,finalReviewOn:s.operationsContentSchedule.finalReviewOn}).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentSchedule.contentVersionId,s.operationsContentVersion.id)).innerJoin(s.operationsContent,eq(s.operationsContentVersion.contentId,s.operationsContent.id)).where(and(inArray(s.operationsContent.id,[...new Set(contentIds)]),eq(s.operationsContent.operationType,'promotion_then_continuous')));
 const today=shanghaiDateKey(now),posts=anchorReviewPosts(versions,[],context,today,now).filter(p=>p.reviewActive),ids=posts.map(p=>p.id);
 if(!ids.length)return new Map<string,PromotionContinuation>();
 const [nodes,metrics,reviews,events]=await Promise.all([
  db.select({id:s.operationsNonPromotionCustomCheckpoint.id,scheduleId:s.operationsNonPromotionCustomCheckpoint.scheduleId,dueOn:s.operationsNonPromotionCustomCheckpoint.dueOn,cancelledAt:s.operationsNonPromotionCustomCheckpoint.cancelledAt}).from(s.operationsNonPromotionCustomCheckpoint).where(inArray(s.operationsNonPromotionCustomCheckpoint.scheduleId,ids)),
  db.select({id:s.operationsContentPerformanceMetric.id,scheduleId:s.operationsContentPerformanceMetric.scheduleId,checkpointType:s.operationsContentPerformanceMetric.checkpointType,recordedThrough:s.operationsContentPerformanceMetric.recordedThrough,statisticsFrom:s.operationsContentPerformanceMetric.statisticsFrom}).from(s.operationsContentPerformanceMetric).where(inArray(s.operationsContentPerformanceMetric.scheduleId,ids)),
  db.select({scheduleId:s.operationsNonPromotionReview.scheduleId,checkpointType:s.operationsNonPromotionReview.checkpointType,metricId:s.operationsNonPromotionReview.metricId}).from(s.operationsNonPromotionReview).where(inArray(s.operationsNonPromotionReview.scheduleId,ids)),
  db.select({scheduleId:s.operationsNonPromotionCheckpointEvent.scheduleId,checkpointType:s.operationsNonPromotionCheckpointEvent.checkpointType,action:s.operationsNonPromotionCheckpointEvent.action}).from(s.operationsNonPromotionCheckpointEvent).where(inArray(s.operationsNonPromotionCheckpointEvent.scheduleId,ids)).orderBy(asc(s.operationsNonPromotionCheckpointEvent.sequence)),
 ]);
 return promotionContinuations(posts,nodes,metrics,reviews,events,today);
}
