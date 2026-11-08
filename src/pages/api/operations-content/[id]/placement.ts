import type {APIRoute} from 'astro';
import {getDb} from '../../../../db/client';
import {placementSchema,previewPlacement,savePlacement} from '../../../../db/schedule-placement';
import {workflowErrorResponse} from '../../../../db/workflow-api';
export const prerender=false;
export const GET:APIRoute=async({params,url,locals})=>{
 try{return Response.json(await previewPlacement(getDb(),params.id!,url.searchParams.get('date')??'',locals.user!));}
 catch(error){return workflowErrorResponse(error);}
};
export const POST:APIRoute=async({params,request,url,locals})=>{
 if(request.headers.get('origin')!==url.origin)return new Response('拒绝跨站写入。',{status:403});
 const parsed=placementSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return Response.json({message:'请核对目标日期、对换帖子及发送时刻。'},{status:422});
 try{return Response.json(await savePlacement(getDb(),params.id!,parsed.data,locals.user!));}
 catch(error){return workflowErrorResponse(error);}
};
