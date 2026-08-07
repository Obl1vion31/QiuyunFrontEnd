import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import {
  annualPlanIssues,
  buildAnnualPlanSnapshot,
  createAnnualPlanSchema,
  diffAnnualPlanSnapshots,
} from '../../db/annual-plan';
import { getDb } from '../../db/client';
import {
  operationsAnnualPlan,
  operationsAnnualPlanBlock,
  operationsAnnualPlanLink,
  operationsAnnualPlanVersion,
  operationsCategory,
  operationsSubject,
  operationsSubjectCategory,
} from '../../db/schema';

export const prerender = false;

export const POST: APIRoute = async ({ request, url, locals }) => {
  if (request.headers.get('origin') !== url.origin) return new Response('拒绝跨站写入。', { status: 403 });
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ message: '请求必须使用有效 JSON。' }, { status: 400 });
  }
  const result = createAnnualPlanSchema.safeParse(payload);
  if (!result.success) {
    return Response.json({ message: '请检查标记的字段。', fields: annualPlanIssues(result.error.issues) }, { status: 422 });
  }

  try {
    const created = await getDb().transaction(async (transaction) => {
      let subjectName: string | null = null;
      let categoryName: string | null = null;
      if (result.data.subjectId) {
        const [subject] = await transaction.select({ name: operationsSubject.name })
          .from(operationsSubject).where(eq(operationsSubject.id, result.data.subjectId)).limit(1);
        if (!subject) return { kind: 'invalid-context' as const };
        subjectName = subject.name;
      }
      if (result.data.categoryId && result.data.subjectId) {
        const [category] = await transaction.select({ name: operationsCategory.name })
          .from(operationsSubjectCategory)
          .innerJoin(operationsCategory, eq(operationsSubjectCategory.categoryId, operationsCategory.id))
          .where(and(
            eq(operationsSubjectCategory.subjectId, result.data.subjectId),
            eq(operationsSubjectCategory.categoryId, result.data.categoryId),
          )).limit(1);
        if (!category) return { kind: 'invalid-context' as const };
        categoryName = category.name;
      }
      const snapshot = buildAnnualPlanSnapshot(result.data, { subjectName, categoryName });
      const [plan] = await transaction.insert(operationsAnnualPlan).values({
        year: result.data.year,
        sectionKey: result.data.sectionKey,
        sectionLabel: result.data.sectionLabel,
        subjectId: result.data.subjectId,
        rowName: result.data.rowName,
        categoryId: result.data.categoryId,
        note: result.data.note,
        sortOrder: result.data.sortOrder,
        isActive: result.data.isActive,
        countsTowardPromotion: result.data.countsTowardPromotion,
      }).returning({ id: operationsAnnualPlan.id });
      if (result.data.blocks.length) {
        await transaction.insert(operationsAnnualPlanBlock).values(result.data.blocks.map((block) => ({
          planId: plan.id,
          startMonth: block.startMonth,
          endMonth: block.endMonth,
          label: block.label,
          ruleType: block.ruleType,
          monthlyFrequency: block.ruleType === 'flexible' ? block.monthlyFrequency : null,
          quantityParts: block.ruleType === 'fixed' ? block.quantityParts : null,
          note: block.note,
          sortOrder: block.sortOrder,
        })));
      }
      if (result.data.links.length) {
        await transaction.insert(operationsAnnualPlanLink).values(result.data.links.map((link) => ({
          planId: plan.id,
          label: link.label,
          url: link.url,
          sortOrder: link.sortOrder,
        })));
      }
      await transaction.insert(operationsAnnualPlanVersion).values({
        planId: plan.id,
        versionNumber: 0,
        snapshot,
        changeSummary: result.data.changeSummary,
        diffSummary: diffAnnualPlanSnapshots(null, snapshot),
        changedByLabel: locals.operationsUser ?? 'unknown',
      });
      return { kind: 'created' as const, id: plan.id };
    });
    if (created.kind === 'invalid-context') {
      return Response.json({ message: '学科或帖子分类关系无效。' }, { status: 422 });
    }
    return Response.json({ ok: true, id: created.id, version: 0 }, { status: 201 });
  } catch (error) {
    const postgresError = error as { code?: string };
    if (postgresError.code === '23505') {
      return Response.json({ message: '该年度和分区中已经存在同名规划行。' }, { status: 409 });
    }
    console.error('annual plan row insert failed', error);
    return Response.json({ message: '数据库暂时不可用，请稍后重试。' }, { status: 503 });
  }
};
