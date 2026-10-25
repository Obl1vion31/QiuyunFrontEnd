import type {APIRoute} from 'astro';
import {z} from 'zod';
import {getDb} from '../../db/client';
import {appendTaxonomy} from '../../db/taxonomy-store';
import {workflowErrorResponse} from '../../db/workflow-api';
export const prerender=false;
const schema=z.object({kind:z.enum(['subject','category']),name:z.string().trim().min(1,'请填写名称').max(80),subjectId:z.string().optional()});
export const POST:APIRoute=async({request,url})=>{
 if(request.headers.get('origin')!==url.origin)return new Response('拒绝跨站写入。',{status:403});
 let data;try{data=await request.json()}catch{return Response.json({message:'请求格式无效'},{status:400})}
 const parsed=schema.safeParse(data);if(!parsed.success)return Response.json({message:parsed.error.issues[0].message},{status:422});
 try{const result=await appendTaxonomy(getDb(),parsed.data);return Response.json(result,{status:result.created?201:200});}catch(e){return workflowErrorResponse(e)}
};
