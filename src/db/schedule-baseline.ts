import {and,eq,inArray,or,sql,gte,lt} from 'drizzle-orm';
import type {Database} from './client';
import * as s from './schema';
import {adjacentMonth} from './monthly-plan-types';
import {shanghaiDateKey} from './promotion-rules.mjs';

export interface BaselineItem {
 id:string;name:string;plannedAt:string;versionId?:string;contentId?:string;versionNumber?:number;
 subjectId?:string;subjectName?:string;categoryId?:string|null;categoryName?:string|null;
 operationType?:string|null;contentRole?:string|null;isPromoted?:boolean;syncToMoments?:boolean;projectDocUrl?:string|null;itemId?:string|null;
}
export interface ScheduleBaseline {schemaVersion:1;month:string;sealedAt:string;items:BaselineItem[]}
export interface ExecutionChange {at:string;actor:string;reason:string;before:Record<string,unknown>|null;after:Record<string,unknown>|null}
export interface ExecutionRecord extends BaselineItem {createdAt:string;cancelledAt:string|null;actualAt:string|null;history:ExecutionChange[]}
export interface ExecutionComparisonRow {
 id:string;name:string;versionNumber?:number;subjectName?:string;categoryName?:string|null;
 originalAt:string|null;plannedAt:string|null;actualAt:string|null;cancelled:boolean;missing:boolean;
 added:boolean;removed:boolean;changed:boolean;flags:string[];history:ExecutionChange[];
}
export interface ScheduleComparison {
 from:string;through:string;asOf:string;months:string[];baselineMonths:string[];
 original:number|null;current:number;added:number|null;removed:number|null;published:number;missing:number;rows:ExecutionComparisonRow[];
}
const stamp=(value:Date|string|null)=>value?new Date(value).toISOString():null;
const inDates=(value:string|null|undefined,from:string,through:string)=>!!value&&shanghaiDateKey(new Date(value))>=from&&shanghaiDateKey(new Date(value))<=through;
const compared=['versionId','name','subjectId','categoryId','operationType','contentRole','plannedAt','isPromoted','syncToMoments'] as const;
export function monthsInRange(from:string,through:string){
 const months:string[]=[];for(let month=from.slice(0,7);month<=through.slice(0,7);month=adjacentMonth(month,1))months.push(month);return months;
}
/** 回放截止后的结构变化；实发补登记仍按真实发生时间归属。 */
export function buildScheduleComparison(baselines:ScheduleBaseline[],records:ExecutionRecord[],from:string,through:string,now=new Date()):ScheduleComparison {
 const asOf=new Date(Math.min(now.getTime(),new Date(through+'T23:59:59.999+08:00').getTime())).toISOString();
 const months=monthsInRange(from,through),baselineMonths=baselines.map(b=>b.month),complete=months.every(m=>baselineMonths.includes(m));
 const original=new Map<string,{item:BaselineItem;sealedAt:string}>();
 for(const baseline of baselines)for(const item of baseline.items){
  const old=original.get(item.id);
  if(!old||!inDates(old.item.plannedAt,from,through)&&inDates(item.plannedAt,from,through))original.set(item.id,{item,sealedAt:baseline.sealedAt});
 }
 const source=new Map(records.map(r=>[r.id,r]));
 const rows:ExecutionComparisonRow[]=[];
 let originalCount=0,current=0,added=0,removed=0,published=0,missing=0;
 for(const id of new Set([...original.keys(),...source.keys()])){
  const base=original.get(id),record=source.get(id);
  let state:Record<string,unknown>|null=record?{...record}:base?{...base.item}:null;
  if(record){
   for(const event of [...record.history].reverse().sort((a,b)=>b.at.localeCompare(a.at)))if(event.at>asOf)state=event.before;
   if(record.createdAt>asOf)state=null;
  }
  const plannedAt=typeof state?.plannedAt==='string'?state.plannedAt:null,cancelled=!!state?.cancelledAt;
  const originalIn=!!base&&inDates(base.item.plannedAt,from,through);
  const currentIn=!!state&&!cancelled&&inDates(plannedAt,from,through);
  const actualAt=record?.actualAt??null,hasPublished=!!actualAt&&actualAt<=asOf;
  const publishedIn=hasPublished&&inDates(actualAt,from,through);
  const history=(record?.history??[]).filter(h=>h.at<=asOf&&(!base||h.at>base.sealedAt));
  const periodChanges=history.some(h=>inDates(h.at,from,through));
  if(!originalIn&&!currentIn&&!publishedIn&&!periodChanges)continue;
  const isAdded=currentIn&&!originalIn,isRemoved=originalIn&&!currentIn;
  const changed=!!base&&!!state&&compared.some(k=>base.item[k]!==undefined&&JSON.stringify(base.item[k]??null)!==JSON.stringify(state![k]??null));
  // 与排期提醒沿用同一2小时门槛，未登记不推断为漏发。
  const isMissing=currentIn&&!hasPublished&&!!plannedAt&&new Date(plannedAt).getTime()+2*3600000<=new Date(asOf).getTime();
  const flags:string[]=[];
  if(complete&&isAdded)flags.push(base?'移入本期':'新增');
  if(cancelled)flags.push('已取消');else if(complete&&isRemoved)flags.push('移出本期');
  if(base&&plannedAt&&plannedAt!==base.item.plannedAt)flags.push(plannedAt>base.item.plannedAt?'延后':'提前');
  if(changed&&compared.some(k=>k!=='plannedAt'&&base!.item[k]!==undefined&&JSON.stringify(base!.item[k]??null)!==JSON.stringify(state![k]??null)))flags.push('修改');
  if(isMissing)flags.push('到期未登记');
  if(hasPublished&&base&&new Date(actualAt!).getTime()>new Date(base.item.plannedAt).getTime()+2*3600000)flags.push('较V0延期发布');
  if(base&&!changed&&!cancelled&&history.length)flags.push('已恢复原计划');
  if(!flags.length)flags.push(base?(hasPublished?'按计划发布':'原计划待发'):complete&&publishedIn?(plannedAt?'跨期实发':'本期补登记'):'无V0基准');
  if(originalIn)originalCount++;if(currentIn)current++;if(isAdded)added++;if(isRemoved)removed++;if(publishedIn)published++;if(isMissing)missing++;
  rows.push({id,name:String(state?.name??base?.item.name??record?.name??'未命名帖子'),versionNumber:(state?.versionNumber??record?.versionNumber??base?.item.versionNumber) as number|undefined,
   subjectName:(state?.subjectName??base?.item.subjectName) as string|undefined,categoryName:(state?.categoryName??base?.item.categoryName) as string|null|undefined,
   originalAt:base?.item.plannedAt??null,plannedAt,actualAt:hasPublished?actualAt:null,cancelled,missing:isMissing,added:complete&&isAdded,removed:complete&&isRemoved,changed,flags,history});
 }
 rows.sort((a,b)=>Number(b.missing)-Number(a.missing)||(a.originalAt??a.plannedAt??'').localeCompare(b.originalAt??b.plannedAt??'')||a.id.localeCompare(b.id));
 return {from,through,asOf,months,baselineMonths,original:complete?originalCount:null,current,added:complete?added:null,removed:complete?removed:null,published,missing,rows};
}

/** 只读投影旧封存事实；缺少字段不以当前值补造。 */
export function legacyScheduleBaseline(month:string,sealedAt:string,plan:any):ScheduleBaseline|null{
 if(!plan?.items||!Array.isArray(plan.items))return null;
 const items:BaselineItem[]=[];
 for(const item of plan.items){
  if(!item.schedule?.id||!item.schedule.plannedAt)return null;
  items.push({id:item.schedule.id,name:item.schedule.name,plannedAt:stamp(item.schedule.plannedAt)!,itemId:item.id,
   subjectId:item.group?.subjectId,categoryId:item.group?.categoryId});
 }
 return {schemaVersion:1,month,sealedAt,items};
}
export async function readScheduleBaselines(db:Database,months:string[]){
 if(!months.length)return [];
 const plans=await db.select({month:s.operationsMonthlyPlan.month,sealedAt:s.operationsMonthlyPlan.lockedAt,
  baseline:sql<ScheduleBaseline|null>`${s.operationsReviewMeetingVersion.snapshot}#>'{generated,scheduleBaseline}'`,
  legacy:sql<unknown>`${s.operationsReviewMeetingVersion.snapshot}#>'{generated,monthly,executionPlan}'`,
 }).from(s.operationsMonthlyPlan).leftJoin(s.operationsReviewMeetingVersion,eq(s.operationsReviewMeetingVersion.id,s.operationsMonthlyPlan.sealedVersionId)).where(inArray(s.operationsMonthlyPlan.month,months));
 return plans.flatMap(p=>{const b=p.baseline??(p.sealedAt?legacyScheduleBaseline(p.month,p.sealedAt.toISOString(),p.legacy):null);return b?[b]:[];});
}
export async function readScheduleComparison(db:Database,from:string,through:string,now=new Date()){
 const baselines=await readScheduleBaselines(db,monthsInRange(from,through));
 const start=new Date(from+'T00:00:00+08:00'),end=new Date(through+'T23:59:59.999+08:00'),ids=baselines.flatMap(b=>b.items.map(i=>i.id));
 const rows=await db.select({id:s.operationsContentSchedule.id,contentId:s.operationsContentVersion.contentId,versionId:s.operationsContentVersion.id,versionNumber:s.operationsContentVersion.versionNumber,
  name:s.operationsContentVersion.contentName,subjectId:s.operationsContentVersion.subjectId,subjectName:s.operationsSubject.name,categoryId:s.operationsContentVersion.categoryId,categoryName:s.operationsCategory.name,
  operationType:s.operationsContent.operationType,contentRole:s.operationsContent.contentRole,projectDocUrl:s.operationsContentVersion.projectDocUrl,
  isPromoted:s.operationsContentSchedule.isPromoted,syncToMoments:s.operationsContentSchedule.syncToMoments,plannedAt:s.operationsContentSchedule.plannedPublishAt,
  actualAt:s.operationsContentSchedule.actualPublishAt,cancelledAt:s.operationsContentSchedule.cancelledAt,createdAt:s.operationsContentSchedule.createdAt,history:s.operationsContentSchedule.executionHistory,
 }).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentVersion.id,s.operationsContentSchedule.contentVersionId))
 .innerJoin(s.operationsContent,eq(s.operationsContent.id,s.operationsContentVersion.contentId)).innerJoin(s.operationsSubject,eq(s.operationsSubject.id,s.operationsContentVersion.subjectId))
 .leftJoin(s.operationsCategory,eq(s.operationsCategory.id,s.operationsContentVersion.categoryId)).where(or(
  and(gte(s.operationsContentSchedule.plannedPublishAt,start),lt(s.operationsContentSchedule.plannedPublishAt,new Date(end.getTime()+1))),
  and(gte(s.operationsContentSchedule.actualPublishAt,start),lt(s.operationsContentSchedule.actualPublishAt,new Date(end.getTime()+1))),
  ids.length?inArray(s.operationsContentSchedule.id,ids):undefined,
  sql`exists(select 1 from jsonb_array_elements(${s.operationsContentSchedule.executionHistory}) h where
   (h->>'at')::timestamptz between ${start.toISOString()} and ${end.toISOString()}
   or (h->'before'->>'plannedAt')::timestamptz between ${start.toISOString()} and ${end.toISOString()}
   or (h->'after'->>'plannedAt')::timestamptz between ${start.toISOString()} and ${end.toISOString()})`,
 ));
 return buildScheduleComparison(baselines,rows.map(r=>({...r,plannedAt:r.plannedAt.toISOString(),actualAt:stamp(r.actualAt),cancelledAt:stamp(r.cancelledAt),createdAt:r.createdAt.toISOString()})),from,through,now);
}
