// T-465 — the record-state change record: a withdrawal and its undoing both
// stay on the record, newest first, each with its author; another firm reads
// nothing of a row it cannot see.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ListContainerStateChangesResponse, PlanRow } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });
const stamp = Date.now();
const password = 'pw-t465';
let projectId: string;
let producer: string;
let stranger: string;
let containerId: string;

async function makeUser(name: string, organisationId: string, elevated: boolean) {
  const [user] = await db.insert(s.users).values({ name, email: `${name}-${stamp}@test.local`, organisationId, orgRole: 'admin' }).returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  await db.insert(s.participants).values({ userId: user!.id, projectId, elevated });
  const res = await app.request('/auth/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${name}-${stamp}@test.local`, password }) });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}
const post = (cookie: string, path: string, body?: unknown) =>
  app.request(path, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, ...(body !== undefined && { body: JSON.stringify(body) }) });

beforeAll(async () => {
  const [ownerOrg] = await db.insert(s.organisations).values({ name: `t465 owner ${stamp}` }).returning();
  const [prodOrg] = await db.insert(s.organisations).values({ name: `t465 producer ${stamp}` }).returning();
  const [otherOrg] = await db.insert(s.organisations).values({ name: `t465 other ${stamp}` }).returning();
  const [project] = await db.insert(s.projects).values({ name: `t465 ${stamp}`, ownerOrganisationId: ownerOrg!.id }).returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrg!.id, projectId, role: 'owner' },
    { organisationId: prodOrg!.id, projectId, role: 'member' },
    { organisationId: otherOrg!.id, projectId, role: 'member' },
  ]);
  producer = await makeUser('t465-prod', prodOrg!.id, true);
  stranger = await makeUser('t465-other', otherOrg!.id, true);
  const created = await post(producer, `/projects/${projectId}/plan`, { documentReference: `T465-${stamp}`, title: 'A planned deliverable' });
  expect(created.status).toBe(201);
  containerId = ((await created.json()) as PlanRow).containerId;
});

afterAll(async () => {
  await pool.end();
});

describe('the record-state change record (T-465)', () => {
  it('a withdrawal and its restoration both stay on the record, newest first, each with its author', async () => {
    expect((await post(producer, `/containers/${containerId}/withdrawal`, { reason: 'Descoped by mistake' })).status).toBe(200);
    expect((await post(producer, `/containers/${containerId}/restoration`)).status).toBe(200);
    const res = await app.request(`/containers/${containerId}/state-changes`, { headers: { cookie: producer } });
    expect(res.status).toBe(200);
    const { items } = (await res.json()) as ListContainerStateChangesResponse;
    expect(items.map((i) => [i.fromState, i.toState])).toEqual([
      ['withdrawn', 'live'],
      ['live', 'withdrawn'],
    ]);
    expect(items[1]!.reason).toBe('Descoped by mistake');
    expect(items[1]!.changedBy.name).toBe('t465-prod');
    expect(items[0]!.reason).toBeNull();
    // the row is live again and carries no withdrawal; the record is where the history lives
    const planRes = await app.request(`/projects/${projectId}/plan`, { headers: { cookie: producer } });
    const row = ((await planRes.json()) as { items: PlanRow[] }).items.find((r) => r.containerId === containerId)!;
    expect(row.state).toBe('live');
    expect(row.withdrawnReason).toBeNull();
  });

  it('another organisation reads nothing of a planned row it cannot see', async () => {
    const res = await app.request(`/containers/${containerId}/state-changes`, { headers: { cookie: stranger } });
    expect(res.status).toBe(404);
  });
});
