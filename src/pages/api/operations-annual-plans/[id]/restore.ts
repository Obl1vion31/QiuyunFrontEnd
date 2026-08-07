import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import {
  buildAnnualPlanSnapshot,
  createAnnualPlanSchema,
  diffAnnualPlanSnapshots,
  restoreAnnualPlanSchema,
} from '../../../../db/annual-plan';
import { getDb } from '../../../../db/client';
import {
  operationsAnnualPlan,
  operationsAnnualPlanBlock,
  operationsAnnualPlanLink,
  operationsAnnualPlanVersion,
  operationsCategory,
  operationsSubject,
  operationsSubjectCategory,
} from '../../../../db/schema';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, url, locals }) => {
  if (request.headers.get('origin') !== url.origin) return new Response('拒绝跨站写入。', { status: 403 });
  if (!params.id) return Response.json({ message: '缺少规划行编号。' }, { status: 400 });
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ message: '请求必须使用有效 JSON。' }, { status: 400 });
  }
  const parsed = restoreAnnualPlanSchema.safeParse(payload);
  if (!parsed.success) return Response.json({ message: '恢复参数无效。' }, { status: 422 });

  try {
    const restored = await getDb().transaction(async (transaction) => {
      const [current] = await transaction.select({ version: operationsAnnualPlan.currentVersionNumber })
        .from(operationsAnnualPlan).where(eq(operationsAnnualPlan.id, params.id!)).limit(1);
      if (!current) return { kind: 'missing' as const };
      if (current.version !== parsed.data.expectedVersionNumber) {
        return { kind: 'conflict' as const, version: current.version };
      }
      const [source] = await transaction.select({ snapshot: operationsAnnualPlanVersion.snapshot })
        .from(operationsAnnualPlanVersion).where(and(
          eq(operationsAnnualPlanVersion.planId, params.id!),
          eq(operationsAnnualPlanVersion.versionNumber, parsed.data.versionNumber),
        )).limit(1);
      if (!source) return { kind: 'missing-version' as const };
      const [currentVersion] = await transaction.select({ snapshot: operationsAnnualPlanVersion.snapshot })
        .from(operationsAnnualPlanVersion).where(and(
          eq(operationsAnnualPlanVersion.planId, params.id!),
          eq(operationsAnnualPlanVersion.versionNumber, current.version),
        )).limit(1);

      const usesLegacyInterviewGuide = source.snapshot.row.subjectId === 'interview'
        && source.snapshot.row.categoryId === 'exam-guide';
      const restoredCandidate = {
        year: source.snapshot.row.year,
        sectionKey: source.snapshot.row.sectionKey,
        sectionLabel: source.snapshot.row.sectionLabel,
        subjectId: source.snapshot.row.subjectId,
        rowName: source.snapshot.row.rowName,
        categoryId: usesLegacyInterviewGuide
          ? 'interview-preparation-guide'
          : source.snapshot.row.categoryId,
        note: source.snapshot.row.note,
        sortOrder: source.snapshot.row.sortOrder,
        isActive: source.snapshot.row.isActive,
        countsTowardPromotion: source.snapshot.row.countsTowardPromotion ?? false,
        blocks: source.snapshot.blocks.map((block) => block.ruleType === 'flexible'
          ? { ...block, ruleType: 'flexible' as const, monthlyFrequency: block.monthlyFrequency!, quantityParts: null }
          : block.ruleType === 'fixed'
            ? { ...block, ruleType: 'fixed' as const, monthlyFrequency: null, quantityParts: block.quantityParts! }
            : { ...block, ruleType: null, monthlyFrequency: null, quantityParts: null }),
        links: source.snapshot.links,
        changeSummary: usesLegacyInterviewGuide
          ? `恢复自 V${parsed.data.versionNumber}（旧分类自动映射为面试准备须知）`
          : `恢复自 V${parsed.data.versionNumber}`,
      };
      const validated = createAnnualPlanSchema.safeParse(restoredCandidate);
      if (!validated.success) return { kind: 'invalid-snapshot' as const };

      let subjectName: string | null = null;
      let categoryName: string | null = null;
      if (validated.data.subjectId) {
        const [subject] = await transaction.select({ name: operationsSubject.name })
          .from(operationsSubject).where(eq(operationsSubject.id, validated.data.subjectId)).limit(1);
        if (!subject) return { kind: 'invalid-context' as const };
        subjectName = subject.name;
      }
      if (validated.data.categoryId && validated.data.subjectId) {
        const [category] = await transaction.select({ name: operationsCategory.name })
          .from(operationsSubjectCategory)
          .innerJoin(operationsCategory, eq(operationsSubjectCategory.categoryId, operationsCategory.id))
          .where(and(
            eq(operationsSubjectCategory.subjectId, validated.data.subjectId),
            eq(operationsSubjectCategory.categoryId, validated.data.categoryId),
          )).limit(1);
        if (!category) return { kind: 'invalid-context' as const };
        categoryName = category.name;
      }
      const nextSnapshot = buildAnnualPlanSnapshot(validated.data, { subjectName, categoryName });
      const nextVersion = current.version + 1;
      const [updated] = await transaction.update(operationsAnnualPlan).set({
        year: validated.data.year,
        sectionKey: validated.data.sectionKey,
        sectionLabel: validated.data.sectionLabel,
        subjectId: validated.data.subjectId,
        rowName: validated.data.rowName,
        categoryId: validated.data.categoryId,
        courseName: null,
        note: validated.data.note,
        sortOrder: validated.data.sortOrder,
        isActive: validated.data.isActive,
        countsTowardPromotion: validated.data.countsTowardPromotion,
        currentVersionNumber: nextVersion,
        updatedAt: new Date(),
      }).where(and(
        eq(operationsAnnualPlan.id, params.id!),
        eq(operationsAnnualPlan.currentVersionNumber, parsed.data.expectedVersionNumber),
      )).returning({ id: operationsAnnualPlan.id });
      if (!updated) return { kind: 'conflict' as const, version: current.version };

      await transaction.delete(operationsAnnualPlanBlock).where(eq(operationsAnnualPlanBlock.planId, params.id!));
      await transaction.delete(operationsAnnualPlanLink).where(eq(operationsAnnualPlanLink.planId, params.id!));
      if (validated.data.blocks.length) {
        await transaction.insert(operationsAnnualPlanBlock).values(validated.data.blocks.map((block) => ({
          planId: params.id!,
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
      if (validated.data.links.length) {
        await transaction.insert(operationsAnnualPlanLink).values(validated.data.links.map((link) => ({
          planId: params.id!,
          label: link.label,
          url: link.url,
          sortOrder: link.sortOrder,
        })));
      }
      await transaction.insert(operationsAnnualPlanVersion).values({
        planId: params.id!,
        versionNumber: nextVersion,
        snapshot: nextSnapshot,
        changeSummary: validated.data.changeSummary,
        diffSummary: diffAnnualPlanSnapshots(currentVersion?.snapshot ?? null, nextSnapshot),
        changedByLabel: locals.operationsUser ?? 'unknown',
      });
      return { kind: 'restored' as const, version: nextVersion };
    });

    if (restored.kind === 'missing') return Response.json({ message: '没有找到这条规划行。' }, { status: 404 });
    if (restored.kind === 'missing-version') return Response.json({ message: '没有找到这个历史版本。' }, { status: 404 });
    if (restored.kind === 'invalid-snapshot') return Response.json({ message: '历史快照不符合当前规划规则。' }, { status: 409 });
    if (restored.kind === 'invalid-context') return Response.json({ message: '历史版本使用的学科或分类关系已失效。' }, { status: 409 });
    if (restored.kind === 'conflict') {
      return Response.json({ message: `规划行已更新到 V${restored.version}，请刷新后重试。` }, { status: 409 });
    }
    return Response.json({ ok: true, version: restored.version });
  } catch (error) {
    const postgresError = error as { code?: string };
    if (postgresError.code === '23505') {
      return Response.json({ message: '恢复后的分区和规划项目名称与现有规划行冲突。' }, { status: 409 });
    }
    console.error('annual plan row restore failed', error);
    return Response.json({ message: '数据库暂时不可用，请稍后重试。' }, { status: 503 });
  }
};
