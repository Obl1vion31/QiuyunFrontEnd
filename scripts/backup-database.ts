/** 只读备份，不打印业务事实；目标必须位于被忽略的本机工具目录。 */
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { createDatabase } from '../src/db/client';
import { sql } from 'drizzle-orm';
if (!process.env.DATABASE_URL) throw new Error('请配置目标数据库 DATABASE_URL。');
const path = resolve(process.argv[2] || `.tools/backups/database-${Date.now()}.json`);
if (!path.startsWith(resolve('.tools/backups') + '/')) throw new Error('备份只允许保存到 .tools/backups/。');
const database = createDatabase(process.env.DATABASE_URL);
try {
  const tables = await database.db.transaction(async tx => {
    await tx.execute(sql`set transaction isolation level repeatable read read only`);
    const names = await tx.execute<{ table_name: string }>(sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`);
    const result: Record<string, { rows: string[]; digest: string }> = {};
    for (const { table_name: name } of names) {
      const rows = await tx.execute<{ json: string }>(sql`select row_to_json(t)::text as json from ${sql.identifier(name)} t`);
      const values = rows.map(row => row.json).sort();
      result[name] = { rows: values, digest: createHash('sha256').update(values.join('\n')).digest('hex') };
    }
    return result;
  });
  await mkdir(resolve('.tools/backups'), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify({ format: 1, createdAt: new Date().toISOString(), tables }), { mode: 0o600 });
  console.log(`私有备份已保存：${path}；${Object.keys(tables).length} 张表。`);
} finally { await database.close(); }
