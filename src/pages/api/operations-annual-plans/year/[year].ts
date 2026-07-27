import type { APIRoute } from 'astro';
import { sql } from 'drizzle-orm';
import { annualPlanYearSchema } from '../../../../db/annual-plan';
import { getDb } from '../../../../db/client';
import { operationsAnnualPlanYear } from '../../../../db/schema';

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request, url }) => {
  if (request.headers.get('origin') !== url.origin) return new Response('拒绝跨站写入。', { status: 403 });
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ message: '请求必须使用有效 JSON。' }, { status: 400 });
  }
  const parsed = annualPlanYearSchema.safeParse({ ...(payload as object), year: Number(params.year) });
  if (!parsed.success) return Response.json({ message: '年度说明无效。' }, { status: 422 });
  try {
    await getDb().insert(operationsAnnualPlanYear).values({
      year: parsed.data.year,
      instructions: parsed.data.instructions,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: operationsAnnualPlanYear.year,
      set: { instructions: parsed.data.instructions, updatedAt: new Date() },
    });
    const [saved] = await getDb().select({
      year: operationsAnnualPlanYear.year,
      instructions: operationsAnnualPlanYear.instructions,
      updatedAt: operationsAnnualPlanYear.updatedAt,
    }).from(operationsAnnualPlanYear).where(sql`${operationsAnnualPlanYear.year} = ${parsed.data.year}`).limit(1);
    return Response.json({ ok: true, year: saved });
  } catch (error) {
    console.error('annual plan year update failed', error);
    return Response.json({ message: '数据库暂时不可用，请稍后重试。' }, { status: 503 });
  }
};
