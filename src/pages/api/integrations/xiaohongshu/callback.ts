import type { APIRoute } from 'astro';
import { completeJuguangAuthorization, JUGUANG_CALLBACK_PATH } from '../../../../integrations/xiaohongshu-juguang';

const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };

export const GET: APIRoute = async ({ url, locals }) => {
  if (!url.search) return Response.json({
    status: 'ready', service: 'xiaohongshu_juguang',
    callbackPath: JUGUANG_CALLBACK_PATH,
    message: '聚光授权回调地址已就绪。账号授权请由湫云管理员发起。',
  }, { headers });
  try {
    if (!locals.user || !locals.session) return Response.json({ code: 'UNAUTHORIZED', message: '请登录湫云后重新发起授权。' }, { status: 401, headers });
    await completeJuguangAuthorization(url.searchParams, locals.user.id, locals.session.id);
    // 移除授权码，后续浏览与返回操作不会再次提交或泄露回调参数。
    return new Response(null, { status: 303, headers: { ...headers, Location: '/business/settings?view=integrations&juguang=authorized' } });
  } catch (error) {
    return new Response(null, { status: 303, headers: { ...headers, Location: '/business/settings?view=integrations&juguang=retry' } });
  }
};
