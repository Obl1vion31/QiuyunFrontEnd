import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
import { validateDatabaseTarget } from './src/db/database-target';

if (!process.env.DATABASE_URL) {
  throw new Error('缺少 DATABASE_URL，请先准备独立开发环境。');
}
const target=validateDatabaseTarget(process.env.DATABASE_URL,process.env);

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: target },
  strict: true,
  verbose: true,
});
