import 'dotenv/config';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDatabase } from '../src/db/client';
if (!process.env.DATABASE_URL) throw new Error('请配置目标数据库 DATABASE_URL。');
const database = createDatabase(process.env.DATABASE_URL);
try { await migrate(database.db, { migrationsFolder: './drizzle' }); console.log('数据库迁移完成。'); }
finally { await database.close(); }
