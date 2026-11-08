import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { eq, sql } from 'drizzle-orm';
import { startPostgresFixture } from './postgres.fixture';
import { organizationAccounts } from './organization.fixture';
import { initialPositions } from '../src/data/organization';
import { readOrganization, saveOrganization } from '../src/db/organization';
import * as s from '../src/db/schema';
const f = await startPostgresFixture({ accounts: organizationAccounts, entry: process.env.ORG_ENTRY });
try {
  const { db, baseURL } = f;
  const before = { users: await db.select().from(s.authUser), credentials: await db.select().from(s.authAccount), subjects: await db.select().from(s.operationsSubject) };
  await db.execute(sql.raw('DROP TABLE organization_assignment, organization_change, organization_position'));
  const migration = await readFile(new URL('../drizzle/0051_organization_people.sql', import.meta.url), 'utf8');
  for (const statement of migration.split('--> statement-breakpoint')) if (statement.trim()) await db.execute(sql.raw(statement));
  assert.deepEqual({ users: await db.select().from(s.authUser), credentials: await db.select().from(s.authAccount), subjects: await db.select().from(s.operationsSubject) }, before);
  const workspace = await readOrganization(db);
  assert.equal(workspace.members.length, 3); assert.equal(workspace.positions.length, 4);
  for (const position of initialPositions) assert.deepEqual(workspace.positions.find(row => row.key === position.key), { ...position, name: workspace.positions.find(row => row.key === position.key)!.name });
  const operator = workspace.members.find(row => row.username === 'zongyunying001')!;
  assert.deepEqual(operator.positions, ['media', 'design', 'touchpoint']);
  const admin = workspace.members.find(row => row.username === 'admin123456')!;
  assert.deepEqual(admin.positions, ['supervisor']);
  const anonymous = await fetch(baseURL + '/organization?view=people', { redirect: 'manual' });
  assert.equal(anonymous.status, 302); assert.equal(anonymous.headers.get('location'), '/login?next=%2Forganization%3Fview%3Dpeople');
  assert.equal((await fetch(baseURL + '/api/organization')).status, 401);
  async function login(account: typeof organizationAccounts[number]) { const response = await fetch(baseURL + '/api/auth/sign-in/username', { method: 'POST', headers: { Origin: baseURL, 'Content-Type': 'application/json' }, body: JSON.stringify(account) }); assert.equal(response.status, 200); return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; '); }
  const adminCookie = await login(organizationAccounts[0]), employeeCookie = await login(organizationAccounts[2]);
  async function write(cookie: string, body: unknown, origin = baseURL) { return fetch(baseURL + '/api/organization', { method: 'PATCH', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  const memberInput = { kind: 'member' as const, userId: operator.id, positions: ['media', 'design'] };
  assert.equal((await write(employeeCookie, memberInput)).status, 403);
  assert.equal((await write(adminCookie, memberInput, 'https://unrelated.example')).status, 403);
  assert.equal((await write(adminCookie, { ...memberInput, role: 'admin' })).status, 422);
  assert.equal((await write(adminCookie, { ...memberInput, positions: ['media', 'media'] })).status, 422);
  const employeeRead = await fetch(baseURL + '/organization', { headers: { Cookie: employeeCookie } });
  const employeeHTML = await employeeRead.text(); assert.equal(employeeRead.status, 200); assert(!employeeHTML.includes('data-edit-position=')); assert(!employeeHTML.includes('data-edit-member='));
  const role = workspace.positions.find(row => row.key === 'media')!;
  const positionInput = { kind: 'position' as const, key: role.key, responsibilities: role.responsibilities, deliverables: role.deliverables, collaboration: role.collaboration, references: [{ label: '隔离测试资料', url: 'https://example.com/project' }] };
  assert.equal((await write(adminCookie, { ...positionInput, references: [{ label: '非法链接', url: 'javascript:alert(1)' }] })).status, 422);
  assert.equal((await write(adminCookie, positionInput)).status, 200);
  assert.deepEqual((await readOrganization(db)).positions.find(row => row.key === 'media')!.references, positionInput.references);
  const count = (await db.select().from(s.organizationChange)).length;
  assert.equal((await write(adminCookie, positionInput)).status, 200); assert.equal((await db.select().from(s.organizationChange)).length, count);
  await saveOrganization(db, admin, memberInput);
  assert.equal((await db.select().from(s.authUser).where(eq(s.authUser.id, operator.id)))[0].role, 'employee');
  await db.update(s.authUser).set({ username: 'renamed_operator', name: '已更名的测试同事' }).where(eq(s.authUser.id, operator.id));
  assert.deepEqual((await readOrganization(db)).members.find(row => row.id === operator.id)!.positions, ['media', 'design']);
  await db.update(s.authUser).set({ username: operator.username, name: operator.name }).where(eq(s.authUser.id, operator.id));
  const beforeConcurrent = new Set((await db.select().from(s.organizationChange)).map(row => row.id));
  await Promise.all([
    saveOrganization(db, admin, { ...memberInput, positions: ['touchpoint'] }),
    saveOrganization(db, admin, { ...memberInput, positions: ['supervisor', 'media'] }),
  ]);
  const changes = (await db.select().from(s.organizationChange)).filter(row => !beforeConcurrent.has(row.id)); assert.equal(changes.length, 2);
  const final = (await readOrganization(db)).members.find(row => row.id === operator.id)!.positions;
  const last = changes.find(row => JSON.stringify(row.after) === JSON.stringify(final))!, first = changes.find(row => row.id !== last.id)!;
  assert.deepEqual(last.before, first.after); assert.deepEqual(first.before, ['media', 'design']);
  assert.equal((await db.select().from(s.authUser).where(eq(s.authUser.id, operator.id)))[0].role, 'employee');
  console.log('PASS: 兼容迁移与三账号任职、匿名保护、双方权限、跨站/非法输入、资料链接、重复保存、更名保持与真实并发更正');
} catch (error) { console.error(f.logs()); throw error; }
finally { await f.stop(); }
