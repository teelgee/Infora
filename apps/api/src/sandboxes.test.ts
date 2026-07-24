// T-153 acceptance, against the live dev database: sandbox creation (self-serve
// within own org, multi_org owner-gated), grant-based access (a member outside
// the grants cannot see it), cross-org grants owner-gated, folders, document
// move, and the one-way bind. ADR-0036/0038.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { GetSandboxResponse, Sandbox, SandboxFolder } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t153';
let projectId: string;
let orgA: string; // owner
let orgB: string; // consultant
let orgC: string; // consultant
let orgD: string; // member, never granted a sandbox
let aCookie: string;
let bCookie: string;
let cCookie: string;
let dCookie: string;
let bParticipant: string;

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
  const [a] = await db.insert(s.organisations).values({ name: 't153 A' }).returning();
  const [b] = await db.insert(s.organisations).values({ name: 't153 B' }).returning();
  const [cc] = await db.insert(s.organisations).values({ name: 't153 C' }).returning();
  const [d] = await db.insert(s.organisations).values({ name: 't153 D' }).returning();
  orgA = a!.id;
  orgB = b!.id;
  orgC = cc!.id;
  orgD = d!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't153 project', ownerOrganisationId: orgA })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: orgA, projectId, role: 'owner' },
    { organisationId: orgB, projectId, role: 'member' },
    { organisationId: orgC, projectId, role: 'member' },
    { organisationId: orgD, projectId, role: 'member' },
  ]);
  aCookie = await session((await makeUser('t153-anna', orgA)).user.email);
  const bUser = await makeUser('t153-bram', orgB);
  bParticipant = bUser.participant.id;
  bCookie = await session(bUser.user.email);
  cCookie = await session((await makeUser('t153-clio', orgC)).user.email);
  dCookie = await session((await makeUser('t153-dave', orgD)).user.email);
});

afterAll(async () => {
  await pool.end();
});

const createSandbox = (cookie: string, scope: string, name = 'sb') =>
  app.request(`/projects/${projectId}/sandboxes`, {
    method: 'POST',
    headers: asJson(cookie),
    body: JSON.stringify({ name, scope }),
  });

let bSandbox: string;

describe('sandbox creation + grant-based access (T-153, ADR-0036)', () => {
  it('a member self-serves a single-org sandbox and can see it; an ungranted member cannot', async () => {
    const res = await createSandbox(bCookie, 'single_org', 'B private');
    expect(res.status).toBe(201);
    bSandbox = ((await res.json()) as Sandbox).id;

    const bGet = await app.request(`/sandboxes/${bSandbox}`, { headers: asJson(bCookie) });
    expect(bGet.status).toBe(200);
    const dGet = await app.request(`/sandboxes/${bSandbox}`, { headers: asJson(dCookie) });
    expect(dGet.status).toBe(404); // not in the grants — separation by a narrower sandbox
  });

  it('multi_org is owner-gated: a member is denied, the owner allowed', async () => {
    expect((await createSandbox(bCookie, 'multi_org', 'shared')).status).toBe(404);
    const owned = await createSandbox(aCookie, 'multi_org', 'A shared');
    expect(owned.status).toBe(201);
  });

  it('a cross-organisation grant is owner-gated; the owner adds C to its own multi_org sandbox', async () => {
    const owned = ((await (await createSandbox(aCookie, 'multi_org', 'A+C')).json()) as Sandbox).id;
    const grant = await app.request(`/sandboxes/${owned}/scope-grants`, {
      method: 'POST',
      headers: asJson(aCookie),
      body: JSON.stringify({ organisationId: orgC }),
    });
    expect(grant.status).toBe(201);
    const cGet = await app.request(`/sandboxes/${owned}`, { headers: asJson(cCookie) });
    expect(cGet.status).toBe(200); // C now admitted

    // B, neither the owning org nor the owner, cannot add D
    const bAddD = await app.request(`/sandboxes/${owned}/scope-grants`, {
      method: 'POST',
      headers: asJson(bCookie),
      body: JSON.stringify({ organisationId: orgD }),
    });
    expect(bAddD.status).toBe(404);
  });
});

describe('folders + document move (T-153, ADR-0036)', () => {
  it('nests folders and moves a document without leaving the sandbox', async () => {
    const root = (await (
      await app.request(`/sandboxes/${bSandbox}/folders`, {
        method: 'POST',
        headers: asJson(bCookie),
        body: JSON.stringify({ name: 'Discipline' }),
      })
    ).json()) as SandboxFolder;
    const child = (await (
      await app.request(`/sandboxes/${bSandbox}/folders`, {
        method: 'POST',
        headers: asJson(bCookie),
        body: JSON.stringify({ name: 'Geo', parentFolderId: root.id }),
      })
    ).json()) as SandboxFolder;
    expect(child.parentFolderId).toBe(root.id);

    const [doc] = await db
      .insert(s.sandboxDocuments)
      .values({
        projectId,
        organisationId: orgB,
        sandboxId: bSandbox,
        folderId: child.id,
        title: 'Geo report',
        createdByParticipantId: bParticipant,
      })
      .returning();
    const moved = await app.request(`/sandbox-documents/${doc!.id}/move`, {
      method: 'POST',
      headers: asJson(bCookie),
      body: JSON.stringify({ folderId: root.id }),
    });
    expect(moved.status).toBe(200);
    const [after] = await db.select().from(s.sandboxDocuments).where(eq(s.sandboxDocuments.id, doc!.id));
    expect(after!.folderId).toBe(root.id);
    expect(after!.sandboxId).toBe(bSandbox); // access unchanged
  });
});

describe('bind — the one-way transition (T-153, ADR-0038)', () => {
  it('binds an own document to an own plan row; re-bind conflicts; wrong-org container invalid', async () => {
    const [container] = await db
      .insert(s.containers)
      .values({ projectId, producingOrganisationId: orgB, documentReference: `T153-BIND-${stamp}` })
      .returning();
    const [doc] = await db
      .insert(s.sandboxDocuments)
      .values({ projectId, organisationId: orgB, sandboxId: bSandbox, title: 'to bind', createdByParticipantId: bParticipant })
      .returning();

    const ok = await app.request(`/sandbox-documents/${doc!.id}/binding`, {
      method: 'POST',
      headers: asJson(bCookie),
      body: JSON.stringify({ containerId: container!.id }),
    });
    expect(ok.status).toBe(200);
    const [ev] = await db.select().from(s.bindingEvents).where(eq(s.bindingEvents.sandboxDocumentId, doc!.id));
    expect(ev!.containerId).toBe(container!.id); // audited

    const again = await app.request(`/sandbox-documents/${doc!.id}/binding`, {
      method: 'POST',
      headers: asJson(bCookie),
      body: JSON.stringify({ containerId: container!.id }),
    });
    expect(again.status).toBe(409); // already bound — one-way

    // a fresh doc cannot bind to another org's container
    const [aContainer] = await db
      .insert(s.containers)
      .values({ projectId, producingOrganisationId: orgA, documentReference: `T153-A-${stamp}` })
      .returning();
    const [doc2] = await db
      .insert(s.sandboxDocuments)
      .values({ projectId, organisationId: orgB, sandboxId: bSandbox, title: 'x', createdByParticipantId: bParticipant })
      .returning();
    const wrong = await app.request(`/sandbox-documents/${doc2!.id}/binding`, {
      method: 'POST',
      headers: asJson(bCookie),
      body: JSON.stringify({ containerId: aContainer!.id }),
    });
    expect(wrong.status).toBe(400);
  });
});

describe('authoring metadata (T-166, ADR-0038)', () => {
  it('sets and reads back a document’s authoring metadata', async () => {
    const [doc] = await db
      .insert(s.sandboxDocuments)
      .values({ projectId, organisationId: orgB, sandboxId: bSandbox, title: 'meta', createdByParticipantId: bParticipant })
      .returning();
    const res = await app.request(`/sandbox-documents/${doc!.id}/metadata`, {
      method: 'PATCH',
      headers: asJson(bCookie),
      body: JSON.stringify({ authoringMetadata: { revision: 'P01', suitability: 'S2' } }),
    });
    expect(res.status).toBe(200);
    const read = (await res.json()) as { authoringMetadata: Record<string, unknown> };
    expect(read.authoringMetadata).toEqual({ revision: 'P01', suitability: 'S2' });
  });
});
