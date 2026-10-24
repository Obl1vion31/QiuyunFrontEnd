import type {APIRoute} from 'astro';
import {z} from 'zod';
import {decideProposal} from '../../../db/business-approvals';
export const prerender=false;
export const PATCH:APIRoute=async({params,request,url,locals})=>{
  if(request.headers.get('origin')!==url.origin)return Response.json({message:'拒绝跨站写入。'},{status:403});
  const input=z.object({action:z.enum(['approve','reject']),reason:z.string().trim().max(500).default('')}).safeParse(await request.json().catch(()=>null));
  if(!input.success)return Response.json({message:'审核参数无效。'},{status:422});
  return decideProposal(params.id!,input.data.action==='approve',input.data.reason,locals.user!,url.origin);
};
