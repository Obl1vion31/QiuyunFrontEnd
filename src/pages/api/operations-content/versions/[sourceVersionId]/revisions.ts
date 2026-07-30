import type { APIRoute } from 'astro';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../../../../../db/client';
import {
  operationsContent,
  operationsContentSchedule,
  operationsContentVersion,
  operationsPromotionCampaign,
  operationsPromotionStage,
} from '../../../../../db/schema';
import { shanghaiDateKey } from '../../../../../db/promotion-rules.mjs';
import {
  issuesByField,
  normalizeCompletionStatus,
  revisionInputFromForm,
  revisionSchema,
} from '../../../../../db/validation';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, url }) => {
  const origin = request.headers.get('origin');
  if (!origin || origin !== url.origin) return new Response('拒绝跨站写入。', { status: 403 });
  if (!params.sourceVersionId) return Response.json({ message: '缺少来源版本。' }, { status: 400 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ message: '请求必须使用有效的表单格式。' }, { status: 400 });
  }
  const result = revisionSchema.safeParse(revisionInputFromForm(form));
  if (!result.success) {
    return Response.json({ message: '请检查标记的字段。', fields: issuesByField(result.error.issues) }, { status: 422 });
  }

  try {
    const created = await getDb().transaction(async (transaction) => {
      const [source] = await transaction.select({
        id: operationsContentVersion.id,
        contentId: operationsContentVersion.contentId,
        versionNumber: operationsContentVersion.versionNumber,
      }).from(operationsContentVersion)
        .where(eq(operationsContentVersion.id, params.sourceVersionId!))
        .limit(1);
      if (!source) return { kind: 'missing' as const };

      const [sourceSchedule] = await transaction.select({
        id: operationsContentSchedule.id,
        promotionStatus: operationsContentSchedule.promotionStatus,
      }).from(operationsContentSchedule).where(and(
        eq(operationsContentSchedule.id, result.data.sourceScheduleId),
        eq(operationsContentSchedule.contentVersionId, source.id),
      )).limit(1);
      if (!sourceSchedule) return { kind: 'missing-schedule' as const };

      const [latest] = await transaction.select({ versionNumber: operationsContentVersion.versionNumber })
        .from(operationsContentVersion)
        .where(eq(operationsContentVersion.contentId, source.contentId))
        .orderBy(desc(operationsContentVersion.versionNumber))
        .limit(1);
      if (latest && latest.versionNumber !== source.versionNumber) {
        return { kind: 'outdated-source' as const, latestVersionNumber: latest.versionNumber };
      }
      const nextVersionNumber = (latest?.versionNumber ?? source.versionNumber) + 1;

      const sourceClosingStatus = sourceSchedule.promotionStatus === 'testing'
        ? 'test_discarded'
        : sourceSchedule.promotionStatus === 'scaling'
          ? 'formal_discarded'
          : sourceSchedule.promotionStatus;
      if (sourceClosingStatus !== sourceSchedule.promotionStatus) {
        await transaction.update(operationsContentSchedule)
          .set({ promotionStatus: sourceClosingStatus, updatedAt: new Date() })
          .where(eq(operationsContentSchedule.id, sourceSchedule.id));
        const [activeCampaign] = await transaction.select({
          id: operationsPromotionCampaign.id,
          currentStage: operationsPromotionCampaign.currentStage,
        }).from(operationsPromotionCampaign)
          .where(eq(operationsPromotionCampaign.scheduleId, sourceSchedule.id))
          .orderBy(desc(operationsPromotionCampaign.createdAt))
          .limit(1);
        if (activeCampaign?.currentStage) {
          const endedOn = shanghaiDateKey(new Date());
          await transaction.update(operationsPromotionStage).set({
            endedOn,
            outcome: sourceClosingStatus,
            updatedAt: new Date(),
          }).where(and(
            eq(operationsPromotionStage.campaignId, activeCampaign.id),
            eq(operationsPromotionStage.stageType, activeCampaign.currentStage),
          ));
          await transaction.update(operationsPromotionCampaign).set({
            currentStage: null,
            currentStatus: sourceClosingStatus,
            endedOn,
            updatedAt: new Date(),
          }).where(eq(operationsPromotionCampaign.id, activeCampaign.id));
        }
      }

      const [version] = await transaction.insert(operationsContentVersion).values({
        contentId: source.contentId,
        versionNumber: nextVersionNumber,
        sourceVersionId: source.id,
        workType: 'revision',
        contentName: result.data.contentName,
        subjectId: result.data.subjectId,
        categoryId: result.data.categoryId,
        revisionSummary: result.data.revisionSummary,
        projectDocName: result.data.projectDocName,
        projectDocUrl: result.data.projectDocUrl,
      }).returning({ id: operationsContentVersion.id });

      const completionStatus = normalizeCompletionStatus(result.data);
      const promotionStatus = result.data.isPromoted
        ? result.data.actualPublishAt ? 'testing' : 'pending'
        : 'none';
      const [schedule] = await transaction.insert(operationsContentSchedule).values({
        contentVersionId: version.id,
        syncToMoments: result.data.syncToMoments,
        isPromoted: result.data.isPromoted,
        promotionStatus,
        plannedPublishAt: result.data.plannedPublishAt,
        actualPublishAt: result.data.actualPublishAt,
        completionStatus,
        delayReason: completionStatus === 'delayed' ? result.data.delayReason : null,
      }).returning({ id: operationsContentSchedule.id });
      if (result.data.isPromoted && result.data.actualPublishAt) {
        const startedOn = shanghaiDateKey(result.data.actualPublishAt);
        const [campaign] = await transaction.insert(operationsPromotionCampaign).values({
          scheduleId: schedule.id,
          startedOn,
          currentStage: 'testing',
          currentStatus: 'testing',
        }).returning({ id: operationsPromotionCampaign.id });
        await transaction.insert(operationsPromotionStage).values({
          campaignId: campaign.id,
          stageType: 'testing',
          startedOn,
        });
      }
      await transaction.update(operationsContent).set({ updatedAt: new Date() })
        .where(eq(operationsContent.id, source.contentId));
      return { kind: 'created' as const, scheduleId: schedule.id, versionNumber: nextVersionNumber };
    });

    if (created.kind === 'missing') return Response.json({ message: '没有找到来源版本。' }, { status: 404 });
    if (created.kind === 'missing-schedule') return Response.json({ message: '来源排期与版本不匹配。' }, { status: 409 });
    if (created.kind === 'outdated-source') {
      return Response.json({ message: `该帖子已有 V${created.latestVersionNumber}，请从最新版本发起改帖。` }, { status: 409 });
    }
    return Response.json({ ok: true, id: created.scheduleId, version: created.versionNumber }, { status: 201 });
  } catch (error) {
    const postgresError = error as { code?: string };
    if (postgresError.code === '23505') {
      return Response.json({ message: '该帖子已产生更新版本，请刷新后再发起改帖。' }, { status: 409 });
    }
    console.error('operations revision insert failed', error);
    return Response.json({ message: '数据库暂时不可用，请稍后重试。' }, { status: 503 });
  }
};
