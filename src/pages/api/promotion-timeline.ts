import {unsafeSubmissionMessage,staleRecordMessage} from '../../db/business-messages';
import {validationMessage} from '../../db/validation-messages';
import type { APIRoute } from 'astro';
import { getDb } from '../../db/client';
import { changePromotionTimeline, readPromotionTimeline, timelineSchema } from '../../db/promotion-timeline';
import { workflowErrorResponse } from '../../db/workflow-api';
export const prerender=false;
export const GET:APIRoute=async({url})=>{
  try{return Response.json(await readPromotionTimeline(getDb(),new Date(),url.searchParams.get('schedule')??undefined),{headers:{'Cache-Control':'no-store'}});}catch(error){return workflowErrorResponse(error);}
};
export const POST:APIRoute=async({request,url,locals})=>{
  if(request.headers.get('origin')!==url.origin)return Response.json({message:unsafeSubmissionMessage},{status:403});
  try{const parsed=timelineSchema.safeParse(await request.json());if(!parsed.success)return Response.json({message:validationMessage(parsed.error.issues[0])},{status:422});if(!parsed.data.fingerprint)return Response.json({code:'STALE_WRITE',message:staleRecordMessage("这篇帖子的推广状态")},{status:409});const result=await changePromotionTimeline(getDb(),parsed.data,locals.user!);return Response.json('contextRequired' in result?result:'confirmationRequired' in result?{...result,message:result.impact.message}:result,{status:'contextRequired' in result||'confirmationRequired' in result?409:200});}catch(error){return workflowErrorResponse(error);}
};
