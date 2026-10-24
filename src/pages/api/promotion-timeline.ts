import type { APIRoute } from 'astro';
import { getDb } from '../../db/client';
import { changePromotionTimeline, readPromotionTimeline, timelineSchema } from '../../db/promotion-timeline';
import { workflowErrorResponse } from '../../db/workflow-api';
export const prerender=false;
export const GET:APIRoute=async({url})=>{
  try{return Response.json(await readPromotionTimeline(getDb(),new Date(),url.searchParams.get('schedule')??undefined),{headers:{'Cache-Control':'no-store'}});}catch(error){return workflowErrorResponse(error);}
};
export const POST:APIRoute=async({request,url,locals})=>{
  if(request.headers.get('origin')!==url.origin)return Response.json({message:'拒绝跨站写入。'},{status:403});
  try{const parsed=timelineSchema.safeParse(await request.json());if(!parsed.success)return Response.json({message:parsed.error.issues[0].message},{status:422});if(!parsed.data.fingerprint)return Response.json({message:'请刷新后核对推广状态。'},{status:422});const result=await changePromotionTimeline(getDb(),parsed.data,locals.user!);return Response.json('confirmationRequired' in result?{...result,message:`${result.impact.dates.join('、')} 的 ${result.impact.dailyMetrics} 条指标与新状态冲突，确认后将归档原事实并开放补录。`}:result,{status:'confirmationRequired' in result?409:200});}catch(error){return workflowErrorResponse(error);}
};
