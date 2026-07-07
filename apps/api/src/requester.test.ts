// T-023 acceptance: requester resolution in front of every endpoint,
// deny-as-404 semantics, no caller-supplied identity. Runs against the live
// dev database with self-contained fixtures: an entitled consultant, an
// authenticated user with no Participant, an authenticated third-org user,
// and a second organisation's sandbox document inside the same project.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t023';

// sessions by persona, filled in beforeAll
let entitled: string; // org A participant on the project
let otherOrg: string; // org B participant on the same project (sandbox privacy)
let noParticipant: string; // org A user with no Participant
let thirdOrg: string; // org C, no Membership at all

let projectId: string;
let conversationId: string;
let runId: string;
let workItemId: string;
let sandboxDocumentId: string; // org A's
let suggestionId: string; // on org A's document

async function makeUser(name: string, organisationId: string) {
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name}-${stamp}@test.local`, organisationId })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
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
  const [orgA] = await db.insert(s.organisations).values({ name: 't023 org A' }).returning();
  const [orgB] = await db.insert(s.organisations).values({ name: 't023 org B' }).returning();
  const [orgC] = await db.insert(s.organisations).values({ name: 't023 org C' }).returning();

  const [project] = await db
    .insert(s.projects)
    .values({ name: 't023 project', ownerOrganisationId: orgA!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: orgA!.id, projectId, role: 'owner' },
    { organisationId: orgB!.id, projectId, role: 'member' },
  ]);

  const alice = await makeUser('t023-alice', orgA!.id);
  const bella = await makeUser('t023-bella', orgB!.id);
  const carol = await makeUser('t023-carol', orgA!.id); // no Participant
  const dara = await makeUser('t023-dara', orgC!.id); // no Membership

  const [aliceP] = await db
    .insert(s.participants)
    .values({ userId: alice.id, projectId })
    .returning();
  await db.insert(s.participants).values({ userId: bella.id, projectId });

  const [conversation] = await db
    .insert(s.conversations)
    .values({ projectId, surface: 'web' })
    .returning();
  conversationId = conversation!.id;
  const [run] = await db
    .insert(s.runs)
    .values({
      conversationId,
      agentId: 'infora.document_production',
      agentProvenance: 'infora',
      request: 't023',
      environmentKey: projectId,
      requesterParticipantId: aliceP!.id,
    })
    .returning();
  runId = run!.id;
  const [workItem] = await db
    .insert(s.workItems)
    .values({ projectId, type: 'document_production', title: 't023', status: 'in_production' })
    .returning();
  workItemId = workItem!.id;
  const [doc] = await db
    .insert(s.sandboxDocuments)
    .values({ projectId, organisationId: orgA!.id, title: 't023 doc', createdByParticipantId: aliceP!.id })
    .returning();
  sandboxDocumentId = doc!.id;
  const [suggestion] = await db
    .insert(s.suggestions)
    .values({ runId, sandboxDocumentId, kind: 'insert', content: 'x', rationale: 'y' })
    .returning();
  suggestionId = suggestion!.id;

  [entitled, otherOrg, noParticipant, thirdOrg] = await Promise.all([
    session(alice.email),
    session(bella.email),
    session(carol.email),
    session(dara.email),
  ]);
});

afterAll(async () => {
  await pool.end();
});

// route → the status the entitled requester's handler answers (bodyless
// POSTs validate to 400; T-046 routes are live; the rest still 501)
const routes = (): Array<[string, string, number]> => [
  ['POST', `/projects/${projectId}/conversations`, 400],
  ['POST', `/conversations/${conversationId}/runs`, 400],
  ['GET', `/conversations/${conversationId}`, 200],
  ['GET', `/runs/${runId}`, 200],
  ['GET', `/projects/${projectId}/work-items`, 200],
  ['GET', `/work-items/${workItemId}`, 200],
  ['POST', `/projects/${projectId}/sandbox-documents`, 501],
  ['GET', `/sandbox-documents/${sandboxDocumentId}`, 501],
  ['PATCH', `/sandbox-documents/${sandboxDocumentId}`, 501],
  ['POST', `/suggestions/${suggestionId}/resolution`, 501],
  ['GET', `/projects/${projectId}/library`, 501],
];

const hit = (cookie: string, method: string, path: string) =>
  app.request(path, { method, headers: { cookie } });

describe('T-023 — the boundary admits the entitled requester', () => {
  it('passes every scoped route through to its handler', async () => {
    for (const [method, path, expected] of routes()) {
      const res = await hit(entitled, method, path);
      expect(`${method} ${path} → ${res.status}`).toBe(`${method} ${path} → ${expected}`);
    }
  });
});

describe('T-023 — deny is the same 404 as nonexistence', () => {
  it('denies the no-Participant user on every scoped route', async () => {
    for (const [method, path] of routes()) {
      const res = await hit(noParticipant, method, path);
      expect(`${method} ${path} → ${res.status}`).toBe(`${method} ${path} → 404`);
      expect(await res.json()).toEqual({ error: 'not_found' });
    }
  });

  it('denies the membership-less third-org user on every scoped route', async () => {
    for (const [method, path] of routes()) {
      const res = await hit(thirdOrg, method, path);
      expect(`${method} ${path} → ${res.status}`).toBe(`${method} ${path} → 404`);
    }
  });

  it("keeps another organisation's sandbox private inside the project (ADR-0018)", async () => {
    expect((await hit(otherOrg, 'GET', `/sandbox-documents/${sandboxDocumentId}`)).status).toBe(404);
    expect((await hit(otherOrg, 'PATCH', `/sandbox-documents/${sandboxDocumentId}`)).status).toBe(404);
    expect((await hit(otherOrg, 'POST', `/suggestions/${suggestionId}/resolution`)).status).toBe(404);
    // while the same requester passes on project-scoped routes
    expect((await hit(otherOrg, 'GET', `/projects/${projectId}/library`)).status).toBe(501);
  });

  it('answers nonexistent and malformed ids identically', async () => {
    const gone = '00000000-0000-4000-8000-000000000000';
    for (const target of [gone, 'not-a-uuid']) {
      const res = await hit(entitled, 'GET', `/runs/${target}`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'not_found' });
    }
  });

  it('an unknown path and a wrong method read the same envelope', async () => {
    expect(await (await hit(entitled, 'GET', '/nope')).json()).toEqual({ error: 'not_found' });
    expect((await hit(entitled, 'DELETE', `/runs/${runId}`)).status).toBe(404);
  });
});
