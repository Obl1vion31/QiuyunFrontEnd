/** 业务页面与接口统一使用数据库会话；保留服务端性能观测。 */
import { defineMiddleware } from 'astro:middleware';
import { getAuth } from './auth/auth';
import { deniedResponse, requiresAdmin } from './auth/permissions';

export const onRequest = defineMiddleware(async ({ request, url, locals }, next) => {
  const protectedPath = url.pathname === '/business' || url.pathname.startsWith('/business/')
    || (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/auth/'));
  if (!protectedPath && url.pathname !== '/login') return next();
  const startedAt = performance.now();
  let sessionResult;
  try {
    sessionResult = await getAuth().api.getSession({ headers: request.headers, returnHeaders: true });
  } catch {
    return Response.json({ message: '账号服务暂时不可用，请稍后重试。' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const identity = sessionResult.response;
  const user = identity?.user;
  locals.user = user?.username && (user.role === 'admin' || user.role === 'employee')
    ? { id: user.id, username: user.username, role: user.role } : null;
  locals.session = locals.user ? identity?.session ?? null : null;
  locals.operationsUser = locals.user?.username;
  if (protectedPath && !locals.user) {
    const headers = { 'Cache-Control': 'private, no-store' };
    if (url.pathname.startsWith('/api/')) return Response.json({ code: 'UNAUTHORIZED', message: '登录已过期，请在新标签页重新登录后重试。' }, { status: 401, headers });
    return new Response(null, { status: 302, headers: { ...headers, Location: `/login?next=${encodeURIComponent(url.pathname + url.search)}` } });
  }
  if (protectedPath && locals.user?.role !== 'admin' && requiresAdmin(url.pathname, request.method)) {
    const response = url.pathname.startsWith('/api/') ? deniedResponse() : new Response(
      '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>权限不足 · 内容工作台</title><style>body{margin:0;display:grid;place-items:center;min-height:100svh;background:#e9eff2;color:#17211c;font:16px/1.6 system-ui,sans-serif}main{max-width:420px;margin:24px;padding:32px;border-top:3px solid #5b8cff;background:#f5f7f4}h1{margin:0;font-size:26px}p{color:#68736d}a{color:#315fd6}</style></head><body><main><h1>需要管理员权限</h1><p>当前账号可以处理日常业务。此页面仅供管理员使用，如需修改，请联系管理员。</p><a href="/business/operations-schedule">返回工作台 →</a></main></body></html>',
      { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
    response.headers.set('Cache-Control', 'private, no-store'); return response;
  }
  const response = await next();
  for (const cookie of sessionResult.headers.getSetCookie()) response.headers.append('Set-Cookie', cookie);
  response.headers.set('Cache-Control', 'private, no-store');
  const totalDuration = performance.now() - startedAt;
  const existingTiming = response.headers.get('Server-Timing') ?? '';
  const databaseDuration = Number(existingTiming.match(/(?:^|,)\s*db;dur=([\d.]+)/)?.[1] ?? 0);
  response.headers.set('Server-Timing', [existingTiming, `render;dur=${Math.max(0, totalDuration - databaseDuration).toFixed(1)}`, `total;dur=${totalDuration.toFixed(1)}`].filter(Boolean).join(', '));
  return response;
});
