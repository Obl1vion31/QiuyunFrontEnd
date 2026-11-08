import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import type { Database } from './client';
import { authUser, organizationAssignment, organizationChange, organizationPosition } from './schema';
import { requireAdmin, type OperationsUser } from '../auth/permissions';
import { positionKeys, positionNames, type OrganizationWorkspace } from '../data/organization';
import { WorkflowError } from './schedule-workflow';

const reference = z.object({
  label: z.string().trim().min(1, '请填写资料名称。').max(60, '资料名称最多60字。'),
  url: z.url('请填写完整的资料链接。').refine(value => ['http:', 'https:'].includes(new URL(value).protocol), '资料链接仅支持 HTTP 或 HTTPS。'),
}).strict();
export const organizationInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('position'), key: z.enum(positionKeys),
    responsibilities: z.string().trim().min(1, '请填写岗位职责。').max(1800),
    deliverables: z.string().trim().min(1, '请填写主要交付。').max(1000),
    collaboration: z.string().trim().min(1, '请填写协作关系。').max(1000),
    references: z.array(reference).max(8, '每个岗位最多关联8份资料。'),
  }).strict(),
  z.object({ kind: z.literal('member'), userId: z.string().min(1).max(128),
    positions: z.array(z.enum(positionKeys)).max(4).refine(values => new Set(values).size === values.length, '岗位不能重复。'),
  }).strict(),
]);

export async function readOrganization(db: Database): Promise<OrganizationWorkspace> {
  const [positions, users, assignments] = await Promise.all([
    db.select().from(organizationPosition),
    db.select({ id: authUser.id, name: authUser.name, username: authUser.username, role: authUser.role, enabled: authUser.enabled }).from(authUser).orderBy(authUser.username),
    db.select().from(organizationAssignment),
  ]);
  return {
    positions: positionKeys.flatMap(key => { const row = positions.find(item => item.key === key); return row ? [{ ...row, name: positionNames[key] }] : []; }),
    members: users.map(user => ({ ...user, positions: positionKeys.filter(key => assignments.some(item => item.userId === user.id && item.positionKey === key)) })),
  };
}

export async function saveOrganization(db: Database, actor: OperationsUser, raw: unknown) {
  requireAdmin(actor);
  const input = organizationInput.parse(raw);
  return db.transaction(async tx => {
    // 任职替换和职责更正低频共用短事务锁，确保前后记录对应实际成功写入。
    await tx.execute(sql`select pg_advisory_xact_lock(719305)`);
    let before: unknown, after: unknown;
    if (input.kind === 'position') {
      const [existing] = await tx.select().from(organizationPosition).where(eq(organizationPosition.key, input.key));
      if (!existing) throw new WorkflowError('岗位不存在，请刷新后重试。', 404);
      const { kind, key, ...content } = input;
      before = { responsibilities: existing.responsibilities, deliverables: existing.deliverables, collaboration: existing.collaboration, references: existing.references };
      after = content;
      if (!isDeepStrictEqual(before, after)) {
        await tx.update(organizationPosition).set(content).where(eq(organizationPosition.key, key));
        await tx.insert(organizationChange).values({ targetKind: kind, targetId: key, before, after, actorId: actor.id });
      }
    } else {
      const [user] = await tx.select({ id: authUser.id }).from(authUser).where(eq(authUser.id, input.userId));
      if (!user) throw new WorkflowError('人员账号不存在，请刷新后重试。', 404);
      const existing = await tx.select().from(organizationAssignment).where(eq(organizationAssignment.userId, user.id));
      const roles = await tx.select({ key: organizationPosition.key }).from(organizationPosition);
      if (input.positions.some(key => !roles.some(role => role.key === key))) throw new WorkflowError('岗位信息尚未就绪，请刷新后重试。', 409);
      before = positionKeys.filter(key => existing.some(item => item.positionKey === key));
      after = positionKeys.filter(key => input.positions.includes(key));
      if (!isDeepStrictEqual(before, after)) {
        await tx.delete(organizationAssignment).where(eq(organizationAssignment.userId, user.id));
        const keys = after as typeof input.positions;
        if (keys.length) await tx.insert(organizationAssignment).values(keys.map(positionKey => ({ userId: user.id, positionKey })));
        await tx.insert(organizationChange).values({ targetKind: 'member', targetId: user.id, before, after, actorId: actor.id });
      }
    }
    return readOrganization(tx);
  });
}
