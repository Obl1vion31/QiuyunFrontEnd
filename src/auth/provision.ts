/** 仅由受控维护脚本与虚构数据库测试创建内部账号。 */
import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import { authUser, authAccount } from '../db/schema';
import type { Database } from '../db/client';
import type { Role } from './permissions';

export async function provisionAccount(db: Database, input: { username: string; password: string; role: Role }) {
  const username = input.username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/.test(username)) throw new Error('账号须为 3–30 位英文字母、数字或下划线。');
  if (input.password.length < 6 || input.password.length > 128) throw new Error('密码长度须为 6–128 个字符。');
  if (!['admin', 'employee'].includes(input.role)) throw new Error('请选择有效角色。');
  const password = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const id = randomUUID();
    const [created] = await tx.insert(authUser).values({ id, username, displayUsername: username, name: username,
      email: `${username}@qiuyun.invalid`, role: input.role }).onConflictDoNothing({ target: authUser.username }).returning();
    if (!created) {
      const [existing] = await tx.select().from(authUser).where(eq(authUser.username, username));
      if (existing.role !== input.role) throw new Error('账号已存在且角色不同；本操作不会覆盖已有角色。');
      return { id: existing.id, created: false };
    }
    await tx.insert(authAccount).values({ id: randomUUID(), userId: id, accountId: id, providerId: 'credential', password });
    return { id, created: true };
  });
}
