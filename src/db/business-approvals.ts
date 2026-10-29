import {readPostSchemas} from './taxonomy-store';
import {createHash} from 'node:crypto';
import {withoutLegacyDelay} from './schedule-delay-cleanup';
import type {APIContext,APIRoute} from 'astro';
import {and,eq,inArray,desc} from 'drizzle-orm';
import {getDb,withDatabase,type Database} from './client';
import * as s from './schema';
import {requiresPlanApproval} from './schedule-rules.mjs';
import {effectiveBusinessPermissions,lockBusinessWrites,withBusinessExecution} from '../auth/business-permissions';
import {isConfigurableBusinessWrite,type BusinessOperation} from '../auth/business-capabilities';
import {AccessDenied,requireAdmin,type OperationsUser} from '../auth/permissions';
import {workflowErrorResponse} from './workflow-api';
import {lockPromotionWorkflow} from './promotion-pauses';
import {extractPublicationLink} from './publication-link.mjs';
import {updateAnnualPlanSchema} from './annual-plan';
import {editScheduleInputFromForm,publicationSchema,publicationInputFromForm} from './validation';
type Context=Pick<APIContext,'request'|'url'|'locals'>;
type Write={module:'annual'|'schedule';target:string;operations:BusinessOperation[];values:Record<string,unknown>};
const stable=(value:unknown):string=>JSON.stringify(value,(_key,item)=>Array.isArray(item)&&item.every(row=>row&&typeof row==='object'&&'id' in row)?[...item].sort((a,b)=>String(a.id).localeCompare(String(b.id))):item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
const digest=(value:unknown)=>createHash('sha256').update(stable(value)).digest('hex');
export const isBusinessWrite=isConfigurableBusinessWrite;
async function describe(db:Database,request:Request):Promise<Write>{
  const path=new URL(request.url).pathname,method=request.method;
  let values:Record<string,unknown>={};
  let form:FormData|undefined;
  if(method!=='DELETE'){
    if(request.headers.get('content-type')?.includes('application/json'))values=await request.clone().json();
    else{form=await request.clone().formData();values=Object.fromEntries(form.entries());}
  }
  const parts=path.split('/').filter(Boolean);
  if(parts[1]==='operations-annual-plans'){
    const operations:BusinessOperation[]=[];
    if(parts[2]==='year')operations.push(parts[4]==='copy'?'annual.copy':'annual.instructions');
    else if(!parts[2])operations.push('annual.create');
    else if(parts[3]==='restore')operations.push('annual.restore');
    else{
      const normalized=updateAnnualPlanSchema.safeParse(values);if(normalized.success)values={...values,...normalized.data};
      const [current]=await db.select().from(s.operationsAnnualPlan).where(eq(s.operationsAnnualPlan.id,parts[2]));
      if(!current)throw new Error('没有找到规划行。');
      if(values.isActive!==current.isActive)operations.push('annual.toggle');
      const [blocks,links]=await Promise.all([db.select().from(s.operationsAnnualPlanBlock).where(eq(s.operationsAnnualPlanBlock.planId,current.id)),db.select().from(s.operationsAnnualPlanLink).where(eq(s.operationsAnnualPlanLink.planId,current.id))]);
      const rowFields=['year','sectionKey','sectionLabel','subjectId','rowName','categoryId','note','sortOrder'] as const;
      const strip=(rows:Record<string,unknown>[],keys:string[])=>rows.sort((a,b)=>Number(a.sortOrder)-Number(b.sortOrder)).map(row=>Object.fromEntries(keys.map(key=>[key,row[key]??null])));
      const blockKeys=['startSlot','endSlot','promotionRanges','label','note','sortOrder'];const linkKeys=['label','url','sortOrder'];
      if(rowFields.some(key=>(values[key]??null)!==(current[key]??null))||stable(strip(blocks,blockKeys))!==stable(strip((values.blocks??[]) as Record<string,unknown>[],blockKeys))||stable(strip(links,linkKeys))!==stable(strip((values.links??[]) as Record<string,unknown>[],linkKeys)))operations.push('annual.edit');
      if(!operations.length)operations.push('annual.edit');
    }
    return {module:'annual',target:parts[2]==='year'?`year:${parts[3]}`:parts[2]?`annual:${parts[2]}`:`year:${values.year}`,operations,values};
  }
  if(parts.length===2)return {module:'schedule',target:'new',operations:['schedule.create'],values};
  if(parts[2]==='versions')return {module:'schedule',target:`schedule:${values.sourceScheduleId}`,operations:['schedule.revise'],values};
  const [current]=await db.select().from(s.operationsContentSchedule).where(eq(s.operationsContentSchedule.id,parts[2]));
  if(!current)throw new Error('没有找到排期。');
  const operations:BusinessOperation[]=[];
  if(form&&method==='PATCH'){
    const normalized=parts[3]==='publication'?publicationSchema.safeParse(publicationInputFromForm(form)):(await readPostSchemas(db)).editScheduleSchema.safeParse(editScheduleInputFromForm(form));
    if(normalized.success)values={...values,...normalized.data};
  }
  const checked=(value:unknown)=>value===true||value==='on';
  const dateValue=(value:unknown,fallback:Date|null)=>value instanceof Date?value:value?new Date(`${value}:00+08:00`):fallback;
  if(method==='DELETE')operations.push('schedule.delete');
  else if(parts[3]==='delay-reasons')operations.push('schedule.reason');
  else if(parts[3]==='publication'){
    const actual=dateValue(values.actualPublishAt,current.actualPublishAt);
    if(current.actualPublishAt&&actual?.getTime()!==current.actualPublishAt.getTime())operations.push('schedule.correctPublication');
    const [version]=await db.select().from(s.operationsContentVersion).where(eq(s.operationsContentVersion.id,current.contentVersionId));
    const link=values.publicationUrl?extractPublicationLink(String(values.publicationUrl)).url:null;
    if(!current.actualPublishAt||link!==(current.publicationUrl??null)||(values.projectDocUrl||version.projectDocUrl)!==version.projectDocUrl||!operations.length)operations.push('schedule.publish');
    if(String(values.dailyReasons??'[]')!=='[]')operations.push('schedule.reason');
  }else{
    if(parts[3]!=='change-requests'){
      const [version]=await db.select().from(s.operationsContentVersion).where(eq(s.operationsContentVersion.id,current.contentVersionId));
      if(['contentName','subjectId','categoryId','projectDocUrl'].some(key=>(values[key]||null)!==(version[key as keyof typeof version]||null))||current.isPromoted!==checked(values.isPromoted)||current.syncToMoments!==checked(values.syncToMoments))operations.push('schedule.edit');
      if(current.isPromoted&&!checked(values.isPromoted)){
        const campaigns=await db.select({id:s.operationsPromotionCampaign.id}).from(s.operationsPromotionCampaign).where(eq(s.operationsPromotionCampaign.scheduleId,current.id));
        if(campaigns.length)operations.push('schedule.endPromotion');
      }
    }
    const next=dateValue(values.plannedPublishAt,current.plannedPublishAt)!;
    if(next.getTime()!==current.plannedPublishAt.getTime())operations.push(requiresPlanApproval(current,new Date())?'schedule.overdueReschedule':'schedule.reschedule');
    if(!operations.length)operations.push('schedule.edit');
  }
  return {module:'schedule',target:`schedule:${current.id}`,operations,values};
}
/** 只保存业务对象，绝不把账号、会话或凭据放进申请快照。 */
async function snapshot(db:Database,write:Write):Promise<Record<string,unknown>>{
  const [kind,id]=write.target.split(':');
  if(write.target==='new')return {};
  if(write.module==='annual'){
    const years=kind==='year'?[Number(id),...(write.values.targetYear?[Number(write.values.targetYear)]:[])]:[];
    const rows=await db.select().from(s.operationsAnnualPlan).where(kind==='annual'?eq(s.operationsAnnualPlan.id,id):inArray(s.operationsAnnualPlan.year,years));
    const ids=rows.map(row=>row.id);
    return {rows,blocks:ids.length?await db.select().from(s.operationsAnnualPlanBlock).where(inArray(s.operationsAnnualPlanBlock.planId,ids)):[],links:ids.length?await db.select().from(s.operationsAnnualPlanLink).where(inArray(s.operationsAnnualPlanLink.planId,ids)):[],years:years.length?await db.select().from(s.operationsAnnualPlanYear).where(inArray(s.operationsAnnualPlanYear.year,years)):[]};
  }
  const [schedule]=await db.select().from(s.operationsContentSchedule).where(eq(s.operationsContentSchedule.id,id));
  if(!schedule)return {};
  const [version]=await db.select().from(s.operationsContentVersion).where(eq(s.operationsContentVersion.id,schedule.contentVersionId));
  const versions=await db.select().from(s.operationsContentVersion).where(eq(s.operationsContentVersion.contentId,version.contentId));
  const campaigns=await db.select().from(s.operationsPromotionCampaign).where(eq(s.operationsPromotionCampaign.scheduleId,id));
  const campaignIds=campaigns.map(row=>row.id);
  const startPlans=await db.select().from(s.operationsPromotionStartPlan).where(eq(s.operationsPromotionStartPlan.scheduleId,id));
  const dayDecisions=campaignIds.length?await db.select().from(s.operationsPromotionDayDecision).where(inArray(s.operationsPromotionDayDecision.campaignId,campaignIds)):[];
  const [publicationEvent]=await db.select({after:s.operationsPublicationEvent.after}).from(s.operationsPublicationEvent).where(eq(s.operationsPublicationEvent.scheduleId,id)).orderBy(desc(s.operationsPublicationEvent.revision)).limit(1);
  const momentsConfirmation=publicationEvent?.after.momentsConfirmation;
  return {schedule:withoutLegacyDelay(schedule),versions,campaigns,
    ...(momentsConfirmation?{momentsConfirmation}:{}),
    ...(startPlans.length?{startPlans}:{}),...(dayDecisions.length?{dayDecisions}:{}),
    reasons:await db.select().from(s.operationsScheduleDelayReason).where(and(eq(s.operationsScheduleDelayReason.scheduleId,id),eq(s.operationsScheduleDelayReason.planRevision,schedule.planRevision))),
    plans:await db.select().from(s.operationsSchedulePlanHistory).where(eq(s.operationsSchedulePlanHistory.scheduleId,id)),
    metrics:campaignIds.length?await db.select().from(s.operationsPromotionDailyMetric).where(inArray(s.operationsPromotionDailyMetric.campaignId,campaignIds)):[],
    ranges:campaignIds.length?await db.select().from(s.operationsPromotionWaitRange).where(inArray(s.operationsPromotionWaitRange.campaignId,campaignIds)):[],
    reviews:await db.select().from(s.operationsNonPromotionReview).where(eq(s.operationsNonPromotionReview.scheduleId,id)),
    checkpoints:await db.select().from(s.operationsNonPromotionCheckpointEvent).where(eq(s.operationsNonPromotionCheckpointEvent.scheduleId,id)),
  };
}
class RolledBack extends Error{constructor(public response:Response,public after:Record<string,unknown>={}){super('ROLLBACK_BUSINESS_PREVIEW');}}
const accepted=(response:Response)=>response.status>=200&&response.status<400;
const pendingResponse=(id:string)=>Response.json({status:'pending_approval',requestId:id,message:'已提交管理员审核。'},{status:202});
export async function runBusinessWrite(context:Context,next:()=>Promise<Response>):Promise<Response>{
  try{
    if(context.request.headers.get('origin')!==context.url.origin)throw new AccessDenied('拒绝跨站写入。');
    const body=await context.request.clone().text();if(body.length>524288)return Response.json({message:'提交内容过长。'},{status:413});
    return await getDb().transaction(async tx=>withDatabase(tx,async()=>{
      await lockBusinessWrites(tx);await lockPromotionWorkflow(tx);
      const write=await describe(tx,context.request),actor=context.locals.user!;
      const effective=await effectiveBusinessPermissions(tx,actor);
      if(write.operations.some(operation=>effective[operation]==='disabled'))throw new AccessDenied('当前账号未开放这项操作。');
      if(!write.operations.some(operation=>effective[operation]==='review')){
        const response=await withBusinessExecution(actor,write.operations,next);
        if(!accepted(response))throw new RolledBack(response);
        return response;
      }
      const before=await snapshot(tx,write),fingerprint=digest(before);
      const grants=(await tx.select().from(s.operationsAccountPermission).where(and(eq(s.operationsAccountPermission.userId,actor.id),inArray(s.operationsAccountPermission.operation,write.operations)))).sort((a,b)=>a.operation.localeCompare(b.operation));
      const path=context.url.pathname.replace(/\/+$/,'');
      const key=digest({user:actor.id,path,method:context.request.method,values:write.values,fingerprint,grants});
      const [existing]=await tx.select().from(s.operationsChangeProposal).where(eq(s.operationsChangeProposal.requestKey,key));
      if(existing)return existing.status==='pending'?pendingResponse(existing.id):Response.json({message:'这次申请已处理，请刷新后重新操作。',status:existing.status},{status:409});
      if(write.target!=='new'&&!write.operations.includes('annual.create')){
        const [pending]=await tx.select({id:s.operationsChangeProposal.id}).from(s.operationsChangeProposal).where(and(eq(s.operationsChangeProposal.requestedById,actor.id),eq(s.operationsChangeProposal.target,write.target),eq(s.operationsChangeProposal.status,'pending')));
        if(pending)return Response.json({message:'这项内容已有待审核修改，请等待管理员处理。',requestId:pending.id},{status:409});
      }
      let after:Record<string,unknown>={};
      try{
        await tx.transaction(async preview=>withDatabase(preview,async()=>{
          const response=await withBusinessExecution(actor,write.operations,next);
          if(!accepted(response))throw new RolledBack(response);
          const result=await response.clone().json().catch(()=>({}));
          const afterWrite=write.target==='new'&&result.id?{...write,target:`schedule:${result.id}`}:write;
          throw new RolledBack(response,await snapshot(preview,afterWrite));
        }));
      }catch(error){if(!(error instanceof RolledBack))throw error;if(!accepted(error.response))throw error;after=error.after;}
      const [created]=await tx.insert(s.operationsChangeProposal).values({requestedById:actor.id,requestedByLabel:actor.username,module:write.module,target:write.target,operations:write.operations,path,method:context.request.method,contentType:context.request.headers.get('content-type')??'',body,fingerprint,requestKey:key,before,after}).returning({id:s.operationsChangeProposal.id});
      return pendingResponse(created.id);
    }));
  }catch(error){if(error instanceof RolledBack)return error.response;if(error instanceof SyntaxError||error instanceof TypeError)return Response.json({message:'提交格式无效。'},{status:422});return workflowErrorResponse(error);}
}

async function replay(path:string,method:string,request:Request,actor:OperationsUser):Promise<Response>{
  const parts=path.split('/').filter(Boolean);let handler:APIRoute|undefined;const params:Record<string,string>={};
  if(parts[1]==='operations-annual-plans'){
    if(!parts[2])handler=(await import('../pages/api/operations-annual-plans')).POST;
    else if(parts[2]==='year'){params.year=parts[3];handler=parts[4]==='copy'?(await import('../pages/api/operations-annual-plans/year/[year]/copy')).POST:(await import('../pages/api/operations-annual-plans/year/[year]')).PATCH;}
    else{params.id=parts[2];handler=parts[3]==='restore'?(await import('../pages/api/operations-annual-plans/[id]/restore')).POST:(await import('../pages/api/operations-annual-plans/[id]')).PATCH;}
  }else if(parts[1]==='operations-content'){
    if(!parts[2])handler=(await import('../pages/api/operations-content')).POST;
    else if(parts[2]==='versions'){params.sourceVersionId=parts[3];handler=(await import('../pages/api/operations-content/versions/[sourceVersionId]/revisions')).POST;}
    else{params.id=parts[2];handler=parts[3]==='publication'?(await import('../pages/api/operations-content/[id]/publication')).PATCH:parts[3]==='delay-reasons'?(await import('../pages/api/operations-content/[id]/delay-reasons')).POST:parts[3]==='change-requests'?(await import('../pages/api/operations-content/[id]/change-requests')).POST:method==='DELETE'?(await import('../pages/api/operations-content/[id]')).DELETE:(await import('../pages/api/operations-content/[id]')).PATCH;}
  }
  if(!handler)throw new Error('未知业务入口。');
  return await handler({request,url:new URL(request.url),params,locals:{user:actor,operationsUser:actor.username,session:null},redirect:(location:string,status=303)=>new Response(null,{status,headers:{Location:location}})} as APIContext);
}
export async function decideProposal(id:string,approve:boolean,reason:string,actor:OperationsUser,origin:string){
  requireAdmin(actor);
  try{return await getDb().transaction(async tx=>withDatabase(tx,async()=>{
    await lockBusinessWrites(tx);await lockPromotionWorkflow(tx);
    const [proposal]=await tx.select().from(s.operationsChangeProposal).where(eq(s.operationsChangeProposal.id,id)).for('update');
    if(!proposal)return Response.json({message:'申请不存在。'},{status:404});
    if(proposal.status!=='pending')return Response.json({status:proposal.status,result:proposal.result});
    const finish=async(status:'approved'|'rejected'|'obsolete',result:Record<string,unknown>|null=null,message=reason)=>{
      await tx.update(s.operationsChangeProposal).set({status,result,decisionReason:message,decidedById:actor.id,decidedByLabel:actor.username,decidedAt:new Date()}).where(eq(s.operationsChangeProposal.id,id));
      return Response.json({status,result,message}, {status:status==='obsolete'?409:200});
    };
    if(!approve){if(!reason.trim())return Response.json({message:'请填写驳回说明。'},{status:422});return finish('rejected');}
    const [owner]=await tx.select({id:s.authUser.id,username:s.authUser.username,role:s.authUser.role}).from(s.authUser).where(eq(s.authUser.id,proposal.requestedById));
    if(!owner||owner.role!=='employee')return finish('obsolete',null,'申请账号状态已变化。');
    const request=new Request(origin+proposal.path,{method:proposal.method,headers:{Origin:origin,Accept:'application/json','Content-Type':proposal.contentType},...(proposal.method==='DELETE'?{}:{body:proposal.body})});
    if(proposal.target.startsWith('schedule:')){
      const [target]=await tx.select({id:s.operationsContentSchedule.id}).from(s.operationsContentSchedule).where(eq(s.operationsContentSchedule.id,proposal.target.slice(9)));
      if(!target)return finish('obsolete',null,'原排期已不存在，请重新提交。');
    }
    const write=await describe(tx,request),permissions=await effectiveBusinessPermissions(tx,owner);
    if(write.operations.some(operation=>permissions[operation]==='disabled')||stable(write.operations)!==stable(proposal.operations)||digest(await snapshot(tx,write))!==proposal.fingerprint)return finish('obsolete',null,'原内容或权限已变化，请重新提交。');
    try{
      const result=await tx.transaction(async apply=>withDatabase(apply,async()=>{
        const response=await withBusinessExecution(owner,write.operations,()=>replay(proposal.path,proposal.method,request,owner));
        if(!response.ok)throw new RolledBack(response);
        return await response.json() as Record<string,unknown>;
      }));
      return finish('approved',result);
    }catch(error){if(!(error instanceof RolledBack))throw error;const detail=await error.response.json().catch(()=>({message:'原内容已变化。'}));return finish('obsolete',null,detail.message);}
  }));}catch(error){return workflowErrorResponse(error);}
}
