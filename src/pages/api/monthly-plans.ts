import type {APIRoute} from 'astro';
import {getDb} from '../../db/client';
import {readMonthlyCalendar,monthlyLinkCandidates} from '../../db/monthly-plan-links';
import {monthSchema} from '../../db/monthly-private';
import {eq,desc} from 'drizzle-orm';
import {operationsMonthlyPlanAssignment,operationsMonthlyPlan} from '../../db/schema';
import {workflowErrorResponse} from '../../db/workflow-api';
export const prerender=false;
export const GET:APIRoute=async({url})=>{
 try{return await getDb().transaction(async db=>{
  const id=url.searchParams.get('id'),schedule=url.searchParams.get('schedule');
  let month:string|undefined;
  if(id){
   if(!/^[0-9a-f-]{36}$/i.test(id))return Response.json({message:'计划编号无效。'},{status:422});
   const[row]=await db.select({month:operationsMonthlyPlan.month}).from(operationsMonthlyPlan).where(eq(operationsMonthlyPlan.id,id));month=row?.month;
  }else if(schedule){
   if(!/^[0-9a-f-]{36}$/i.test(schedule))return Response.json({message:'排期编号无效。'},{status:422});
   const[row]=await db.select({month:operationsMonthlyPlan.month}).from(operationsMonthlyPlanAssignment).innerJoin(operationsMonthlyPlan,eq(operationsMonthlyPlan.id,operationsMonthlyPlanAssignment.planId)).where(eq(operationsMonthlyPlanAssignment.scheduleId,schedule)).orderBy(desc(operationsMonthlyPlan.month));month=row?.month;
  }else{const parsed=monthSchema.safeParse(url.searchParams.get('month'));if(!parsed.success)return Response.json({message:'请选择有效月份。'},{status:422});month=parsed.data;}
  const plan=month?await readMonthlyCalendar(db,month):null;
  if(plan&&url.searchParams.get('choices')==='1'){
   const group=url.searchParams.get('group')??'',week=Number(url.searchParams.get('week'));
   if(!group||!Number.isInteger(week)||week<1||week>5)return Response.json({message:'请选择有效计划。'},{status:422});
   // 同一只读事务固定名额与候选凭据，不能用保存前读取替换旧输入的版本。
   return Response.json({plan,candidates:await monthlyLinkCandidates(db,plan.id,group,week)});
  }
  return Response.json({plan});
 },{isolationLevel:'repeatable read',accessMode:'read only'});}catch(error){return workflowErrorResponse(error);}
};
