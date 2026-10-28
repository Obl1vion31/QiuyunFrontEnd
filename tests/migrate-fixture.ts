import {readFile} from 'node:fs/promises';
import type { PGlite } from '@electric-sql/pglite';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../src/db/schema';
import { subjects, postCategories, subjectCategoryMappings } from '../src/db/taxonomy';

export async function migrateFixture(pg: PGlite) {
  // 历史迁移含特定导入批次的数量断言，不适用于空库；隔离库先建立当前业务结构，再验证新认证 SQL。
  const business = schema;
  const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(business));
  await pg.exec('BEGIN');
  try {
    for (const statement of statements) await pg.exec(statement);
    const identifiers=await readFile(new URL('../drizzle/0042_account_login_identifiers.sql',import.meta.url),'utf8');
    for(const statement of identifiers.split('--> statement-breakpoint').filter(s=>/^\s*CREATE (?:OR REPLACE FUNCTION|TRIGGER)/.test(s)))await pg.exec(statement);
    const db = drizzle(pg);
    await db.insert(schema.operationsSubject).values(subjects.map((row, index) => ({ ...row, sortOrder: index * 10 })));
    await db.insert(schema.operationsCategory).values(postCategories.map((row, index) => ({ ...row, sortOrder: index * 10 })));
    await db.insert(schema.operationsSubjectCategory).values([...subjectCategoryMappings]);
    await pg.exec('COMMIT');
  } catch (error) { await pg.exec('ROLLBACK'); throw error; }
}
