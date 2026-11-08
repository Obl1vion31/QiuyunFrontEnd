import {inArray} from 'drizzle-orm';
import type {Database} from './client';
import * as s from './schema';
import {shanghaiDateKey} from './promotion-rules.mjs';
import {scheduleReasonRequired} from './schedule-plan-policy';
import {ScheduleReasonError} from './schedule-workflow';

export async function requireSchedulePlanReason(db:Database,schedule:{id:string;plannedPublishAt:Date},next:Date,reason:string){
 const message=await schedulePlanReason(db,schedule,next);
 if(message&&!reason.trim())throw new ScheduleReasonError(message);
}
export async function schedulePlanReason(db:Database,schedule:{id:string;plannedPublishAt:Date},next:Date){
 return (await schedulePlanReasons(db,[{schedule,next}])).get(schedule.id)??null;
}
/** 一个目标日只读取一次计划来源，避免每个候选重复传输计划JSON。 */
export async function schedulePlanReasons(db:Database,moves:Array<{schedule:{id:string;plannedPublishAt:Date};next:Date}>){
 const months=[...new Set(moves.flatMap(({schedule,next})=>[shanghaiDateKey(schedule.plannedPublishAt).slice(0,7),shanghaiDateKey(next).slice(0,7)]))];
 if(!moves.length)return new Map<string,string|null>();
 const [plans,links]=await Promise.all([
  db.select({id:s.operationsMonthlyPlan.id,month:s.operationsMonthlyPlan.month,arrangementStatus:s.operationsMonthlyPlan.arrangementStatus,content:s.operationsMonthlyPlan.content,additions:s.operationsMonthlyPlan.additions}).from(s.operationsMonthlyPlan).where(inArray(s.operationsMonthlyPlan.month,months)),
  db.select({scheduleId:s.operationsMonthlyPlanAssignment.scheduleId,itemId:s.operationsMonthlyPlanAssignment.itemId,planId:s.operationsMonthlyPlanAssignment.planId}).from(s.operationsMonthlyPlanAssignment).where(inArray(s.operationsMonthlyPlanAssignment.scheduleId,moves.map(m=>m.schedule.id))),
 ]);
 return new Map(moves.map(({schedule,next})=>{
  const oldMonth=shanghaiDateKey(schedule.plannedPublishAt).slice(0,7),day=shanghaiDateKey(next);
  const relevant=plans.filter(p=>p.month===oldMonth||p.month===day.slice(0,7)),link=links.find(l=>l.scheduleId===schedule.id&&plans.some(p=>p.id===l.planId&&p.month===oldMonth)),plan=link&&plans.find(p=>p.id===link.planId);
  const item=plan&&[...plan.content.items,...plan.additions.flatMap(b=>b.content.items)].find(i=>i.id===link!.itemId);
  return [schedule.id,scheduleReasonRequired(relevant.some(p=>p.arrangementStatus==='confirmed'),plan?.month??null,item?.week??null,day)];
 }));
}
