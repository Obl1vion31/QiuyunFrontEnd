import type {APIRoute} from 'astro';
export const prerender=false;
export const POST:APIRoute=async({request,url})=>request.headers.get('origin')!==url.origin?new Response('拒绝跨站写入。',{status:403}):Response.json({message:'分类规则设置已停用。'},{status:410});
