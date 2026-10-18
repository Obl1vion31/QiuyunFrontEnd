import {and,desc,eq} from 'drizzle-orm';
import type {Database} from './client';
import type {OperationsUser} from '../auth/permissions';
import {operationsChangeProposal,operationsScheduleChangeRequest,operationsContentSchedule,operationsContentVersion} from './schema';
import {proposalDiff,proposalTitle} from './proposal-diff';
import {businessDateTime} from '../scripts/business-date';
export async function readScheduleApprovals(db:Database,user:OperationsUser,scheduleId?:string){
 const [proposals,legacy,current]=await Promise.all([
  db.select().from(operationsChangeProposal).where(and(eq(operationsChangeProposal.module,'schedule'),eq(operationsChangeProposal.status,'pending'),user.role==='admin'?undefined:eq(operationsChangeProposal.requestedById,user.id),scheduleId?eq(operationsChangeProposal.target,`schedule:${scheduleId}`):undefined)).orderBy(desc(operationsChangeProposal.createdAt)),
  db.select().from(operationsScheduleChangeRequest).where(and(eq(operationsScheduleChangeRequest.status,'pending'),user.role==='admin'?undefined:eq(operationsScheduleChangeRequest.requestedById,user.id),scheduleId?eq(operationsScheduleChangeRequest.scheduleId,scheduleId):undefined)),
  db.select({id:operationsContentSchedule.id,name:operationsContentVersion.contentName,version:operationsContentVersion.versionNumber,actual:operationsContentSchedule.actualPublishAt,status:operationsContentSchedule.promotionStatus}).from(operationsContentSchedule).innerJoin(operationsContentVersion,eq(operationsContentVersion.id,operationsContentSchedule.contentVersionId)),
 ]);
 const normalized=await Promise.all(proposals.map(async row=>{
  const id=row.target.startsWith('schedule:')?row.target.slice(9):null;
  const item=current.find(record=>record.id===id);
  const versions=row.after.versions as Array<{contentName?:string;versionNumber?:number}>|undefined;
  const request=new Request('http://internal.invalid',{method:'POST',headers:{'Content-Type':row.contentType},body:row.body});
  const values=row.contentType.includes('json')?await request.json():Object.fromEntries(await request.formData());
  return {key:`proposal:${row.id}`,scheduleId:id,name:item?.name??versions?.[0]?.contentName??String(values.contentName??'新排期申请'),version:item?.version??versions?.[0]?.versionNumber??0,title:proposalTitle(row.operations),requestedBy:row.requestedByLabel,createdAt:row.createdAt,statusLabel:item?(item.actual?'已登记发布':'尚未登记'):'尚未创建',reason:String(values.planChangeReason??values.reason??''),diff:proposalDiff(row.before,row.after),endpoint:`/api/business-change-proposals/${row.id}`};
 }));
 return [...normalized,...legacy.map(row=>{const item=current.find(record=>record.id===row.scheduleId);return {key:`legacy:${row.id}`,scheduleId:row.scheduleId,name:item?.name??'改期申请',version:item?.version??0,title:'修改应发时间',requestedBy:row.requestedByLabel,createdAt:row.createdAt,statusLabel:item?.actual?'已登记发布':'尚未登记',reason:row.reason,diff:[{label:'应发时间',before:businessDateTime(row.originalPlannedPublishAt),after:businessDateTime(row.requestedPublishAt)}],endpoint:`/api/operations-content/${row.scheduleId}/change-requests/${row.id}`};})].sort((a,b)=>a.createdAt.getTime()-b.createdAt.getTime());
}
