/** 员工与管理员共用暂停操作。全局锁先于活动锁，避免暂停和复盘交错覆盖。 */
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './client';
import type { OperationsUser } from '../auth/permissions';
import { WorkflowError, type Transaction } from './schedule-workflow';
import { nextDateKey, shanghaiDateKey } from './promotion-rules.mjs';
import { pauseIsActive } from './promotion-state.mjs';
import { operationsPromotionPause as pauses, operationsPromotionPauseTarget as targets,
  operationsPromotionHold as holds, operationsPromotionCampaign as campaigns } from './schema';

const dateKey = z.string().regex(/^20\d{2}-\d{2}-\d{2}$/, '日期无效').refine(value => {
  const date = new Date(`${value}T00:00:00+08:00`);
  return Number.isFinite(date.getTime()) && shanghaiDateKey(date) === value;
}, '日期无效');
export const pauseCreateSchema = z.object({ endsOn: dateKey, requestKey: z.uuid(), reason: z.string().trim().max(500).default('节假日暂停') });
export const pauseUpdateSchema = z.object({ action: z.enum(['extend','resume']), endsOn: dateKey.optional(), expectedRevision: z.coerce.number().int().min(0) });
export const lockPromotionWorkflow = (transaction: Transaction) => transaction.execute(sql`select pg_advisory_xact_lock(739214502)`);

export async function readPromotionContext(database: Database | Transaction) {
  const [pauseRows, targetRows, holdRows] = await Promise.all([
    database.select().from(pauses).orderBy(asc(pauses.startsAt)), database.select().from(targets), database.select().from(holds).orderBy(asc(holds.startedOn)),
  ]);
  return { pauses: pauseRows, targets: targetRows, holds: holdRows };
}

export async function pauseSummary(database: Database | Transaction, now = new Date()) {
  const [context, running] = await Promise.all([readPromotionContext(database), database.select({ id: campaigns.id, currentStage: campaigns.currentStage })
    .from(campaigns).where(inArray(campaigns.currentStatus, ['testing','scaling']))]);
  const active = context.pauses.find(pause => pauseIsActive(pause, now)) ?? null;
  return { active, testing: running.filter(c => c.currentStage === 'testing').length, scaling: running.filter(c => c.currentStage === 'scaling').length,
    affected: active ? context.targets.filter(t => t.pauseId === active.id).length : running.length };
}

function endInstant(endsOn: string, now: Date) {
  if (endsOn < shanghaiDateKey(now)) throw new WorkflowError('暂停截止日不能早于今天。', 422);
  return new Date(`${nextDateKey(endsOn)}T00:00:00+08:00`);
}

export async function createPromotionPause(database: Database, input: z.infer<typeof pauseCreateSchema>, actor: OperationsUser, now = new Date()) {
  const endsAt = endInstant(input.endsOn, now);
  return database.transaction(async tx => {
    await lockPromotionWorkflow(tx);
    const [existing] = await tx.select().from(pauses).where(eq(pauses.requestKey, input.requestKey));
    if (existing) return { id: existing.id, repeated: true };
    const all = await tx.select().from(pauses);
    if (all.some(pause => pauseIsActive(pause, now))) throw new WorkflowError('团队已有暂停安排，请调整截止日或提前恢复。');
    const running = await tx.select().from(campaigns).where(inArray(campaigns.currentStatus, ['testing','scaling'])).orderBy(asc(campaigns.id)).for('update');
    const [pause] = await tx.insert(pauses).values({ requestKey: input.requestKey, startsAt: now, endsAt,
      reason: input.reason || '节假日暂停', createdById: actor.id, createdByLabel: actor.username, updatedById: actor.id, updatedByLabel: actor.username,
      history: [{ at: now.toISOString(), actor: actor.username, action: 'create', endsAt: endsAt.toISOString() }], updatedAt: now }).returning();
    if (running.length) await tx.insert(targets).values(running.map(campaign => ({ pauseId: pause.id, campaignId: campaign.id, stageType: campaign.currentStage! })));
    return { id: pause.id, repeated: false, affected: running.length };
  });
}

export async function updatePromotionPause(database: Database, id: string, input: z.infer<typeof pauseUpdateSchema>, actor: OperationsUser, now = new Date()) {
  return database.transaction(async tx => {
    await lockPromotionWorkflow(tx);
    const [pause] = await tx.select().from(pauses).where(eq(pauses.id, id)).for('update');
    if (!pause) throw new WorkflowError('没有找到这次暂停。', 404);
    if (pause.revision !== input.expectedRevision) throw new WorkflowError('暂停安排已更新，请刷新后重试。');
    if (!pauseIsActive(pause, now)) throw new WorkflowError('这次暂停已经结束。');
    if (input.action === 'extend' && !input.endsOn) throw new WorkflowError('请选择暂停截止日。', 422);
    const endsAt = input.action === 'extend' ? endInstant(input.endsOn!, now) : pause.endsAt;
    await tx.update(pauses).set({ endsAt, resumedAt: input.action === 'resume' ? now : null, revision: pause.revision + 1,
      updatedById: actor.id, updatedByLabel: actor.username, updatedAt: now,
      history: [...pause.history, { at: now.toISOString(), actor: actor.username, action: input.action, endsAt: endsAt.toISOString() }],
    }).where(eq(pauses.id, id));
  });
}

export async function guardPromotionStart(transaction: Transaction, date: string, now = new Date()) {
  const rows = await transaction.select().from(pauses);
  if (rows.some(pause => pauseIsActive(pause, now) && date >= shanghaiDateKey(pause.startsAt))) {
    throw new WorkflowError('团队正在节假日暂停，请在暂停结束后开始或恢复推广。');
  }
}

/** 补录假期前开始的活动时，仍需纳入当前暂停，避免历史补录绕过全局暂停。 */
export async function attachPromotionToActivePause(transaction: Transaction, campaignId: string, stage: string, now = new Date()) {
  const rows = await transaction.select().from(pauses);
  const active = rows.find(pause => pauseIsActive(pause, now));
  if (active) await transaction.insert(targets).values({ pauseId: active.id, campaignId, stageType: stage }).onConflictDoNothing();
}
