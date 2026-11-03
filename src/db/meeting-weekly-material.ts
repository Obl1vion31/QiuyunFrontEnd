import {promotionLeadCostTrend,type LeadCostPoint,type LeadCostReview} from './meeting-lead-trend';
import {weeklyReportMetrics,type WeeklyReportMetrics} from './meeting-report-metrics';
import {sameNonPromotionCohort,type ContentRole} from './content-roles';
import {rateComparison,type RateSample,type RateComparison} from './meeting-rate-comparison';
import {readMonthlyMeeting,type MonthlyMeetingMaterial} from './monthly-meeting';
import {readMonthlyPlan,type MonthlyPlanView} from './monthly-plans';
import {requiredPromotionStage} from './promotion-review-required';
import {testingCycles,testingCycleOn} from './promotion-cycles.mjs';
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
import {anchorReviewPosts,readReviewPlanning} from './non-promotion-plan';
import {reviewNodes,type ReviewMode} from './non-promotion-nodes';
import {nonPromotionSource} from './non-promotion-record';
import {actualDataRange,cardDataRange,type ActualDataRange} from './meeting-card-rules';
import { operationsContent as contents,operationsContentSchedule as schedules, operationsContentVersion as versions, operationsSubject as subjects, operationsCategory as categories, operationsPromotionDailyMetric as daily, operationsContentPerformanceMetric as performance, operationsNonPromotionReview as reviews, operationsReviewMeeting as meetings, operationsReviewMeetingVersion as meetingVersions, operationsPromotionStage as stages } from './schema';
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
    leadCostTrend?:LeadCostPoint[];
    rateSamples?:RateSample[];rateAsOf?:string;rateComparison?:RateComparison;
    testCycleNumber?:number;
    testCycleEndedOn?:string|null;
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
        from?:string;through?:string;
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
    standardCohortEligible?:boolean;
    contentRole?:ContentRole|null;statisticsFrom?:string|null;statisticsScope?:'version_interval'|'post_cumulative'|'legacy_cumulative';
    rateComparison?:RateComparison;
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
    checkpointType: string;
    checkpointKind?:'standard'|'custom';
    nodeId?:string|null;
    reviewMode?:ReviewMode;
    exposureCount?:number|null;
    readCount?:number|null;
    placeholder?:'future'|'missing'|'skipped';
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
    reportMetrics?:WeeklyReportMetrics;
    monthly?:MonthlyMeetingMaterial;
    monthlyPlans?:MonthlyPlanView[];
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
export async function readWeeklyMaterial(db: Database, meeting: MeetingRecord, now = new Date()): Promise<WeeklyMaterial> {
    if(meeting.meetingType==='monthly'&&meeting.draftSnapshot.monthlySchemaVersion===1){
        const monthly=await readMonthlyMeeting(db,meeting);
        const base={schemaVersion:4 as const,periodStart:meeting.periodStart,periodEnd:meeting.periodEnd,summary:{...monthly.operations.spend,posts:monthly.operations.spendRows.length,testingPosts:0,scalingPosts:0},promotions:[],nonPromotions:[],nonPromotionContext:[],pending:[],excludedNonPromotions:[],monthly};
        return {...base,fingerprint:sourceHash({periodStart:meeting.periodStart,periodEnd:meeting.periodEnd,monthly:monthly.fingerprint})};
    }

    const [context, facts, content, performanceRows, reviewRows, events, allMeetings, allVersionsIncludingInvalid, stageRows] = await Promise.all([
        readPromotionContext(db), db.select().from(daily).orderBy(asc(daily.metricDate), asc(daily.id)),
        db.select({ scheduleId: schedules.id, contentId: versions.contentId, contentName: versions.contentName, versionNumber: versions.versionNumber, subjectId: versions.subjectId, subjectName: subjects.name, categoryId: versions.categoryId, categoryName: categories.name, contentRole:contents.contentRole,operationType:contents.operationType,isPromoted: schedules.isPromoted, actualPublishAt: schedules.actualPublishAt }).from(schedules).innerJoin(versions, eq(schedules.contentVersionId, versions.id)).innerJoin(contents,eq(versions.contentId,contents.id)).innerJoin(subjects, eq(versions.subjectId, subjects.id)).leftJoin(categories, eq(versions.categoryId, categories.id)),
        db.select().from(performance), db.select().from(reviews), readCheckpointEvents(db), db.select().from(meetings).orderBy(desc(meetings.periodEnd)), db.select().from(meetingVersions), db.select().from(stages),
    ]);
    const allVersions=allVersionsIncludingInvalid.filter(v=>!v.invalidatedAt);
    const planning=await readReviewPlanning(db);
    const start = meeting.periodStart, end = meeting.periodEnd;
    content.sort((a, b) => a.scheduleId.localeCompare(b.scheduleId));
    const previous = allMeetings.filter(m => m.id !== meeting.id && m.meetingType === meeting.meetingType && m.status === 'completed' && m.periodEnd <= end && m.meetingAt <= meeting.meetingAt).map(m => ({ meeting: m, version: allVersions.find(v => v.lifecycleStatus!=='draft' && !v.invalidatedAt && v.meetingId === m.id && v.versionNumber === m.currentVersionNumber) })).filter(p => p.version);
    const priorCards = (key: string, type: 'promotions' | 'nonPromotions', origin = false) => previous.flatMap(p => { const g = (p.version!.snapshot as any)?.generated; const cards = (type === 'promotions' ? [...(g?.promotions ?? []), ...(g?.promotionSnapshots ?? []).flatMap((ref: any) => (ref.snapshot?.rows ?? []).map((r: any) => ({ ...r, originKey: `${r.campaignId}:${r.stageType}:${r.originalStageStartedOn ?? r.startedOn}` })))] : g?.nonPromotions ?? []) as Array<any>; return cards.map(c => ({ ...c, key: c.key ?? `${c.scheduleId}:${c.checkpointType ?? `day_${c.checkpoint}`}` })).filter(c => (origin ? c.originKey : c.key) === key && !c.comparisonOnly).map(card => ({ card, savedAt: p.version!.createdAt, ref: { meetingId: p.meeting.id, name: p.meeting.name, versionNumber: p.version!.versionNumber, periodEnd: p.meeting.periodEnd } })); });
    const leadReviews:LeadCostReview[]=previous.flatMap(p=>{
        const snapshot=p.version!.snapshot as any;
        const generated=snapshot.generated;
        const cards=[...(generated?.promotions??[]),...(generated?.promotionSnapshots??[]).flatMap((ref:any)=>ref.snapshot?.rows??[])] as Array<Omit<WeeklyPromotionCard,'total'>&{total?:WeeklyPromotionCard['total'];actualLeadCost?:number|null}>;
        return cards.flatMap(card=>{
            const post=content.find(c=>c.scheduleId===card.scheduleId),range=card.dataRange===undefined&&card.facts?actualDataRange(card.facts):card.dataRange;
            if(!range||!post)return [];
            return [{key:`${p.meeting.id}:${card.key}`,contentId:post.contentId,scheduleId:card.scheduleId,stageType:card.stageType,versionNumber:post.versionNumber,from:range.from,through:range.through,value:card.total?card.total.actualLeadCost:card.actualLeadCost??null,meetingId:p.meeting.id,meetingVersion:p.version!.versionNumber,finalizedAt:(p.version!.finalizedAt??p.version!.createdAt).toISOString()}];
        });
    });
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
            complete: boolean;
        }> = [];
        const lastActive = (before: string) => testIntervals.filter(s => s.startedOn <= before).map(s => [s.endedOn ?? before, before].sort()[0]).sort().at(-1) ?? null;
        for (const change of context.stateChanges.filter(c => c.campaignId === campaign.id && c.businessDate <= nextDateKey(end) && ['test_paused', 'test_pending', 'test_discarded', 'scaling'].includes(c.actualStatus ?? ''))) {
            const before = promotionStateOn(campaign, context, previousDateKey(change.businessDate));
            const previousActive = before?.currentStatus === 'testing';
            const last = testingCheckpointDate(change.actualStatus!, change.businessDate, previousActive, lastActive(previousDateKey(change.businessDate)));
            if (last && last >= campaign.startedOn && last <= end)
                nodes.push({ date: change.businessDate, lastTestingOn: last, label: promotionLabels[change.actualStatus!] ?? change.actualStatus!, complete: change.actualStatus!=='test_paused' });
        }
        for (const f of related.filter(f => f.recordKind !== 'test_residual' && f.stageTypeSnapshot === 'testing' && ['test_pause', 'test_pending', 'test_discarded', 'start_scaling'].includes(f.reviewDecision))) {
            const last = f.dailyStatus === 'active' ? f.metricDate : lastActive(f.metricDate);
            if (last)
                nodes.push({ date: nextDateKey(f.metricDate), lastTestingOn: last, label: ({ test_pause: '测试暂停', test_pending: '测试结束待定', test_discarded: '测试淘汰', start_scaling: '开始放量' } as Record<string, string>)[f.reviewDecision], complete: f.reviewDecision!=='test_pause' });
        }
        for (const i of testIntervals)
            if (i.endedOn && i.endedOn <= end && !nodes.some(n => n.lastTestingOn === i.endedOn))
                nodes.push({ date: nextDateKey(i.endedOn), lastTestingOn: i.endedOn, label: i.outcome ? promotionLabels[i.outcome] ?? '测试阶段小结' : '测试阶段小结', complete: ['start_scaling','test_discarded'].includes(i.outcome??'') });
        for (const {stageType,cycle} of [...testingCycles(campaign,context,end).map(cycle=>({stageType:'testing' as const,cycle})),{stageType:'scaling' as const,cycle:null}]) {
            const cycleStart=cycle?.startedOn??campaign.startedOn,cycleEnd=cycle?.endedOn;
            const cycleNodes=nodes.filter(n=>!cycle||(n.lastTestingOn>=cycleStart&&(!cycleEnd||n.lastTestingOn<=cycleEnd)));
            const relevant = related.filter(f => f.stageTypeSnapshot === stageType&&(!cycle||(f.sourceStageStartedOn??testingCycleOn(campaign,context,f.metricDate)?.startedOn)===cycleStart)), phase = intervals.filter(s => s.stageType === stageType&&(!cycle||(s.startedOn>=cycleStart&&(!cycleEnd||s.startedOn<=cycleEnd))));
            const origin = stageType === 'testing' ? cycleStart : [...phase.map(s => s.startedOn), ...relevant.flatMap(f => f.sourceStageStartedOn ? [f.sourceStageStartedOn] : [])].sort()[0];
            if (!origin)
                continue;
            const originKey = `${campaign.id}:${stageType}:${origin}`, prior = priorCards(originKey, 'promotions', true);
            const matchingNodes = cycleNodes.filter(n => between(n.lastTestingOn, start, end));
            const changedNodes = cycleNodes.filter(n => between(n.date, start, end));
            const periodFacts = relevant.filter(f => between(f.metricDate, start, end));
            const late = relevant.filter(f => f.metricDate < start && lastFinalized && f.updatedAt > lastFinalized && !prior.some(p => p.card.facts?.some((old: any) => old.id === f.id && sourceHash(old) === sourceHash(f))));
            const conclusions=cycleNodes.filter(n=>n.complete);
            const completed=stageType==='scaling'||conclusions.length>0;
            const current = completed && (stageType === 'scaling' ? phase.some(p=>p.startedOn<=end&&(!p.endedOn||p.endedOn>=start))||periodFacts.length>0 : conclusions.some(n=>between(n.lastTestingOn,start,end)));
            const supplement = completed && !current && (late.length > 0 || stageType === 'testing' && periodFacts.length > 0 || prior.length > 0 && changedNodes.length > 0);
            const cutoff = stageType === 'testing' ? conclusions.map(n => n.lastTestingOn).sort().at(-1) ?? null : end;
            const added = [...new Map([...periodFacts, ...late].map(f => [f.id, f])).values()].sort((a, b) => a.metricDate.localeCompare(b.metricDate));
            const cardFacts = supplement && added.length ? added : stageType === 'testing' ? relevant : periodFacts;
            const missingDates: string[] = [];
            const upper = stageType === 'testing' ? (cutoff ?? end) : end;
            const from=stageType==='testing'?origin:[origin,start].sort().at(-1)!;
            for(let d=from;d<=upper;d=nextDateKey(d))if(requiredPromotionStage(campaign,context,d)===stageType&&(!cycle||testingCycleOn(campaign,context,d)?.startedOn===cycleStart)&&!related.some(f=>f.metricDate===d))missingDates.push(d);
            const knownIds = new Map<string, string>();
            for (const p of prior)
                for (const f of p.card.facts ?? [])
                    if (!knownIds.has(f.id))
                        knownIds.set(f.id, sourceHash(f));
            const changes = cardFacts.filter(f => !knownIds.has(f.id) || knownIds.get(f.id) !== sourceHash(f));
            const last = cycleNodes.filter(n => n.lastTestingOn <= end).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
            const eligible = current || supplement;
            const card: WeeklyPromotionCard = { ...post, key: originKey, originKey, sourceHash: sourceHash({ facts: cardFacts, nodes:cycleNodes }), campaignId: campaign.id, stageType, startedOn: supplement && added.length ? added[0].metricDate : stageType === 'testing' ? origin : [origin, start].sort().at(-1)!, endedOn: supplement && added.length ? added.at(-1)!.metricDate : stageType === 'testing' ? (cutoff ?? end) : end, kind: current ? 'current' : 'supplement', label: stageType === 'scaling' ? (supplement ? '往期放量补录' : '本期放量') : supplement ? '往期补充与更新' : matchingNodes.some(n => n.label === '测试暂停') && !matchingNodes.some(n => ['测试结束待定', '测试淘汰', '开始放量'].includes(n.label)) ? '测试阶段小结' : last?.label ?? '测试结果', events: [...new Map(cycleNodes.map(n => [`${n.date}:${n.label}`, n])).values()].sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label)), facts: cardFacts, total: totals(cardFacts), periodTotal: totals(periodFacts), changes: totals(changes), missingDates: [...new Set(missingDates)], previous: prior.map(p => p.ref), historical: emptyBenchmark(), peers: emptyBenchmark(), ownHistory: [] };
            if(cycle){card.testCycleNumber=cycle.number;card.testCycleEndedOn=testingCycles(campaign,context,shanghaiDateKey(new Date())).find(c=>c.startedOn===cycle.startedOn)?.endedOn??cycle.endedOn;}
            card.dataRange=actualDataRange(cardFacts);
            card.dailyStates=Object.fromEntries(cardFacts.map(f=>[f.metricDate,f.actualStatusSnapshot??promotionStateOn(campaign,context,f.metricDate)?.currentStatus??'']));
            (card as any)._eligible = eligible;
            card.currentStatus=promotionStateOn(campaign,context,shanghaiDateKey(new Date()))?.currentStatus??state.currentStatus;
            (card as any)._historicalFacts = relevant.filter(f => f.metricDate < start);
            (card as any)._cutoff = stageType === 'scaling' ? (phase.length && phase.every(p => p.endedOn) ? phase.map(p => p.endedOn!).sort().at(-1) : null) : cutoff;
            pool.push(card);
        }
    }
    // 同一轮次跨会议与会前／会后版本只保留最新的有效人工点击率。
    const rateSources=new Map<string,{card:WeeklyPromotionCard;sample:RateSample}>();
    for(const version of [...allVersions].sort((a,b)=>a.createdAt.getTime()-b.createdAt.getTime()||a.versionNumber-b.versionNumber)){
      const snapshot=version.snapshot as any;
      if(version.lifecycleStatus==='draft'||version.invalidatedAt||version.meetingId===meeting.id||snapshot.meeting?.periodEnd>end)continue;
      for(const card of snapshot.generated?.promotions??[]){
        const input=snapshot.draft?.promotionInputs?.[card.key],range=cardDataRange(card);
        if(!range||range.through>end||!input?.confirmed||input.rateNeedsReview||input.clickRate==null||!Number.isFinite(input.clickRate)||input.rateRange&&(input.rateRange.from!==range.from||input.rateRange.through!==range.through))continue;
        rateSources.set(card.originKey??card.key,{card,sample:{key:card.originKey??card.key,clickRate:input.clickRate,through:range.through,sourceVersionId:version.id,sourceHash:card.sourceHash}});
      }
    }
    for (const card of pool) {
        card.rateAsOf=end;
        card.rateSamples=[...rateSources.values()].filter(s=>s.card.subjectId===card.subjectId&&s.card.categoryId===card.categoryId&&s.card.stageType===card.stageType).map(s=>s.sample);
        const same = pool.filter(p => p.stageType === card.stageType && sameNonPromotionCohort(p,card));
        card.historical = benchPromotion(same.filter(p => (p as any)._cutoff && ((p as any)._cutoff < start)).map(p => ({ key: p.key, facts: (p as any)._historicalFacts as Fact[] })), card.key);
        card.peers = benchPromotion(same.filter(p => (p as any)._eligible && p.kind === 'current').map(p => ({ key: p.key, facts: p.facts })), card.key);
        const owned=new Set(context.campaigns.filter(c=>content.find(p=>p.scheduleId===c.scheduleId)?.contentId===card.contentId).map(c=>c.id));
        const earlierCycles=pool.filter(p=>p.contentId===card.contentId&&p.campaignId===card.campaignId&&p.stageType==='testing'&&p.startedOn<card.startedOn).map(p=>({name:p.contentName,versionNumber:p.versionNumber,stageType:p.stageType,from:cardDataRange(p)?.from,through:cardDataRange(p)?.through,periodLabel:`测试第${p.testCycleNumber??1}轮 · ${p.dataRange?.from??p.startedOn}—${p.dataRange?.through??p.testCycleEndedOn??p.endedOn}`,spend:p.total.spend,actualOpenCost:p.total.actualOpenCost,actualLeadCost:p.total.actualLeadCost}));
        card.ownHistory = [...earlierCycles.sort((a,b)=>(b.through??'').localeCompare(a.through??'')),...(['testing','scaling'] as const).flatMap(stageType=>{
          const before=facts.filter(f=>owned.has(f.campaignId)&&f.metricDate<start&&f.stageTypeSnapshot===stageType);
          if(!before.length)return [];
          const t=totals(before);
          return [{name:card.contentName,versionNumber:card.versionNumber,stageType,from:before[0].metricDate,through:before.at(-1)!.metricDate,periodLabel:before[0].metricDate+'—'+before.at(-1)!.metricDate,spend:t.spend,actualOpenCost:t.actualOpenCost,actualLeadCost:t.actualLeadCost}];
        })];
    }
    for(const card of pool){const last=priorCards(card.originKey,'promotions',true)[0];if(last?.card?.total){const t=last.card.total,range=cardDataRange(last.card);card.ownHistory.unshift({name:card.contentName,versionNumber:card.versionNumber,stageType:card.stageType,from:range?.from,through:range?.through,periodLabel:'上期 '+last.ref.periodEnd,spend:t.spend,actualOpenCost:t.actualOpenCost,actualLeadCost:t.actualLeadCost});}}
    for(const card of pool){
        const range=cardDataRange(card)??{from:card.startedOn,through:card.endedOn};
        card.leadCostTrend=promotionLeadCostTrend({key:card.key,contentId:card.contentId,scheduleId:card.scheduleId,stageType:card.stageType,versionNumber:card.versionNumber,...range,value:card.total.actualLeadCost,finalizedAt:now.toISOString()},leadReviews);
    }
    const nonPool: WeeklyNonPromotionCard[] = [], pending: WeeklyMaterial['pending'] = [], excludedNonPromotions:NonNullable<WeeklyMaterial['excludedNonPromotions']>=[];
    const nonPosts=anchorReviewPosts(content.map(p=>({...p,id:p.scheduleId})),planning.plans,context,shanghaiDateKey(now),now).filter(p=>p.reviewActive);
    const nodesFor=(post:typeof nonPosts[number])=>reviewNodes(post.actualPublishAt,post.enabledPlan,planning.custom.filter(n=>n.contentId===post.contentId&&(post.operationType!=='promotion_then_continuous'||n.scheduleId===post.id))).filter(n=>!post.activatedOn||n.dueOn>=post.activatedOn);
    for (const post of nonPosts)
        for (const node of nodesFor(post)) {
            const checkpointType=node.type;
            const key = `${post.scheduleId}:${checkpointType}`, metric = performanceRows.find(p => p.scheduleId === post.scheduleId && p.checkpointType === checkpointType), review = reviewRows.find(p => p.scheduleId === post.scheduleId && p.checkpointType === checkpointType), skipped = events.get(key)?.action === 'skip';
            const {publishedOn,dueOn}=node;
            if(skipped&&between(dueOn,start,end)){const event=events.get(key)!;excludedNonPromotions.push({key,contentName:post.contentName,checkpointType,reason:event.reason,eventId:event.id});}
            if (!metric || metric.recordedThrough>end) {
                if (!skipped && dueOn >= start && dueOn <= end && (node.kind!=='custom'||dueOn<shanghaiDateKey(now)))
                    pending.push({ key,scheduleId:post.scheduleId,actualPublishAt:post.actualPublishAt,versionNumber:post.versionNumber,publishedOn,dueOn,recordedThrough:dueOn, contentName: post.contentName, checkpointType, reason: '尚无实际数据截止日' });
                nonPool.push({...post,key,checkpointType,checkpointKind:node.kind,nodeId:node.nodeId,reviewMode:post.mode,publishedOn,dueOn,recordedThrough:null,firstRecordedAt:null,updatedAt:null,sourceHash:sourceHash({node,skipped}),kind:'supplement',label:'对照',clickRate:null,threeSecondReadRate:null,readCount:null,exposureCount:null,conclusion:'',cause:'',nextAction:'',skipped,previous:priorCards(key,'nonPromotions').map(p=>p.ref),historical:emptyBenchmark(),peers:emptyBenchmark(),ownHistory:[],placeholder:skipped?'skipped':dueOn>end||node.kind==='custom'&&dueOn>=shanghaiDateKey(now)?'future':'missing'});
                continue;
            }
            const cutoff = metric.recordedThrough, hash = sourceHash({ metric:nonPromotionSource(metric), review:nonPromotionSource(review)??undefined,...(post.contentRole?{contentRole:post.contentRole}:{}) }), prior = priorCards(key, 'nonPromotions');
            const current = between(cutoff, start, end) && !skipped;
            const latest = review && review.updatedAt > metric.updatedAt ? review.updatedAt : metric.updatedAt;
            const changed = prior.length ? !prior.some(p => p.card.sourceHash === hash || !p.card.sourceHash && latest <= p.savedAt) : !!lastFinalized && latest > lastFinalized;
            const card: WeeklyNonPromotionCard = { ...post, key, checkpointType,checkpointKind:node.kind,nodeId:node.nodeId,reviewMode:post.mode,statisticsFrom:metric.statisticsFrom,statisticsScope:metric.statisticsFrom?'version_interval':post.operationType==='promotion_then_continuous'?'legacy_cumulative':'post_cumulative',readCount:metric.readCount,exposureCount:metric.exposureCount,publishedOn,dueOn, recordedThrough: cutoff, firstRecordedAt: iso(metric.createdAt), updatedAt: iso(review?.updatedAt && review.updatedAt > metric.updatedAt ? review.updatedAt : metric.updatedAt), sourceHash: hash, kind: current ? 'current' : 'supplement', label: current ? '本期数据' : prior.length ? '往期数据更新' : '往期补录', clickRate: metric.clickRate==null?null:Number(metric.clickRate), threeSecondReadRate: Number(metric.threeSecondReadRate), conclusion: review?.conclusion ?? '', cause: review?.cause ?? '', nextAction: review?.nextAction ?? '', skipped, previous: prior.map(p => p.ref), historical: emptyBenchmark(), peers: emptyBenchmark(), ownHistory: [] };
            (card as any)._eligible = (post.operationType!=='promotion_then_continuous'||metric.statisticsFrom===post.statisticsFrom)&&(current || !skipped && cutoff < start && changed);
            nonPool.push(card);
        }
    // 本期二轮尚未处理时，将缺失的首轮作为同卡片流程的前置节点展示。
    for(const node of [...pending].filter(n=>n.checkpointType==='day_15')){
      const key=`${node.scheduleId}:day_7`;
      if(nonPosts.find(p=>p.id===node.scheduleId)?.enabledPlan.day7&&!performanceRows.some(p=>p.scheduleId===node.scheduleId&&p.checkpointType==='day_7')&&events.get(key)?.action!=='skip'&&!pending.some(p=>p.key===key)){
        const dueOn=checkpointsForPublishDate(content.find(p=>p.scheduleId===node.scheduleId)!.actualPublishAt!).find(row=>row.type==='day_7')!.dueOn;
        pending.unshift({...node,key,checkpointType:'day_7',dueOn,recordedThrough:dueOn,reason:'请先处理首轮'});
      }
    }
    for (const card of nonPool) {
        if(card.placeholder||card.checkpointKind==='custom')continue;
        card.ownHistory = nonPool.filter(p => p.contentId === card.contentId && p.versionNumber < card.versionNumber && p.checkpointType === card.checkpointType).map(p => ({ versionNumber: p.versionNumber, recordedThrough: p.recordedThrough, clickRate: p.clickRate, threeSecondReadRate: p.threeSecondReadRate }));
        const same = card.standardCohortEligible?nonPool.filter(p => p.standardCohortEligible&&!p.placeholder&&sameNonPromotionCohort(p,card) && p.checkpointType === card.checkpointType && !p.skipped):[];
        card.historical = benchNon(same.filter(p => p.recordedThrough! < start), card.key);
        card.peers = benchNon(same.filter(p => p.recordedThrough! >= start && p.recordedThrough! <= end), card.key);
        card.rateComparison=rateComparison(same.map(p=>({key:p.key,clickRate:p.clickRate,threeSecondReadRate:p.threeSecondReadRate!,through:p.recordedThrough!,sourceHash:p.sourceHash})),end);
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
    const includedFacts=new Set(promotions.flatMap(p=>p.facts.map(f=>f.id)));
    const periodFacts = facts.filter(f => includedFacts.has(f.id)&&between(f.metricDate, start, end)), summary = { ...totals(periodFacts), posts: new Set(periodFacts.map(f => context.campaigns.find(c => c.id === f.campaignId)?.scheduleId ?? f.campaignId)).size, testingPosts: new Set(periodFacts.filter(f => f.stageTypeSnapshot === 'testing').map(f => f.campaignId)).size, scalingPosts: new Set(periodFacts.filter(f => f.stageTypeSnapshot === 'scaling').map(f => f.campaignId)).size };
    const months=[...new Set([start.slice(0,7),end.slice(0,7)])];
    const monthlyPlans=meeting.meetingType==='weekly'?(await Promise.all(months.map(month=>readMonthlyPlan(db,month,now)))).filter((p):p is MonthlyPlanView=>!!p?.firstFinalizedAt):undefined;
    const base = { schemaVersion: 4 as const, periodStart: start, periodEnd: end, summary, reportMetrics:weeklyReportMetrics(context,facts,start,end,now), promotions, nonPromotions, nonPromotionContext: nonPool, pending,excludedNonPromotions,...(monthlyPlans?.length?{monthlyPlans}:{}) };
    return { ...base, fingerprint: sourceHash(base) };
}
export function selectWeeklyMaterial(material: WeeklyMaterial, promotionKeys: string[], nonSelections: Array<{
    scheduleId: string;
    checkpointType: string;
}>) {
    const promotions = material.promotions.filter(p => promotionKeys.includes(p.key));
    const keys = new Set(nonSelections.map(s => `${s.scheduleId}:${s.checkpointType}`));
    const primary = material.nonPromotions.filter(p => keys.has(p.key)).map(p => ({ ...p, comparisonOnly: false }));
    const posts=new Set(primary.map(p=>p.contentId));
    const comparison = material.nonPromotionContext.filter(p=>posts.has(p.contentId)&&!keys.has(p.key)).map(p=>({...p,comparisonOnly:true}));
    return { promotions, nonPromotions: [...primary, ...comparison],excludedNonPromotions:material.excludedNonPromotions??[] };
}

/** 仅供可编辑草稿兼容：补齐缺失的当日状态，不刷新指标、来源指纹或人工输入。 */
export async function readWeeklyDraftStates(db: Database, material: WeeklyMaterial): Promise<WeeklyMaterial> {
    const missing = (card: WeeklyPromotionCard, fact: Fact) => !fact.actualStatusSnapshot && !card.dailyStates?.[fact.metricDate];
    if (!material.promotions.some(card => card.facts.some(fact => missing(card, fact)))) return material;
    const context = await readPromotionContext(db);
    const metrics = new Map(context.metrics.map(fact => [`${fact.campaignId}:${fact.metricDate}`, fact]));
    return { ...material, promotions: material.promotions.map(card => {
        const campaign = context.campaigns.find(c => c.id === card.campaignId && c.scheduleId === card.scheduleId);
        if (!campaign) return card;
        const dailyStates = { ...card.dailyStates };
        for (const fact of card.facts) {
            if (!missing(card, fact)) continue;
            const recorded = metrics.get(`${card.campaignId}:${fact.metricDate}`);
            // 必须有同一活动同一天的真实记录；不能由当前状态推断删除或缺失的日度事实。
            if (!recorded) continue;
            const state = recorded.actualStatusSnapshot ?? promotionStateOn(campaign, context, fact.metricDate)?.currentStatus;
            if (state) dailyStates[fact.metricDate] = state;
        }
        return { ...card, dailyStates };
    }) };
}
