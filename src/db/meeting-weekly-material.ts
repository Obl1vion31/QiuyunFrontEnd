/** 周例会 v4：实际日期候选、可核对的比较样本与不可变来源。 */
import { createHash } from 'node:crypto';
import { eq, asc, desc } from 'drizzle-orm';
import type { Database } from './client';
import { readPromotionContext } from './promotion-pauses';
import { promotionStateOn, promotionLabels } from './promotion-state.mjs';
import { nextDateKey, previousDateKey, shanghaiDateKey } from './promotion-rules.mjs';
import { promotionTotals, type PromotionFact } from './promotion-overview';
import { readCheckpointEvents } from './non-promotion-workflow';
import {checkpointsForPublishDate} from './stage-review-rules.mjs';
import {actualDataRange,type ActualDataRange} from './meeting-card-rules';
import { operationsContentSchedule as schedules, operationsContentVersion as versions, operationsSubject as subjects, operationsCategory as categories, operationsPromotionDailyMetric as daily, operationsContentPerformanceMetric as performance, operationsNonPromotionReview as reviews, operationsReviewMeeting as meetings, operationsReviewMeetingVersion as meetingVersions, operationsPromotionStage as stages, operationsCategoryPolicyVersion as policies } from './schema';
export const sourceHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v)).digest('hex');
export type MeetingRecord = typeof meetings.$inferSelect;
type Fact = typeof daily.$inferSelect;
type Totals = ReturnType<typeof promotionTotals>;
export type PreviousReview = {
    meetingId: string;
    name: string;
    versionNumber: number;
    periodEnd: string;
};
export interface Benchmark {
    n: number;
    days: number;
    spend?: number | null;
    actualOpenCost?: number | null;
    actualLeadCost?: number | null;
    clickRate?: number | null;
    threeSecondReadRate?: number | null;
    sourceKeys: string[];
    samples?: Array<Record<string, unknown>>;
}
export interface WeeklyPromotionCard {
    dataRange?:ActualDataRange;
    dailyStates?:Record<string,string>;
    currentStatus?:string;
    key: string;
    originKey: string;
    sourceHash: string;
    campaignId: string;
    scheduleId: string;
    contentId: string;
    versionNumber: number;
    contentName: string;
    subjectId: string;
    subjectName: string;
    categoryId: string | null;
    categoryName: string | null;
    stageType: 'testing' | 'scaling';
    startedOn: string;
    endedOn: string;
    kind: 'current' | 'supplement';
    label: string;
    events: Array<{
        date: string;
        lastTestingOn: string;
        label: string;
    }>;
    facts: Fact[];
    total: Totals;
    periodTotal: Totals;
    changes: Totals;
    missingDates: string[];
    previous: PreviousReview[];
    historical: Benchmark;
    peers: Benchmark;
    ownHistory: Array<{
        stageType?:string;
        periodLabel?:string;
        name: string;
        versionNumber: number;
        spend: number | null;
        actualOpenCost: number | null;
        actualLeadCost: number | null;
    }>;
}
export interface WeeklyNonPromotionCard {
    actualPublishAt?:Date|string|null;
    key: string;
    scheduleId: string;
    contentId: string;
    versionNumber: number;
    contentName: string;
    subjectId: string;
    subjectName: string;
    categoryId: string | null;
    categoryName: string | null;
    checkpointType: 'day_7' | 'day_15';
    publishedOn?:string;
    dueOn?:string;
    recordedThrough: string | null;
    firstRecordedAt: string | null;
    updatedAt: string | null;
    sourceHash: string;
    kind: 'current' | 'supplement';
    label: string;
    clickRate: number | null;
    threeSecondReadRate: number | null;
    conclusion: string;
    cause: string;
    nextAction: string;
    skipped: boolean;
    previous: PreviousReview[];
    historical: Benchmark;
    peers: Benchmark;
    ownHistory: Array<{
        versionNumber: number;
        recordedThrough: string | null;
        clickRate: number | null;
        threeSecondReadRate: number | null;
    }>;
}
export interface WeeklyMaterial {
    schemaVersion: 4;
    periodStart: string;
    periodEnd: string;
    fingerprint: string;
    summary: Totals & {
        posts: number;
        testingPosts: number;
        scalingPosts: number;
    };
    promotions: WeeklyPromotionCard[];
    nonPromotions: WeeklyNonPromotionCard[];
    nonPromotionContext: WeeklyNonPromotionCard[];
    excludedNonPromotions?:Array<{key:string;contentName:string;checkpointType:string;reason:string;eventId:string}>;
    pending: Array<{
        actualPublishAt?:Date|string|null;
        scheduleId?:string;
        recordedThrough?:string;
        publishedOn?:string;
        dueOn?:string;
        versionNumber?:number;
        key: string;
        contentName: string;
        checkpointType: string;
        reason: string;
    }>;
}
const emptyBenchmark = (): Benchmark => ({ n: 0, days: 0, sourceKeys: [] });
const between = (date: string, start: string, end: string) => date >= start && date <= end;
const iso = (value: Date | string | null | undefined) => value ? new Date(value).toISOString() : null;
const totals = (facts: Fact[]) => promotionTotals(facts as PromotionFact[]);
const benchPromotion = (rows: Array<{
    key: string;
    facts: Fact[];
}>, excluded: string): Benchmark => { const sample = rows.filter(r => r.key !== excluded && r.facts.length); const t = totals(sample.flatMap(r => r.facts)); return { n: sample.length, days: sample.reduce((n, r) => n + totals(r.facts).recordedDays, 0), spend: t.spend, actualOpenCost: t.actualOpenCost, actualLeadCost: t.actualLeadCost, sourceKeys: sample.map(r => r.key), samples: sample.map(r => ({ key: r.key, facts: r.facts })) }; };
const benchNon = (rows: WeeklyNonPromotionCard[], excluded: string): Benchmark => { const sample = rows.filter(r => r.key !== excluded && r.clickRate != null && r.threeSecondReadRate != null); return { n: sample.length, days: 0, clickRate: sample.length ? sample.reduce((n, r) => n + r.clickRate!, 0) / sample.length : null, threeSecondReadRate: sample.length ? sample.reduce((n, r) => n + r.threeSecondReadRate!, 0) / sample.length : null, sourceKeys: sample.map(r => r.key), samples: sample.map(r => ({ key: r.key, recordedThrough: r.recordedThrough, clickRate: r.clickRate, threeSecondReadRate: r.threeSecondReadRate, sourceHash: r.sourceHash })) }; };
/** 实际状态 D 日变化；待定／放量／暂停从 D 日起，终止前一日测试。 */
export function testingCheckpointDate(status: string, effectiveOn: string, previousActive: boolean, lastActive: string | null) { return status === 'test_discarded' && previousActive ? effectiveOn : previousActive ? previousDateKey(effectiveOn) : lastActive; }
export async function readWeeklyMaterial(db: Database, meeting: MeetingRecord): Promise<WeeklyMaterial> {
    const [context, facts, content, performanceRows, reviewRows, events, allMeetings, allVersions, stageRows, policyRows] = await Promise.all([
        readPromotionContext(db), db.select().from(daily).orderBy(asc(daily.metricDate), asc(daily.id)),
        db.select({ scheduleId: schedules.id, contentId: versions.contentId, contentName: versions.contentName, versionNumber: versions.versionNumber, subjectId: versions.subjectId, subjectName: subjects.name, categoryId: versions.categoryId, categoryName: categories.name, isPromoted: schedules.isPromoted, actualPublishAt: schedules.actualPublishAt }).from(schedules).innerJoin(versions, eq(schedules.contentVersionId, versions.id)).innerJoin(subjects, eq(versions.subjectId, subjects.id)).leftJoin(categories, eq(versions.categoryId, categories.id)),
        db.select().from(performance), db.select().from(reviews), readCheckpointEvents(db), db.select().from(meetings).orderBy(desc(meetings.periodEnd)), db.select().from(meetingVersions), db.select().from(stages), db.select().from(policies).orderBy(desc(policies.versionNumber)),
    ]);
    const start = meeting.periodStart, end = meeting.periodEnd;
    content.sort((a, b) => a.scheduleId.localeCompare(b.scheduleId));
    const previous = allMeetings.filter(m => m.id !== meeting.id && m.meetingType === meeting.meetingType && m.status === 'completed' && m.periodEnd <= end && m.meetingAt <= meeting.meetingAt).map(m => ({ meeting: m, version: allVersions.find(v => v.meetingId === m.id && v.versionNumber === m.currentVersionNumber) })).filter(p => p.version);
    const priorCards = (key: string, type: 'promotions' | 'nonPromotions', origin = false) => previous.flatMap(p => { const g = (p.version!.snapshot as any)?.generated; const cards = (type === 'promotions' ? [...(g?.promotions ?? []), ...(g?.promotionSnapshots ?? []).flatMap((ref: any) => (ref.snapshot?.rows ?? []).map((r: any) => ({ ...r, originKey: `${r.campaignId}:${r.stageType}:${r.originalStageStartedOn ?? r.startedOn}` })))] : g?.nonPromotions ?? []) as Array<any>; return cards.map(c => ({ ...c, key: c.key ?? `${c.scheduleId}:${c.checkpointType ?? `day_${c.checkpoint}`}` })).filter(c => (origin ? c.originKey : c.key) === key && !c.comparisonOnly).map(card => ({ card, savedAt: p.version!.createdAt, ref: { meetingId: p.meeting.id, name: p.meeting.name, versionNumber: p.version!.versionNumber, periodEnd: p.meeting.periodEnd } })); });
    const lastFinalized = previous[0]?.version?.createdAt;
    const pool: WeeklyPromotionCard[] = [];
    for (const campaign of context.campaigns) {
        const post = content.find(p => p.scheduleId === campaign.scheduleId);
        if (!post || campaign.startedOn > end)
            continue;
        const related = facts.filter(f => f.campaignId === campaign.id && f.metricDate <= end);
        const state = promotionStateOn(campaign, context, nextDateKey(end));
        if (!state)
            continue;
        const intervals = state.stages.length ? state.stages : stageRows.filter(s => s.campaignId === campaign.id && s.startedOn <= end);
        const testIntervals = intervals.filter(s => s.stageType === 'testing');
        const nodes: Array<{
            date: string;
            lastTestingOn: string;
            label: string;
        }> = [];
        const lastActive = (before: string) => testIntervals.filter(s => s.startedOn <= before).map(s => [s.endedOn ?? before, before].sort()[0]).sort().at(-1) ?? null;
        for (const change of context.stateChanges.filter(c => c.campaignId === campaign.id && c.businessDate <= nextDateKey(end) && ['test_paused', 'test_pending', 'test_discarded', 'scaling'].includes(c.actualStatus ?? ''))) {
            const before = promotionStateOn(campaign, context, previousDateKey(change.businessDate));
            const previousActive = before?.currentStatus === 'testing';
            const last = testingCheckpointDate(change.actualStatus!, change.businessDate, previousActive, lastActive(previousDateKey(change.businessDate)));
            if (last && last >= campaign.startedOn && last <= end)
                nodes.push({ date: change.businessDate, lastTestingOn: last, label: promotionLabels[change.actualStatus!] ?? change.actualStatus! });
        }
        for (const f of related.filter(f => f.recordKind !== 'test_residual' && f.stageTypeSnapshot === 'testing' && ['test_pause', 'test_pending', 'test_discarded', 'start_scaling'].includes(f.reviewDecision))) {
            const last = f.dailyStatus === 'active' ? f.metricDate : lastActive(f.metricDate);
            if (last)
                nodes.push({ date: nextDateKey(f.metricDate), lastTestingOn: last, label: ({ test_pause: '测试暂停', test_pending: '测试结束待定', test_discarded: '测试淘汰', start_scaling: '开始放量' } as Record<string, string>)[f.reviewDecision] });
        }
        for (const i of testIntervals)
            if (i.endedOn && i.endedOn <= end && !nodes.some(n => n.lastTestingOn === i.endedOn))
                nodes.push({ date: nextDateKey(i.endedOn), lastTestingOn: i.endedOn, label: i.outcome ? promotionLabels[i.outcome] ?? '测试阶段小结' : '测试阶段小结' });
        for (const stageType of ['testing', 'scaling'] as const) {
            const relevant = related.filter(f => f.stageTypeSnapshot === stageType), phase = intervals.filter(s => s.stageType === stageType);
            const origin = stageType === 'testing' ? campaign.startedOn : [...phase.map(s => s.startedOn), ...relevant.flatMap(f => f.sourceStageStartedOn ? [f.sourceStageStartedOn] : [])].sort()[0];
            if (!origin)
                continue;
            const originKey = `${campaign.id}:${stageType}:${origin}`, prior = priorCards(originKey, 'promotions', true);
            const matchingNodes = nodes.filter(n => between(n.lastTestingOn, start, end));
            const changedNodes = nodes.filter(n => between(n.date, start, end));
            const periodFacts = relevant.filter(f => between(f.metricDate, start, end));
            const late = relevant.filter(f => f.metricDate < start && lastFinalized && f.updatedAt > lastFinalized && !prior.some(p => p.card.facts?.some((old: any) => old.id === f.id && sourceHash(old) === sourceHash(f))));
            const current = stageType === 'scaling' ? periodFacts.length > 0 : matchingNodes.length > 0 || state.currentStatus==='testing' && periodFacts.some(f=>f.dailyStatus==='active'&&f.recordKind!=='test_residual');
            const supplement = !current && (late.length > 0 || stageType === 'testing' && periodFacts.length > 0 || prior.length > 0 && changedNodes.length > 0);
            const cutoff = stageType === 'testing' ? nodes.map(n => n.lastTestingOn).sort().at(-1) ?? null : end;
            const added = [...new Map([...periodFacts, ...late].map(f => [f.id, f])).values()].sort((a, b) => a.metricDate.localeCompare(b.metricDate));
            const cardFacts = supplement && added.length ? added : stageType === 'testing' ? relevant : periodFacts;
            const missingDates: string[] = [];
            const upper = stageType === 'testing' ? (cutoff ?? end) : end;
            for (const i of phase) {
                const from = stageType === 'testing' ? i.startedOn : [i.startedOn, start].sort().at(-1)!, to = [i.endedOn ?? upper, upper].sort()[0];
                for (let d = from; d <= to; d = nextDateKey(d))
                    if (!related.some(f => f.metricDate === d))
                        missingDates.push(d);
            }
            const knownIds = new Map<string, string>();
            for (const p of prior)
                for (const f of p.card.facts ?? [])
                    if (!knownIds.has(f.id))
                        knownIds.set(f.id, sourceHash(f));
            const changes = cardFacts.filter(f => !knownIds.has(f.id) || knownIds.get(f.id) !== sourceHash(f));
            const last = nodes.filter(n => n.lastTestingOn <= end).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
            const eligible = current || supplement;
            const card: WeeklyPromotionCard = { ...post, key: originKey, originKey, sourceHash: sourceHash({ facts: cardFacts, nodes }), campaignId: campaign.id, stageType, startedOn: supplement && added.length ? added[0].metricDate : stageType === 'testing' ? origin : [origin, start].sort().at(-1)!, endedOn: supplement && added.length ? added.at(-1)!.metricDate : stageType === 'testing' ? (cutoff ?? end) : end, kind: current ? 'current' : 'supplement', label: stageType === 'scaling' ? (supplement ? '往期放量补录' : '本期放量') : supplement ? '往期补充与更新' : matchingNodes.some(n => n.label === '测试暂停') && !matchingNodes.some(n => ['测试结束待定', '测试淘汰', '开始放量'].includes(n.label)) ? '测试阶段小结' : last?.label ?? '测试结果', events: [...new Map(nodes.map(n => [`${n.date}:${n.label}`, n])).values()].sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label)), facts: cardFacts, total: totals(cardFacts), periodTotal: totals(periodFacts), changes: totals(changes), missingDates: [...new Set(missingDates)], previous: prior.map(p => p.ref), historical: emptyBenchmark(), peers: emptyBenchmark(), ownHistory: [] };
            card.dataRange=actualDataRange(cardFacts);
            card.dailyStates=Object.fromEntries(cardFacts.map(f=>[f.metricDate,f.actualStatusSnapshot??promotionStateOn(campaign,context,f.metricDate)?.currentStatus??'']));
            (card as any)._eligible = eligible;
            card.currentStatus=promotionStateOn(campaign,context,shanghaiDateKey(new Date()))?.currentStatus??state.currentStatus;
            (card as any)._historicalFacts = relevant.filter(f => f.metricDate < start);
            (card as any)._cutoff = stageType === 'scaling' ? (phase.length && phase.every(p => p.endedOn) ? phase.map(p => p.endedOn!).sort().at(-1) : null) : cutoff;
            pool.push(card);
        }
    }
    for (const card of pool) {
        const same = pool.filter(p => p.stageType === card.stageType && p.subjectId === card.subjectId && p.categoryId === card.categoryId);
        card.historical = benchPromotion(same.filter(p => (p as any)._cutoff && ((p as any)._cutoff < start)).map(p => ({ key: p.key, facts: (p as any)._historicalFacts as Fact[] })), card.key);
        card.peers = benchPromotion(same.filter(p => (p as any)._eligible && p.kind === 'current').map(p => ({ key: p.key, facts: p.facts })), card.key);
        const owned=new Set(context.campaigns.filter(c=>content.find(p=>p.scheduleId===c.scheduleId)?.contentId===card.contentId).map(c=>c.id));
        card.ownHistory = (['testing','scaling'] as const).flatMap(stageType=>{
          const before=facts.filter(f=>owned.has(f.campaignId)&&f.metricDate<start&&f.stageTypeSnapshot===stageType);
          if(!before.length)return [];
          const t=totals(before);
          return [{name:card.contentName,versionNumber:card.versionNumber,stageType,periodLabel:before[0].metricDate+'—'+before.at(-1)!.metricDate,spend:t.spend,actualOpenCost:t.actualOpenCost,actualLeadCost:t.actualLeadCost}];
        });
    }
    for(const card of pool){const last=priorCards(card.originKey,'promotions',true)[0];if(last?.card?.total){const t=last.card.total;card.ownHistory.unshift({name:card.contentName,versionNumber:card.versionNumber,stageType:card.stageType,periodLabel:'上期 '+last.ref.periodEnd,spend:t.spend,actualOpenCost:t.actualOpenCost,actualLeadCost:t.actualLeadCost});}}
    const nonPool: WeeklyNonPromotionCard[] = [], pending: WeeklyMaterial['pending'] = [], excludedNonPromotions:NonNullable<WeeklyMaterial['excludedNonPromotions']>=[];
    for (const post of content.filter(p => !p.isPromoted && p.actualPublishAt))
        for (const checkpointType of ['day_7', 'day_15'] as const) {
            const key = `${post.scheduleId}:${checkpointType}`, metric = performanceRows.find(p => p.scheduleId === post.scheduleId && p.checkpointType === checkpointType), review = reviewRows.find(p => p.scheduleId === post.scheduleId && p.checkpointType === checkpointType), skipped = events.get(key)?.action === 'skip';
            const policy = policyRows.find(p => p.categoryId === post.categoryId && p.effectiveOn <= end);
            const {publishedOn,dueOn}=checkpointsForPublishDate(post.actualPublishAt!).find(row=>row.type===checkpointType)!;
            if(skipped&&between(dueOn,start,end)){const event=events.get(key)!;excludedNonPromotions.push({key,contentName:post.contentName,checkpointType,reason:event.reason,eventId:event.id});}
            if (!metric) {
                if (!skipped && policy?.requiresNonPromotionReview !== false && dueOn >= start && dueOn <= end)
                    pending.push({ key,scheduleId:post.scheduleId,actualPublishAt:post.actualPublishAt,versionNumber:post.versionNumber,publishedOn,dueOn,recordedThrough:dueOn, contentName: post.contentName, checkpointType, reason: '尚无实际数据截止日' });
                continue;
            }
            if (metric.recordedThrough > end)
                continue;
            const cutoff = metric.recordedThrough, hash = sourceHash({ metric, review }), prior = priorCards(key, 'nonPromotions');
            const current = between(cutoff, start, end) && !skipped;
            const latest = review && review.updatedAt > metric.updatedAt ? review.updatedAt : metric.updatedAt;
            const changed = prior.length ? !prior.some(p => p.card.sourceHash === hash || !p.card.sourceHash && latest <= p.savedAt) : !!lastFinalized && latest > lastFinalized;
            const card: WeeklyNonPromotionCard = { ...post, key, checkpointType,publishedOn,dueOn, recordedThrough: cutoff, firstRecordedAt: iso(metric.createdAt), updatedAt: iso(review?.updatedAt && review.updatedAt > metric.updatedAt ? review.updatedAt : metric.updatedAt), sourceHash: hash, kind: current ? 'current' : 'supplement', label: current ? '本期数据' : prior.length ? '往期数据更新' : '往期补录', clickRate: Number(metric.clickRate), threeSecondReadRate: Number(metric.threeSecondReadRate), conclusion: review?.conclusion ?? '', cause: review?.cause ?? '', nextAction: review?.nextAction ?? '', skipped, previous: prior.map(p => p.ref), historical: emptyBenchmark(), peers: emptyBenchmark(), ownHistory: [] };
            (card as any)._eligible = current || !skipped && cutoff < start && changed;
            nonPool.push(card);
        }
    // 本期二轮尚未处理时，将缺失的首轮作为同卡片流程的前置节点展示。
    for(const node of [...pending].filter(n=>n.checkpointType==='day_15')){
      const key=`${node.scheduleId}:day_7`;
      if(!performanceRows.some(p=>p.scheduleId===node.scheduleId&&p.checkpointType==='day_7')&&events.get(key)?.action!=='skip'&&!pending.some(p=>p.key===key)){
        const dueOn=checkpointsForPublishDate(content.find(p=>p.scheduleId===node.scheduleId)!.actualPublishAt!).find(row=>row.type==='day_7')!.dueOn;
        pending.unshift({...node,key,checkpointType:'day_7',dueOn,recordedThrough:dueOn,reason:'请先处理首轮'});
      }
    }
    for (const card of nonPool) {
        card.ownHistory = nonPool.filter(p => p.contentId === card.contentId && p.versionNumber < card.versionNumber && p.checkpointType === card.checkpointType).map(p => ({ versionNumber: p.versionNumber, recordedThrough: p.recordedThrough, clickRate: p.clickRate, threeSecondReadRate: p.threeSecondReadRate }));
        const same = nonPool.filter(p => p.subjectId === card.subjectId && p.categoryId === card.categoryId && p.checkpointType === card.checkpointType && !p.skipped);
        card.historical = benchNon(same.filter(p => p.recordedThrough! < start), card.key);
        card.peers = benchNon(same.filter(p => p.recordedThrough! >= start && p.recordedThrough! <= end), card.key);
    }
    const promotions = pool.filter(p => (p as any)._eligible).sort((a, b) => a.key.localeCompare(b.key));
    for (const p of promotions) {
        delete (p as any)._eligible;
        delete (p as any)._cutoff;
        delete (p as any)._historicalFacts;
    }
    const nonPromotions = nonPool.filter(p => (p as any)._eligible).sort((a, b) => a.key.localeCompare(b.key));
    for (const p of nonPool)
        delete (p as any)._eligible;
    const periodFacts = facts.filter(f => between(f.metricDate, start, end)), summary = { ...totals(periodFacts), posts: new Set(periodFacts.map(f => context.campaigns.find(c => c.id === f.campaignId)?.scheduleId ?? f.campaignId)).size, testingPosts: new Set(periodFacts.filter(f => f.stageTypeSnapshot === 'testing').map(f => f.campaignId)).size, scalingPosts: new Set(periodFacts.filter(f => f.stageTypeSnapshot === 'scaling').map(f => f.campaignId)).size };
    const base = { schemaVersion: 4 as const, periodStart: start, periodEnd: end, summary, promotions, nonPromotions, nonPromotionContext: nonPool, pending,excludedNonPromotions };
    return { ...base, fingerprint: sourceHash(base) };
}
export function selectWeeklyMaterial(material: WeeklyMaterial, promotionKeys: string[], nonSelections: Array<{
    scheduleId: string;
    checkpointType: string;
}>) {
    const promotions = material.promotions.filter(p => promotionKeys.includes(p.key));
    const keys = new Set(nonSelections.map(s => `${s.scheduleId}:${s.checkpointType}`));
    const primary = material.nonPromotions.filter(p => keys.has(p.key)).map(p => ({ ...p, comparisonOnly: false }));
    const comparison = primary.filter(p => p.checkpointType === 'day_15' && !keys.has(`${p.scheduleId}:day_7`)).flatMap(p => { const first = material.nonPromotionContext.find(c => c.scheduleId === p.scheduleId && c.checkpointType === 'day_7'); return first ? [{ ...first, comparisonOnly: true }] : []; });
    return { promotions, nonPromotions: [...primary, ...comparison],excludedNonPromotions:material.excludedNonPromotions??[] };
}
