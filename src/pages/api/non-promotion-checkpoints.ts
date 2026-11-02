import {lockPromotionWorkflow} from '../../db/promotion-pauses';
import {readReviewPlanning} from '../../db/non-promotion-plan';
import type { APIRoute } from 'astro';
import { getDb } from '../../db/client';
import { changeCheckpointState, checkpointActionSchema } from '../../db/non-promotion-workflow';
import { workflowErrorResponse, workflowForm } from '../../db/workflow-api';
import {z} from 'zod';
import {addCustomNode,mutateCustomNode,reviewIdentity,anchorReviewPosts} from '../../db/non-promotion-plan';
import {WorkflowError} from '../../db/schedule-workflow';
import * as s from '../../db/schema';
import {operationsContent} from '../../db/schema';
import {eq} from 'drizzle-orm';
const manageSchema=z.object({action:z.enum(['add','reschedule','cancel']),scheduleId:z.uuid(),nodeId:z.uuid().optional(),dueOn:z.string().optional(),expectedRevision:z.coerce.number().int().min(0).optional(),reason:z.string().max(500).default('')});
export const prerender = false;
export const GET:APIRoute=async({url})=>{
 try{
  const id=z.uuid().parse(url.searchParams.get('scheduleId')),db=getDb();
  const [target]=await db.select({contentRole:s.operationsContent.contentRole,operationType:s.operationsContent.operationType,contentId:s.operationsContentVersion.contentId,actualPublishAt:s.operationsContentSchedule.actualPublishAt,isPromoted:s.operationsContentSchedule.isPromoted}).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentSchedule.contentVersionId,s.operationsContentVersion.id)).innerJoin(s.operationsContent,eq(s.operationsContentVersion.contentId,s.operationsContent.id)).where(eq(s.operationsContentSchedule.id,id));
  if(!target)return Response.json({message:'没有找到帖子。'},{status:404});
  const [plan]=await db.select().from(s.operationsNonPromotionReviewPlan).where(eq(s.operationsNonPromotionReviewPlan.contentId,target.contentId));
  const custom=await db.select().from(s.operationsNonPromotionCustomCheckpoint).where(eq(s.operationsNonPromotionCustomCheckpoint.contentId,target.contentId));
  const published=await db.select({actualPublishAt:s.operationsContentSchedule.actualPublishAt,id:s.operationsContentSchedule.id,contentId:s.operationsContentVersion.contentId,operationType:s.operationsContent.operationType,versionNumber:s.operationsContentVersion.versionNumber,isPromoted:s.operationsContentSchedule.isPromoted}).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentSchedule.contentVersionId,s.operationsContentVersion.id)).innerJoin(s.operationsContent,eq(s.operationsContentVersion.contentId,s.operationsContent.id)).where(eq(s.operationsContentVersion.contentId,target.contentId));
  const first=anchorReviewPosts(published,plan?[plan]:[],(await readReviewPlanning(db)).context)[0];
  const otherCycle=target.operationType==='promotion_then_continuous'&&id!==first?.id,pendingCycle=otherCycle&&!!target.actualPublishAt&&target.actualPublishAt.getTime()>Date.now(),historicalCycle=otherCycle&&!pendingCycle&&!!target.actualPublishAt;
  const owner=otherCycle?id:first?.id??id,displayPost=otherCycle?published.find(p=>p.id===id):first;
  const previewConversion=first?.isPromoted&&!target.isPromoted;
  const defaults=previewConversion?{mode:'continuous',day7:false,day15:false}:first?.enabledPlan??plan??{mode:'standard',day7:true,day15:true};
  const metrics=await db.select({customId:s.operationsContentPerformanceMetric.customCheckpointId,statisticsFrom:s.operationsContentPerformanceMetric.statisticsFrom}).from(s.operationsContentPerformanceMetric).where(eq(s.operationsContentPerformanceMetric.scheduleId,owner));
  return Response.json({contentRole:target.contentRole,statisticsFrom:otherCycle?metrics.find(m=>m.statisticsFrom)?.statisticsFrom??null:first?.statisticsFrom??null,operationType:target.operationType,historicalCycle,pendingCycle,reviewActive:!otherCycle&&(first?.reviewActive??false),activatedOn:otherCycle?null:first?.activatedOn??null,plan:plan??null,defaults,anchorScheduleId:owner,publishedOn:displayPost?.actualPublishAt?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(displayPost.actualPublishAt):null,isPromoted:displayPost?.isPromoted??target.isPromoted,nodes:custom.filter(n=>target.operationType!=='promotion_then_continuous'||n.scheduleId===owner).map(n=>({...n,completed:metrics.some(m=>m.customId===n.id)}))},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return workflowErrorResponse(error);}
};
export const POST: APIRoute = async ({ request, url, locals }) => {
  try {
    const form=await request.clone().formData();
    if(['add','reschedule','cancel'].includes(String(form.get('action')))){
      const input=await workflowForm(request,url,manageSchema);if(input.error)return input.error;
      const data=input.data!;
      if(data.action!=='add'&&(!data.nodeId||data.expectedRevision==null))return Response.json({message:'请刷新后核对节点。'},{status:422});
      await getDb().transaction(async tx=>{await lockPromotionWorkflow(tx);const post=await reviewIdentity(tx,data.scheduleId);if(post.id!==data.scheduleId)throw new WorkflowError('请使用原帖复盘计划管理节点。');await tx.select({id:operationsContent.id}).from(operationsContent).where(eq(operationsContent.id,post.contentId)).for('update');if(data.action==='add')await addCustomNode(tx,post.id,data.dueOn??'',locals.user!.username);else await mutateCustomNode(tx,post.id,{action:data.action,nodeId:data.nodeId!,dueOn:data.dueOn,expectedRevision:data.expectedRevision!,reason:data.reason},locals.user!.username);});
      return Response.json({ok:true});
    }
    const input = await workflowForm(request, url, checkpointActionSchema);
    if (input.error) return input.error;
    await changeCheckpointState(getDb(), input.data!, locals.user!);
    return Response.json({ ok: true });
  } catch (error) { return workflowErrorResponse(error); }
};
