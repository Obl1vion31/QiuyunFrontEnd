import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getDefaultAutoSelectFamilyAttemptTimeout, setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

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
  const url = process.env.DATABASE_URL || import.meta.env?.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL_NOT_CONFIGURED');
  database ??= createDatabase(url);
  return database.db;
}
