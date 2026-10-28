/** 数据库身份与会话服务。不得从客户端组件导入本模块。 */
import { betterAuth } from 'better-auth/minimal';
import { username } from 'better-auth/plugins/username';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { getDb, type Database } from '../db/client';
import { authUser, authSession, authAccount, authVerification, authRateLimit } from '../db/schema';
import {sql} from 'drizzle-orm';

export function createAuth(db: Database, config: { secret: string; baseURL: string; rateLimit?: boolean }) {
  if (config.secret.length < 32) throw new Error('BETTER_AUTH_SECRET_NOT_CONFIGURED');
  const url = new URL(config.baseURL);
  if (url.pathname !== '/' || url.search || url.hash) throw new Error('INVALID_BETTER_AUTH_URL');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!local && url.protocol !== 'https:') throw new Error('AUTH_REQUIRES_HTTPS');
  const trustedOrigins = [url.origin];
  if (local) trustedOrigins.push(`http://localhost:${url.port || '80'}`, `http://127.0.0.1:${url.port || '80'}`);
  return betterAuth({
    appName: 'Qiuyun Operations',
    secret: config.secret,
    baseURL: url.origin,
    trustedOrigins,
    // 登录尚无 cookie 时也验证来源，避免登录 CSRF；不依赖浏览器是否已持有会话。
    hooks: { before: createAuthMiddleware(async context => {
      if (context.request && !['GET', 'HEAD', 'OPTIONS'].includes(context.request.method)
        && !trustedOrigins.includes(context.request.headers.get('origin') ?? '')) {
        throw new APIError('FORBIDDEN', { message: '拒绝跨站账号操作。' });
      }
      if(context.path==='/sign-in/username'&&typeof context.body?.username==='string'){
        const identifier=context.body.username.trim();
        if(!identifier||identifier.length>40)throw new APIError('BAD_REQUEST',{message:'请填写有效的账号或用户名。'});
        const [account]=await db.select({username:authUser.username,enabled:authUser.enabled}).from(authUser)
          .where(sql`lower(btrim(${authUser.username}))=lower(btrim(${identifier})) or lower(btrim(${authUser.name}))=lower(btrim(${identifier}))`);
        if(!account)throw new APIError('UNAUTHORIZED',{message:'账号或密码不正确。'});
        if(!account.enabled)throw new APIError('FORBIDDEN',{message:'账号已停用，请联系管理员。'});
        return {context:{body:{...context.body,username:account.username}}};
      }
    }) },
    database: drizzleAdapter(db, { provider: 'pg', transaction: true, schema: {
      user: authUser, session: authSession, account: authAccount, verification: authVerification, rateLimit: authRateLimit,
    } }),
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 6, maxPasswordLength: 128 },
    user: { additionalFields: { role: { type: ['admin', 'employee'], required: true, defaultValue: 'employee', input: false },enabled:{type:'boolean',required:true,defaultValue:true,input:false} } },
    session: { expiresIn: 7 * 86400, updateAge: 86400, cookieCache: { enabled: false } },
    rateLimit: { enabled: config.rateLimit ?? true, storage: 'database', window: 60, max: 100,
      customRules: { '/sign-in/username': { window: 60, max: 5 }, '/sign-in/email': { window: 60, max: 5 } } },
    advanced: { cookiePrefix: 'qiuyun', useSecureCookies: url.protocol === 'https:' },
    plugins: [username({ immutableUsername: true })],
  });
}

let shared: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  if (!shared) {
    const runtimeEnv = process.env;
    const secret = runtimeEnv.BETTER_AUTH_SECRET || import.meta.env?.BETTER_AUTH_SECRET;
    const baseURL = runtimeEnv.BETTER_AUTH_URL || import.meta.env?.BETTER_AUTH_URL;
    if (!secret || !baseURL) throw new Error('AUTH_NOT_CONFIGURED');
    shared = createAuth(getDb(), { secret, baseURL, rateLimit: runtimeEnv.NODE_ENV !== 'test' });
  }
  return shared;
}
