import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../../../../../db/client';
import { operationsAnnualPlanVersion } from '../../../../../db/schema';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const versionNumber = Number(params.versionNumber);
  if (!params.id || !Number.isInteger(versionNumber) || versionNumber < 0) {
    return Response.json({ message: '版本编号无效。' }, { status: 400 });
  }
  try {
    const [version] = await getDb().select({
      versionNumber: operationsAnnualPlanVersion.versionNumber,
      snapshot: operationsAnnualPlanVersion.snapshot,
      changeSummary: operationsAnnualPlanVersion.changeSummary,
      diffSummary: operationsAnnualPlanVersion.diffSummary,
      changedByLabel: operationsAnnualPlanVersion.changedByLabel,
      createdAt: operationsAnnualPlanVersion.createdAt,
    }).from(operationsAnnualPlanVersion).where(and(
      eq(operationsAnnualPlanVersion.planId, params.id),
      eq(operationsAnnualPlanVersion.versionNumber, versionNumber),
    )).limit(1);
    if (!version) return Response.json({ message: '没有找到这个历史版本。' }, { status: 404 });
    return Response.json({ version });
  } catch (error) {
    console.error('annual plan version query failed', error);
    return Response.json({ message: '数据库暂时不可用，请稍后重试。' }, { status: 503 });
  }
};
