import type { APIRoute } from 'astro';
import { timingSafeEqual } from 'node:crypto';
import { renewJuguangConnections } from '../../../integrations/juguang-renewal';
import { JuguangError } from '../../../integrations/xiaohongshu-juguang';
export const prerender = false;
const headers = {'Cache-Control':'private, no-store'};
export const GET: APIRoute = async ({request}) => {
  const secret = process.env.CRON_SECRET;
  const received = Buffer.from(request.headers.get('Authorization') ?? '');
  const expected = Buffer.from('Bearer '+(secret ?? ''));
  if (!secret || secret.length < 32 || received.length !== expected.length || !timingSafeEqual(received,expected)) return Response.json({code:'UNAUTHORIZED'},{status:401,headers});
  try {
    const result = await renewJuguangConnections();
    console.info('juguang-renewal',JSON.stringify(result));
    return Response.json(result,{status:result.errors ? 503 : 200,headers});
  } catch (error) {
    // 不输出上游返回、请求头或凭据；日志仅保留白名单代码。
    const code = error instanceof JuguangError ? error.code : 'JUGUANG_RENEWAL_FAILED';
    console.error('juguang-renewal',code);
    return Response.json({code},{status:error instanceof JuguangError ? error.status : 503,headers});
  }
};
export const ALL: APIRoute = () => new Response(null,{status:405,headers:{...headers,Allow:'GET'}});

export const HEAD = ALL;
