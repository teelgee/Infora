// T-051 acceptance, against the live dev database: create, list, open — and
// the list is the requester's organisation's private sandbox only, by
// construction (ADR-0018).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
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

  it('PATCH is manual editing — content lands, no Suggestion, no Signal (T-082)', async () => {
    const created = (await (
      await app.request(`/projects/${projectId}/sandbox-documents`, {
        method: 'POST',
        headers: { cookie: alice, 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Hand-written note' }),
      })
    ).json()) as SandboxDocument;

    const patched = await app.request(`/sandbox-documents/${created.id}`, {
      method: 'PATCH',
      headers: { cookie: alice, 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'Typed by hand, as if AI did not exist.' }),
    });
    expect(patched.status).toBe(200);
    const doc = (await patched.json()) as SandboxDocument;
    expect(doc.content).toBe('Typed by hand, as if AI did not exist.');
    expect(new Date(doc.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(created.updatedAt).getTime(),
    );

    const suggestions = await db
      .select()
      .from(s.suggestions)
      .where(eq(s.suggestions.sandboxDocumentId, created.id));
    expect(suggestions).toEqual([]); // no ceremony, by design
  });

  it('lists the document’s suggestions for the Editor panel (T-082)', async () => {
    const created = (await (
      await app.request(`/projects/${projectId}/sandbox-documents`, {
        method: 'POST',
        headers: { cookie: alice, 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Drafted into' }),
      })
    ).json()) as SandboxDocument;

    // a run leaves a Suggestion on the document
    const [conversation] = await db
      .insert(s.conversations)
      .values({ projectId, surface: 'web' })
      .returning();
    const [participant] = await db
      .select()
      .from(s.participants)
      .where(eq(s.participants.projectId, projectId))
      .limit(1);
    const [run] = await db
      .insert(s.runs)
      .values({
        conversationId: conversation!.id,
        agentId: 'infora.grounded_draft',
        agentProvenance: 'infora',
        request: 'draft it',
        environmentKey: projectId,
        requesterParticipantId: participant!.id,
      })
      .returning();
    await db.insert(s.suggestions).values({
      runId: run!.id,
      sandboxDocumentId: created.id,
      kind: 'insert',
      content: 'Proposed text.',
      rationale: 'Grounded draft: 1 cited claim from project sources; nothing was withheld.',
    });

    const res = await app.request(`/sandbox-documents/${created.id}/suggestions`, {
      headers: { cookie: alice },
    });
    expect(res.status).toBe(200);
    const { items } = (await res.json()) as { items: Array<{ content: string; signal?: unknown }> };
    expect(items).toHaveLength(1);
    expect(items[0]!.content).toBe('Proposed text.');
    expect(items[0]!.signal).toBeUndefined(); // pending
  });
});
