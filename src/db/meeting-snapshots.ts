/** 例会事实只由服务端读取；客户端只能传引用编号和人工文字。 */
import { asc, desc, eq, ne, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './client';
import { WorkflowError } from './schedule-workflow';
import { readCheckpointEvents } from './non-promotion-workflow';
import { addDays, shanghaiKey, sumPromotionMetrics } from './meeting-review-rules.mjs';
import { operationsContentSchedule as schedules, operationsContentVersion as versions, operationsSubject as subjects, operationsCategory as categories, operationsPromotionCampaign as campaigns, operationsPromotionDailyMetric as metrics, operationsNonPromotionReview as nonPromotions, operationsPromotionStageReviewVersion as stageVersions, operationsReviewActionItem as issues, operationsMeetingAttachment as attachments, operationsReviewMeeting as meetings, operationsReviewMeetingVersion as meetingVersions, type WeeklyMeetingDraft } from './schema';
import type { StageSnapshot } from './promotion-stage-reviews';
import {operationsReviewActionProgress as progress} from './schema';
export async function readOpenMeetingIssues(db:Database){
  const [items,updates]=await Promise.all([db.select().from(issues).where(ne(issues.status,'resolved')),db.select().from(progress).orderBy(desc(progress.createdAt))]);
  return items.map(item=>({id:item.id,problem:item.problem,conclusion:updates.find(p=>p.itemId===item.id)?.conclusion??'',status:item.status as 'pending'|'validating'|'paused'}));
}
const text = z.string().max(10000).default('');
export const meetingDraftSchema = z.object({
  workflowVersion:z.literal(5).optional(),candidatesConfirmed:z.boolean().default(false),
  hasRevisionDraft:z.boolean().optional(),
  finalizationStage:z.enum(['pre','post']).optional(),
  promotionDecisions:z.record(z.string(),z.enum(['restart_testing','testing','test_paused','test_pending','scaling','scaling_paused','test_discarded','formal_discarded','ended'])).default({}),
  nonPromotionInputs:z.record(z.string(),z.object({mode:z.enum(['record','skip']).optional(),editing:z.boolean().optional(),clickRate:z.string().max(100).optional(),threeSecondReadRate:z.string().max(100).optional(),recordedThrough:z.string().max(20).optional(),conclusion:text,platformNoteId:z.string().max(24).optional(),reason:z.string().max(500).optional()})).default({}),
  schemaVersion: z.union([z.literal(2), z.literal(3),z.literal(4)]), coreConclusion: text, nextAction: text,
  promotionSelections:z.array(z.string().min(1).max(200)).max(500).default([]),materialFingerprint:z.string().max(64).optional(),
  situation: text, strategy: text, temporaryNotes: text,
  promotionSnapshotIds: z.array(z.uuid()).max(20).default([]), attachmentIds: z.array(z.uuid()).max(20).default([]),
  temporaryLinks: z.array(z.object({ label: z.string().max(200), url: z.url().max(2000).refine(v => /^https?:\/\//i.test(v), '只支持 HTTP/HTTPS 链接') })).max(20).default([]),
  promotionInputs: z.record(z.string(), z.object({ confirmed:z.boolean().optional(), rateRange:z.object({from:z.iso.date(),through:z.iso.date()}).nullable().optional(),rateNeedsReview:z.boolean().optional(),clickRate: z.number().min(0).max(100).nullable(), recordedThrough: z.string().max(20), currentSituation: text, activeAction: text })),
  issues: z.array(z.object({ id: z.uuid().optional(), problem: z.string().trim().max(2000), conclusion: text, status: z.enum(['pending','validating','resolved','paused']) })).max(100),
  nonPromotionSelections: z.array(z.object({ scheduleId: z.uuid(), checkpointType: z.enum(['day_7','day_15']) })).max(500),
}).superRefine((v, ctx) => {
  for (const values of [v.promotionSelections, v.promotionSnapshotIds, v.attachmentIds, v.nonPromotionSelections.map(s => `${s.scheduleId}:${s.checkpointType}`), v.issues.flatMap(i => i.id ? [i.id] : [])]) if (values.length !== new Set(values).size) ctx.addIssue({ code: 'custom', message: '引用或勾选重复' });
});
export async function readMeetingMaterial(db: Database, meeting: typeof meetings.$inferSelect) {
  const [content, campaignRows, daily, reviews, checkpointEvents, priorVersions, meetingRows] = await Promise.all([
    db.select({ scheduleId: schedules.id, contentVersionId: versions.id, contentId: versions.contentId, versionNumber: versions.versionNumber, contentName: versions.contentName, subjectName: subjects.name, categoryId: versions.categoryId, categoryName: categories.name, projectDocUrl: versions.projectDocUrl, isPromoted: schedules.isPromoted, plannedPublishAt: schedules.plannedPublishAt, actualPublishAt: schedules.actualPublishAt }).from(schedules).innerJoin(versions, eq(schedules.contentVersionId, versions.id)).innerJoin(subjects, eq(versions.subjectId, subjects.id)).leftJoin(categories, eq(versions.categoryId, categories.id)),
    db.select().from(campaigns), db.select().from(metrics).orderBy(asc(metrics.metricDate)), db.select().from(nonPromotions), readCheckpointEvents(db), db.select().from(meetingVersions), db.select().from(meetings),
  ]);
  const previousCounts = new Map<string, number>();
  for (const m of meetingRows.filter(m => m.status === 'completed' && m.id !== meeting.id)) {
    const v = priorVersions.find(v => v.meetingId === m.id && v.versionNumber === m.currentVersionNumber);
    const selected = ((v?.snapshot as any)?.generated?.nonPromotions ?? []) as Array<{ scheduleId: string; checkpointType?: string; checkpoint?: number }>;
    for (const row of selected) { const key = `${row.scheduleId}:${row.checkpointType ?? `day_${row.checkpoint}`}`; previousCounts.set(key, (previousCounts.get(key) ?? 0) + 1); }
  }
  const activity = campaignRows.flatMap(c => {
    const active = daily.filter(m => m.campaignId === c.id && m.metricDate >= meeting.periodStart && m.metricDate <= meeting.periodEnd);
    const post = content.find(p => p.scheduleId === c.scheduleId);
    if (!active.length || !post) return [];
    return [{ campaignId: c.id, contentId: post.contentId, contentVersionId: post.contentVersionId, contentName: post.contentName, versionNumber: post.versionNumber, testingDays: active.filter(m => m.dailyStatus==='active'&&m.recordKind!=='test_residual'&&m.stageTypeSnapshot === 'testing').length, scalingDays: active.filter(m => m.dailyStatus==='active'&&m.recordKind!=='test_residual'&&m.stageTypeSnapshot === 'scaling').length, total: sumPromotionMetrics(active), metricIds: active.map(m => m.id) }];
  });
  const candidates = content.filter(p => !p.isPromoted && p.actualPublishAt).flatMap(p => {
    return (['day_7','day_15'] as const).flatMap(checkpointType => {
      const dueOn = addDays(shanghaiKey(p.actualPublishAt!), checkpointType === 'day_7' ? 7 : 15);
      if (dueOn > meeting.periodEnd || checkpointEvents.get(`${p.scheduleId}:${checkpointType}`)?.action === 'skip') return [];
      const review = reviews.find(r => r.scheduleId === p.scheduleId && r.checkpointType === checkpointType) ?? null;
      return [{ ...p, checkpointType, dueOn, recommended: dueOn >= meeting.periodStart, priorReviewCount: previousCounts.get(`${p.scheduleId}:${checkpointType}`) ?? 0, review, status: review ? 'completed' : 'pending' }];
    });
  });
  return { activity, candidates };
}
export async function assembleMeetingSnapshot(db: Database, meeting: typeof meetings.$inferSelect, draft: WeeklyMeetingDraft) {
  const material = await readMeetingMaterial(db, meeting);
  const citedIds = draft.promotionSnapshotIds ?? [];
  const cited = citedIds.length ? await db.select().from(stageVersions).where(inArray(stageVersions.id, citedIds)) : [];
  if (cited.length !== citedIds.length) throw new WorkflowError('引用的推广快照不存在，请重新选择。', 422);
  const promotionSnapshots = citedIds.map(id => { const row = cited.find(c => c.id === id)!; return { id: row.id, reviewId: row.reviewId, versionNumber: row.versionNumber, snapshot: row.snapshot as unknown as StageSnapshot }; });
  const selectedNonPromotions = draft.nonPromotionSelections.map(selection => {
    const row = material.candidates.find(p => p.scheduleId === selection.scheduleId && p.checkpointType === selection.checkpointType);
    if (!row) throw new WorkflowError('勾选的非推广节点尚未到期或已设为不复盘，请刷新后重新选择。');
    return row;
  });
  const ids = draft.attachmentIds ?? [];
  const media = ids.length ? await db.select({ id: attachments.id, meetingId: attachments.meetingId, name: attachments.name, mimeType: attachments.mimeType, byteLength: attachments.byteLength }).from(attachments).where(inArray(attachments.id, ids)) : [];
  if (media.length !== ids.length || media.some(a => a.meetingId !== meeting.id)) throw new WorkflowError('图片与当前会议不匹配。', 422);
  if (draft.issues.some(i => i.id)) {
    const known = await db.select({ id: issues.id }).from(issues).where(inArray(issues.id, draft.issues.flatMap(i => i.id ? [i.id] : [])));
    if (known.length !== draft.issues.filter(i => i.id).length) throw new WorkflowError('历史事项已更新，请刷新后重试。');
  }
  return { schemaVersion: 3, meeting: { id: meeting.id, name: meeting.name, periodStart: meeting.periodStart, periodEnd: meeting.periodEnd, meetingAt: meeting.meetingAt.toISOString() }, generated: { activity: material.activity, promotionSnapshots, nonPromotions: selectedNonPromotions, attachments: media }, draft };
}
