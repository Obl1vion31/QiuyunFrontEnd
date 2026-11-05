import {createHash} from 'node:crypto';
import {and,eq,inArray,sql} from 'drizzle-orm';
import {z} from 'zod';
import type {Database} from './client';
import * as s from './schema';
import {effectiveMonthlySchedule,type PlanContent} from './monthly-plan-types';

export const monthlyLinksSchema=z.object({
 requestId:z.uuid(),groupId:z.string().min(1).max(200),week:z.number().int().min(1).max(5),
 expectedRevision:z.number().int().nonnegative(),expectedAssignmentVersion:z.string().regex(/^[a-f0-9]{64}$/),
 scheduleIds:z.array(z.uuid()).max(1000),versions:z.record(z.uuid(),z.string().regex(/^[a-f0-9]{32}$/)),
 reason:z.string().trim().max(2000).default('')
}).strict().refine(v=>new Set(v.scheduleIds).size===v.scheduleIds.length,'排期不能重复选择。');
export type MonthlyLinksInput=z.infer<typeof monthlyLinksSchema>;
export const monthlyLinkPath=(id:string)=>'/api/monthly-plans/'+id+'/links';
export const linkDigest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const linkRequestHash=(input:MonthlyLinksInput)=>linkDigest({...input,scheduleIds:[...input.scheduleIds].sort(),versions:Object.fromEntries(Object.entries(input.versions).sort(([a],[b])=>a.localeCompare(b)))});
export async function pendingMonthlyLinks(db:Database,planId:string){
 const rows=await db.select({id:s.operationsChangeProposal.id,body:s.operationsChangeProposal.body,createdAt:s.operationsChangeProposal.createdAt}).from(s.operationsChangeProposal).where(and(eq(s.operationsChangeProposal.path,monthlyLinkPath(planId)),eq(s.operationsChangeProposal.status,'pending')));
 return rows.map(row=>({...row,input:monthlyLinksSchema.parse(JSON.parse(row.body))}));
}
export const planLinkItems=(plan:{content:PlanContent;additions:Array<{content:PlanContent}>})=>[...plan.content.items,...plan.additions.flatMap(b=>b.content.items)];
export async function monthlyLinkState(db:Database,planId:string){
 const [plan]=await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.id,planId));
 if(!plan)return null;
 const assignments=await db.select().from(s.operationsMonthlyPlanAssignment).where(eq(s.operationsMonthlyPlanAssignment.planId,planId));
 const proposalIds=assignments.flatMap(a=>a.proposalId?[a.proposalId]:[]);
 const proposals=proposalIds.length?await db.select({id:s.operationsChangeProposal.id,status:s.operationsChangeProposal.status}).from(s.operationsChangeProposal).where(inArray(s.operationsChangeProposal.id,proposalIds)):[];
 return {plan,items:planLinkItems(plan),assignments,proposals,pending:await pendingMonthlyLinks(db,planId)};
}
export type MonthlyLinkState=NonNullable<Awaited<ReturnType<typeof monthlyLinkState>>>;
export function linkScope(state:MonthlyLinkState,groupId:string,week:number){return state.items.filter(i=>i.groupId===groupId&&i.week===week&&i.kind==='new'&&!i.scheduleId);}
export function assignmentVersion(state:MonthlyLinkState,groupId:string,week:number,ignoreProposalId?:string){
 const items=linkScope(state,groupId,week);
 return linkDigest(items.map(item=>{
  const a=state.assignments.find(a=>a.itemId===item.id);
  return {itemId:item.id,scheduleId:a?.scheduleId??null,history:(a?.history??[]).filter(h=>!ignoreProposalId||h.proposalId!==ignoreProposalId),
   pending:a?.proposalId&&a.proposalId!==ignoreProposalId&&state.proposals.some(p=>p.id===a.proposalId&&p.status==='pending')?a.proposalId:null,
   reservations:state.pending.filter(p=>p.id!==ignoreProposalId&&p.input.groupId===groupId&&p.input.week===week).map(p=>p.id).sort()};
 }));
}
export type MonthlyPostTime={id:string;createdAt:Date;versionCreatedAt:Date;versionUpdatedAt:Date;planEffectiveAt:Date|null};
export async function monthlySubmittedAt(db:Database,post:MonthlyPostTime,now:Date){
 // 当前类型／应发日期能核实的服务器时间；审批创建的原帖沿用申请受理时间。
 let time=new Date(Math.max(post.createdAt.getTime(),post.versionUpdatedAt.getTime(),post.planEffectiveAt?.getTime()??0));
 if(post.versionUpdatedAt.getTime()<=post.versionCreatedAt.getTime()&&!post.planEffectiveAt){
  const [proposal]=await db.select({at:s.operationsChangeProposal.createdAt}).from(s.operationsChangeProposal).where(and(eq(s.operationsChangeProposal.status,'approved'),eq(s.operationsChangeProposal.target,'new'),sql`${s.operationsChangeProposal.result}->>'id' = ${post.id}`)).limit(1);
  if(proposal)time=proposal.at;
 }
 return new Date(Math.min(time.getTime(),now.getTime()));
}
export async function releaseMonthlyReservation(db:Database,proposalId:string){
 const rows=await db.select().from(s.operationsMonthlyPlanAssignment).where(eq(s.operationsMonthlyPlanAssignment.proposalId,proposalId));
 for(const row of rows){
  if(!row.scheduleId)continue;
  const [plan]=await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.id,row.planId));
  const item=plan&&planLinkItems(plan).find(i=>i.id===row.itemId);if(effectiveMonthlySchedule(row.history,row.scheduleId,item?.scheduleId??null)===row.scheduleId)continue;
  await db.update(s.operationsMonthlyPlanAssignment).set({scheduleId:null,updatedAt:new Date()}).where(eq(s.operationsMonthlyPlanAssignment.id,row.id));
 }
}
