// T-051 acceptance, against the live dev database: create, list, open — and
// the list is the requester's organisation's private sandbox only, by
// construction (ADR-0018).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ListSandboxDocumentsResponse, SandboxDocument } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t051';
let projectId: string;
let orgA: string;
let alice: string; // org A session
let bella: string; // org B session, participant on the same project

async function makeUser(name: string, organisationId: string) {
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name}-${stamp}@test.local`, organisationId })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  await db.insert(s.participants).values({ userId: user!.id, projectId });
  return user!;
}

async function session(email: string): Promise<string> {
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

beforeAll(async () => {
  const [a] = await db.insert(s.organisations).values({ name: 't051 org A' }).returning();
  const [b] = await db.insert(s.organisations).values({ name: 't051 org B' }).returning();
  orgA = a!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't051 project', ownerOrganisationId: orgA })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: orgA, projectId, role: 'owner' },
    { organisationId: b!.id, projectId, role: 'member' },
  ]);
  await makeUser('t051-alice', orgA);
  await makeUser('t051-bella', b!.id);
  [alice, bella] = await Promise.all([
    session(`t051-alice-${stamp}@test.local`),
    session(`t051-bella-${stamp}@test.local`),
  ]);
});

afterAll(async () => {
  await pool.end();
});

describe('sandbox documents (T-051)', () => {
  it('creates in the requester’s own sandbox and reads back', async () => {
    const created = await app.request(`/projects/${projectId}/sandbox-documents`, {
      method: 'POST',
      headers: { cookie: alice, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Options note' }),
    });
    expect(created.status).toBe(201);
    const doc = (await created.json()) as SandboxDocument;
    expect(doc).toMatchObject({ projectId, organisationId: orgA, title: 'Options note', content: '' });

    const read = await app.request(`/sandbox-documents/${doc.id}`, { headers: { cookie: alice } });
    expect(read.status).toBe(200);
    expect(((await read.json()) as SandboxDocument).id).toBe(doc.id);
  });

  it('lists only the requester organisation’s documents — no parameter exists', async () => {
    await app.request(`/projects/${projectId}/sandbox-documents`, {
      method: 'POST',
      headers: { cookie: bella, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'B-org private note' }),
    });

    const asAlice = (await (
      await app.request(`/projects/${projectId}/sandbox-documents`, { headers: { cookie: alice } })
    ).json()) as ListSandboxDocumentsResponse;
    expect(asAlice.items.every((d) => d.organisationId === orgA)).toBe(true);
    expect(asAlice.items.some((d) => d.title === 'B-org private note')).toBe(false);

    const asBella = (await (
      await app.request(`/projects/${projectId}/sandbox-documents`, { headers: { cookie: bella } })
    ).json()) as ListSandboxDocumentsResponse;
    expect(asBella.items.some((d) => d.title === 'B-org private note')).toBe(true);
    expect(asBella.items.some((d) => d.title === 'Options note')).toBe(false);
  });

  it('rejects a titleless create as invalid', async () => {
    const res = await app.request(`/projects/${projectId}/sandbox-documents`, {
      method: 'POST',
      headers: { cookie: alice, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
