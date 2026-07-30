import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import {
  annualPlanIssues,
  buildAnnualPlanSnapshot,
  diffAnnualPlanSnapshots,
  snapshotsEqual,
  updateAnnualPlanSchema,
} from '../../../db/annual-plan';
import { getDb } from '../../../db/client';
import {
  operationsAnnualPlan,
  operationsAnnualPlanBlock,
  operationsAnnualPlanLink,
  operationsAnnualPlanVersion,
  operationsCategory,
  operationsSubject,
  operationsSubjectCategory,
} from '../../../db/schema';

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request, url, locals }) => {
  if (request.headers.get('origin') !== url.origin) return new Response('拒绝跨站写入。', { status: 403 });
  if (!params.id) return Response.json({ message: '缺少规划行编号。' }, { status: 400 });
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ message: '请求必须使用有效 JSON。' }, { status: 400 });
  }
  const result = updateAnnualPlanSchema.safeParse(payload);
  if (!result.success) {
    return Response.json({ message: '请检查标记的字段。', fields: annualPlanIssues(result.error.issues) }, { status: 422 });
  }

  try {
    const saved = await getDb().transaction(async (transaction) => {
      const [current] = await transaction.select({
        id: operationsAnnualPlan.id,
        version: operationsAnnualPlan.currentVersionNumber,
      }).from(operationsAnnualPlan).where(eq(operationsAnnualPlan.id, params.id!)).limit(1);
      if (!current) return { kind: 'missing' as const };
      if (current.version !== result.data.expectedVersionNumber) {
        return { kind: 'conflict' as const, version: current.version };
      }

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
      const nextSnapshot = buildAnnualPlanSnapshot(result.data, { subjectName, categoryName });
      const [previousVersion] = await transaction.select({ snapshot: operationsAnnualPlanVersion.snapshot })
        .from(operationsAnnualPlanVersion).where(and(
          eq(operationsAnnualPlanVersion.planId, current.id),
          eq(operationsAnnualPlanVersion.versionNumber, current.version),
        )).limit(1);
      if (previousVersion && snapshotsEqual(previousVersion.snapshot, nextSnapshot)) {
        return { kind: 'unchanged' as const, version: current.version };
      }

      const nextVersion = current.version + 1;
      const [updated] = await transaction.update(operationsAnnualPlan).set({
        year: result.data.year,
        sectionKey: result.data.sectionKey,
        sectionLabel: result.data.sectionLabel,
        subjectId: result.data.subjectId,
        rowName: result.data.rowName,
        categoryId: result.data.categoryId,
        courseName: null,
        note: result.data.note,
        sortOrder: result.data.sortOrder,
        isActive: result.data.isActive,
        countsTowardPromotion: result.data.countsTowardPromotion,
        currentVersionNumber: nextVersion,
        updatedAt: new Date(),
      }).where(and(
        eq(operationsAnnualPlan.id, current.id),
        eq(operationsAnnualPlan.currentVersionNumber, result.data.expectedVersionNumber),
      )).returning({ id: operationsAnnualPlan.id });
      if (!updated) return { kind: 'conflict' as const, version: current.version };

      await transaction.delete(operationsAnnualPlanBlock).where(eq(operationsAnnualPlanBlock.planId, current.id));
      await transaction.delete(operationsAnnualPlanLink).where(eq(operationsAnnualPlanLink.planId, current.id));
      if (result.data.blocks.length) {
        await transaction.insert(operationsAnnualPlanBlock).values(result.data.blocks.map((block) => ({
          planId: current.id,
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
          planId: current.id,
          label: link.label,
          url: link.url,
          sortOrder: link.sortOrder,
        })));
      }
      await transaction.insert(operationsAnnualPlanVersion).values({
        planId: current.id,
        versionNumber: nextVersion,
        snapshot: nextSnapshot,
        changeSummary: result.data.changeSummary,
        diffSummary: diffAnnualPlanSnapshots(previousVersion?.snapshot ?? null, nextSnapshot),
        changedByLabel: locals.operationsUser ?? 'unknown',
      });
      return { kind: 'saved' as const, version: nextVersion };
    });

    if (saved.kind === 'missing') return Response.json({ message: '没有找到这条规划行。' }, { status: 404 });
    if (saved.kind === 'invalid-context') return Response.json({ message: '学科或帖子分类关系无效。' }, { status: 422 });
    if (saved.kind === 'conflict') {
      return Response.json({ message: `规划行已更新到 V${saved.version}，请刷新后重试。` }, { status: 409 });
    }
    return Response.json({ ok: true, version: saved.version, unchanged: saved.kind === 'unchanged' });
  } catch (error) {
    const postgresError = error as { code?: string };
    if (postgresError.code === '23505') {
      return Response.json({ message: '该年度和分区中已经存在同名规划行。' }, { status: 409 });
    }
    console.error('annual plan row update failed', error);
    return Response.json({ message: '数据库暂时不可用，请稍后重试。' }, { status: 503 });
  }
};
