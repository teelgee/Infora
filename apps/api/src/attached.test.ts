// T-154 acceptance, against the live dev database: the attached-source working
// set on a conversation (pin/list/unpin), and a document-bound multiplayer
// conversation gated on the document's sandbox scope — a co-org in the shared
// sandbox reaches it; a member outside the scope does not. ADR-0022/0039.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AttachedSource } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t154';
let projectId: string;
let orgA: string;
let orgB: string;
let orgC: string;
let orgD: string;
let aParticipant: string;
let bParticipant: string;
let bCookie: string;
let cCookie: string;
let dCookie: string;
let sharedSandbox: string;
let docId: string;

async function makeUser(name: string, organisationId: string) {
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name}-${stamp}@test.local`, organisationId })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [p] = await db.insert(s.participants).values({ userId: user!.id, projectId }).returning();
  return { user: user!, participant: p! };
}
async function session(email: string): Promise<string> {
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}
const asJson = (cookie: string) => ({ cookie, 'content-type': 'application/json' });

beforeAll(async () => {
  const [a] = await db.insert(s.organisations).values({ name: 't154 A' }).returning();
  const [b] = await db.insert(s.organisations).values({ name: 't154 B' }).returning();
  const [cc] = await db.insert(s.organisations).values({ name: 't154 C' }).returning();
  const [d] = await db.insert(s.organisations).values({ name: 't154 D' }).returning();
  orgA = a!.id;
  orgB = b!.id;
  orgC = cc!.id;
  orgD = d!.id;
  const [project] = await db.insert(s.projects).values({ name: 't154 project', ownerOrganisationId: orgA }).returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: orgA, projectId, role: 'owner' },
    { organisationId: orgB, projectId, role: 'member' },
    { organisationId: orgC, projectId, role: 'member' },
    { organisationId: orgD, projectId, role: 'member' },
  ]);
  const a1 = await makeUser('t154-anna', orgA);
  const b1 = await makeUser('t154-bram', orgB);
  aParticipant = a1.participant.id;
  bParticipant = b1.participant.id;
  bCookie = await session(b1.user.email);
  cCookie = await session((await makeUser('t154-clio', orgC)).user.email);
  dCookie = await session((await makeUser('t154-dave', orgD)).user.email);

  // an owner-provisioned shared sandbox with B and C admitted
  const [sb] = await db
    .insert(s.sandboxes)
    .values({ projectId, name: 'B+C shared', scope: 'multi_org', owningOrganisationId: orgA, createdByParticipantId: aParticipant })
    .returning();
  sharedSandbox = sb!.id;
  await db.insert(s.sandboxScopeGrants).values([
    { sandboxId: sharedSandbox, granteeType: 'organisation', organisationId: orgB, grantedByParticipantId: aParticipant },
    { sandboxId: sharedSandbox, granteeType: 'organisation', organisationId: orgC, grantedByParticipantId: aParticipant },
  ]);
  // B's co-authored document in the shared sandbox
  const [doc] = await db
    .insert(s.sandboxDocuments)
    .values({ projectId, organisationId: orgB, sandboxId: sharedSandbox, title: 'co-authored draft', createdByParticipantId: bParticipant })
    .returning();
  docId = doc!.id;
});

afterAll(async () => {
  await pool.end();
});

let conversationId: string;

describe('attached-source working set on a multiplayer conversation (T-154)', () => {
  it('B opens a document-bound conversation and pins several sources', async () => {
    const created = await app.request(`/projects/${projectId}/conversations`, {
      method: 'POST',
      headers: asJson(bCookie),
      body: JSON.stringify({ surface: 'web', sandboxDocumentId: docId }),
    });
    expect(created.status).toBe(201);
    conversationId = ((await created.json()) as { conversationId: string }).conversationId;

    for (const src of [
      { kind: 'sandbox', ref: 'sandbox-doc-x', label: 'Working note' },
      { kind: 'web', ref: 'https://example.test/std' },
    ]) {
      const res = await app.request(`/conversations/${conversationId}/attached-sources`, {
        method: 'POST',
        headers: asJson(bCookie),
        body: JSON.stringify(src),
      });
      expect(res.status).toBe(201);
    }
    const list = await app.request(`/conversations/${conversationId}/attached-sources`, { headers: asJson(bCookie) });
    expect(((await list.json()) as { items: AttachedSource[] }).items.length).toBe(2);
  });

  it('a co-org in the shared sandbox sees the working set; a member outside the scope cannot', async () => {
    const cList = await app.request(`/conversations/${conversationId}/attached-sources`, { headers: asJson(cCookie) });
    expect(cList.status).toBe(200);
    expect(((await cList.json()) as { items: AttachedSource[] }).items.length).toBe(2);

    const dList = await app.request(`/conversations/${conversationId}/attached-sources`, { headers: asJson(dCookie) });
    expect(dList.status).toBe(404); // D is not in the sandbox scope
  });

  // T-250 (finding F3 §6) — the reserved `web` attached-source kind,
  // resolved. It stays, per the 2026-07-29 ruling: web *research* results are
  // citable in a separate external register; a user-pinned web attached source
  // keeps the original ADR-0022 rule and never grounds, never cites. Until now
  // that held by omission — nothing read the row. This pins it: the pointer is
  // stored, a run over the same conversation carries nothing from it, and the
  // only type that can ever carry fetched web content (ExternalSource, T-250)
  // cannot enter the working input at all.
  it('a pinned web source is a pointer, not content: no run grounds on it', async () => {
    const run = await app.request(`/conversations/${conversationId}/runs`, {
      method: 'POST',
      headers: asJson(bCookie),
      body: JSON.stringify({ request: 'What do the attached sources say?' }),
    });
    expect(run.status).toBe(201);
    const body = (await run.json()) as {
      response: string | null;
      citations: unknown[];
      steps: Array<{ sourceSet: unknown[] }>;
    };

    const seen = JSON.stringify([body.steps.flatMap((step) => step.sourceSet), body.citations]);
    expect(seen).not.toContain('example.test/std'); // the pinned pointer
    expect(seen).not.toContain('attachedSource');
    expect(body.response ?? '').not.toContain('example.test/std');
  });

  it('unpins by closing the interval', async () => {
    const list = await app.request(`/conversations/${conversationId}/attached-sources`, { headers: asJson(bCookie) });
    const first = ((await list.json()) as { items: AttachedSource[] }).items[0]!;
    const unpin = await app.request(`/attached-sources/${first.id}/unpin`, { method: 'POST', headers: asJson(bCookie) });
    expect(unpin.status).toBe(200);
    const after = await app.request(`/conversations/${conversationId}/attached-sources`, { headers: asJson(bCookie) });
    expect(((await after.json()) as { items: AttachedSource[] }).items.length).toBe(1);
  });
});
