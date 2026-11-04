import {StaleWriteError} from './schedule-workflow';
import {eq} from 'drizzle-orm';
import type {Database} from './client';
import {type Transaction} from './schedule-workflow';
import * as s from './schema';
import {rolesForCategory,type ContentRole} from './content-roles';
/** 原帖职能沿用排期编辑的权限与审批；历史沿用原帖计划事件。 */
export async function saveContentRole(db:Database|Transaction,scheduleId:string,input:{contentRole?:ContentRole|null;expectedContentRole?:ContentRole|null;categoryId:string|null},actor:string){
 const [row]=await db.select({content:s.operationsContent}).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentSchedule.contentVersionId,s.operationsContentVersion.id)).innerJoin(s.operationsContent,eq(s.operationsContentVersion.contentId,s.operationsContent.id)).where(eq(s.operationsContentSchedule.id,scheduleId));
 await db.select({id:s.operationsContent.id}).from(s.operationsContent).where(eq(s.operationsContent.id,row.content.id)).for('update');
 const [content]=await db.select().from(s.operationsContent).where(eq(s.operationsContent.id,row.content.id));
 if(!rolesForCategory(input.categoryId).length)return;
 const next=input.contentRole;
 if(next===undefined||next===content.contentRole)return;
 if(input.expectedContentRole!==undefined&&input.expectedContentRole!==content.contentRole)throw new StaleWriteError('内容职能已更新，请刷新核对；当前输入已保留。');
 await db.update(s.operationsContent).set({contentRole:next,updatedAt:new Date()}).where(eq(s.operationsContent.id,content.id));
 const [plan]=await db.select().from(s.operationsNonPromotionReviewPlan).where(eq(s.operationsNonPromotionReviewPlan.contentId,content.id));
 const event={at:new Date().toISOString(),actor,before:{contentRole:content.contentRole},after:{contentRole:next}};
 if(plan)await db.update(s.operationsNonPromotionReviewPlan).set({revision:plan.revision+1,history:[...plan.history,event],updatedAt:new Date()}).where(eq(s.operationsNonPromotionReviewPlan.contentId,content.id));
 else await db.insert(s.operationsNonPromotionReviewPlan).values({contentId:content.id,anchorScheduleId:scheduleId,mode:'standard',history:[event]});
}
