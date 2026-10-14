import type { APIRoute } from 'astro';
import { getAuth } from '../../../auth/auth';
export const prerender = false;

export const ALL: APIRoute = async (context) => {
  const endpoint = context.params.all;
  const allowed = (endpoint === 'get-session' && context.request.method === 'GET')
    || (['sign-in/username', 'sign-out'].includes(endpoint ?? '') && context.request.method === 'POST');
  if (!allowed) return Response.json({ message: '没有这个账号操作入口。' }, { status: 404 });
  try {
    const headers = new Headers(context.request.headers);
    // clientAddress 由部署适配器提供，不能接受客户端自行指定的限流身份。
    headers.set('x-forwarded-for', context.clientAddress);
    const response = await getAuth().handler(new Request(context.request, { headers }));
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch {
    return Response.json({ message: '登录服务暂时不可用，请稍后重试。' }, { status: 503 });
  }
};
