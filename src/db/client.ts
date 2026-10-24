import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getDefaultAutoSelectFamilyAttemptTimeout, setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';
import { AsyncLocalStorage } from 'node:async_hooks';

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
// 审核复用原写入入口，并与申请状态使用同一外层事务；异步上下文按请求隔离。
const scopedDatabase = new AsyncLocalStorage<Database>();
export const withDatabase = <T>(db: Database, action: () => Promise<T>) => scopedDatabase.run(db, action);

export function createDatabase(url: string) {
  // 跨区域 TCP 建连常超过 Node 的默认单地址 250ms，保留已有的更长设置。
  setDefaultAutoSelectFamilyAttemptTimeout(Math.max(1000, getDefaultAutoSelectFamilyAttemptTimeout()));
  const max = Number(new URL(url).searchParams.get('max') ?? 3);
  if (!Number.isInteger(max) || max < 1) throw new Error('INVALID_DATABASE_POOL_SIZE');
  const client = postgres(url, { max, prepare: false, connect_timeout: 15, idle_timeout: 10 });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

let database: ReturnType<typeof createDatabase> | undefined;

export function getDb() {
  const scoped = scopedDatabase.getStore();
  if (scoped) return scoped;
  const url = process.env.DATABASE_URL || import.meta.env?.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL_NOT_CONFIGURED');
  database ??= createDatabase(url);
  return database.db;
}
