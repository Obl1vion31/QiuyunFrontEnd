import { randomUUID } from 'node:crypto';
import { and, eq, getTableColumns, inArray, ne, sql } from 'drizzle-orm';
import type { Database } from './client';
import { annualPlanBlockValues, buildAnnualPlanSnapshot, createAnnualPlanSchema } from './annual-plan';
import { normalizeBlock } from './annual-plan-rules.mjs';
import { operationsAnnualPlan as plans, operationsAnnualPlanBlock as blocks, operationsAnnualPlanLink as links, operationsAnnualPlanVersion as versions, operationsAnnualPlanYear as years, operationsSubject, operationsCategory } from './schema';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** 年度复制与常规保存共用短事务锁，避免检查空年度后被并发新建插入。 */
export async function lockAnnualPlanWrites(transaction: Transaction) {
  await transaction.execute(sql`select pg_advisory_xact_lock(69741, 0)`);
}

export async function copyAnnualYear(database: Database, sourceYear: number, targetYear: number, changedByLabel: string) {
  return database.transaction(async transaction => {
    await lockAnnualPlanWrites(transaction);
    const [target] = await transaction.select({ id: plans.id }).from(plans).where(eq(plans.year, targetYear)).limit(1);
    const [targetInfo] = await transaction.select().from(years).where(eq(years.year, targetYear)).limit(1);
    if (target || targetInfo?.instructions?.trim()) return { kind: 'occupied' as const };
    const source = await transaction.select({ ...getTableColumns(plans), subjectName: operationsSubject.name, categoryName: operationsCategory.name })
      .from(plans).leftJoin(operationsSubject, eq(plans.subjectId, operationsSubject.id)).leftJoin(operationsCategory, eq(plans.categoryId, operationsCategory.id))
      .where(and(eq(plans.year, sourceYear), ne(plans.sectionKey, 'general')));
    if (!source.length) return { kind: 'missing' as const };
    const ids = source.map(row => row.id);
    const [sourceBlocks, sourceLinks, sourceInfo] = await Promise.all([
      transaction.select().from(blocks).where(inArray(blocks.planId, ids)),
      transaction.select().from(links).where(inArray(links.planId, ids)),
      transaction.select().from(years).where(eq(years.year, sourceYear)).limit(1),
    ]);
    const copies = source.map(row => {
      const input = createAnnualPlanSchema.safeParse({ ...row, year: targetYear,
        blocks: sourceBlocks.filter(block => block.planId === row.id).map(block => normalizeBlock(block, row.countsTowardPromotion)),
        links: sourceLinks.filter(link => link.planId === row.id), changeSummary: `复制自 ${sourceYear} 年`,
      });
      if (!input.success) return null;
      return { id: randomUUID(), snapshot: buildAnnualPlanSnapshot(input.data, row) };
    });
    if (copies.some(copy => !copy)) return { kind: 'invalid' as const };
    const valid = copies.filter(copy => copy !== null);
    await transaction.insert(years).values({ year: targetYear, instructions: sourceInfo[0]?.instructions ?? null })
      .onConflictDoUpdate({ target: years.year, set: { instructions: sourceInfo[0]?.instructions ?? null, updatedAt: new Date() } });
    await transaction.insert(plans).values(valid.map(({ id, snapshot }) => {
      const { subjectName, categoryName, ...row } = snapshot.row;
      return { ...row, id, currentVersionNumber: 0 };
    }));
    const copiedBlocks = valid.flatMap(({ id, snapshot }) => snapshot.blocks.map(block => annualPlanBlockValues(id, block)));
    if (copiedBlocks.length) await transaction.insert(blocks).values(copiedBlocks);
    const copiedLinks = valid.flatMap(({ id, snapshot }) => snapshot.links.map(link => ({ ...link, planId: id })));
    if (copiedLinks.length) await transaction.insert(links).values(copiedLinks);
    await transaction.insert(versions).values(valid.map(({ id, snapshot }) => ({ planId: id, versionNumber: 0, snapshot,
      changeSummary: `复制自 ${sourceYear} 年`, diffSummary: ['复制年度配置并创建规划行'], changedByLabel,
    })));
    return { kind: 'copied' as const, count: valid.length };
  });
}
