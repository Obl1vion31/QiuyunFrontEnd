import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { drizzle } from 'drizzle-orm/pglite';
import { migrateFixture } from './migrate-fixture';
import { provisionAccount } from '../src/auth/provision';
import * as schema from '../src/db/schema';

export const admin = { username: 'test_admin', password: 'fictional-admin-password', role: 'admin' as const };
export const employee = { username: 'test_employee', password: 'fictional-employee-password', role: 'employee' as const };
export async function startFixture() {
  const pg = new PGlite(); const db = drizzle(pg, { schema });
  await migrateFixture(pg);
  await provisionAccount(db, admin); await provisionAccount(db, employee);
  const socket = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port: 0, maxConnections: 10 }); await socket.start();
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const address = probe.address(); assert.ok(address && typeof address === 'object');
  const port = address.port; await new Promise<void>(resolve => probe.close(() => resolve()));
  const baseURL = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['dist/server/entry.mjs'], { env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), NODE_ENV: 'test', DATABASE_URL: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?max=1`, BETTER_AUTH_URL: baseURL, BETTER_AUTH_SECRET: 'fictional-browser-secret-at-least-32-characters' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', chunk => { logs += chunk; }); child.stderr.on('data', chunk => { logs += chunk; });
  const stop = async () => {
    if (child.exitCode === null && !child.signalCode) { child.kill('SIGTERM'); const timer = setTimeout(() => child.kill('SIGKILL'), 5000); await once(child, 'exit'); clearTimeout(timer); }
    await socket.stop();
    // socket 的 close 事件以 setImmediate 清理协议状态，先排空再关闭 Wasm 数据库。
    await new Promise<void>(resolve => setImmediate(resolve));
    await new Promise<void>(resolve => setImmediate(resolve));
    await pg.close();
  };
  try {
    for (let index = 0; index < 100; index++) {
      if (child.exitCode !== null) throw new Error(logs);
      try { if ((await fetch(`${baseURL}/api/auth/get-session`, { signal: AbortSignal.timeout(500) })).ok) return { pg, db, baseURL, stop, logs: () => logs }; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('隔离测试服务未启动：' + logs);
  } catch (error) { await stop(); throw error; }
}
