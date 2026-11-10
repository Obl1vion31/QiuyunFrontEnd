import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decryptJuguangTokens, encryptJuguangTokens, exchangeJuguangCode, JuguangError,
  juguangAuthorizationUrl, juguangConfig, juguangErrorResponse, parseJuguangCallback, parseJuguangTokenResponse,
} from '../src/integrations/xiaohongshu-juguang';

const tokenExample = {
  code: 0, success: true,
  data: {
    access_token: 'fictional-access-token', refresh_token: 'fictional-refresh-token',
    access_token_expires_in: 86399, refresh_token_expires_in: 2591999,
    user_id: 'fictional-authorization-user', platform_type: 1,
    approval_advertisers: [{ advertiser_id: 1234, advertiser_name: '虚构隔离验收账号' }],
  },
};

test('聚光授权仅申请报表读取，回调地址按官方参数编码一次', () => {
  const callback = 'https://qiuyun-frontend.vercel.app/api/integrations/xiaohongshu/callback';
  const url = new URL(juguangAuthorizationUrl('42', callback, 'fictional-state'));
  assert.equal(url.origin + url.pathname, 'https://ad-market.xiaohongshu.com/auth');
  assert.equal(url.searchParams.get('appId'), '42');
  assert.deepEqual(JSON.parse(url.searchParams.get('scope')!), ['report_service']);
  assert.equal(url.searchParams.get('redirectUri'), callback);
  assert.equal(url.searchParams.get('state'), 'fictional-state');
});

test('配置未齐备不假报授权成功；非法应用 ID 被拒绝', () => {
  const previous = { id: process.env.XHS_JUGUANG_APP_ID, secret: process.env.XHS_JUGUANG_APP_SECRET };
  try {
    delete process.env.XHS_JUGUANG_APP_ID; delete process.env.XHS_JUGUANG_APP_SECRET;
    assert.throws(juguangConfig, (e: unknown) => e instanceof JuguangError && e.code === 'JUGUANG_NOT_CONFIGURED');
    process.env.XHS_JUGUANG_APP_ID = '9007199254740993'; process.env.XHS_JUGUANG_APP_SECRET = 'fictional-secret';
    assert.throws(juguangConfig, (e: unknown) => e instanceof JuguangError && e.code === 'JUGUANG_CONFIG_INVALID');
  } finally {
    if (previous.id === undefined) delete process.env.XHS_JUGUANG_APP_ID; else process.env.XHS_JUGUANG_APP_ID = previous.id;
    if (previous.secret === undefined) delete process.env.XHS_JUGUANG_APP_SECRET; else process.env.XHS_JUGUANG_APP_SECRET = previous.secret;
  }
});

test('回调拒绝遗漏、重复参数和非本应用生成的 state 形态', () => {
  const state = 's'.repeat(43);
  assert.deepEqual(parseJuguangCallback(new URLSearchParams({ auth_code: 'opaque-code', state })), { authCode: 'opaque-code', state });
  for (const query of ['', `code=x&state=${state}`, 'auth_code=x&state=short', `auth_code=x&auth_code=y&state=${state}`, `auth_code=x&state=${state}&state=${state}`]) {
    assert.throws(() => parseJuguangCallback(new URLSearchParams(query)), JuguangError);
  }
});

test('按官方返回结构解析令牌，拒绝其他场景、应用和错误有效期', async () => {
  assert.equal(parseJuguangTokenResponse(tokenExample, '42').access_token, tokenExample.data.access_token);
  for (const patch of [{ platform_type: 2 }, { app_id: 43 }, { access_token_expires_in: -1 }, { access_token: '' }]) {
    assert.throws(() => parseJuguangTokenResponse({ ...tokenExample, data: { ...tokenExample.data, ...patch } }, '42'), JuguangError);
  }
  try {
    parseJuguangTokenResponse({ code: 410013, success: false, msg: 'do-not-expose-this-secret' }, '42');
    assert.fail('Expected rejected authorization');
  } catch (error) {
    assert.ok(error instanceof JuguangError);
    assert.ok(!(await juguangErrorResponse(error).text()).includes('do-not-expose-this-secret'));
  }
});

test('令牌加密具有随机性且绑定应用与账号，篡改和跨账号解密失败', () => {
  process.env.BETTER_AUTH_SECRET = 'fictional-juguang-test-secret-at-least-32-characters';
  const tokens = { accessToken: 'fictional-access-token', refreshToken: 'fictional-refresh-token' };
  const encrypted = encryptJuguangTokens(tokens, '42:owner');
  assert.notEqual(encrypted, encryptJuguangTokens(tokens, '42:owner'));
  assert.ok(!encrypted.includes(tokens.accessToken));
  assert.deepEqual(decryptJuguangTokens(encrypted, '42:owner'), tokens);
  assert.throws(() => decryptJuguangTokens(encrypted, '42:another-owner'));
  const parts = encrypted.split('.'); parts[2] = Buffer.alloc(16).toString('base64url');
  assert.throws(() => decryptJuguangTokens(parts.join('.'), '42:owner'));
});

test('上游断网使用正式请求格式且不重试、不向响应泄露凭据', async context => {
  process.env.XHS_JUGUANG_APP_ID = '42'; process.env.XHS_JUGUANG_APP_SECRET = 'fictional-private-secret';
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls++;
    assert.equal(url, 'https://adapi.xiaohongshu.com/api/open/oauth2/access_token');
    assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'error');
    assert.deepEqual(JSON.parse(init.body as string), { app_id: 42, secret: 'fictional-private-secret', auth_code: 'fictional-private-code' });
    throw new Error('fictional-private-secret fictional-private-code');
  });
  try { await exchangeJuguangCode('fictional-private-code'); assert.fail('Expected network failure'); }
  catch (error) {
    const response = juguangErrorResponse(error);
    assert.equal(response.status, 502);
    const text = await response.text(); assert.ok(!text.includes('fictional-private'));
  }
  assert.equal(calls, 1);
});
