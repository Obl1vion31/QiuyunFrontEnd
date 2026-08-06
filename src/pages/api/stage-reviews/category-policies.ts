import type { APIRoute } from 'astro';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../../db/client';
import { operationsCategory, operationsCategoryPolicyVersion } from '../../../db/schema';
import { formObject, issuesByField } from '../../../db/stage-review-validation';

export const prerender = false;

const schema = z.object({
  categoryId: z.string().trim().min(1, '请选择分类'),
  displayName: z.string().trim().min(1, '请填写显示名称').max(100, '名称过长'),
  defaultIsPromoted: z.string().optional().transform((value) => value === 'on'),
  isSelectable: z.string().optional().transform((value) => value === 'on'),
  effectiveOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '请选择生效日期'),
  changeSummary: z.string().trim().min(1, '请填写变更说明').max(500, '变更说明过长'),
});

export const POST: APIRoute = async ({ request, url, locals }) => {
  if (request.headers.get('origin') !== url.origin) return new Response('拒绝跨站写入。', { status: 403 });
  let form: FormData;
  try { form = await request.formData(); } catch { return Response.json({ message: '请求必须使用有效表单。' }, { status: 400 }); }
  const result = schema.safeParse(formObject(form));
  if (!result.success) return Response.json({ message: '请检查分类规则。', fields: issuesByField(result.error.issues) }, { status: 422 });
  try {
    const saved = await getDb().transaction(async (transaction) => {
      const [category] = await transaction.select({ id: operationsCategory.id }).from(operationsCategory).where(eq(operationsCategory.id, result.data.categoryId)).limit(1);
      if (!category) return null;
      const [latest] = await transaction.select({ versionNumber: operationsCategoryPolicyVersion.versionNumber })
        .from(operationsCategoryPolicyVersion).where(eq(operationsCategoryPolicyVersion.categoryId, category.id))
        .orderBy(desc(operationsCategoryPolicyVersion.versionNumber)).limit(1);
      const [policy] = await transaction.insert(operationsCategoryPolicyVersion).values({
        ...result.data,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        changedByLabel: locals.operationsUser || 'unknown',
      }).returning({ id: operationsCategoryPolicyVersion.id });
      return policy;
    });
    if (!saved) return Response.json({ message: '没有找到这个帖子分类。' }, { status: 404 });
    return Response.json({ ok: true, id: saved.id }, { status: 201 });
  } catch (error) {
    console.error('category policy create failed', error);
    return Response.json({ message: '数据库暂时不可用，请稍后重试。' }, { status: 503 });
  }
};
