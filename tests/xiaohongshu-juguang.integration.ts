import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sql, eq } from 'drizzle-orm';
import { admin, employee, startFixture } from './auth.fixture';
import { startPostgresFixture } from './postgres.fixture';
import { withDatabase, type Database } from '../src/db/client';
import { authVerification, authUser, xiaohongshuJuguangConnection } from '../src/db/schema';
import {
  beginJuguangAuthorization, consumeJuguangState, decryptJuguangTokens,
  juguangConnectionStatus, parseJuguangTokenResponse, saveJuguangConnection,
} from '../src/integrations/xiaohongshu-juguang';

process.env.XHS_JUGUANG_APP_ID = '42';
process.env.XHS_JUGUANG_APP_SECRET = 'fictional-isolated-app-secret';
process.env.BETTER_AUTH_SECRET = 'fictional-juguang-test-secret-at-least-32-characters';
const fixture = process.env.TEST_POSTGRES_URL
  ? await startPostgresFixture({ entry: process.env.JUGUANG_ENTRY })
  : await startFixture({ entry: process.env.JUGUANG_ENTRY });
const { baseURL } = fixture;
const db = fixture.db as Database;
const path = '/api/integrations/xiaohongshu';
const checks: string[] = [];
async function request(route: string, method = 'GET', cookie = '', origin = baseURL) {
  return fetch(baseURL + route, { method, redirect: 'manual', headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}) } });
}
async function login(account: typeof admin | typeof employee) {
  const response = await fetch(baseURL + '/api/auth/sign-in/username', {
    method: 'POST', headers: { Origin: baseURL, 'Content-Type': 'application/json' }, body: JSON.stringify(account),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
  const session = await (await request('/api/auth/get-session', 'GET', cookie)).json();
  return { cookie, userId: session.user.id as string, sessionId: session.session.id as string };
}
try {
  const before = await db.select().from(authUser);
  await db.execute(sql`drop table xiaohongshu_juguang_connection`);
  const migration = await readFile(new URL('../drizzle/0052_xiaohongshu_juguang.sql', import.meta.url), 'utf8');
  for (const statement of migration.split('--> statement-breakpoint')) await db.execute(sql.raw(statement));
  assert.deepEqual(await db.select().from(authUser), before);
  checks.push('真实迁移只追加连接表，既有账号保持');

  const ready = await request(path + '/callback'); assert.equal(ready.status, 200);
  assert.equal((await ready.json()).status, 'ready');
  assert.equal(ready.headers.get('referrer-policy'), 'no-referrer');
  assert.match(ready.headers.get('cache-control')!, /no-store/);
  assert.equal((await request(path + '/callback', 'HEAD')).status, 200);
  for (const route of [path + '/callback?auth_code=fictional', path + '/status', '/api/promotion-daily']) assert.equal((await request(route)).status, 401);
  assert.equal((await request(path + '/authorize', 'POST')).status, 401);
  assert.equal((await request(path + '/authorize')).status, 401);
  assert.equal((await request(path + '/callback/')).status, 401, '公开例外只覆盖精确登记路径');
  checks.push('公开就绪检查、HEAD、带参回调及其他接口的登录门禁');

  const boss = await login(admin), staff = await login(employee);
  for (const [route, method] of [[path + '/status', 'GET'], [path + '/callback?auth_code=fictional', 'GET'], [path + '/authorize', 'POST'], [path + '/authorize', 'GET']]) {
    assert.equal((await request(route, method, staff.cookie)).status, 403);
  }
  assert.equal((await request(path + '/authorize', 'POST', boss.cookie, 'https://untrusted.example')).status, 403);
  assert.equal((await request(path + '/authorize', 'GET', boss.cookie, 'https://untrusted.example')).status, 403);
  const crossSite = await fetch(baseURL + path + '/authorize', { redirect: 'manual', headers: { Cookie: boss.cookie, 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(crossSite.status, 403);
  const statesBeforeHead = await db.select({ id: authVerification.id }).from(authVerification);
  assert.equal((await request(path + '/authorize', 'HEAD', boss.cookie)).status, 204);
  assert.deepEqual(await db.select({ id: authVerification.id }).from(authVerification), statesBeforeHead);
  const navigated = await request(path + '/authorize', 'GET', boss.cookie);
  assert.equal(navigated.status, 303);
  assert.deepEqual(JSON.parse(new URL(navigated.headers.get('location')!).searchParams.get('scope')!), ['report_service']);
  const status = await request(path + '/status', 'GET', boss.cookie);
  assert.deepEqual(await status.json(), { service: 'xiaohongshu_juguang', requestedScopes: ['report_service'], configured: true, connections: [] });
  const incomplete = await request(path + '/callback?auth_code=fictional', 'GET', boss.cookie);
  assert.equal(incomplete.status, 400); assert.ok(!(await incomplete.text()).includes('auth_code=fictional'));
  checks.push('管理员／员工权限、GET／POST发起、跨站拒绝、HEAD无副作用及状态不暴露令牌');

  const started = await request(path + '/authorize', 'POST', boss.cookie); assert.equal(started.status, 303);
  const upstream = new URL(started.headers.get('location')!);
  assert.equal(upstream.origin + upstream.pathname, 'https://ad-market.xiaohongshu.com/auth');
  assert.deepEqual(JSON.parse(upstream.searchParams.get('scope')!), ['report_service']);
  assert.equal(upstream.searchParams.get('redirectUri'), baseURL + path + '/callback');
  const state = upstream.searchParams.get('state')!;
  await withDatabase(db, async () => {
    await assert.rejects(consumeJuguangState(state, staff.userId, boss.sessionId, '42'));
    await assert.rejects(consumeJuguangState(state, boss.userId, 'other-session', '42'));
    await assert.rejects(consumeJuguangState(state, boss.userId, boss.sessionId, '43'));
    const results = await Promise.allSettled([consumeJuguangState(state, boss.userId, boss.sessionId, '42'), consumeJuguangState(state, boss.userId, boss.sessionId, '42')]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected').length, 1);
    const expired = new URL(await beginJuguangAuthorization(boss.userId, boss.sessionId, baseURL)).searchParams.get('state')!;
    await db.update(authVerification).set({ expiresAt: new Date(0) });
    await assert.rejects(consumeJuguangState(expired, boss.userId, boss.sessionId, '42'));
  });
  checks.push('正式授权链接、state 的应用／会话绑定、过期及原子防重放');

  await withDatabase(db, async () => {
    const token = parseJuguangTokenResponse({ code: 0, success: true, data: {
      access_token: 'fictional-access-token', refresh_token: 'fictional-refresh-token',
      access_token_expires_in: 86399, refresh_token_expires_in: 2591999,
      user_id: 'fictional-upstream-account', platform_type: 1,
      approval_advertisers: [{ advertiser_id: 1234, advertiser_name: '虚构隔离验收账号' }],
    } }, '42');
    await saveJuguangConnection(token, '42', boss.userId);
    await saveJuguangConnection({ ...token, access_token: 'fictional-replacement-access' }, '42', boss.userId);
    const rows = await db.select().from(xiaohongshuJuguangConnection);
    assert.equal(rows.length, 1);
    assert.ok(!rows[0].encryptedTokens.includes('fictional'));
    assert.equal(decryptJuguangTokens(rows[0].encryptedTokens, '42:fictional-upstream-account').accessToken, 'fictional-replacement-access');
    const safe = JSON.stringify(await juguangConnectionStatus());
    assert.ok(!safe.includes('fictional-access-token') && !safe.includes('fictional-refresh-token') && !safe.includes('encryptedTokens'));
    assert.equal((await db.select().from(authUser).where(eq(authUser.id, boss.userId))).length, 1);
  });
  checks.push('正式持久化逻辑加密保存、重复授权更新及安全状态读取');
  console.log(JSON.stringify({ database: process.env.TEST_POSTGRES_URL ? 'PostgreSQL' : 'PGlite', checks }, null, 2));
} catch (error) { console.error(fixture.logs().slice(-2500)); throw error; }
finally { await fixture.stop(); }
