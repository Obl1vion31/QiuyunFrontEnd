import type {APIRoute} from 'astro';
export const prerender=false;
export const POST:APIRoute=async()=>Response.json({message:'类型维护已移至系统设置的业务配置。'},{status:410});
