import { and, asc, desc, eq, inArray,sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './client';
import type { OperationsUser } from '../auth/permissions';
import { requireAdmin } from '../auth/permissions';
import {effectiveBusinessPermissions,hasBusinessExecution,requireBusinessOperation} from '../auth/business-permissions';
import { completionStatus, delayDayCount, delayDays, needsRegistration, registrationState, requiresPlanApproval } from './schedule-rules.mjs';
import { shanghaiDateTime } from './validation';
import { publicationState, mayKeepEmptyPublicationLink } from './publication-rules.mjs';
import { operationsPublicationReservation as reservations,operationsPublicationEvent as publicationEvents } from './schema';
import { operationsContentSchedule as schedules, operationsSchedulePlanHistory as plans,
  operationsScheduleChangeRequest as requests, operationsScheduleDelayReason as reasons } from './schema';
import {operationsChangeProposal as proposals} from './schema';

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Reader = Database | Transaction;
type Schedule = typeof schedules.$inferSelect;
type Plan = typeof plans.$inferSelect;
type Reason = typeof reasons.$inferSelect;
export class WorkflowError extends Error {
  constructor(message: string, public status = 409, public approvalRequired = false) { super(message); }
}
export const reasonSchema = z.object({
  planRevision: z.coerce.number().int().min(0), dayNumber: z.coerce.number().int().min(1),
  responsibility: z.enum(['self', 'external', 'requester']), reason: z.string().trim().min(1, '请填写文字原因').max(500),
  expectedUpdatedAt: z.preprocess(value => value === '' ? null : value, z.string().nullable().optional()),
  expectedHistoryLength: z.coerce.number().int().min(0).optional(),
});
export const changeRequestSchema = z.object({
  plannedPublishAt: shanghaiDateTime, expectedPlanRevision: z.coerce.number().int().min(0),
  reason: z.string().trim().min(1, '请填写改期理由').max(500),
});
export const decisionSchema = z.object({
  action: z.enum(['approve', 'reject']), reason: z.string().trim().max(500).default(''),
}).superRefine((value, context) => {
  if (value.action === 'reject' && !value.reason) context.addIssue({ code: 'custom', path: ['reason'], message: '请填写驳回说明' });
});

export async function lockSchedule(transaction: Transaction, id: string) {
  const [schedule] = await transaction.select().from(schedules).where(eq(schedules.id, id)).limit(1).for('update');
  if (!schedule) throw new WorkflowError('没有找到这条排期。', 404);
  return schedule;
}

export function scheduleDelayItems(schedule: Schedule, history: Plan[], saved: Reason[], through: Date, now = through) {
  const periods = [
    ...history.map(plan => ({ revision: plan.revision, plannedAt: plan.plannedPublishAt, effectiveAt: plan.effectiveAt, thresholdHours: plan.delayThresholdHours, end: new Date(Math.min(plan.endedAt.getTime(), through.getTime(), now.getTime())) })),
    { revision: schedule.planRevision, plannedAt: schedule.plannedPublishAt, effectiveAt: schedule.planEffectiveAt, thresholdHours: schedule.delayThresholdHours, end: through },
  ];
  const savedMap = new Map(saved.map(item => [`${item.planRevision}:${item.dayNumber}`, item]));
  const items = periods.flatMap(period => delayDays(period.plannedAt, period.end, period.effectiveAt, period.thresholdHours).map(day => ({
    planRevision: period.revision, ...day, dueAt: savedMap.get(`${period.revision}:${day.dayNumber}`)?.dueAt ?? day.dueAt, saved: savedMap.get(`${period.revision}:${day.dayNumber}`) ?? null,
    archived: false,
  })));
  const keys = new Set(items.map(item => `${item.planRevision}:${item.dayNumber}`));
  // 更正实发事实不能抹去已经写下的原因；超出当前时间范围的记录只在历史中保留。
  for (const item of saved) if (!keys.has(`${item.planRevision}:${item.dayNumber}`)) items.push({
    planRevision: item.planRevision, dayNumber: item.dayNumber, dueAt: item.dueAt, saved: item, archived: true,
  });
  return items.sort((a, b) => a.planRevision - b.planRevision || a.dayNumber - b.dayNumber);
}

export async function readScheduleWorkflow(database: Reader, id: string, actualOverride?: Date, now = new Date()) {
  const [schedule] = await database.select().from(schedules).where(eq(schedules.id, id)).limit(1);
  if (!schedule) throw new WorkflowError('没有找到这条排期。', 404);
  const [history, saved, applications, publicationReservations, publicationHistory] = await Promise.all([
    database.select().from(plans).where(eq(plans.scheduleId, id)).orderBy(asc(plans.revision)),
    database.select().from(reasons).where(eq(reasons.scheduleId, id)),
    database.select().from(requests).where(eq(requests.scheduleId, id)).orderBy(asc(requests.createdAt)),
    database.select().from(reservations).where(eq(reservations.scheduleId,id)).orderBy(desc(reservations.createdAt)),
    database.select().from(publicationEvents).where(eq(publicationEvents.scheduleId,id)).orderBy(desc(publicationEvents.revision)),
  ]);
  const through = new Date(Math.min((actualOverride ?? schedule.actualPublishAt ?? now).getTime(), now.getTime()));
  return { schedule, history, applications, publicationReservations, publicationHistory, publicationState:publicationState(schedule), allowEmptyPublicationLink:mayKeepEmptyPublicationLink(schedule),
    registrationState: registrationState(schedule, now), requiresPlanApproval: requiresPlanApproval(schedule, now),
    days: scheduleDelayItems(schedule, history, saved, through, now),
    overdueDays: !schedule.actualPublishAt ? delayDayCount(schedule.plannedPublishAt, now, schedule.planEffectiveAt, schedule.delayThresholdHours) : 0,
  };
}

export async function saveDelayReason(transaction: Transaction, schedule: Schedule, input: z.infer<typeof reasonSchema>, actor: OperationsUser, now = new Date(), actualOverride?: Date) {
  const workflow = await readScheduleWorkflow(transaction, schedule.id, actualOverride, now);
  const day = workflow.days.find(item => item.planRevision === input.planRevision && item.dayNumber === input.dayNumber);
  if (!day || day.archived) throw new WorkflowError('这一天尚未进入延期，或排期已变化，请刷新后重试。');
  const current = day.saved;
  if ((current?.updatedAt.toISOString() ?? null) !== (input.expectedUpdatedAt ?? null)
    || (current && current.history.length !== input.expectedHistoryLength)) {
    throw new WorkflowError('这一天的理由已被更新，请刷新后重试。');
  }
  const values = { responsibility: input.responsibility, reason: input.reason, source: 'manual' as const,
    changedById: actor.id, changedByLabel: actor.username, updatedAt: now };
  if (current) {
    await transaction.update(reasons).set({ ...values, history: [...current.history, {
      reason: current.reason, responsibility: current.responsibility, source: current.source,
      changedById: current.changedById, changedByLabel: current.changedByLabel, updatedAt: current.updatedAt.toISOString(),
    }] }).where(eq(reasons.id, current.id));
  } else {
    await transaction.insert(reasons).values({ scheduleId: schedule.id, planRevision: input.planRevision,
      dayNumber: input.dayNumber, dueAt: day.dueAt, ...values });
  }
}

/** 给受控历史导入复用；只补不存在的日期，不覆盖人工填写，不建立改期申请。 */
export async function backfillHistoricalDelayReasons(transaction: Transaction, scheduleId: string, cutoff = new Date()) {
  const schedule = await lockSchedule(transaction, scheduleId);
  const days = delayDays(schedule.plannedPublishAt, schedule.actualPublishAt ?? cutoff, schedule.planEffectiveAt, schedule.delayThresholdHours);
  if (!days.length) return;
  await transaction.insert(reasons).values(days.map(day => ({ scheduleId, planRevision: schedule.planRevision,
    ...day, responsibility: 'unknown' as const, reason: schedule.delayReason?.trim() || '未知',
    source: 'historical' as const, changedByLabel: '历史补齐', updatedAt: cutoff,
  }))).onConflictDoNothing();
}

export async function changeSchedulePlan(transaction: Transaction, schedule: Schedule, plannedAt: Date, reason: string, actor: OperationsUser, now = new Date()) {
  const operation=requiresPlanApproval(schedule,now)?'schedule.overdueReschedule':'schedule.reschedule';
  if((await effectiveBusinessPermissions(transaction,actor))[operation]==='review'&&!hasBusinessExecution(actor,operation))throw new WorkflowError('修改应发时间需提交管理员审核。',409,true);
  await requireBusinessOperation(transaction,actor,operation);
  if (plannedAt.getTime() === schedule.plannedPublishAt.getTime()) return;
  if (!reason.trim()) throw new WorkflowError('请填写改期理由。', 422);
  if (!schedule.actualPublishAt && plannedAt <= now) throw new WorkflowError('尚未实发的排期，请选择未来的发送时间。', 422);
  await transaction.insert(plans).values({ scheduleId: schedule.id, revision: schedule.planRevision,
    plannedPublishAt: schedule.plannedPublishAt, effectiveAt: schedule.planEffectiveAt, delayThresholdHours: schedule.delayThresholdHours,
    endedAt: schedule.actualPublishAt ?? now, newPlannedPublishAt: plannedAt,
    reason, changedById: actor.id, changedByLabel: actor.username });
  await transaction.update(schedules).set({ plannedPublishAt: plannedAt, planRevision: schedule.planRevision + 1,
    planEffectiveAt: now, completionStatus: completionStatus(plannedAt, schedule.actualPublishAt, schedule.delayThresholdHours), publicationRevision:schedule.publicationRevision+1, updatedAt: now,
  }).where(eq(schedules.id, schedule.id));
  await transaction.update(reservations).set({status:'obsolete',history:sql`${reservations.history} || ${JSON.stringify([{status:'obsolete',actorId:actor.id,actorLabel:actor.username,at:now.toISOString(),reason:'应发时间已变更，请重新登记预约'}])}::jsonb`,decisionReason:'应发时间已变更，请重新登记预约',updatedAt:now}).where(and(eq(reservations.scheduleId,schedule.id),inArray(reservations.status,['pending','approved'])));
  await transaction.update(requests).set({ status: 'obsolete', decidedAt: now, decisionReason: '排期已发生变化' })
    .where(and(eq(requests.scheduleId, schedule.id), eq(requests.status, 'pending')));
}

export async function createChangeRequest(database: Database, scheduleId: string, input: z.infer<typeof changeRequestSchema>, actor: OperationsUser, now = new Date()) {
  return database.transaction(async transaction => {
    const schedule = await lockSchedule(transaction, scheduleId);
    const operation=requiresPlanApproval(schedule,now)?'schedule.overdueReschedule':'schedule.reschedule';
    if(hasBusinessExecution(actor,operation)){
      if(schedule.planRevision!==input.expectedPlanRevision)throw new WorkflowError('排期已更新，请刷新后重新申请。');
      await changeSchedulePlan(transaction,schedule,input.plannedPublishAt,input.reason,actor,now);
      return {id:schedule.id,applied:true};
    }
    if (!requiresPlanApproval(schedule, now)) throw new WorkflowError('当前改期无需审批，请直接编辑排期。');
    if (schedule.planRevision !== input.expectedPlanRevision) throw new WorkflowError('排期已更新，请刷新后重新申请。');
    if (input.plannedPublishAt <= now) throw new WorkflowError('请选择未来的发送时间。', 422);
    if (input.plannedPublishAt.getTime() === schedule.plannedPublishAt.getTime()) throw new WorkflowError('新的应发时间与当前时间相同。', 422);
    const [pending] = await transaction.select({ id: requests.id }).from(requests)
      .where(and(eq(requests.scheduleId, scheduleId), eq(requests.status, 'pending'))).limit(1);
    if (pending) throw new WorkflowError('这条排期已有待审批申请，请等待管理员处理。');
    const [created] = await transaction.insert(requests).values({ scheduleId, planRevision: schedule.planRevision,
      originalPlannedPublishAt: schedule.plannedPublishAt, requestedPublishAt: input.plannedPublishAt,
      reason: input.reason, requestedById: actor.id, requestedByLabel: actor.username,
    }).returning({ id: requests.id });
    return created;
  });
}

export async function decideChangeRequest(database: Database, scheduleId: string, requestId: string, input: z.infer<typeof decisionSchema>, actor: OperationsUser, now = new Date()) {
  requireAdmin(actor);
  return database.transaction(async transaction => {
    const schedule = await lockSchedule(transaction, scheduleId);
    const [application] = await transaction.select().from(requests)
      .where(and(eq(requests.id, requestId), eq(requests.scheduleId, scheduleId))).limit(1);
    if (!application || application.status !== 'pending') throw new WorkflowError('申请已处理或不存在，请刷新。');
    if (schedule.actualPublishAt || application.planRevision !== schedule.planRevision
      || application.originalPlannedPublishAt.getTime() !== schedule.plannedPublishAt.getTime()) {
      await transaction.update(requests).set({ status: 'obsolete', decidedAt: now, decisionReason: '排期已变化或已经实发' }).where(eq(requests.id, requestId));
      return { obsolete: true };
    }
    if (input.action === 'approve') {
      if (application.requestedPublishAt <= now) throw new WorkflowError('申请中的新时间已经过去，请驳回后重新申请。');
      await changeSchedulePlan(transaction, schedule, application.requestedPublishAt, application.reason, actor, now);
    }
    await transaction.update(requests).set({ status: input.action === 'approve' ? 'approved' : 'rejected',
      decidedById: actor.id, decidedByLabel: actor.username, decisionReason: input.reason || null, decidedAt: now,
    }).where(eq(requests.id, requestId));
    return { obsolete: false };
  });
}

export async function teamScheduleNotifications(database: Database, now = new Date()) {
  const [rows, history, saved, applications, pendingProposals] = await Promise.all([
    database.select().from(schedules), database.select().from(plans), database.select().from(reasons),
    database.select().from(requests).where(eq(requests.status, 'pending')),
    database.select({target:proposals.target}).from(proposals).where(and(eq(proposals.status,'pending'),eq(proposals.module,'schedule'))),
  ]);
  const overdueIds = rows.filter(row => needsRegistration(row, now)).map(row => row.id);
  const missingReasonIds = rows.filter(row => row.actualPublishAt && scheduleDelayItems(row, history.filter(item => item.scheduleId === row.id),
    saved.filter(item => item.scheduleId === row.id), new Date(Math.min(row.actualPublishAt?.getTime() ?? now.getTime(), now.getTime())), now).some(day => !day.saved && !day.archived)).map(row => row.id);
  return { reservationApprovals:0,publicationDue:0,reservationApprovalIds:[],publicationDueIds:[],overdue: overdueIds.length, missingRegistration: overdueIds.length, missingRegistrationIds: overdueIds, pendingApprovals: applications.length+pendingProposals.length, missingReasons: missingReasonIds.length,
    overdueIds, missingReasonIds, approvalScheduleIds: [...new Set([...applications.map(item => item.scheduleId),...pendingProposals.filter(item=>item.target.startsWith('schedule:')).map(item=>item.target.slice(9))])], serverTime: now.toISOString() };
}
