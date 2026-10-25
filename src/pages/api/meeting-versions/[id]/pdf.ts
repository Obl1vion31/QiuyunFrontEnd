import type {APIRoute} from 'astro';
import {z} from 'zod';
import {getDb} from '../../../../db/client';
import {ensureMeetingPdf} from '../../../../db/meeting-pdf';
import {workflowErrorResponse} from '../../../../db/workflow-api';
export const prerender=false;
export const POST:APIRoute=async({params,request,url,locals})=>{
 if(request.headers.get('origin')!==url.origin)return Response.json({message:'拒绝跨站写入。'},{status:403});
 if(!z.uuid().safeParse(params.id).success)return Response.json({message:'版本编号无效。'},{status:422});
 try{const result=await ensureMeetingPdf(getDb(),params.id!,locals.operationsUser||'unknown');return Response.json(result,{status:result.status==='failed'?503:result.status==='pending'?202:200});}catch(error){return workflowErrorResponse(error);}
};
