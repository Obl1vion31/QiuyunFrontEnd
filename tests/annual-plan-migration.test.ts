import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { normalizeBlock } from '../src/db/annual-plan-rules.mjs';

test('追加迁移兼容旧结构、旧写入和新半月约束', async () => {
  const pg = new PGlite();
  try {
    const snapshot = JSON.parse(await readFile('drizzle/meta/0026_snapshot.json', 'utf8'));
    for (const statement of await generateMigration(generateDrizzleJson({}), snapshot)) await pg.exec(statement);
    await pg.exec(`INSERT INTO operations_annual_plan (id, year, section_key, section_label, row_name) VALUES ('10000000-0000-4000-8000-000000000001',2026,'fictional','虚构','虚构迁移规划');
      INSERT INTO operations_annual_plan_block (plan_id,start_month,end_month,label,rule_type,monthly_frequency) VALUES ('10000000-0000-4000-8000-000000000001',3,9,'旧阶段','flexible',2);`);
    await pg.exec(await readFile('drizzle/0027_annual_plan_half_month.sql', 'utf8'));
    const result = await pg.query<any>('SELECT * FROM operations_annual_plan_block');
    const legacy = result.rows[0];
    assert.equal(legacy.start_slot, null); assert.equal(legacy.monthly_frequency, 2);
    assert.equal(normalizeBlock({ startMonth: legacy.start_month, endMonth: legacy.end_month, ruleType: legacy.rule_type, monthlyFrequency: legacy.monthly_frequency }, true).note, '每月 2 篇');
    // 迁移后的旧部署仍可写旧格式；新代码读取时进行兼容转换。
    await pg.exec(`INSERT INTO operations_annual_plan_block (plan_id,start_month,end_month,label) VALUES ('10000000-0000-4000-8000-000000000001',10,12,'旧客户端');`);
    await assert.rejects(pg.exec(`UPDATE operations_annual_plan_block SET start_slot=5,end_slot=25,promotion_ranges='[]'`));
    await pg.exec(`UPDATE operations_annual_plan_block SET start_slot=5,end_slot=17,promotion_ranges='[{"startSlot":5,"endSlot":6}]' WHERE label='旧阶段'`);
    assert.equal((await pg.query<any>(`SELECT end_slot FROM operations_annual_plan_block WHERE label='旧阶段'`)).rows[0].end_slot, 17);
  } finally { await pg.close(); }
});
