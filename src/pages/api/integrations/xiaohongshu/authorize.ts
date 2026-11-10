import type { APIRoute } from 'astro';
import { beginJuguangAuthorization, juguangErrorResponse } from '../../../../integrations/xiaohongshu-juguang';

export const POST: APIRoute = async ({ url, locals }) => {
  try {
    const location = await beginJuguangAuthorization(locals.user!.id, locals.session!.id, url.origin);
    return new Response(null, { status: 303, headers: { Location: location, 'Referrer-Policy': 'no-referrer' } });
  } catch (error) { return juguangErrorResponse(error); }
};
