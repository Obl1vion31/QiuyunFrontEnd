import {syncContinuousCheckpoints,saveFinalReviewDate} from './continuous-schedule';
import {eq,desc} from 'drizzle-orm';
import type {Database} from './client';
import type {Transaction} from './schedule-workflow';
import {WorkflowError} from './schedule-workflow';
import * as s from './schema';
import {isPromotionType,operationMode,type OperationType} from './operation-types';
import {validReviewDate} from './non-promotion-nodes';
import {saveReviewPlan} from './non-promotion-plan';
export async function operationSetupChanged(db:Database|Transaction,contentId:string,input:{operationType?:OperationType;reviewDueOn?:string;reviewDay7?:boolean;reviewDay15?:boolean}){
 if(!input.operationType)return false;
 const [content]=await db.select().from(s.operationsContent).where(eq(s.operationsContent.id,contentId)),[plan]=await db.select().from(s.operationsNonPromotionReviewPlan).where(eq(s.operationsNonPromotionReviewPlan.contentId,contentId));
 if(content.operationType!==input.operationType||!plan)return true;
 const mode=operationMode(input.operationType);if(mode!=='instant')return false;
 const nodes=await db.select().from(s.operationsNonPromotionCustomCheckpoint).where(eq(s.operationsNonPromotionCustomCheckpoint.contentId,contentId));
 return plan.day7!==!!input.reviewDay7||plan.day15!==!!input.reviewDay15||(plan.draftDueOn??nodes.find(n=>!n.cancelledAt)?.dueOn??'')!==(input.reviewDueOn??'');
}
export async function saveOperationSetup(db:Database|Transaction,scheduleId:string,input:{finalReviewOn?:string;operationType?:OperationType;reviewDueOn:string;reviewDay7:boolean;reviewDay15:boolean;expectedReviewRevision:number},actor:string,authorize?:()=>Promise<unknown>){
 if(input.finalReviewOn!==undefined&&await saveFinalReviewDate(db,scheduleId,input.finalReviewOn,input.expectedReviewRevision,actor,authorize,input.operationType))input={...input,expectedReviewRevision:input.expectedReviewRevision+1};
 if(!input.operationType)return;
 if(!await operationSetupChanged(db,(await db.select({contentId:s.operationsContentVersion.contentId}).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentSchedule.contentVersionId,s.operationsContentVersion.id)).where(eq(s.operationsContentSchedule.id,scheduleId)))[0].contentId,input))return;
 if(authorize)await authorize();
 const [row]=await db.select({schedule:s.operationsContentSchedule,content:s.operationsContent}).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentSchedule.contentVersionId,s.operationsContentVersion.id)).innerJoin(s.operationsContent,eq(s.operationsContentVersion.contentId,s.operationsContent.id)).where(eq(s.operationsContentSchedule.id,scheduleId));
 if(!row)throw new WorkflowError('没有找到帖子。',404);
 await db.select({id:s.operationsContent.id}).from(s.operationsContent).where(eq(s.operationsContent.id,row.content.id)).for('update');
 const [plan]=await db.select().from(s.operationsNonPromotionReviewPlan).where(eq(s.operationsNonPromotionReviewPlan.contentId,row.content.id));
 if((plan?.revision??-1)!==input.expectedReviewRevision)throw new WorkflowError('运营类型或复盘配置已更新，请刷新核对。');
 const latest=await db.select({id:s.operationsContentSchedule.id}).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentSchedule.contentVersionId,s.operationsContentVersion.id)).where(eq(s.operationsContentVersion.contentId,row.content.id)).orderBy(desc(s.operationsContentVersion.versionNumber));
 if(row.content.operationType!==input.operationType&&latest[0]?.id!==scheduleId)throw new WorkflowError('请在最新版本的排期详情中调整运营类型。',422);
 if(input.operationType==='promotion_then_continuous'&&row.content.operationType!=='promotion_then_continuous'&&!row.schedule.finalReviewOn)throw new WorkflowError('请选择最终复盘日期。',422);
 const mode=operationMode(input.operationType),dueOn=mode==='instant'?input.reviewDueOn:'';
 if(row.schedule.actualPublishAt&&mode==='instant'&&!dueOn)throw new WorkflowError('请填写即时复盘截止日期。',422);
 if(dueOn&&!validReviewDate(dueOn))throw new WorkflowError('请选择有效截止日期。',422);
 await db.update(s.operationsContent).set({operationType:input.operationType,updatedAt:new Date()}).where(eq(s.operationsContent.id,row.content.id));
 if(row.schedule.actualPublishAt&&!isPromotionType(input.operationType)){
  await saveReviewPlan(db,plan?.anchorScheduleId??scheduleId,{mode,day7:mode==='standard'||input.reviewDay7,day15:mode==='standard'||input.reviewDay15,dueOn,expectedRevision:input.expectedReviewRevision},actor);
  if(row.content.operationType!==input.operationType){const [saved]=await db.select().from(s.operationsNonPromotionReviewPlan).where(eq(s.operationsNonPromotionReviewPlan.contentId,row.content.id));await db.update(s.operationsNonPromotionReviewPlan).set({history:[...saved.history,{at:new Date().toISOString(),actor,before:{operationType:row.content.operationType},after:{operationType:input.operationType}}]}).where(eq(s.operationsNonPromotionReviewPlan.contentId,row.content.id));}return;
 }
 const values={mode,day7:mode==='standard'||mode==='instant'&&input.reviewDay7,day15:mode==='standard'||mode==='instant'&&input.reviewDay15,draftDueOn:dueOn||null};
 const history=[...(plan?.history??[]),{at:new Date().toISOString(),actor,before:{operationType:row.content.operationType},after:{operationType:input.operationType,...values}}];
 if(plan)await db.update(s.operationsNonPromotionReviewPlan).set({...values,revision:plan.revision+1,history,updatedAt:new Date()}).where(eq(s.operationsNonPromotionReviewPlan.contentId,row.content.id));
 else await db.insert(s.operationsNonPromotionReviewPlan).values({contentId:row.content.id,anchorScheduleId:scheduleId,...values,history});
 await syncContinuousCheckpoints(db,scheduleId,actor);
}
