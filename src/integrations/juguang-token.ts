import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client';
import { xiaohongshuJuguangConnection as connection } from '../db/schema';
import { decryptJuguangTokens, encryptJuguangTokens, hasJuguangReportScope, parseJuguangTokenResponse, type juguangConfig } from './xiaohongshu-juguang';

const envelope = z.object({ code: z.number(), success: z.boolean(), data: z.unknown().optional() });
export class UpstreamFailure extends Error { constructor(public code: string) { super(code); } }
export function failure(code: string) {
  const authorization = ['410010','410016','410017','410019','410020','410022','410023','SCOPE','IDENTITY'].includes(code);
  const messages: Record<string,string> = {
    '410010':'应用不可用，请核对开放平台应用状态后重新授权。',
    '410016':'刷新令牌失效，请重新授权。', '410017':'授权已过期，请重新授权。',
    '410019':'访问令牌失效，请重新授权。', '410020':'访问令牌已过期，请重新授权。',
    '410022':'平台资质异常，请核对资质后重新授权。', '410023':'缺少报表权限，请重新授权。',
    '410025':'广告账户 ID 无效，请核对授权账户。', '410026':'该账户不在当前授权范围，请重新核对账户授权。',
    '410027':'广告账户状态异常，请到聚光核对。', '410028':'账户暂不满足接口调用条件，请到聚光核对资质与投放条件。',
    '410029':'聚光调用频率受限，请稍后重试。', SCOPE:'当前授权范围与报表只读设置不符，请重新授权。',
    IDENTITY:'刷新结果与当前授权账户不符，请重新授权。', TIMEOUT:'聚光请求超时，请稍后重试。',
    RESPONSE:'聚光返回异常，请稍后重试。', NETWORK:'暂时无法连接聚光，请稍后重试。',
  };
  return { status: authorization ? 'reauthorize' as const : 'error' as const, code, message: messages[code] ?? '聚光接口暂时不可用，请稍后重试。' };
}
export async function upstream(url: string, body: unknown, deadline: number, accessToken?: string) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new UpstreamFailure('TIMEOUT');
  let response: Response;
  try { response = await fetch(url, { method:'POST', redirect:'error', signal:AbortSignal.timeout(Math.min(10_000, remaining)), headers:{'Content-Type':'application/json', ...(accessToken ? {'Access-Token':accessToken} : {})}, body:JSON.stringify(body) }); }
  catch (error) { throw new UpstreamFailure(error instanceof Error && ['TimeoutError','AbortError'].includes(error.name) ? 'TIMEOUT' : 'NETWORK'); }
  let raw: unknown; try { raw = await response.json(); } catch { throw new UpstreamFailure('RESPONSE'); }
  const parsed = envelope.safeParse(raw);
  if (!parsed.success) throw new UpstreamFailure('RESPONSE');
  if (!parsed.data.success || parsed.data.code !== 0) throw new UpstreamFailure(String(parsed.data.code));
  if (!response.ok) throw new UpstreamFailure('RESPONSE');
  return raw;
}

/** 调用方持有应用锁；刷新成功立即保存，后续报表失败不能回滚已轮换凭据。 */
export async function refreshJuguangConnection(row: typeof connection.$inferSelect, config: ReturnType<typeof juguangConfig>, deadline: number) {
  if (!hasJuguangReportScope(row.scope)) throw new UpstreamFailure('SCOPE');
  if (row.refreshTokenExpiresAt.getTime() <= Date.now()) throw new UpstreamFailure('410017');
  let tokens: ReturnType<typeof decryptJuguangTokens>;
  try { tokens = decryptJuguangTokens(row.encryptedTokens, config.appId+':'+row.authorizationUserId); }
  catch { throw new UpstreamFailure('IDENTITY'); }
  const raw = await upstream('https://adapi.xiaohongshu.com/api/open/oauth2/refresh_token', {app_id:Number(config.appId), secret:config.secret, refresh_token:tokens.refreshToken}, deadline);
  let token: ReturnType<typeof parseJuguangTokenResponse>;
  try { token = parseJuguangTokenResponse(raw, config.appId); } catch { throw new UpstreamFailure('IDENTITY'); }
  if (token.user_id !== row.authorizationUserId) throw new UpstreamFailure('IDENTITY');
  const scope = token.scope ?? row.scope;
  if (!hasJuguangReportScope(scope)) throw new UpstreamFailure('SCOPE');
  tokens = {accessToken:token.access_token, refreshToken:token.refresh_token};
  const now = new Date();
  const values = {
    encryptedTokens:encryptJuguangTokens(tokens,config.appId+':'+row.authorizationUserId),
    accessTokenExpiresAt:new Date(now.getTime()+token.access_token_expires_in*1000),
    refreshTokenExpiresAt:new Date(now.getTime()+token.refresh_token_expires_in*1000),
    scope, advertisers:token.approval_advertisers ?? row.advertisers, updatedAt:now,
    lastRenewal:{checkedAt:now.toISOString(), status:'ok' as const, code:'0', message:'令牌已自动续期'},
  };
  await getDb().update(connection).set(values).where(and(eq(connection.appId,config.appId),eq(connection.authorizationUserId,row.authorizationUserId)));
  Object.assign(row,values);
  return tokens;
}
