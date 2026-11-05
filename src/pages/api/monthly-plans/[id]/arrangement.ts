import type {APIRoute} from 'astro';
import {z} from 'zod';
import {getDb} from '../../../../db/client';
import {changeArrangement,readArrangement} from '../../../../db/monthly-arrangement';
import {operationsMonthlyPlan} from '../../../../db/schema';
import {eq} from 'drizzle-orm';
import {workflowErrorResponse} from '../../../../db/workflow-api';
import {requireBusinessOperation} from '../../../../auth/business-permissions';
export const prerender=false;
const schema=z.object({action:z.enum(['submit','confirm','return']),fingerprint:z.string().length(64),requestId:z.uuid(),reason:z.string().trim().min(1).max(2000)});
export const GET:APIRoute=async({params})=>{
 try{const [plan]=await getDb().select({month:operationsMonthlyPlan.month}).from(operationsMonthlyPlan).where(eq(operationsMonthlyPlan.id,params.id!));return plan?Response.json(await readArrangement(getDb(),plan.month)):Response.json({message:'月计划不存在。'},{status:404});}catch(error){return workflowErrorResponse(error);}
};
export const POST:APIRoute=async({params,request,url,locals})=>{
 try{
  if(request.headers.get('origin')!==url.origin)return Response.json({message:'拒绝跨站写入。'},{status:403});
  const input=schema.safeParse(await request.json());if(!params.id||!input.success)return Response.json({message:'请填写核对说明并重新核对排期清单。'},{status:422});
  if(input.data.action==='submit')await requireBusinessOperation(getDb(),locals.user!,'schedule.edit');
  const result=await changeArrangement(getDb(),params.id,input.data,locals.user!);
  if(input.data.action==='confirm'){const [plan]=await getDb().select({versionId:operationsMonthlyPlan.sealedVersionId}).from(operationsMonthlyPlan).where(eq(operationsMonthlyPlan.id,params.id));if(plan?.versionId)try{await (await import('../../../../db/meeting-pdf')).ensureMeetingPdf(getDb(),plan.versionId,locals.user!.username);}catch{/* PDF失败保留封存结果，沿原归档入口重试。 */}}
  return Response.json(result);
 }catch(error){return workflowErrorResponse(error);}
};
