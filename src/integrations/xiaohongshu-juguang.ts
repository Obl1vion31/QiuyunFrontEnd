import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client';
import { authVerification, xiaohongshuJuguangConnection } from '../db/schema';

export const JUGUANG_CALLBACK_PATH = '/api/integrations/xiaohongshu/callback';
export const JUGUANG_SCOPES = ['report_service'] as const;
const STATE_LIFETIME_MS = 10 * 60_000;
const TOKEN_URL = 'https://adapi.xiaohongshu.com/api/open/oauth2/access_token';

export class JuguangError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

export function juguangConfig() {
  const appId = process.env.XHS_JUGUANG_APP_ID?.trim();
  const secret = process.env.XHS_JUGUANG_APP_SECRET?.trim();
  if (!appId || !secret) throw new JuguangError('JUGUANG_NOT_CONFIGURED', '聚光应用尚未配置，请在创建应用后配置应用 ID 和密钥。', 503);
  if (!/^\d+$/.test(appId) || !Number.isSafeInteger(Number(appId)) || Number(appId) <= 0) {
    throw new JuguangError('JUGUANG_CONFIG_INVALID', '聚光应用 ID 配置无效，请联系管理员核对。', 503);
  }
  return { appId, secret };
}

export function juguangCallbackUrl(origin: string) {
  return new URL(JUGUANG_CALLBACK_PATH, origin).href;
}

export function juguangAuthorizationUrl(appId: string, callbackUrl: string, state: string) {
  const url = new URL('https://ad-market.xiaohongshu.com/auth');
  url.searchParams.set('appId', appId);
  url.searchParams.set('scope', JSON.stringify(JUGUANG_SCOPES));
  url.searchParams.set('redirectUri', callbackUrl);
  url.searchParams.set('state', state);
  return url.href;
}

const stateIdentifier = (state: string) => `juguang-oauth:${createHash('sha256').update(state).digest('hex')}`;
const stateOwner = (userId: string, sessionId: string, appId: string) => JSON.stringify({ userId, sessionId, appId });

export async function beginJuguangAuthorization(userId: string, sessionId: string, origin: string) {
  const config = juguangConfig();
  const state = randomBytes(32).toString('base64url');
  await getDb().insert(authVerification).values({
    id: randomUUID(), identifier: stateIdentifier(state), value: stateOwner(userId, sessionId, config.appId),
    expiresAt: new Date(Date.now() + STATE_LIFETIME_MS),
  });
  return juguangAuthorizationUrl(config.appId, juguangCallbackUrl(origin), state);
}

export function parseJuguangCallback(params: URLSearchParams) {
  const authCode = params.get('auth_code');
  const state = params.get('state');
  if (params.getAll('auth_code').length !== 1 || !authCode || authCode.length > 2048
    || params.getAll('state').length !== 1 || !state || !/^[A-Za-z0-9_-]{43}$/.test(state)) {
    throw new JuguangError('JUGUANG_INVALID_CALLBACK', '授权回调不完整，请从湫云重新发起聚光授权。');
  }
  return { authCode, state };
}

const tokenDataSchema = z.object({
  access_token: z.string().min(1).max(4096), refresh_token: z.string().min(1).max(4096),
  access_token_expires_in: z.number().int().positive().max(31_536_000),
  refresh_token_expires_in: z.number().int().positive().max(31_536_000),
  user_id: z.string().min(1).max(200), platform_type: z.literal(1),
  app_id: z.number().int().positive().optional(), scope: z.string().max(4096).optional(),
  approval_advertisers: z.array(z.object({
    advertiser_id: z.number().int().positive().refine(Number.isSafeInteger),
    advertiser_name: z.string().max(500),
  })).optional(),
});
export type JuguangTokenData = z.infer<typeof tokenDataSchema>;

export function parseJuguangTokenResponse(body: unknown, appId: string) {
  const envelope = z.object({ code: z.number(), success: z.boolean(), data: z.unknown().optional() }).safeParse(body);
  if (!envelope.success) throw new JuguangError('JUGUANG_INVALID_RESPONSE', '聚光授权服务返回异常，请重新发起授权。', 502);
  if (!envelope.data.success || envelope.data.code !== 0) {
    throw new JuguangError('JUGUANG_AUTHORIZATION_REJECTED', '聚光授权未完成，请核对应用配置并重新授权。', 502);
  }
  const parsed = tokenDataSchema.safeParse(envelope.data.data);
  if (!parsed.success || (parsed.data.app_id !== undefined && String(parsed.data.app_id) !== appId)) {
    throw new JuguangError('JUGUANG_INVALID_TOKEN', '聚光授权结果与当前应用或服务场景不符，请重新授权。', 502);
  }
  return parsed.data;
}

export async function exchangeJuguangCode(authCode: string) {
  const config = juguangConfig();
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: Number(config.appId), secret: config.secret, auth_code: authCode }),
    });
  } catch {
    throw new JuguangError('JUGUANG_UNAVAILABLE', '暂时无法完成聚光授权，请稍后重新发起。', 502);
  }
  let body: unknown;
  try { body = await response.json(); } catch {
    throw new JuguangError('JUGUANG_INVALID_RESPONSE', '聚光授权服务返回异常，请重新发起授权。', 502);
  }
  if (!response.ok) {
    throw new JuguangError('JUGUANG_INVALID_RESPONSE', '聚光授权服务返回异常，请重新发起授权。', 502);
  }
  return parseJuguangTokenResponse(body, config.appId);
}

function tokenEncryptionKey() {
  const secret = process.env.BETTER_AUTH_SECRET || import.meta.env?.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new JuguangError('JUGUANG_STORAGE_UNAVAILABLE', '授权保存服务暂时不可用，请联系管理员。', 503);
  // 同一应用根密钥按用途派生；密文不能用作登录会话或其他平台凭据。
  return Buffer.from(hkdfSync('sha256', secret, 'qiuyun:xiaohongshu:juguang', 'tokens:v1', 32));
}

export function encryptJuguangTokens(tokens: { accessToken: string; refreshToken: string }, owner: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', tokenEncryptionKey(), iv);
  cipher.setAAD(Buffer.from(owner));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptJuguangTokens(value: string, owner: string) {
  const [version, iv, tag, ciphertext, extra] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext || extra !== undefined) throw new Error('INVALID_JUGUANG_TOKEN_CIPHERTEXT');
  const decipher = createDecipheriv('aes-256-gcm', tokenEncryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(owner));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
  return z.object({ accessToken: z.string().min(1), refreshToken: z.string().min(1) }).parse(JSON.parse(plaintext));
}

export async function consumeJuguangState(state: string, userId: string, sessionId: string, appId: string) {
  const db = getDb();
  // DELETE RETURNING 原子消费，过期、其他会话与重复回调都不能换取令牌。
  const consumed = await db.delete(authVerification).where(and(
    eq(authVerification.identifier, stateIdentifier(state)),
    eq(authVerification.value, stateOwner(userId, sessionId, appId)),
    gt(authVerification.expiresAt, new Date()),
  )).returning({ id: authVerification.id });
  if (consumed.length !== 1) throw new JuguangError('JUGUANG_INVALID_STATE', '授权已过期或与当前登录不符，请重新发起聚光授权。');
}

export async function saveJuguangConnection(token: JuguangTokenData, appId: string, userId: string) {
  const now = new Date();
  const values = {
    appId, authorizationUserId: token.user_id,
    encryptedTokens: encryptJuguangTokens({ accessToken: token.access_token, refreshToken: token.refresh_token }, `${appId}:${token.user_id}`),
    accessTokenExpiresAt: new Date(now.getTime() + token.access_token_expires_in * 1000),
    refreshTokenExpiresAt: new Date(now.getTime() + token.refresh_token_expires_in * 1000),
    advertisers: token.approval_advertisers ?? [], scope: token.scope ?? null, updatedBy: userId, updatedAt: now,
  };
  await getDb().insert(xiaohongshuJuguangConnection).values(values).onConflictDoUpdate({
    target: [xiaohongshuJuguangConnection.appId, xiaohongshuJuguangConnection.authorizationUserId], set: values,
  });
}

export async function completeJuguangAuthorization(params: URLSearchParams, userId: string, sessionId: string) {
  const { authCode, state } = parseJuguangCallback(params);
  const { appId } = juguangConfig();
  await consumeJuguangState(state, userId, sessionId, appId);
  const token = await exchangeJuguangCode(authCode);
  await saveJuguangConnection(token, appId, userId);
}

export async function juguangConnectionStatus() {
  let appId: string;
  try { appId = juguangConfig().appId; } catch (error) {
    if (error instanceof JuguangError && error.code === 'JUGUANG_NOT_CONFIGURED') return { configured: false, connections: [] };
    throw error;
  }
  const connections = await getDb().select({
    authorizationUserId: xiaohongshuJuguangConnection.authorizationUserId,
    advertisers: xiaohongshuJuguangConnection.advertisers, scope: xiaohongshuJuguangConnection.scope,
    accessTokenExpiresAt: xiaohongshuJuguangConnection.accessTokenExpiresAt,
    refreshTokenExpiresAt: xiaohongshuJuguangConnection.refreshTokenExpiresAt,
  }).from(xiaohongshuJuguangConnection).where(eq(xiaohongshuJuguangConnection.appId, appId));
  return { configured: true, connections };
}

export function juguangErrorResponse(error: unknown) {
  if (error instanceof JuguangError) return Response.json({ code: error.code, message: error.message }, { status: error.status });
  return Response.json({ code: 'JUGUANG_SAVE_FAILED', message: '授权结果暂时无法保存，请稍后重新发起授权。' }, { status: 503 });
}
