import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {and,eq,gt,inArray,lt,or,sql} from 'drizzle-orm';
import type {Database} from './client';
import * as s from './schema';
import {WorkflowError} from './schedule-workflow';
import {writeResources} from './collaboration-resources';

export type LeaseIdentity={userId:string;sessionId:string;tabId:string};
const leaseTime=60_000;
export const overlaps=(a:string,b:string)=>a===b||a.startsWith(b+':')||b.startsWith(a+':');
export async function canonicalResources(db:Database,resources:string[]):Promise<string[]>{
 const result:string[]=[];
 for(const resource of resources){
  if(['taxonomy','promotion-stage-reviews'].includes(resource)){result.push(resource);continue;}
  if(!/^[\w:-]{1,240}$/.test(resource))throw new WorkflowError('编辑对象无效。',422);
  const [kind,id,...rest]=resource.split(':');
  if(kind==='year'?!/^20\d{2}$/.test(id):!z.uuid().safeParse(id).success)throw new WorkflowError('编辑对象无效。',422);
  if(kind==='campaign'){
   const [row]=await db.select({scheduleId:s.operationsPromotionCampaign.scheduleId}).from(s.operationsPromotionCampaign).where(eq(s.operationsPromotionCampaign.id,id));
   if(!row)throw new WorkflowError('推广活动不存在。',404);result.push(`schedule:${row.scheduleId}:campaign:${id}${rest.length?':'+rest.join(':'):''}`);
  }else if(kind==='metric'){
   const [row]=await db.select({campaignId:s.operationsPromotionDailyMetric.campaignId}).from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.id,id));
   if(!row)throw new WorkflowError('记录不存在。',404);
   const [campaign]=await db.select().from(s.operationsPromotionCampaign).where(eq(s.operationsPromotionCampaign.id,row.campaignId));result.push(`schedule:${campaign.scheduleId}`);
  }else if(kind==='content'){
   const rows=await db.select({id:s.operationsContentSchedule.id}).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentSchedule.contentVersionId,s.operationsContentVersion.id)).where(eq(s.operationsContentVersion.contentId,id));result.push(...rows.map(row=>`schedule:${row.id}`));
  }else if(kind==='plan'){
   const [row]=await db.select().from(s.operationsAnnualPlan).where(eq(s.operationsAnnualPlan.id,id));if(!row)throw new WorkflowError('规划不存在。',404);result.push(`year:${row.year}:plan:${id}`);
  }else if(kind==='stageReview'){
   const [row]=await db.select().from(s.operationsPromotionStageReview).where(eq(s.operationsPromotionStageReview.id,id));if(!row)throw new WorkflowError('阶段复盘不存在。',404);result.push('promotion-stage-reviews');
  }else if(kind==='meetingVersion'){
   const [row]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,id));if(!row)throw new WorkflowError('会议版本不存在。',404);result.push(`meeting:${row.meetingId}`);
  }else if(kind==='attachment'){
   const [row]=await db.select().from(s.operationsMeetingAttachment).where(eq(s.operationsMeetingAttachment.id,id));if(!row)throw new WorkflowError('附件不存在。',404);result.push(`meeting:${row.meetingId}`);
  }else if(kind==='decision'){
   const rows=await db.select().from(s.operationsReviewMeetingVersion);const decision=rows.flatMap(row=>(row.snapshot as any)?.generated?.meetingDecisions??[]).find((row:any)=>row.id===resource.slice('decision:'.length));
   if(!decision)throw new WorkflowError('安排不存在。',404);result.push(`schedule:${decision.scheduleId}`);
  }else if(kind==='proposal'){
   const [row]=await db.select().from(s.operationsChangeProposal).where(eq(s.operationsChangeProposal.id,id));if(!row)throw new WorkflowError('申请不存在。',404);result.push(...await canonicalResources(db,[row.target.replace(/^annual:/,'plan:')]));
  }else if(['schedule','meeting','year','account'].includes(kind))result.push(resource);
  else throw new WorkflowError('不支持此编辑对象。',422);
 }
 return [...new Set(result)].sort();
}
async function lockRoots(db:Database,resources:string[]){
 for(const root of [...new Set(resources.map(value=>value.split(':').slice(0,2).join(':')))].sort())await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`edit:${root}`},0))`);
}
const revision=(token:string)=>createHash('sha256').update(token).digest('hex');
export async function leaseOccupants(db:Database,identity:LeaseIdentity,raw:string[],now=new Date()){
 const resources=await canonicalResources(db,raw);
 const rows=await db.select({resource:s.businessEditLease.resource,token:s.businessEditLease.token,expiresAt:s.businessEditLease.expiresAt,userId:s.businessEditLease.userId,sessionId:s.businessEditLease.sessionId,tabId:s.businessEditLease.tabId,name:s.authUser.name,role:s.authUser.role}).from(s.businessEditLease).innerJoin(s.authUser,eq(s.authUser.id,s.businessEditLease.userId)).where(and(gt(s.businessEditLease.expiresAt,now),eq(s.authUser.enabled,true)));
 const positions=await db.select().from(s.businessPresence).where(gt(s.businessPresence.expiresAt,now));
 return rows.filter(row=>resources.some(resource=>overlaps(resource,row.resource))).map(row=>({resource:row.resource,own:row.sessionId===identity.sessionId&&row.tabId===identity.tabId,name:row.role==='admin'?'Admin':row.name,role:row.role,revision:revision(row.token),expiresAt:row.expiresAt.toISOString(),field:positions.find(position=>position.sessionId===row.sessionId&&position.tabId===row.tabId)?.field??null}));
}
export async function acquireLeases(db:Database,identity:LeaseIdentity,raw:string[],now=new Date(),takeover?:Record<string,string>){
 const resources=await canonicalResources(db,raw);await lockRoots(db,resources);
 const existing=await db.select().from(s.businessEditLease).where(gt(s.businessEditLease.expiresAt,now));
 const conflicts=existing.filter(lease=>resources.some(resource=>overlaps(lease.resource,resource))&&(lease.sessionId!==identity.sessionId||lease.tabId!==identity.tabId));
 if(conflicts.length){
  if(!takeover||conflicts.some(lease=>takeover[lease.resource]!==revision(lease.token)))throw new WorkflowError(takeover?'占用情况已变化，请重新确认。':'已有其他人正在编辑。',409);
  await db.delete(s.businessEditLease).where(inArray(s.businessEditLease.resource,conflicts.map(lease=>lease.resource)));
 }
 const leases=[];
 for(const resource of resources){const owned=existing.find(row=>row.resource===resource&&row.sessionId===identity.sessionId&&row.tabId===identity.tabId);
  const value={resource,...identity,token:owned?.token??randomUUID(),expiresAt:new Date(now.getTime()+leaseTime)};
  await db.insert(s.businessEditLease).values(value).onConflictDoUpdate({target:s.businessEditLease.resource,set:value});leases.push({resource,token:value.token,expiresAt:value.expiresAt.toISOString()});
 }
 return leases;
}
export async function verifyLeases(db:Database,identity:LeaseIdentity,resources:string[],tokens:Record<string,string>,now=new Date()){
 await lockRoots(db,resources);
 const leases=await db.select().from(s.businessEditLease).where(gt(s.businessEditLease.expiresAt,now));
 for(const resource of resources){const lease=leases.find(row=>overlaps(row.resource,resource)&&row.sessionId===identity.sessionId&&row.tabId===identity.tabId&&tokens[row.resource]===row.token&&(row.resource===resource||resource.startsWith(row.resource+':')));
  if(!lease||leases.some(row=>overlaps(row.resource,resource)&&(row.sessionId!==identity.sessionId||row.tabId!==identity.tabId)))throw new WorkflowError('编辑权限已失效，请重新取得编辑权并核对最新数据。输入已保留。',409);
 }
}
export async function requestResources(db:Database,request:Request){
 let data:Record<string,unknown>={};
 if(!['GET','HEAD','DELETE'].includes(request.method)){
  try{data=request.headers.get('content-type')?.includes('application/json')?await request.clone().json():Object.fromEntries((await request.clone().formData()).entries());}catch{return [];}
 }else if(request.method==='DELETE'&&request.headers.get('content-type')?.includes('application/json')){try{data=await request.clone().json();}catch{return [];}}
 return canonicalResources(db,writeResources(new URL(request.url).pathname,request.method,data));
}
export async function renewLeases(db:Database,identity:LeaseIdentity,tokens:Record<string,string>){
 const resources=Object.keys(tokens);await lockRoots(db,resources);
 const rows=resources.length?await db.select().from(s.businessEditLease).where(inArray(s.businessEditLease.resource,resources)):[];
 const expiresAt=new Date(Date.now()+leaseTime),valid=rows.filter(row=>row.sessionId===identity.sessionId&&row.tabId===identity.tabId&&row.token===tokens[row.resource]&&row.expiresAt>new Date());
 if(valid.length)await db.update(s.businessEditLease).set({expiresAt}).where(inArray(s.businessEditLease.resource,valid.map(row=>row.resource)));
 return {leases:valid.map(row=>({resource:row.resource,token:row.token,expiresAt:expiresAt.toISOString()})),lost:resources.filter(resource=>!valid.some(row=>row.resource===resource))};
}
export async function releaseLeases(db:Database,identity:LeaseIdentity,resources:string[],tokens:Record<string,string>={}){
 if(resources.length)await db.delete(s.businessEditLease).where(and(inArray(s.businessEditLease.resource,resources),eq(s.businessEditLease.sessionId,identity.sessionId),eq(s.businessEditLease.tabId,identity.tabId),or(...resources.map(resource=>and(eq(s.businessEditLease.resource,resource),tokens[resource]?eq(s.businessEditLease.token,tokens[resource]):undefined)))));
}
export async function cleanExpiredCollaboration(db:Database){const now=new Date();await db.delete(s.businessEditLease).where(lt(s.businessEditLease.expiresAt,now));await db.delete(s.businessPresence).where(lt(s.businessPresence.expiresAt,now));}
