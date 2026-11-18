import {and,eq} from 'drizzle-orm';
import type {OperationsUser} from '../auth/permissions';
import type {Database} from './client';
import {operationsChangeProposal as proposals,operationsScheduleChangeRequest as requests} from './schema';

export function pendingScheduleRequestScope(viewer?:OperationsUser,scheduleId?:string) {
 const owner=viewer?.role==='employee'?viewer.id:undefined;
 return {
  legacy:and(eq(requests.status,'pending'),owner?eq(requests.requestedById,owner):undefined,scheduleId?eq(requests.scheduleId,scheduleId):undefined),
  proposals:and(eq(proposals.module,'schedule'),eq(proposals.status,'pending'),owner?eq(proposals.requestedById,owner):undefined,scheduleId?eq(proposals.target,`schedule:${scheduleId}`):undefined),
 };
}

export async function readPendingScheduleRequestKeys(db:Database,viewer?:OperationsUser) {
 const scope=pendingScheduleRequestScope(viewer);
 const [legacy,current]=await Promise.all([
  db.select({scheduleId:requests.scheduleId}).from(requests).where(scope.legacy),
  db.select({target:proposals.target}).from(proposals).where(scope.proposals),
 ]);
 return {count:legacy.length+current.length,scheduleIds:[...new Set([
  ...legacy.map(row=>row.scheduleId),...current.filter(row=>row.target.startsWith('schedule:')).map(row=>row.target.slice(9)),
 ])]};
}
