import type { APIRoute } from 'astro';
import { z } from 'zod';
import { checkJuguangConnection } from '../../../../integrations/juguang-check';
import { juguangErrorResponse } from '../../../../integrations/xiaohongshu-juguang';
const input = z.object({authorizationUserId:z.string().min(1).max(200)}).strict();
export const POST: APIRoute = async ({request,url}) => {
  if(request.headers.get('origin')!==url.origin)return Response.json({code:'INVALID_ORIGIN',message:'请从本站发起连接检查。'},{status:403});
  const parsed = input.safeParse(await request.json().catch(()=>null));
  if (!parsed.success) return Response.json({code:'INVALID_INPUT',message:'请选择有效的授权连接。'},{status:400});
  try { return Response.json({check:await checkJuguangConnection(parsed.data.authorizationUserId)}); }
  catch (error) { return juguangErrorResponse(error); }
};
