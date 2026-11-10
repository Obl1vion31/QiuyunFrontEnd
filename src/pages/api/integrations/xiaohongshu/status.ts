import type { APIRoute } from 'astro';
import { JUGUANG_SCOPES, juguangConnectionStatus, juguangErrorResponse } from '../../../../integrations/xiaohongshu-juguang';

export const GET: APIRoute = async () => {
  try { return Response.json({ service: 'xiaohongshu_juguang', requestedScopes: JUGUANG_SCOPES, ...await juguangConnectionStatus() }); }
  catch (error) { return juguangErrorResponse(error); }
};
