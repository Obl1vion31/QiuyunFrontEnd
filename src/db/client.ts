import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

let client: ReturnType<typeof postgres> | undefined;

export function getDb() {
  const url = import.meta.env.DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL_NOT_CONFIGURED');
  client ??= postgres(url, { max: 5, prepare: false });
  return drizzle(client);
}
