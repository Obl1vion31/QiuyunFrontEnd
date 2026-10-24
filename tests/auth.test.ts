import {isConfigurableBusinessWrite} from '../src/auth/business-capabilities';
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrateFixture } from './migrate-fixture';
import { eq } from 'drizzle-orm';
import { verifyPassword } from 'better-auth/crypto';
import { createAuth } from '../src/auth/auth';
import { provisionAccount } from '../src/auth/provision';
import { requiresAdmin, safeReturnTo, requireAdmin } from '../src/auth/permissions';
import * as schema from '../src/db/schema';

const pg = new PGlite();
const db = drizzle(pg, { schema });
const config = { secret: 'fictional-auth-test-secret-at-least-32-characters', baseURL: 'http://localhost:4321' };
let auth: ReturnType<typeof createAuth>;
const admin = { username: 'test_admin', password: 'fictional-admin-password', role: 'admin' as const };
const employee = { username: 'test_employee', password: 'fictional-employee-password', role: 'employee' as const };
before(async () => { await migrateFixture(pg); auth = createAuth(db, { ...config, rateLimit: false }); await provisionAccount(db, admin); await provisionAccount(db, employee); });
after(async () => { await pg.close(); });
const request = (path: string, body?: object, cookie?: string, instance = auth, origin = config.baseURL) => instance.handler(new Request(`${config.baseURL}/api/auth/${path}`, {
  method: body ? 'POST' : 'GET', headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
}));
async function login(input: { username: string; password: string } = admin) {
  const response = await request('sign-in/username', input); assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie')!, /HttpOnly/); assert.match(response.headers.get('set-cookie')!, /SameSite=Lax/i);
  return response.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ');
}
test('用户名登录保存哈希、注册关闭、无效凭据不创建会话', async () => {
  const [row] = await db.select().from(schema.authAccount).innerJoin(schema.authUser, eq(schema.authAccount.userId, schema.authUser.id)).where(eq(schema.authUser.username, admin.username));
  assert.notEqual(row.auth_account.password, admin.password);
  assert.ok(await verifyPassword({ hash: row.auth_account.password!, password: admin.password }));
  assert.equal((await request('sign-up/email', { name: '虚构', email: 'fictional@example.test', password: 'fictional-password' })).status, 400);
  const before = (await db.select().from(schema.authSession)).length;
  for (const input of [{ ...admin, password: 'fictional-wrong' }, { username: 'missing_user', password: 'fictional-password' }]) assert.equal((await request('sign-in/username', input)).status, 401);
  assert.equal((await db.select().from(schema.authSession)).length, before);
});
test('重复与并发创建不改密码或角色', async () => {
  const input = { username: 'duplicate_user', password: 'fictional-original-password', role: 'employee' as const };
  const results = await Promise.all([provisionAccount(db, input), provisionAccount(db, input)]);
  assert.equal(results.filter(row => row.created).length, 1); assert.equal(results[0].id, results[1].id);
  await provisionAccount(db, { ...input, password: 'fictional-replacement' });
  assert.equal((await request('sign-in/username', input)).status, 200);
  assert.equal((await request('sign-in/username', { ...input, password: 'fictional-replacement' })).status, 401);
  await assert.rejects(provisionAccount(db, { ...input, role: 'admin' }), /角色不同/);
});
test('身份与角色来自数据库，伪造身份无效，角色更新即时读取', async () => {
  const cookie = await login(employee);
  let result = await auth.api.getSession({ headers: new Headers({ cookie, 'x-user-role': 'admin' }) });
  assert.equal(result?.user.username, employee.username); assert.equal(result?.user.role, 'employee');
  const update = await request('update-user', { role: 'admin' }, cookie); assert.equal(update.status, 400);
  result = await auth.api.getSession({ headers: new Headers({ cookie }) }); assert.equal(result?.user.role, 'employee');
  await db.update(schema.authUser).set({ role: 'admin' }).where(eq(schema.authUser.username, employee.username));
  result = await auth.api.getSession({ headers: new Headers({ cookie }) }); assert.equal(result?.user.role, 'admin');
  await db.update(schema.authUser).set({ role: 'employee' }).where(eq(schema.authUser.username, employee.username));
  assert.equal(await auth.api.getSession({ headers: new Headers({ cookie: 'qiuyun.session_token=forged' }) }), null);
});
test('退出、撤销和过期立即阻止访问，另一个账号会话保持', async () => {
  const cookie = await login(); const other = await login(employee);
  assert.equal((await request('sign-out', {}, cookie)).status, 200);
  assert.equal(await auth.api.getSession({ headers: new Headers({ cookie }) }), null);
  const active = await auth.api.getSession({ headers: new Headers({ cookie: other }) }); assert.equal(active?.user.role, 'employee');
  await db.update(schema.authSession).set({ expiresAt: new Date(0) }).where(eq(schema.authSession.id, active!.session.id));
  assert.equal(await auth.api.getSession({ headers: new Headers({ cookie: other }) }), null);
  const revokedCookie = await login(); const revoked = await auth.api.getSession({ headers: new Headers({ cookie: revokedCookie }) });
  await db.delete(schema.authSession).where(eq(schema.authSession.id, revoked!.session.id));
  assert.equal(await auth.api.getSession({ headers: new Headers({ cookie: revokedCookie }) }), null);
});
test('外部来源被拒绝，HTTPS cookie 使用 Secure', async () => {
  assert.equal((await request('sign-in/username', admin, undefined, auth, 'https://untrusted.example')).status, 403);
  const secure = createAuth(db, { ...config, baseURL: 'https://qiuyun.example', rateLimit: false });
  const response = await secure.handler(new Request('https://qiuyun.example/api/auth/sign-in/username', { method: 'POST', headers: { Origin: 'https://qiuyun.example', 'Content-Type': 'application/json' }, body: JSON.stringify(admin) }));
  assert.equal(response.status, 200); assert.match(response.headers.get('set-cookie')!, /; Secure/i);
});
test('多个实例共享原子限流，重建实例不能重置', async () => {
  const instances = [createAuth(db, config), createAuth(db, config)];
  const attempt = (instance: typeof auth) => instance.handler(new Request(`${config.baseURL}/api/auth/sign-in/username`, { method: 'POST', headers: { Origin: config.baseURL, 'Content-Type': 'application/json', 'x-forwarded-for': '192.0.2.31' }, body: JSON.stringify({ ...admin, password: 'fictional-wrong' }) }));
  const responses = await Promise.all(Array.from({ length: 8 }, (_, index) => attempt(instances[index % 2])));
  assert.equal(responses.filter(row => row.status === 401).length, 5); assert.equal(responses.filter(row => row.status === 429).length, 3);
  assert.equal((await attempt(createAuth(db, config))).status, 429);
});
test('请求权限覆盖旧入口、删除及未知写入，返回地址不能跳到外站', () => {
  for (const [path, method] of [['/business/settings','GET'], ['/api/stage-reviews/category-policies','POST'], ['/api/meeting-reviews/test','DELETE'], ['/api/stage-reviews/test','DELETE'], ['/api/operations-content/test/platform-note-id','POST'], ['/api/future-write','POST'], ['/api/operations-annual-plans/future/write','POST'], ['/api/operations-content/future/write','POST']]) assert.equal(requiresAdmin(path, method), true);
  for (const [path, method] of [['/api/operations-annual-plans','POST'],['/api/operations-content','POST'], ['/api/operations-content/test/publication','PATCH'], ['/api/promotion-daily/test','PATCH'], ['/api/operations-annual-plans/test/versions','GET'], ['/api/stage-reviews/test','PATCH']]) assert.equal(requiresAdmin(path, method), false);
  assert.throws(() => requireAdmin({ id: 'fictional', username: employee.username, role: 'employee' }));
  for (const target of ['https://evil.example/business/a', '//evil.example/business/a', '/login', '/business/../login']) assert.equal(safeReturnTo(target, config.baseURL), '/business/operations-schedule');
  assert.equal(safeReturnTo('/business/annual-plan?year=2027', config.baseURL), '/business/annual-plan?year=2027');
});

test('可配置写入的角色门禁与事务入口共用路径规则，尾斜杠不能绕过授权',()=>{
 for(const [path,method] of [['/api/operations-content','POST'],['/api/operations-content/example','PATCH'],['/api/operations-content/example','DELETE'],['/api/operations-content/example/publication','PATCH'],['/api/operations-content/example/delay-reasons','POST'],['/api/operations-content/example/change-requests','POST'],['/api/operations-content/versions/example/revisions','POST'],['/api/operations-annual-plans','POST'],['/api/operations-annual-plans/example','PATCH'],['/api/operations-annual-plans/example/restore','POST'],['/api/operations-annual-plans/year/2027','PATCH'],['/api/operations-annual-plans/year/2027/copy','POST']]){
  for(const suffix of ['', '/']){assert.equal(isConfigurableBusinessWrite(path+suffix,method),true);assert.equal(requiresAdmin(path+suffix,method),false);}
 }
 assert.equal(isConfigurableBusinessWrite('/api/operations-annual-plans/future/write','POST'),false);
});
