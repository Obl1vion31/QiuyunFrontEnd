import { initialPositions, type PositionKey } from '../src/data/organization';
import * as schema from '../src/db/schema';
import type { Database } from '../src/db/client';
export const organizationAccounts = [
  { username: 'admin123456', name: '测试主管甲', password: 'fictional-org-admin-password', role: 'admin' as const },
  { username: 'boss', name: '测试主管乙', password: 'fictional-org-boss-password', role: 'admin' as const },
  { username: 'zongyunying001', name: '测试运营同事', password: 'fictional-org-employee-password', role: 'employee' as const },
];
export async function seedOrganization(db: Database) {
  await db.insert(schema.organizationPosition).values(initialPositions);
  const users = await db.select().from(schema.authUser);
  await db.insert(schema.organizationAssignment).values(users.flatMap(user => {
    const keys: PositionKey[] = user.role === 'admin' ? ['supervisor'] : ['media', 'design', 'touchpoint'];
    return keys.map(positionKey => ({ userId: user.id, positionKey }));
  }));
}
