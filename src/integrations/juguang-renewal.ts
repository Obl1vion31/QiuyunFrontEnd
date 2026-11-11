import { and, eq, lte } from 'drizzle-orm';
import { getDb } from '../db/client';
import { xiaohongshuJuguangConnection as connection } from '../db/schema';
import { juguangConfig, withJuguangLock } from './xiaohongshu-juguang';
import { failure, refreshJuguangConnection, UpstreamFailure } from './juguang-token';

export const JUGUANG_RENEW_BEFORE_MS = 16 * 3600_000;

/** 定时任务只续期凭据，不读取报表或更改复盘事实。 */
export async function renewJuguangConnections() {
  const config = juguangConfig();
  return withJuguangLock(config.appId, true, async () => {
    // 取得锁后重新读取；重复投递或手动检查先刷新后，本轮不再轮换。
    const rows = await getDb().select().from(connection).where(and(eq(connection.appId,config.appId),lte(connection.accessTokenExpiresAt,new Date(Date.now()+JUGUANG_RENEW_BEFORE_MS))));
    const result = {checked:rows.length, refreshed:0, errors:0, reauthorize:0};
    const deadline = Date.now()+25_000;
    for (const row of rows) {
      try { await refreshJuguangConnection(row,config,deadline); result.refreshed++; }
      catch (error) {
        if (!(error instanceof UpstreamFailure)) throw error;
        const safe = failure(error.code);
        if (safe.status === 'reauthorize') result.reauthorize++; else result.errors++;
        await getDb().update(connection).set({lastRenewal:{checkedAt:new Date().toISOString(),...safe,message:safe.status==='error'?safe.message.replace('请稍后重试。','下个时段自动重试。'):safe.message}}).where(and(eq(connection.appId,config.appId),eq(connection.authorizationUserId,row.authorizationUserId)));
      }
    }
    return result;
  });
}
