// T-153 acceptance, against the live dev database: sandbox creation (self-serve
// within own org, multi_org owner-gated), grant-based access (a member outside
// the grants cannot see it), cross-org grants owner-gated, folders, document
// move, and the one-way bind. ADR-0036/0038.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Sandbox, SandboxFolder } from '@infora/contracts';
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

async function makeUser(name: string, organisationId: string, elevated = false) {
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name}-${stamp}@test.local`, organisationId })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [p] = await db.insert(s.participants).values({ userId: user!.id, projectId, elevated }).returning();
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
  // anna is the owner super-user; bram a guest super-user (creation is a
  // super-user act, T-186); clio and dave are ordinary members
  aCookie = await session((await makeUser('t153-anna', orgA, true)).user.email);
  const bUser = await makeUser('t153-bram', orgB, true);
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

describe('sandbox creation + grant-based access (T-153, ADR-0036/T-186)', () => {
  it('a super-user creates a single-org sandbox and can see it; an ungranted member cannot', async () => {
    const res = await createSandbox(bCookie, 'single_org', 'B private');
    expect(res.status).toBe(201);
    bSandbox = ((await res.json()) as Sandbox).id;

    const bGet = await app.request(`/sandboxes/${bSandbox}`, { headers: asJson(bCookie) });
    expect(bGet.status).toBe(200);
    const dGet = await app.request(`/sandboxes/${bSandbox}`, { headers: asJson(dCookie) });
    expect(dGet.status).toBe(404); // not in the grants — separation by a narrower sandbox
  });

  it('an ordinary member cannot create a sandbox at all (creation is a super-user act, T-186)', async () => {
    const res = await createSandbox(dCookie, 'single_org', 'D tries');
    expect(res.status).toBe(403);
  });

  it('a shared (multi_org) sandbox is the owner-super’s act: a guest super-user is denied, the owner-super allowed', async () => {
    expect((await createSandbox(bCookie, 'multi_org', 'shared')).status).toBe(403); // guest-super cannot open cross-org
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

    // the list read carries the org-grant scope for the sandbox card (T-184):
    // both the owning org and the shared-in org appear
    const list = (await (
      await app.request(`/projects/${projectId}/sandboxes`, { headers: asJson(aCookie) })
    ).json()) as { items: Array<{ id: string; organisationIdsInScope?: string[] }> };
    const card = list.items.find((i) => i.id === owned)!;
    expect(new Set(card.organisationIdsInScope)).toEqual(new Set([orgA, orgC]));

    // B, neither the owning org nor the owner, cannot add D
    const bAddD = await app.request(`/sandboxes/${owned}/scope-grants`, {
      method: 'POST',
      headers: asJson(bCookie),
      body: JSON.stringify({ organisationId: orgD }),
    });
    expect(bAddD.status).toBe(404);
  });

  it('the wizard admits organisations and specific participants at creation (T-187)', async () => {
    // owner-super creates a shared sandbox admitting org C up front
    const shared = ((await (
      await app.request(`/projects/${projectId}/sandboxes`, {
        method: 'POST',
        headers: asJson(aCookie),
        body: JSON.stringify({ name: 'wizard shared', scope: 'multi_org', organisationIds: [orgC] }),
      })
    ).json()) as Sandbox).id;
    expect((await app.request(`/sandboxes/${shared}`, { headers: asJson(cCookie) })).status).toBe(200); // C admitted at creation

    // guest-super creates a named-user sandbox admitting a specific person up front
    const guest = await makeUser('t187-gwen', orgB);
    const nu = ((await (
      await app.request(`/projects/${projectId}/sandboxes`, {
        method: 'POST',
        headers: asJson(bCookie),
        body: JSON.stringify({ name: 'wizard named', scope: 'named_user', participantIds: [guest.participant.id] }),
      })
    ).json()) as Sandbox).id;
    const gwenCookie = await session(guest.user.email);
    expect((await app.request(`/sandboxes/${nu}`, { headers: asJson(gwenCookie) })).status).toBe(200); // admitted at creation
    // an ungranted org-B member still cannot see it (participant-private)
    const stranger = await session((await makeUser('t187-stan', orgB)).user.email);
    expect((await app.request(`/sandboxes/${nu}`, { headers: asJson(stranger) })).status).toBe(404);
  });
});

describe('personal sandboxes (T-186)', () => {
  it('every participant has an auto-provisioned personal sandbox, created idempotently', async () => {
    const read = async () =>
      (await (
        await app.request(`/projects/${projectId}/sandboxes`, { headers: asJson(dCookie) })
      ).json()) as { items: Array<{ isPersonal: boolean; name: string }> };
    const first = await read();
    const personal = first.items.filter((i) => i.isPersonal);
    expect(personal.length).toBe(1);
    expect(personal[0]!.name).toBe('Personal workspace');
    // an ordinary member sees only their personal sandbox (no others granted)
    expect(first.items.length).toBe(1);
    // idempotent: listing again does not provision a second
    const second = await read();
    expect(second.items.filter((i) => i.isPersonal).length).toBe(1);
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

describe('per-sandbox settings + the folder-creation toggle (T-181, ADR-0040)', () => {
  let superCookie: string; // an elevated (super-user) participant in org B
  let ordCookie: string; // an ordinary (non-elevated) member in org B

  it('an ordinary member cannot configure; a super-user of the owning org can', async () => {
    // a guest super-user of org B (elevated) and an ordinary org-B member
    superCookie = await session((await makeUser('t181-bea', orgB, true)).user.email);
    ordCookie = await session((await makeUser('t181-cid', orgB)).user.email);

    // an ordinary member is refused (403); the setting stays default (on)
    const denied = await app.request(`/sandboxes/${bSandbox}/settings`, {
      method: 'PATCH',
      headers: asJson(ordCookie),
      body: JSON.stringify({ allowMemberFolderCreate: false }),
    });
    expect(denied.status).toBe(403);

    // the super-user turns member folder creation off
    const ok = await app.request(`/sandboxes/${bSandbox}/settings`, {
      method: 'PATCH',
      headers: asJson(superCookie),
      body: JSON.stringify({ allowMemberFolderCreate: false }),
    });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { allowMemberFolderCreate: boolean }).allowMemberFolderCreate).toBe(false);
  });

  it('with the toggle off, an ordinary member cannot create a folder but a super-user can', async () => {
    const member = await app.request(`/sandboxes/${bSandbox}/folders`, {
      method: 'POST',
      headers: asJson(ordCookie),
      body: JSON.stringify({ name: 'Members cannot add this' }),
    });
    expect(member.status).toBe(403);
    expect(((await member.json()) as { detail?: string }).detail).toBe('member_folder_create_disabled');

    const superFolder = await app.request(`/sandboxes/${bSandbox}/folders`, {
      method: 'POST',
      headers: asJson(superCookie),
      body: JSON.stringify({ name: 'Super-user structure' }),
    });
    expect(superFolder.status).toBe(201);
  });

  it('canConfigure is a self fact on the read: true for the super-user, false for the member', async () => {
    const asSuper = (await (await app.request(`/sandboxes/${bSandbox}`, { headers: asJson(superCookie) })).json()) as {
      canConfigure: boolean;
    };
    const asMember = (await (await app.request(`/sandboxes/${bSandbox}`, { headers: asJson(ordCookie) })).json()) as {
      canConfigure: boolean;
    };
    expect(asSuper.canConfigure).toBe(true);
    expect(asMember.canConfigure).toBe(false);

    // restore the default so later shared-state tests are unaffected
    await app.request(`/sandboxes/${bSandbox}/settings`, {
      method: 'PATCH',
      headers: asJson(superCookie),
      body: JSON.stringify({ allowMemberFolderCreate: true }),
    });
  });

  it('create-folder-structure: a super-user lays out a nested tree at once; a member cannot (T-182)', async () => {
    const structure = {
      nodes: [
        { name: 'Environmental', children: [{ name: 'Ecology' }, { name: 'Noise' }] },
        { name: 'Engineering', children: [{ name: 'Civil' }] },
      ],
    };
    // an ordinary member is refused — laying out structure is a super-user act
    const denied = await app.request(`/sandboxes/${bSandbox}/folder-structure`, {
      method: 'POST',
      headers: asJson(ordCookie),
      body: JSON.stringify(structure),
    });
    expect(denied.status).toBe(403);

    const ok = await app.request(`/sandboxes/${bSandbox}/folder-structure`, {
      method: 'POST',
      headers: asJson(superCookie),
      body: JSON.stringify(structure),
    });
    expect(ok.status).toBe(201);
    expect(((await ok.json()) as { created: number }).created).toBe(5);

    // the nesting is real: Ecology's parent is Environmental, both in this sandbox
    const all = await db.select().from(s.sandboxFolders).where(eq(s.sandboxFolders.sandboxId, bSandbox));
    const env = all.find((f) => f.name === 'Environmental')!;
    const eco = all.find((f) => f.name === 'Ecology')!;
    expect(eco.parentFolderId).toBe(env.id);
    expect(env.parentFolderId).toBeNull();
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

describe('document presence (T-175, ADR-0039)', () => {
  it('heartbeats and reports another present participant, self excluded', async () => {
    const [doc] = await db
      .insert(s.sandboxDocuments)
      .values({ projectId, organisationId: orgB, sandboxId: bSandbox, title: 'presence', createdByParticipantId: bParticipant })
      .returning();
    // a second Calder & Hale participant, present on the same document
    const [user2] = await db
      .insert(s.users)
      .values({ name: 'Cleo Bevan', email: `cleo-${stamp}@test.local`, organisationId: orgB })
      .returning();
    const [p2] = await db.insert(s.participants).values({ userId: user2!.id, projectId }).returning();
    await db.insert(s.documentPresence).values({ sandboxDocumentId: doc!.id, participantId: p2!.id });

    const beat = await app.request(`/sandbox-documents/${doc!.id}/presence`, { method: 'POST', headers: asJson(bCookie) });
    expect(beat.status).toBe(200);
    const read = await app.request(`/sandbox-documents/${doc!.id}/presence`, { headers: asJson(bCookie) });
    const { items } = (await read.json()) as { items: Array<{ participantId: string; name: string; initials: string }> };
    expect(items.map((i) => i.participantId)).toEqual([p2!.id]); // the other person, not self
    expect(items[0]!.initials).toBe('CB');
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
