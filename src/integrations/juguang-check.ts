import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { xiaohongshuJuguangConnection as connection } from '../db/schema';
import { decryptJuguangTokens, hasJuguangReportScope, JuguangError, juguangConfig, withJuguangLock } from './xiaohongshu-juguang';
import { failure, upstream, UpstreamFailure, refreshJuguangConnection } from './juguang-token';
import type { JuguangCheck } from './juguang-check-types';

export const JUGUANG_NOTE_REPORT = 'https://adapi.xiaohongshu.com/api/open/jg/data/report/offline/note';
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
      tokens = await refreshJuguangConnection(row, config, deadline);
      refreshed = true;
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
