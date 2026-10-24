import type { APIRoute } from 'astro';
export const prerender = false;
export const POST: APIRoute = async ({request,url}) => {
  if(request.headers.get('origin')!==url.origin)return Response.json({message:'拒绝跨站写入。'},{status:403});
  return Response.json({message:'发布登记已更新，请刷新页面后直接填写发布时间与帖子链接。'},{status:410});
};
