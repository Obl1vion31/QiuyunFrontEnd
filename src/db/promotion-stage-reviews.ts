import {promotionTotals} from './promotion-overview';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './client';
import { readPromotionContext } from './promotion-pauses';
import { campaignPauseWindows, campaignWaitWindows, dateInWindows, promotionStateOn } from './promotion-state.mjs';
import { nextDateKey,previousDateKey, shanghaiDateKey } from './promotion-rules.mjs';
import { businessDate } from './promotion-wait-ranges';
import { WorkflowError } from './schedule-workflow';
import { operationsContentVersion as versions, operationsContentSchedule as schedules, operationsSubject as subjects, operationsCategory as categories, operationsPromotionDailyMetric as metrics, operationsPromotionStageReview as reviews, operationsPromotionStageReviewVersion as snapshots } from './schema';

export interface StageFact { id: string; metricDate: string; dailyStatus: string; stageTypeSnapshot: string; spend: string | number; platformOpenCount: number; actualOpenCount: number; platformLeadCount: number; actualLeadCount: number; reviewDecision: string; note?: string | null;actualStatusSnapshot?:string|null;recordKind?:string;sourceStageStartedOn?:string|null }
export interface StageRow {
  key: string; campaignId: string; scheduleId: string; contentVersionId: string; contentId: string; contentName: string; versionNumber: number; subjectName: string; categoryName: string | null; projectDocUrl: string | null;
  stageType: string; startedOn: string; endedOn: string; originalStageStartedOn?:string;additionOnly?:boolean;facts: StageFact[]; missingDates: string[];
  spend: number | null; platformOpenCount: number | null; actualOpenCount: number | null; platformLeadCount: number | null; actualLeadCount: number | null; actualOpenCost: number | null; actualLeadCost: number | null;
}
export interface StageSnapshot { schemaVersion: 1 | 2; name: string; periodStart: string; periodEnd: string; generatedAt: string; rows: StageRow[] }
export const stageSnapshotSchema = z.object({ name: z.string().trim().max(120).default(''), periodStart: businessDate, periodEnd: businessDate, requestKey: z.uuid(), expectedVersion: z.number().int().min(0).optional() }).superRefine((v, ctx) => {
  if (v.periodEnd < v.periodStart) ctx.addIssue({ code: 'custom', path: ['periodEnd'], message: '结束日不能早于开始日' });
  if (v.periodEnd >= shanghaiDateKey(new Date())) ctx.addIssue({ code: 'custom', path: ['periodEnd'], message: '请选择今天以前的数据区间' });
});
export function aggregateStageRows(input: { campaignId: string; metadata: Omit<StageRow, 'key'|'campaignId'|'stageType'|'startedOn'|'endedOn'|'facts'|'missingDates'|'spend'|'platformOpenCount'|'actualOpenCount'|'platformLeadCount'|'actualLeadCount'|'actualOpenCost'|'actualLeadCost'>; stages: Array<{ stageType: string; startedOn: string; endedOn: string | null }>; metrics: StageFact[]; windows: Array<{ startedOn: string; endedOn: string }>; periodStart: string; periodEnd: string;phaseEnds?:{testing?:string;scaling?:string} }): StageRow[] {
  if(input.metrics.some(m=>m.sourceStageStartedOn))return aggregateAttributedStageRows(input);
  return input.stages.flatMap(stage => {
    if (stage.stageType === 'testing' && (!stage.endedOn || stage.endedOn < input.periodStart || stage.endedOn > input.periodEnd)) return [];
    const start = stage.stageType === 'testing' ? stage.startedOn : [stage.startedOn, input.periodStart].sort().at(-1)!;
    const end = stage.stageType === 'testing' ? stage.endedOn! : [stage.endedOn ?? input.periodEnd, input.periodEnd].sort()[0];
    if (start > end) return [];
    const facts = input.metrics.filter(m => m.stageTypeSnapshot === stage.stageType && m.metricDate >= start && m.metricDate <= end).map(m => ({ id: m.id, metricDate: m.metricDate, dailyStatus: m.dailyStatus, stageTypeSnapshot: m.stageTypeSnapshot, spend: m.spend, platformOpenCount: m.platformOpenCount, actualOpenCount: m.actualOpenCount, platformLeadCount: m.platformLeadCount, actualLeadCount: m.actualLeadCount, reviewDecision: m.reviewDecision, note: m.note ?? null }));
    const dates = new Set(facts.map(m => m.metricDate));
    const missingDates: string[] = [];
    for (let date = start; date <= end; date = nextDateKey(date)) if (!dateInWindows(date, input.windows) && !dates.has(date)) missingDates.push(date);
    if (!facts.length && !missingDates.length) return [];
    const sum = (key: 'spend'|'platformOpenCount'|'actualOpenCount'|'platformLeadCount'|'actualLeadCount') => facts.length ? Math.round(facts.reduce((n,m) => n + Number(m[key]),0) * 100) / 100 : null;
    const spend = sum('spend'), actualOpenCount = sum('actualOpenCount'), actualLeadCount = sum('actualLeadCount');
    return [{ ...input.metadata, key: `${input.campaignId}:${stage.stageType}:${stage.startedOn}`, campaignId: input.campaignId, stageType: stage.stageType, startedOn: start, endedOn: end, facts, missingDates, spend, actualOpenCount, actualLeadCount, platformOpenCount: sum('platformOpenCount'), platformLeadCount: sum('platformLeadCount'), actualOpenCost: spend != null && actualOpenCount ? Math.round(spend / actualOpenCount * 100) / 100 : null, actualLeadCost: spend != null && actualLeadCount ? Math.round(spend / actualLeadCount * 100) / 100 : null }];
  });
}

/** 新事实按稳定原阶段聚合；结束后产生的数据只进入其实际日期所属区间。 */
function aggregateAttributedStageRows(input:Parameters<typeof aggregateStageRows>[0]):StageRow[]{
 const origins=new Map<string,{stageType:string;startedOn:string}>();
 for(const stage of input.stages){const origin=input.metrics.find(m=>m.stageTypeSnapshot===stage.stageType&&m.sourceStageStartedOn)?.sourceStageStartedOn??input.stages.find(s=>s.stageType===stage.stageType)!.startedOn;origins.set(`${stage.stageType}:${origin}`,{stageType:stage.stageType,startedOn:origin});}
 for(const fact of input.metrics)if(fact.sourceStageStartedOn)origins.set(`${fact.stageTypeSnapshot}:${fact.sourceStageStartedOn}`,{stageType:fact.stageTypeSnapshot,startedOn:fact.sourceStageStartedOn});
 return [...origins.values()].flatMap(origin=>{
  const intervals=input.stages.filter(s=>s.stageType===origin.stageType);
  const lifecycleFacts=input.metrics.filter(m=>m.recordKind!=='test_residual'&&m.stageTypeSnapshot===origin.stageType&&m.metricDate<=input.periodEnd);
  const factEnds=lifecycleFacts.flatMap(m=>origin.stageType==='testing'?[...(['test_pending','test_discarded','start_scaling'].includes(m.reviewDecision)?[m.metricDate]:[]),...(m.actualStatusSnapshot==='test_pending'?[previousDateKey(m.metricDate)]:[]),...(m.actualStatusSnapshot==='test_discarded'?[m.metricDate]:[])]:['ended','formal_discarded'].includes(m.reviewDecision)?[m.metricDate]:[]);
  const ended=input.phaseEnds?.[origin.stageType as 'testing'|'scaling']??factEnds.sort()[0]??(origin.stageType==='scaling'&&!intervals.some(s=>!s.endedOn)?intervals.map(s=>s.endedOn!).sort().at(-1)??null:null);
  const completedInPeriod=origin.stageType==='testing'&&ended&&ended>=input.periodStart&&ended<=input.periodEnd;
  const related=input.metrics.filter(m=>m.stageTypeSnapshot===origin.stageType&&(m.sourceStageStartedOn??origin.startedOn)===origin.startedOn);
  const facts=related.filter(m=>completedInPeriod&&m.metricDate<=ended!||m.metricDate>=input.periodStart&&m.metricDate<=input.periodEnd&&(origin.stageType==='scaling'||m.metricDate>(ended??'9999-12-31')));
  const additionOnly=origin.stageType==='testing'&&!completedInPeriod;
  const start=completedInPeriod?origin.startedOn:[origin.startedOn,input.periodStart].sort().at(-1)!;
  const end=input.periodEnd;
  const missingDates:string[]=[];
  if(!additionOnly)for(const interval of intervals){const from=[interval.startedOn,start].sort().at(-1)!,to=[interval.endedOn??end,end].sort()[0];for(let date=from;date<=to;date=nextDateKey(date))if(!dateInWindows(date,input.windows)&&!related.some(m=>m.metricDate===date))missingDates.push(date);}
  if(!facts.length&&!missingDates.length)return [];
  const totals=promotionTotals(facts.map(f=>({...f,campaignId:input.campaignId,note:f.note??null})));
  return [{...input.metadata,key:`${input.campaignId}:${origin.stageType}:${origin.startedOn}${additionOnly?':additional':''}`,campaignId:input.campaignId,stageType:origin.stageType,startedOn:start,endedOn:end,originalStageStartedOn:origin.startedOn,additionOnly,facts,missingDates,...totals}];
 });
}

export async function generateStageSnapshot(db: Database, periodStart: string, periodEnd: string, name = ''): Promise<StageSnapshot> {
  const [context, daily, content] = await Promise.all([
    readPromotionContext(db), db.select().from(metrics).orderBy(asc(metrics.metricDate)),
    db.select({ scheduleId: schedules.id, contentVersionId: versions.id, contentId: versions.contentId, contentName: versions.contentName, versionNumber: versions.versionNumber, subjectName: subjects.name, categoryName: categories.name, projectDocUrl: versions.projectDocUrl }).from(schedules).innerJoin(versions, eq(schedules.contentVersionId, versions.id)).innerJoin(subjects, eq(versions.subjectId, subjects.id)).leftJoin(categories, eq(versions.categoryId, categories.id)),
  ]);
  const rows = context.campaigns.flatMap(campaign => {
    if (campaign.startedOn > periodEnd) return [];
    const metadata = content.find(c => c.scheduleId === campaign.scheduleId);
    if (!metadata) return [];
    const state = promotionStateOn(campaign, context, nextDateKey(periodEnd));
    if (!state) throw new WorkflowError('部分推广历史无法回放，请先核对日度记录。');
    const phaseEnds:{testing?:string;scaling?:string}={};
    const testEnds=[...context.stateChanges.filter(c=>c.campaignId===campaign.id&&c.businessDate<=periodEnd).flatMap(c=>c.actualStatus==='test_pending'||c.actualStatus==='scaling'?[previousDateKey(c.businessDate)]:c.actualStatus==='test_discarded'?[c.businessDate]:[])];
    if(testEnds.length)phaseEnds.testing=testEnds.sort()[0];
    return aggregateStageRows({ campaignId: campaign.id, metadata, phaseEnds,stages: state.stages, metrics: daily.filter(m => m.campaignId === campaign.id), windows: [...campaignPauseWindows(campaign, context), ...campaignWaitWindows(campaign, context), ...context.holds.filter(h => h.campaignId === campaign.id)], periodStart, periodEnd });
  });
  return { schemaVersion: 2, name: name || `${periodStart}—${periodEnd} 推广阶段复盘`, periodStart, periodEnd, generatedAt: new Date().toISOString(), rows };
}
export async function saveStageSnapshot(db: Database, input: z.infer<typeof stageSnapshotSchema>, actor: string, id?: string) {
  return db.transaction(async tx => {
    const [existing] = await tx.select().from(reviews).where(id ? eq(reviews.id, id) : eq(reviews.requestKey, input.requestKey)).for('update');
    if (!id && existing) return { id: existing.id, repeated: true };
    if (id && !existing) throw new WorkflowError('没有找到阶段复盘。', 404);
    if (existing && (existing.periodStart !== input.periodStart || existing.periodEnd !== input.periodEnd)) throw new WorkflowError('快照时间段已固定，请另存为新的阶段复盘。');
    const previous = existing ? await tx.select().from(snapshots).where(eq(snapshots.reviewId, existing.id)) : [];
    const currentVersion = Math.max(-1, ...previous.map(v => v.versionNumber));
    if (existing && currentVersion !== input.expectedVersion) throw new WorkflowError('快照版本已更新，请刷新后重试。');
    const snapshot = await generateStageSnapshot(tx, input.periodStart, input.periodEnd, existing?.name || input.name);
    const [review] = existing ? [existing] : await tx.insert(reviews).values({ requestKey: input.requestKey, name: snapshot.name, periodStart: input.periodStart, periodEnd: input.periodEnd, createdByLabel: actor }).returning();
    const [version] = await tx.insert(snapshots).values({ reviewId: review.id, versionNumber: currentVersion + 1, snapshot: snapshot as unknown as Record<string, unknown>, createdByLabel: actor }).returning();
    return { id: review.id, snapshotId: version.id, versionNumber: version.versionNumber };
  });
}
