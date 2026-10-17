import type {APIRoute} from 'astro';
import {z} from 'zod';
import {getDb} from '../../../db/client';
import {businessOperations} from '../../../auth/business-capabilities';
import {updateAccountPermissions} from '../../../auth/business-permissions';
import {workflowErrorResponse} from '../../../db/workflow-api';
const modes=z.object(Object.fromEntries(businessOperations.map(([key])=>[key,z.enum(['disabled','direct','review'])]))).strict();
const input=z.object({userId:z.string().min(1),permissions:modes,expected:modes}).strict();
export const prerender=false;
export const PATCH:APIRoute=async({request,url,locals})=>{
  if(request.headers.get('origin')!==url.origin)return Response.json({message:'拒绝跨站写入。'},{status:403});
  try{
    const parsed=input.safeParse(await request.json());if(!parsed.success)return Response.json({message:'请选择完整且有效的账号权限。'},{status:422});
    const saved=await updateAccountPermissions(getDb(),locals.user!,parsed.data.userId,parsed.data.permissions as Parameters<typeof updateAccountPermissions>[3],parsed.data.expected as Parameters<typeof updateAccountPermissions>[4]);
    return saved?Response.json({ok:true}):Response.json({message:'权限已被其他管理员更新，请刷新后重试。'},{status:409});
  }catch(error){return workflowErrorResponse(error);}
};
