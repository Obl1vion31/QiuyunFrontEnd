import type {APIRoute} from 'astro';
import {getDb} from '../../../../db/client';
import {monthlyLinksSchema} from '../../../../db/monthly-link-state';
import {applyMonthlyLinks} from '../../../../db/monthly-plan-links';
import {requireBusinessOperation} from '../../../../auth/business-permissions';
import {workflowErrorResponse} from '../../../../db/workflow-api';
export const prerender=false;
export const POST:APIRoute=async({params,request,url,locals})=>{
 if(request.headers.get('origin')!==url.origin)return Response.json({message:'拒绝跨站写入。'},{status:403});
 if(!params.id||!/^[a-f0-9-]{36}$/i.test(params.id))return Response.json({message:'请选择有效月计划。'},{status:422});
 let body:unknown;try{body=await request.json();}catch{return Response.json({message:'提交格式无效。'},{status:422});}
 const parsed=monthlyLinksSchema.safeParse(body);if(!parsed.success)return Response.json({message:'关联信息不完整，请重新选择计划。'},{status:422});
 try{return await getDb().transaction(async tx=>{await requireBusinessOperation(tx,locals.user!,'schedule.edit');return (await applyMonthlyLinks(tx,params.id!,parsed.data,locals.user!.username))!;});}catch(error){return workflowErrorResponse(error);}
};
