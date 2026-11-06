import {and,eq,inArray} from 'drizzle-orm';
import type {Database} from './client';
import * as s from './schema';
import {shanghaiDateKey} from './promotion-rules.mjs';
import {scheduleReasonRequired} from './schedule-plan-policy';
import {ScheduleReasonError} from './schedule-workflow';

export async function requireSchedulePlanReason(db:Database,schedule:{id:string;plannedPublishAt:Date},next:Date,reason:string){
 const oldMonth=shanghaiDateKey(schedule.plannedPublishAt).slice(0,7),day=shanghaiDateKey(next),months=[...new Set([oldMonth,day.slice(0,7)])];
 const plans=await db.select().from(s.operationsMonthlyPlan).where(inArray(s.operationsMonthlyPlan.month,months));
 const sealed=plans.some(p=>p.arrangementStatus==='confirmed');
 const [link]=await db.select({itemId:s.operationsMonthlyPlanAssignment.itemId,month:s.operationsMonthlyPlan.month,content:s.operationsMonthlyPlan.content,additions:s.operationsMonthlyPlan.additions})
 .from(s.operationsMonthlyPlanAssignment).innerJoin(s.operationsMonthlyPlan,eq(s.operationsMonthlyPlan.id,s.operationsMonthlyPlanAssignment.planId))
 .where(and(eq(s.operationsMonthlyPlanAssignment.scheduleId,schedule.id),eq(s.operationsMonthlyPlan.month,oldMonth)));
 const item=link&&[...link.content.items,...link.additions.flatMap(b=>b.content.items)].find(i=>i.id===link.itemId);
 const message=scheduleReasonRequired(sealed,link?.month??null,item?.week??null,day);
 if(message&&!reason.trim())throw new ScheduleReasonError(message);
}
