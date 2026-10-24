/** 最新排期之外的延期原因实际删除，不进入业务归档或审批重放。 */
import {and, eq, inArray} from 'drizzle-orm';
import type {Database} from './client';
import {delayDays} from './schedule-rules.mjs';
import {operationsContentSchedule as schedules, operationsScheduleDelayReason as reasons,
  operationsChangeProposal as proposals, operationsPromotionTimelineAudit as audits} from './schema';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Schedule = typeof schedules.$inferSelect;
type Json = Record<string, unknown>;
export function withoutLegacyDelay<T extends {delayReason?: unknown}>(value:T) {
  const {delayReason: _obsolete, ...rest} = value;
  return rest;
}
function validReason(value:unknown, revision:number, days:Set<number>) {
  const row=value as Json;
  return Number(row?.planRevision)===revision && days.has(Number(row?.dayNumber));
}
export function cleanDelaySnapshot(snapshot:Json, revision:number, days:Set<number>):Json {
  return {...snapshot,
    ...(snapshot.schedule?{schedule:withoutLegacyDelay(snapshot.schedule as Json)}:{}),
    ...(Array.isArray(snapshot.reasons)?{reasons:snapshot.reasons.filter(row=>validReason(row,revision,days))}:{}),
  };
}
export async function cleanDelayRequest(body:string, contentType:string, path:string, revision:number, days:Set<number>) {
  if (!body) return {body,contentType};
  const clean=(input:Json)=>{
    const next={...input};delete next.delayReason;
    if ('dailyReasons' in next) {
      const raw=next.dailyReasons, entries=typeof raw==='string'?JSON.parse(raw):raw;
      const kept=Array.isArray(entries)?entries.filter(row=>validReason(row,revision,days)):[];
      next.dailyReasons=typeof raw==='string'?JSON.stringify(kept):kept;
    }
    if(path.endsWith('/delay-reasons')&&!validReason(next,revision,days)) {
      for(const key of ['reason','responsibility','expectedUpdatedAt','expectedHistoryLength'])delete next[key];
    }
    return next;
  };
  if(contentType.includes('application/json')) {
    const input=JSON.parse(body),next=clean(input);
    return {body:JSON.stringify(next)===JSON.stringify(input)?body:JSON.stringify(next),contentType};
  }
  const form=await new Request('http://cleanup.local',{method:'POST',headers:{'Content-Type':contentType},body}).formData();
  const input=Object.fromEntries(form),next=clean(input);
  if(JSON.stringify(next)===JSON.stringify(input))return {body,contentType};
  for(const key of Object.keys(input))if(!(key in next))form.delete(key);
  for(const [key,value] of Object.entries(next))if(value!==input[key])form.set(key,String(value));
  const encoded=new Response(form);
  return {body:await encoded.text(),contentType:encoded.headers.get('content-type')!};
}

/** 由改期／实发更正和一次性清理复用；调用者持有排期行锁。 */
export async function pruneScheduleDelayReasons(tx:Transaction, schedule:Schedule, now=new Date()) {
  const through=new Date(Math.min((schedule.actualPublishAt??now).getTime(),now.getTime()));
  const days=new Set(delayDays(schedule.plannedPublishAt,through).map(day=>day.dayNumber));
  const rows=await tx.select().from(reasons).where(eq(reasons.scheduleId,schedule.id));
  const stale=rows.filter(row=>!validReason(row,schedule.planRevision,days));
  if(stale.length)await tx.delete(reasons).where(inArray(reasons.id,stale.map(row=>row.id)));
  if(schedule.delayReason!==null)await tx.update(schedules).set({delayReason:null}).where(eq(schedules.id,schedule.id));
  let snapshots=0;
  for(const row of await tx.select().from(proposals).where(and(eq(proposals.module,'schedule'),eq(proposals.target,`schedule:${schedule.id}`)))) {
    const before=cleanDelaySnapshot(row.before,schedule.planRevision,days),after=cleanDelaySnapshot(row.after,schedule.planRevision,days);
    const request=await cleanDelayRequest(row.body,row.contentType,row.path,schedule.planRevision,days);
    if(JSON.stringify(before)===JSON.stringify(row.before)&&JSON.stringify(after)===JSON.stringify(row.after)&&request.body===row.body)continue;
    await tx.update(proposals).set({before,after,...request,...(row.status==='pending'?{status:'obsolete' as const,decisionReason:'排期已更新，请按最新排期重新提交。',decidedAt:now}:{})}).where(eq(proposals.id,row.id));
    snapshots++;
  }
  for(const row of await tx.select().from(audits).where(eq(audits.scheduleId,schedule.id))) {
    const before=cleanDelaySnapshot(row.before,schedule.planRevision,days),after=cleanDelaySnapshot(row.after,schedule.planRevision,days);
    if(JSON.stringify(before)===JSON.stringify(row.before)&&JSON.stringify(after)===JSON.stringify(row.after))continue;
    await tx.update(audits).set({before,after}).where(eq(audits.id,row.id));snapshots++;
  }
  return {deleted:stale.length,snapshots,legacyCleared:schedule.delayReason!==null};
}
