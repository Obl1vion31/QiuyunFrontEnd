import {nonPromotionGroups} from './non-promotion-groups';
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { getDb } from './client';
import { operationsCategory, operationsCategoryPolicyVersion, operationsContent, operationsContentPerformanceMetric, operationsContentSchedule, operationsContentVersion, operationsNonPromotionReview, operationsNonPromotionCheckpointEvent, operationsSubject } from './schema';
import { checkpointsForPublishDate, nextReviewCheckpoint, reviewCheckpoints, shanghaiDateKey, summarizeRates } from './stage-review-rules.mjs';
import { readCheckpointEvents } from './non-promotion-workflow';
import { subjects, postCategories, subjectCategoryMappings } from './taxonomy';

/** SSR 与认证 GET 共用的读取口径；筛选不改变同学科、分类、轮次的样本池。 */
export async function readNonPromotionReview(url: URL) {
const today = shanghaiDateKey(new Date());
const names: Record<string,string> = { day_7: '首轮', day_15: '二轮' };
let loadError = '';
let schedules: Array<{ id:string; contentId:string; platformNoteId:string|null; actualPublishAt:Date; contentName:string; projectDocUrl:string|null; versionNumber:number; subjectId:string; subjectName:string; categoryId:string|null; categoryName:string|null }> = [];
let metrics: Array<typeof operationsContentPerformanceMetric.$inferSelect & {subjectId:string;categoryId:string|null}> = [];
let reviews: Array<typeof operationsNonPromotionReview.$inferSelect> = [];
let checkpointEvents = new Map<string, typeof operationsNonPromotionCheckpointEvent.$inferSelect>();
let policies: Array<typeof operationsCategoryPolicyVersion.$inferSelect> = [];

try {
  [schedules, metrics, reviews, policies, checkpointEvents] = await Promise.all([
    getDb().select({ id:operationsContentSchedule.id, contentId:operationsContent.id, platformNoteId:operationsContent.platformNoteId, actualPublishAt:operationsContentSchedule.actualPublishAt, contentName:operationsContentVersion.contentName, projectDocUrl:operationsContentVersion.projectDocUrl, versionNumber:operationsContentVersion.versionNumber, subjectId:operationsContentVersion.subjectId, subjectName:operationsSubject.name, categoryId:operationsContentVersion.categoryId, categoryName:operationsCategory.name }).from(operationsContentSchedule).innerJoin(operationsContentVersion,eq(operationsContentSchedule.contentVersionId,operationsContentVersion.id)).innerJoin(operationsContent,eq(operationsContentVersion.contentId,operationsContent.id)).innerJoin(operationsSubject,eq(operationsContentVersion.subjectId,operationsSubject.id)).leftJoin(operationsCategory,eq(operationsContentVersion.categoryId,operationsCategory.id)).where(and(eq(operationsContentSchedule.isPromoted,false),isNotNull(operationsContentSchedule.actualPublishAt))).orderBy(desc(operationsContentSchedule.actualPublishAt)) as Promise<typeof schedules>,
    getDb().select({ id:operationsContentPerformanceMetric.id,scheduleId:operationsContentPerformanceMetric.scheduleId,checkpointType:operationsContentPerformanceMetric.checkpointType,recordedThrough:operationsContentPerformanceMetric.recordedThrough,clickRate:operationsContentPerformanceMetric.clickRate,threeSecondReadRate:operationsContentPerformanceMetric.threeSecondReadRate,createdAt:operationsContentPerformanceMetric.createdAt,updatedAt:operationsContentPerformanceMetric.updatedAt,subjectId:operationsContentVersion.subjectId,categoryId:operationsContentVersion.categoryId }).from(operationsContentPerformanceMetric).innerJoin(operationsContentSchedule,eq(operationsContentPerformanceMetric.scheduleId,operationsContentSchedule.id)).innerJoin(operationsContentVersion,eq(operationsContentSchedule.contentVersionId,operationsContentVersion.id)).where(and(inArray(operationsContentPerformanceMetric.checkpointType,['day_7','day_15']),eq(operationsContentSchedule.isPromoted,false),isNotNull(operationsContentSchedule.actualPublishAt))),
    getDb().select().from(operationsNonPromotionReview).where(inArray(operationsNonPromotionReview.checkpointType,['day_7','day_15'])).orderBy(desc(operationsNonPromotionReview.reviewedAt)),
    getDb().select().from(operationsCategoryPolicyVersion).orderBy(desc(operationsCategoryPolicyVersion.versionNumber)),
    readCheckpointEvents(getDb()),
  ]);
} catch(error){ console.error('non-promotion review query failed',error); loadError='非推广复盘数据暂时不可用。请检查数据库连接和最新迁移。'; }

const reviewMap = new Map(reviews.map(row => [`${row.scheduleId}:${row.checkpointType}`, row]));
const metricMap = new Map(metrics.map(row => [`${row.scheduleId}:${row.checkpointType}`, row]));
const latestPolicy = new Map<string, typeof operationsCategoryPolicyVersion.$inferSelect>();
for (const policy of policies) if (policy.effectiveOn <= today && !latestPolicy.has(policy.categoryId)) latestPolicy.set(policy.categoryId, policy);
const selectedSubject = subjects.some(subject => subject.id === url.searchParams.get('subject')) ? url.searchParams.get('subject')! : '';
const categoryOptions = selectedSubject ? postCategories.filter(category => subjectCategoryMappings.some(mapping => mapping.subjectId === selectedSubject && mapping.categoryId === category.id)) : [];
const selectedCategory = categoryOptions.some(category => category.id === url.searchParams.get('category')) ? url.searchParams.get('category')! : '';
const rows = schedules.filter(row => (!row.categoryId || latestPolicy.get(row.categoryId)?.requiresNonPromotionReview !== false)
  && (!selectedSubject || row.subjectId === selectedSubject) && (!selectedCategory || row.categoryId === selectedCategory)).map(row => {
  const completed = reviewCheckpoints.filter(checkpoint => reviewMap.has(`${row.id}:${checkpoint.type}`)).map(checkpoint => checkpoint.type);
  const skipped = reviewCheckpoints.filter(checkpoint => checkpointEvents.get(`${row.id}:${checkpoint.type}`)?.action === 'skip').map(checkpoint => checkpoint.type);
  return { ...row, completed, skipped, next: nextReviewCheckpoint(row.actualPublishAt, [...completed, ...skipped], today), checkpoints: checkpointsForPublishDate(row.actualPublishAt) };
});
const pending = rows.filter(row => row.next);
const activeView = ['history','skipped'].includes(url.searchParams.get('view') ?? '') ? url.searchParams.get('view')! : 'pending';
const selectedRound = activeView === 'history' && ['day_7','day_15'].includes(url.searchParams.get('checkpoint') ?? '') ? url.searchParams.get('checkpoint')! : '';
const grouped = activeView === 'history' && url.searchParams.get('group') !== '0';
const viewHref = (view: string, key?: string) => {
  const query = new URLSearchParams({ view });
  if (selectedSubject) query.set('subject', selectedSubject);
  if (selectedCategory) query.set('category', selectedCategory);
  if (view === 'history') { if (selectedRound) query.set('checkpoint', selectedRound); query.set('group', url.searchParams.get('group') === '0' ? '0' : '1'); }
  if (key) query.set('row', key);
  return `?${query}`;
};
const tableRows = rows.flatMap(row => {
  const visible = activeView === 'pending' ? (row.next ? [row.next] : [])
    : reviewCheckpoints.filter(checkpoint => (activeView === 'history' ? row.completed : row.skipped).includes(checkpoint.type));
  return visible.filter(checkpoint => !selectedRound || checkpoint.type === selectedRound).map(checkpoint => {
    const key = `${row.id}:${checkpoint.type}`;
    const peers = metrics.filter(metric => metric.checkpointType === checkpoint.type && metric.subjectId === row.subjectId
      && metric.categoryId === row.categoryId && checkpointEvents.get(`${metric.scheduleId}:${metric.checkpointType}`)?.action !== 'skip');
    return { key, row, checkpoint, dueOn: row.checkpoints.find(item => item.type === checkpoint.type)!.dueOn!,
      metric: metricMap.get(key), review: reviewMap.get(key), event: checkpointEvents.get(key),
      click: summarizeRates(peers.map(metric => Number(metric.clickRate))), read: summarizeRates(peers.map(metric => Number(metric.threeSecondReadRate))) };
  });
});
const categoryGroups=nonPromotionGroups(tableRows);
const selectedGroup=categoryGroups.some(group=>group.key===url.searchParams.get('bucket'))?url.searchParams.get('bucket')!:null;
const selected = tableRows.find(row => row.key === url.searchParams.get('row'));
const baseHref = viewHref(activeView);

return { checkpointEvents, today, names, loadError, schedules, metrics, reviews, policies, latestPolicy, selectedSubject, categoryOptions, selectedCategory, rows, pending, activeView, selectedRound, grouped, viewHref, tableRows, selected, baseHref,categoryGroups,selectedGroup };
}
