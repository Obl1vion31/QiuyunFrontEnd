import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client';
import { xiaohongshuJuguangConnection as connection } from '../db/schema';
import { decryptJuguangTokens, encryptJuguangTokens, hasJuguangReportScope, JuguangError, juguangConfig, parseJuguangTokenResponse, withJuguangLock } from './xiaohongshu-juguang';
import type { JuguangCheck } from './juguang-check-types';

export const JUGUANG_NOTE_REPORT = 'https://adapi.xiaohongshu.com/api/open/jg/data/report/offline/note';
const REFRESH_URL = 'https://adapi.xiaohongshu.com/api/open/oauth2/refresh_token';
const envelope = z.object({ code: z.number(), success: z.boolean(), data: z.unknown().optional() });
class UpstreamFailure extends Error { constructor(public code: string) { super(code); } }
function failure(code: string) {
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
async function upstream(url: string, body: unknown, deadline: number, accessToken?: string) {
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

export async function checkJuguangConnection(authorizationUserId: string) {
  const config = juguangConfig();
  return withJuguangLock(config.appId, true, async () => {
    const where = and(eq(connection.appId, config.appId), eq(connection.authorizationUserId, authorizationUserId));
    const [row] = await getDb().select().from(connection).where(where);
    if (!row) throw new JuguangError('JUGUANG_CONNECTION_NOT_FOUND','授权连接不存在，请刷新页面。',404);
    const deadline = Date.now() + 25_000;
    let tokens: {accessToken:string;refreshToken:string} | undefined;
    let refreshed = false;
    const result: JuguangCheck = { checkedAt: new Date().toISOString(), status:'failed', accounts:[] };
    async function refresh() {
      if (row.refreshTokenExpiresAt.getTime() <= Date.now()) throw new UpstreamFailure('410017');
      const raw = await upstream(REFRESH_URL, { app_id:Number(config.appId), secret:config.secret, refresh_token:tokens!.refreshToken }, deadline);
      let token: ReturnType<typeof parseJuguangTokenResponse>;
      try { token = parseJuguangTokenResponse(raw,config.appId); } catch { throw new UpstreamFailure('IDENTITY'); }
      if (token.user_id !== row.authorizationUserId) throw new UpstreamFailure('IDENTITY');
      const scope = token.scope ?? row.scope;
      if (!hasJuguangReportScope(scope)) throw new UpstreamFailure('SCOPE');
      tokens = {accessToken:token.access_token,refreshToken:token.refresh_token}; refreshed = true;
      const now = new Date();
      const values = { encryptedTokens:encryptJuguangTokens(tokens,config.appId+':'+row.authorizationUserId), accessTokenExpiresAt:new Date(now.getTime()+token.access_token_expires_in*1000), refreshTokenExpiresAt:new Date(now.getTime()+token.refresh_token_expires_in*1000), scope, advertisers:token.approval_advertisers ?? row.advertisers, updatedAt:now };
      // 后续报表失败转换为检查结果，不能抛出导致已轮换令牌回滚。
      await getDb().update(connection).set(values).where(where);
      Object.assign(row,values);
    }
    let initialFailure: ReturnType<typeof failure> | undefined;
    try {
      if (!hasJuguangReportScope(row.scope)) throw new UpstreamFailure('SCOPE');
      if (row.refreshTokenExpiresAt.getTime() <= Date.now()) throw new UpstreamFailure('410017');
      try { tokens = decryptJuguangTokens(row.encryptedTokens,config.appId+':'+row.authorizationUserId); }
      catch { throw new UpstreamFailure('IDENTITY'); }
      if (row.accessTokenExpiresAt.getTime() <= Date.now()+60_000) await refresh();
    } catch (error) { if (!(error instanceof UpstreamFailure)) throw error; initialFailure = failure(error.code); }
    const date = new Date(Date.now()+8*3600_000-2*86400_000).toISOString().slice(0,10);
    for (const account of row.advertisers) {
      if (initialFailure) { result.accounts.push({advertiserId:account.advertiser_id,...initialFailure}); continue; }
      const read = () => upstream(JUGUANG_NOTE_REPORT,{advertiser_id:account.advertiser_id,start_date:date,end_date:date,time_unit:'DAY',page_num:1,page_size:1},deadline,tokens!.accessToken);
      try {
        try { await read(); }
        catch (error) {
          if (error instanceof UpstreamFailure && ['410019','410020'].includes(error.code) && !refreshed) { await refresh(); await read(); }
          else throw error;
        }
        result.accounts.push({advertiserId:account.advertiser_id,status:'ok',code:'0',message:'离线报表读取正常'});
      } catch (error) {
        if (!(error instanceof UpstreamFailure)) throw error;
        const safe = failure(error.code);
        result.accounts.push({advertiserId:account.advertiser_id,...safe});
        if (safe.status === 'reauthorize') initialFailure = safe;
      }
    }
    const successes = result.accounts.filter(account=>account.status==='ok').length;
    result.status = successes === result.accounts.length && successes > 0 ? 'ok' : successes > 0 ? 'partial' : initialFailure?.status === 'reauthorize' ? 'reauthorize' : 'failed';
    result.checkedAt = new Date().toISOString();
    await getDb().update(connection).set({lastCheck:result}).where(where);
    return result;
  });
}
