import {eq} from 'drizzle-orm';
import {z} from 'zod';
import type {Database} from './client';
import * as s from './schema';
import {readTaxonomy} from './taxonomy-store';
import {readPromotionContext} from './promotion-pauses';
import {promotionTotals,type PromotionFact} from './promotion-overview';
import {promotionStateOn,promotionLabels} from './promotion-state.mjs';
import {testingCycles,testingCycleOn} from './promotion-cycles.mjs';
import {requiredPromotionStage} from './promotion-review-required';
import {nextDateKey,previousDateKey,shanghaiDateKey} from './promotion-rules.mjs';
import {completionStatus,needsRegistration} from './schedule-rules.mjs';

export const monthlyQuerySchema=z.object({month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/,'请选择有效月份。'),subject:z.string().default(''),category:z.string().default('')});
export type MonthlyQuery=z.infer<typeof monthlyQuerySchema>;
type Context=Awaited<ReturnType<typeof readPromotionContext>>;
export interface MonthlyPost {
 id:string;contentId:string;contentName:string;versionNumber:number;subjectId:string;subjectName:string;categoryId:string|null;categoryName:string|null;
 plannedPublishAt:Date;actualPublishAt:Date|null;planRevision:number;isPromoted:boolean;promotionStatus:string;
}
interface MonthlySource {
 posts:MonthlyPost[];history:typeof s.operationsSchedulePlanHistory.$inferSelect[];reasons:typeof s.operationsScheduleDelayReason.$inferSelect[];
 metrics:PromotionFact[];context:Context;taxonomy:Awaited<ReturnType<typeof readTaxonomy>>;
}
const monthOf=(date:Date)=>shanghaiDateKey(date).slice(0,7);
const cents=(value:number)=>Math.round(value*100)/100;
export const monthlyQuery=(params:URLSearchParams,now=new Date())=>monthlyQuerySchema.parse({month:params.get('month')??shanghaiDateKey(now).slice(0,7),subject:params.get('subject')??'',category:params.get('category')??''});

/** 月额按事实发生日汇总；失败判定读取当前有效历史，费用不挪到淘汰月份。 */
export function buildMonthlyOperations(source:MonthlySource,query:MonthlyQuery,now=new Date()) {
 const today=shanghaiDateKey(now),from=query.month+'-01',nextMonth=new Date(`${from}T00:00:00Z`);nextMonth.setUTCMonth(nextMonth.getUTCMonth()+1);
 const through=previousDateKey(nextMonth.toISOString().slice(0,10)),inMonth=(date:string)=>date>=from&&date<=through;
 const posts=source.posts.filter(p=>(!query.subject||p.subjectId===query.subject)&&(!query.category||p.categoryId===query.category));
 const postMap=new Map(posts.map(p=>[p.id,p]));
 const scheduleRows=posts.map(post=>{
  const currentMonth=monthOf(post.plannedPublishAt)===query.month,publishedThisMonth=Boolean(post.actualPublishAt&&monthOf(post.actualPublishAt)===query.month);
  const history=source.history.filter(h=>h.scheduleId===post.id).sort((a,b)=>a.revision-b.revision);
  const movedOut=!currentMonth&&!post.actualPublishAt&&history.some(h=>monthOf(h.plannedPublishAt)===query.month);
  const status=completionStatus(post.plannedPublishAt,post.actualPublishAt),missing=needsRegistration(post,now);
  const reasons=source.reasons.filter(r=>r.scheduleId===post.id&&r.planRevision===post.planRevision).sort((a,b)=>a.dayNumber-b.dayNumber);
  const operational=reasons.some(r=>r.responsibility==='self'),external=reasons.some(r=>['external','requester'].includes(r.responsibility));
  return {id:post.id,contentName:post.contentName,versionNumber:post.versionNumber,subjectName:post.subjectName,categoryName:post.categoryName,
   plannedAt:post.plannedPublishAt.toISOString(),actualAt:post.actualPublishAt?.toISOString()??null,currentMonth,publishedThisMonth,movedOut,status,missing,
   severe:missing&&now.getTime()-post.plannedPublishAt.getTime()>48*3600000,changedPending:currentMonth&&!post.actualPublishAt&&history.length>0,
   operational:currentMonth&&(status==='delayed'||missing)&&operational,mixed:operational&&external,
   history:history.map(h=>({from:h.plannedPublishAt.toISOString(),to:h.newPlannedPublishAt.toISOString(),at:h.endedAt.toISOString(),reason:h.reason})),
   reasons:reasons.map(r=>({day:r.dayNumber,at:r.dueAt.toISOString(),responsibility:r.responsibility,reason:r.reason})),
  };
 }).filter(p=>p.currentMonth||p.publishedThisMonth||p.movedOut).sort((a,b)=>Number(b.severe)-Number(a.severe)||Number(b.missing)-Number(a.missing)||b.plannedAt.localeCompare(a.plannedAt));
 const planned=scheduleRows.filter(p=>p.currentMonth),registered=planned.filter(p=>p.actualAt),delayed=registered.filter(p=>p.status==='delayed');
 const publication={planned:planned.length,published:scheduleRows.filter(p=>p.publishedThisMonth).length,newPublished:scheduleRows.filter(p=>p.publishedThisMonth&&p.versionNumber===0).length,
  revisionPublished:scheduleRows.filter(p=>p.publishedThisMonth&&p.versionNumber>0).length,crossMonthPublished:scheduleRows.filter(p=>p.publishedThisMonth&&!p.currentMonth).length,
  registered:registered.length,onTime:registered.filter(p=>p.status==='on_time').length,delayed:delayed.length,delayRate:registered.length?delayed.length/registered.length*100:null,
  missing:planned.filter(p=>p.missing).length,severe:planned.filter(p=>p.severe).length,pending:planned.filter(p=>!p.actualAt&&!p.missing).length,
  operational:planned.filter(p=>p.operational).length,changedPending:scheduleRows.filter(p=>p.changedPending).length,movedOut:scheduleRows.filter(p=>p.movedOut).length};

 const campaigns=source.context.campaigns.filter(c=>postMap.has(c.scheduleId));
 const campaignMap=new Map(campaigns.map(c=>[c.id,c]));
 const facts=source.metrics.filter(m=>campaignMap.has(m.campaignId));
 const monthlyFacts=facts.filter(m=>inMonth(m.metricDate));
 const wastedIds=new Set<string>();
 const wastedRows:Array<{key:string;scheduleId:string;contentName:string;versionNumber:number;subjectName:string;categoryName:string|null;cycle:number;startedOn:string;discardedOn:string;monthSpend:number;totalSpend:number;residualSpend:number}>=[];
 const missingRows:Array<{campaignId:string;scheduleId:string;contentName:string;versionNumber:number;dates:string[]}>=[];
 const statuses=new Map<string,string>();
 for(const campaign of campaigns){
  const post=postMap.get(campaign.scheduleId)!;
  const state=promotionStateOn(campaign,source.context,today);
  const status=campaign.endedOn&&campaign.endedOn<=today&&['test_discarded','formal_discarded','ended'].includes(campaign.currentStatus)?campaign.currentStatus:state?.currentStatus??campaign.currentStatus;
  statuses.set(campaign.id,status);
  const ends:string[]=(state?.stages??[]).filter(stage=>stage.outcome==='test_discarded'&&stage.endedOn).map(stage=>stage.endedOn!);
  if(status==='test_discarded'&&campaign.endedOn)ends.push(campaign.endedOn);
  const related=facts.filter(m=>m.campaignId===campaign.id);
  for(const cycle of testingCycles(campaign,source.context,today)){
   const discardedOn=ends.find(date=>date>=cycle.startedOn&&(!cycle.endedOn||date<=cycle.endedOn));if(!discardedOn)continue;
   const cycleFacts=related.filter(m=>m.stageTypeSnapshot==='testing'&&(m.sourceStageStartedOn??testingCycleOn(campaign,source.context,m.metricDate)?.startedOn)===cycle.startedOn);
   const monthFacts=cycleFacts.filter(m=>inMonth(m.metricDate));
   for(const m of monthFacts)wastedIds.add(m.id);
   if(monthFacts.length)wastedRows.push({key:`${campaign.id}:${cycle.startedOn}`,scheduleId:post.id,contentName:post.contentName,versionNumber:post.versionNumber,subjectName:post.subjectName,categoryName:post.categoryName,
    cycle:cycle.number,startedOn:cycle.startedOn,discardedOn,monthSpend:promotionTotals(monthFacts).spend??0,totalSpend:promotionTotals(cycleFacts).spend??0,residualSpend:promotionTotals(monthFacts.filter(m=>m.recordKind==='test_residual')).spend??0});
  }
  const dates:string[]=[],end=[through,previousDateKey(today),campaign.endedOn??'9999-12-31'].sort()[0];
  const recorded=new Set(related.filter(m=>m.recordKind!=='test_residual').map(m=>m.metricDate));
  for(let day=[from,campaign.startedOn].sort().at(-1)!;day<=end;day=nextDateKey(day))if(!recorded.has(day)&&requiredPromotionStage(campaign,source.context,day))dates.push(day);
  if(dates.length)missingRows.push({campaignId:campaign.id,scheduleId:post.id,contentName:post.contentName,versionNumber:post.versionNumber,dates});
 }
 const spendRows=posts.flatMap(post=>{
  const ids=new Set(campaigns.filter(c=>c.scheduleId===post.id).map(c=>c.id)),rows=monthlyFacts.filter(m=>ids.has(m.campaignId));if(!rows.length)return [];
  const latest=campaigns.filter(c=>c.scheduleId===post.id).sort((a,b)=>a.startedOn.localeCompare(b.startedOn)).at(-1)!;
  const status=statuses.get(latest.id)??latest.currentStatus;
  return [{scheduleId:post.id,contentName:post.contentName,versionNumber:post.versionNumber,subjectId:post.subjectId,subjectName:post.subjectName,categoryId:post.categoryId,categoryName:post.categoryName,
   status,statusLabel:promotionLabels[status as keyof typeof promotionLabels]??status,...promotionTotals(rows),wasted:promotionTotals(rows.filter(m=>wastedIds.has(m.id))).spend??0}];
 }).sort((a,b)=>(b.spend??0)-(a.spend??0));
 const groups=new Map<string,typeof spendRows>();
 for(const row of spendRows){const key=`${row.subjectId}:${row.categoryId??''}`;groups.set(key,[...(groups.get(key)??[]),row]);}
 const categories=[...groups.entries()].map(([key,rows])=>{
  const ids=new Set(rows.map(r=>r.scheduleId)),metrics=monthlyFacts.filter(m=>ids.has(campaignMap.get(m.campaignId)!.scheduleId));
  return {key,subjectId:rows[0].subjectId,subjectName:rows[0].subjectName,categoryName:rows[0].categoryName,posts:rows.length,...promotionTotals(metrics),wasted:cents(rows.reduce((n,r)=>n+r.wasted,0)),scheduleIds:rows.map(r=>r.scheduleId)};
 }).sort((a,b)=>(b.spend??0)-(a.spend??0));
 const subjects=[...new Set(spendRows.map(r=>r.subjectId))].map(id=>{const rows=spendRows.filter(r=>r.subjectId===id);return {id,name:rows[0].subjectName,spend:cents(rows.reduce((n,r)=>n+(r.spend??0),0)),wasted:cents(rows.reduce((n,r)=>n+r.wasted,0))};}).sort((a,b)=>b.spend-a.spend);
 return {query,generatedAt:now.toISOString(),from,through,today,taxonomy:source.taxonomy,publication,scheduleRows,
  spend:{...promotionTotals(monthlyFacts),wasted:monthlyFacts.length?promotionTotals(monthlyFacts.filter(m=>wastedIds.has(m.id))).spend??0:null,testing:promotionTotals(monthlyFacts.filter(m=>m.stageTypeSnapshot==='testing')).spend,scaling:promotionTotals(monthlyFacts.filter(m=>m.stageTypeSnapshot==='scaling')).spend},
  spendRows,categories,subjects,wastedRows:wastedRows.sort((a,b)=>b.monthSpend-a.monthSpend),missingRows};
}
export type MonthlyOperations=ReturnType<typeof buildMonthlyOperations>;

export async function readMonthlyOperations(db:Database,query:MonthlyQuery,now=new Date()):Promise<MonthlyOperations>{
 const [posts,history,reasons,metrics,context,taxonomy]=await Promise.all([
  db.select({id:s.operationsContentSchedule.id,contentId:s.operationsContentVersion.contentId,contentName:s.operationsContentVersion.contentName,versionNumber:s.operationsContentVersion.versionNumber,
   subjectId:s.operationsContentVersion.subjectId,subjectName:s.operationsSubject.name,categoryId:s.operationsContentVersion.categoryId,categoryName:s.operationsCategory.name,
   plannedPublishAt:s.operationsContentSchedule.plannedPublishAt,actualPublishAt:s.operationsContentSchedule.actualPublishAt,planRevision:s.operationsContentSchedule.planRevision,isPromoted:s.operationsContentSchedule.isPromoted,promotionStatus:s.operationsContentSchedule.promotionStatus})
   .from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentSchedule.contentVersionId,s.operationsContentVersion.id)).innerJoin(s.operationsSubject,eq(s.operationsContentVersion.subjectId,s.operationsSubject.id)).leftJoin(s.operationsCategory,eq(s.operationsContentVersion.categoryId,s.operationsCategory.id)),
  db.select().from(s.operationsSchedulePlanHistory),db.select().from(s.operationsScheduleDelayReason),db.select().from(s.operationsPromotionDailyMetric),readPromotionContext(db),readTaxonomy(db),
 ]);
 return buildMonthlyOperations({posts,history,reasons,metrics,context,taxonomy},query,now);
}
