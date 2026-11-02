import type {APIRoute} from 'astro';
import {getDb} from '../../db/client';
import {readMonthlyPlan} from '../../db/monthly-plans';
import {monthSchema} from '../../db/monthly-private';
import {eq,desc} from 'drizzle-orm';
import {operationsMonthlyPlanAssignment,operationsMonthlyPlan} from '../../db/schema';
import {workflowErrorResponse} from '../../db/workflow-api';
export const prerender=false;
export const GET:APIRoute=async({url})=>{try{const id=url.searchParams.get('id');if(id){if(!/^[0-9a-f-]{36}$/i.test(id))return Response.json({message:'计划编号无效。'},{status:422});const[row]=await getDb().select().from(operationsMonthlyPlan).where(eq(operationsMonthlyPlan.id,id));return Response.json({plan:row?await readMonthlyPlan(getDb(),row.month):null});}const schedule=url.searchParams.get('schedule');if(schedule){if(!/^[0-9a-f-]{36}$/i.test(schedule))return Response.json({message:'排期编号无效。'},{status:422});const [row]=await getDb().select({month:operationsMonthlyPlan.month}).from(operationsMonthlyPlanAssignment).innerJoin(operationsMonthlyPlan,eq(operationsMonthlyPlan.id,operationsMonthlyPlanAssignment.planId)).where(eq(operationsMonthlyPlanAssignment.scheduleId,schedule)).orderBy(desc(operationsMonthlyPlan.month));return Response.json({plan:row?await readMonthlyPlan(getDb(),row.month):null});}const month=monthSchema.safeParse(url.searchParams.get('month'));if(!month.success)return Response.json({message:'请选择有效月份。'},{status:422});return Response.json({plan:await readMonthlyPlan(getDb(),month.data)});}catch(error){return workflowErrorResponse(error);}};
