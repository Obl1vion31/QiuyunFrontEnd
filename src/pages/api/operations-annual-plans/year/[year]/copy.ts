import type { APIRoute } from 'astro';
import { copyAnnualPlanSchema } from '../../../../../db/annual-plan';
import { copyAnnualYear } from '../../../../../db/annual-plan-storage';
import { getDb } from '../../../../../db/client';
export const prerender = false;
export const POST: APIRoute = async ({ params, request, url, locals }) => {
  if (request.headers.get('origin') !== url.origin) return Response.json({ message: '拒绝跨站写入。' }, { status: 403 });
  let payload: unknown;
  try { payload = await request.json(); } catch { return Response.json({ message: '请求必须使用有效 JSON。' }, { status: 400 }); }
  const sourceYear = Number(params.year);
  const parsed = copyAnnualPlanSchema.safeParse(payload);
  if (!parsed.success || !Number.isInteger(sourceYear) || sourceYear < 2000 || sourceYear > 9999 || sourceYear === parsed.data.targetYear) {
    return Response.json({ message: '请选择与来源不同的有效目标年度。' }, { status: 422 });
  }
  try {
    const result = await copyAnnualYear(getDb(), sourceYear, parsed.data.targetYear, locals.operationsUser ?? 'unknown');
    if (result.kind === 'occupied') return Response.json({ message: '目标年度已有规划或年度说明，不能覆盖。' }, { status: 409 });
    if (result.kind === 'missing') return Response.json({ message: '来源年度还没有可复制的规划行。' }, { status: 404 });
    if (result.kind === 'invalid') return Response.json({ message: '来源规划存在无效区间，请先检查后再复制。' }, { status: 409 });
    return Response.json({ ok: true, year: parsed.data.targetYear, count: result.count }, { status: 201 });
  } catch (error) {
    console.error('annual plan year copy failed', error);
    return Response.json({ message: '数据库暂时不可用，请稍后重试。' }, { status: 503 });
  }
};
