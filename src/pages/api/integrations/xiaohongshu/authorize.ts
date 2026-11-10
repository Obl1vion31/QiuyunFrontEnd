import type { APIRoute } from 'astro';
import { beginJuguangAuthorization, juguangErrorResponse } from '../../../../integrations/xiaohongshu-juguang';

const authorize: APIRoute = async ({ url, locals }) => {
  try {
    const location = await beginJuguangAuthorization(locals.user!.id, locals.session!.id, url.origin);
    return new Response(null, { status: 303, headers: { Location: location, 'Referrer-Policy': 'no-referrer' } });
  } catch (error) { return juguangErrorResponse(error); }
};

export const POST = authorize;

export const GET: APIRoute = context => {
  const origin = context.request.headers.get('origin');
  if (context.request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== context.url.origin)) {
    return Response.json({ code: 'JUGUANG_CROSS_SITE', message: '请从湫云打开聚光授权。' }, { status: 403 });
  }
  return authorize(context);
};

export const HEAD: APIRoute = () => new Response(null, { status: 204, headers: { Allow: 'GET, HEAD, POST' } });
