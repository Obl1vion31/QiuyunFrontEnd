import { timingSafeEqual } from 'node:crypto';
import { defineMiddleware } from 'astro:middleware';

const protectedPaths = ['/business/operations-schedule', '/api/operations-content'];

function sameValue(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const onRequest = defineMiddleware(async ({ request, url }, next) => {
  if (!protectedPaths.some((path) => url.pathname === path || url.pathname.startsWith(`${path}/`))) return next();

  const expectedUser = import.meta.env.OPERATIONS_ADMIN_USER || process.env.OPERATIONS_ADMIN_USER;
  const expectedPassword = import.meta.env.OPERATIONS_ADMIN_PASSWORD || process.env.OPERATIONS_ADMIN_PASSWORD;
  const header = request.headers.get('authorization');
  let user = '';
  let password = '';

  if (header?.startsWith('Basic ')) {
    try {
      [user, password] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(/:(.*)/s, 2);
    } catch { /* 无效凭据按未认证处理。 */ }
  }

  if (!expectedUser || !expectedPassword || !sameValue(user, expectedUser) || !sameValue(password, expectedPassword)) {
    return new Response('需要排期台账访问凭据。', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Operations Schedule", charset="UTF-8"' },
    });
  }
  return next();
});
