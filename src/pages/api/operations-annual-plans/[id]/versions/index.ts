import type { APIRoute } from 'astro';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '../../../../../db/client';
import { operationsAnnualPlan, operationsAnnualPlanVersion } from '../../../../../db/schema';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  if (!params.id) return Response.json({ message: '缺少规划编号。' }, { status: 400 });
  try {
    const [plan] = await getDb().select({ id: operationsAnnualPlan.id })
      .from(operationsAnnualPlan).where(eq(operationsAnnualPlan.id, params.id)).limit(1);
    if (!plan) return Response.json({ message: '没有找到这条规划。' }, { status: 404 });
    const versions = await getDb().select({
      versionNumber: operationsAnnualPlanVersion.versionNumber,
      changeSummary: operationsAnnualPlanVersion.changeSummary,
      diffSummary: operationsAnnualPlanVersion.diffSummary,
      changedByLabel: operationsAnnualPlanVersion.changedByLabel,
      createdAt: operationsAnnualPlanVersion.createdAt,
    }).from(operationsAnnualPlanVersion)
      .where(eq(operationsAnnualPlanVersion.planId, params.id))
      .orderBy(desc(operationsAnnualPlanVersion.versionNumber));
    return Response.json({ versions });
  } catch (error) {
    console.error('annual plan versions query failed', error);
    return Response.json({ message: '数据库暂时不可用，请稍后重试。' }, { status: 503 });
  }
};
