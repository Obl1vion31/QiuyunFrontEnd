import { and, desc, eq, lte } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './client';
import type { OperationsUser } from '../auth/permissions';
import { nextReviewCheckpoint, shanghaiDateKey } from './stage-review-rules.mjs';
import { lockSchedule, WorkflowError, type Transaction } from './schedule-workflow';
import { operationsNonPromotionCheckpointEvent as events, operationsNonPromotionReview as reviews,
  operationsContentVersion as versions, operationsCategoryPolicyVersion as policies, operationsContentPerformanceMetric as metrics } from './schema';

export const checkpointActionSchema = z.object({
  scheduleId: z.uuid(), checkpointType: z.enum(['day_7', 'day_15']), action: z.enum(['skip', 'restore']),
  scope: z.enum(['checkpoint','schedule']).default('checkpoint'),
  expectedEvents: z.preprocess(value=>{if(typeof value!=='string')return value;try{return JSON.parse(value)}catch{return null}},z.record(z.string(),z.string().nullable()).optional()),
  reason: z.string().trim().min(1, '请填写原因').max(500),
  expectedEventId: z.preprocess(value => value === '' ? null : value, z.uuid().nullable().optional()),
});

export function latestCheckpointEvents(rows: Array<typeof events.$inferSelect>) {
  const latest = new Map<string, typeof events.$inferSelect>();
  for (const row of [...rows].sort((a, b) => b.sequence - a.sequence)) {
    const key = `${row.scheduleId}:${row.checkpointType}`;
    if (!latest.has(key)) latest.set(key, row);
  }
  return latest;
}

export async function readCheckpointEvents(database: Database | Transaction, scheduleId?: string) {
  const rows = await database.select().from(events).where(scheduleId ? eq(events.scheduleId, scheduleId) : undefined);
  return latestCheckpointEvents(rows);
}

export async function changeCheckpointState(database: Database, input: Omit<z.infer<typeof checkpointActionSchema>,'scope'> & {scope?:'schedule'|'checkpoint'}, actor: OperationsUser, now = new Date()) {
  return database.transaction(async transaction => {
    const schedule = await lockSchedule(transaction, input.scheduleId);
    if (!schedule.actualPublishAt || schedule.isPromoted) throw new WorkflowError('只能处理已实发的非推广帖子。');
    const [version] = await transaction.select().from(versions).where(eq(versions.id, schedule.contentVersionId)).limit(1);
    if (version.categoryId) {
      const [policy] = await transaction.select().from(policies).where(and(eq(policies.categoryId, version.categoryId), lte(policies.effectiveOn, shanghaiDateKey(now))))
        .orderBy(desc(policies.versionNumber)).limit(1);
      if (policy?.requiresNonPromotionReview === false) throw new WorkflowError('当前分类未开放非推广复盘。');
    }
    const latest = await readCheckpointEvents(transaction, schedule.id);
    const key = `${schedule.id}:${input.checkpointType}`;
    const current = latest.get(key);
    if ((current?.id ?? null) !== (input.expectedEventId ?? null)) throw new WorkflowError('节点状态已更新，请刷新后重试。');
    const completed = [
      ...await transaction.select({ type: reviews.checkpointType }).from(reviews).where(eq(reviews.scheduleId, schedule.id)),
      ...(input.action==='skip'?await transaction.select({ type: metrics.checkpointType }).from(metrics).where(eq(metrics.scheduleId, schedule.id)):[]),
    ];
    if(input.scope==='schedule'){
      if(!input.expectedEvents)throw new WorkflowError('请刷新后重新核对整篇复盘状态。');
      const affected=(['day_7','day_15'] as const).filter(type=>!completed.some(row=>row.type===type));
      for(const type of affected){const event=latest.get(`${schedule.id}:${type}`);if((event?.id??null)!==(input.expectedEvents[type]??null))throw new WorkflowError('节点状态已更新，请刷新后重试。');}
      const targets=affected.filter(type=>input.action==='skip'?latest.get(`${schedule.id}:${type}`)?.action!=='skip':latest.get(`${schedule.id}:${type}`)?.action==='skip');
      if(!targets.length)throw new WorkflowError('该篇没有可处理的未完成节点。');
      await transaction.insert(events).values(targets.map(checkpointType=>({scheduleId:schedule.id,checkpointType,action:input.action,reason:input.reason,changedById:actor.id,changedByLabel:actor.username,createdAt:now})));
      return;
    }
    if (completed.some(row => row.type === input.checkpointType)) throw new WorkflowError('已有复盘数据的节点不能跳过，请保留真实指标。');
    if (input.action === 'restore') {
      if (current?.action !== 'skip') throw new WorkflowError('这个节点没有处于不复盘状态。');
    } else {
      const resolved = [...completed.map(row => row.type), ...[...latest.values()].filter(row => row.action === 'skip').map(row => row.checkpointType)];
      const next = nextReviewCheckpoint(schedule.actualPublishAt, resolved, shanghaiDateKey(now));
      if (next?.type !== input.checkpointType) throw new WorkflowError('请按首轮、二轮顺序处理已经到期的节点。');
    }
    await transaction.insert(events).values({ scheduleId: schedule.id, checkpointType: input.checkpointType,
      action: input.action, reason: input.reason, changedById: actor.id, changedByLabel: actor.username, createdAt: now });
  });
}
