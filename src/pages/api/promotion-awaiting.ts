import type { APIRoute } from 'astro';
import { getDb } from '../../db/client';
import { changePromotionTimeline, timelineSchema } from '../../db/promotion-timeline';
import { workflowErrorResponse } from '../../db/workflow-api';
export const prerender=false;
export const POST:APIRoute=async({request,url,locals})=>{
 if(request.headers.get('origin')!==url.origin)return Response.json({message:'拒绝跨站写入。'},{status:403});
 try{
  const form=await request.formData();const values=Object.fromEntries(form);
  const input=timelineSchema.safeParse({...values,action:values.action==='defer'?'wait':values.action,waitingThrough:values.waitingThrough||undefined});
  if(!input.success)return Response.json({message:'待推广操作无效。'},{status:422});
  const result=await changePromotionTimeline(getDb(),input.data,locals.user!);
  return Response.json({...result,status:values.action==='defer'?'deferred':'started'},{status:201});
 }catch(error){return workflowErrorResponse(error);}
};
