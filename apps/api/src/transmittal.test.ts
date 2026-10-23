// T-137 acceptance — the ADR-0035 write half over HTTP against the live dev
// database: the owner issues a non-review transmittal (setting the share), the
// receiving organisation acknowledges (mode-aware), the gate opens for the
// whole org, intra-org narrowing restricts to named participants, and a
// standing rule auto-grants on issue. Visibility is read back through the
// library list, whose pre-filter is the very gate under test.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GetLibraryResponse } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { FAKE_EMBED_MODEL, fakeRouter, fakeVector } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t137';
let ownerOrgId: string;
let recvOrgId: string;
let projectId: string;
let ownerSession: string;
let adminSession: string; // Eleanor — recv org admin
let paulSession: string;
let quinnSession: string;
let paulParticipantId: string;
let quinnParticipantId: string;

async function makeUser(name: string, organisationId: string, orgRole: 'admin' | 'member') {
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name}-${stamp}@test.local`, organisationId, orgRole })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId })
    .returning();
  return { userId: user!.id, participantId: participant!.id };
}

async function session(name: string): Promise<string> {
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${name}-${stamp}@test.local`, password }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

// a promoted library deliverable produced by the owner org, with a live version
async function makeDeliverable(reference: string): Promise<string> {
  const [container] = await db
    .insert(s.containers)
    .values({ projectId, producingOrganisationId: ownerOrgId, documentReference: reference, inLibrary: true })
    .returning();
  const content = `gamma ${reference}`;
  const [version] = await db
    .insert(s.versions)
    .values({ containerId: container!.id, versionReference: 'v1', content, isCurrent: true })
    .returning();
  await db.insert(s.versionChunks).values({
    versionId: version!.id,
    chunkIndex: 0,
    content,
    embedding: fakeVector(content),
    embeddingModelId: FAKE_EMBED_MODEL,
    embeddingModelVersion: 'fake-1',
  });
  return container!.id;
}

const post = (cookie: string, path: string, body?: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
const patch = (cookie: string, path: string, body: unknown) =>
  app.request(path, {
    method: 'PATCH',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

async function libraryHas(cookie: string, containerId: string): Promise<boolean> {
  const res = await app.request(`/projects/${projectId}/library`, { headers: { cookie } });
  const { items } = (await res.json()) as GetLibraryResponse;
  return items.some((i) => i.containerId === containerId);
}

beforeAll(async () => {
  const [ownerOrg] = await db.insert(s.organisations).values({ name: 't137 owner' }).returning();
  const [recvOrg] = await db.insert(s.organisations).values({ name: 't137 recv' }).returning();
  ownerOrgId = ownerOrg!.id;
  recvOrgId = recvOrg!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't137 project', ownerOrganisationId: ownerOrgId })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrgId, projectId, role: 'owner' },
    { organisationId: recvOrgId, projectId, role: 'member' },
  ]);

  await makeUser('t137-owner', ownerOrgId, 'admin');
  const eleanor = await makeUser('t137-eleanor', recvOrgId, 'admin');
  const paul = await makeUser('t137-paul', recvOrgId, 'member');
  const quinn = await makeUser('t137-quinn', recvOrgId, 'member');
  paulParticipantId = paul.participantId;
  quinnParticipantId = quinn.participantId;
  void eleanor;

  [ownerSession, adminSession, paulSession, quinnSession] = await Promise.all([
    session('t137-owner'),
    session('t137-eleanor'),
    session('t137-paul'),
    session('t137-quinn'),
  ]);
});

afterAll(async () => {
  await pool.end();
});

describe('the non-review transmittal and the acknowledgement gate (T-137, ADR-0035)', () => {
  it('only the owner issues; a member cannot', async () => {
    const containerId = await makeDeliverable(`T137-OWN-${Date.now()}`);
    const denied = await post(paulSession, `/containers/${containerId}/transmittals`, {
      organisationIds: [recvOrgId],
    });
    expect(denied.status).toBe(404);
    const ok = await post(ownerSession, `/containers/${containerId}/transmittals`, {
      organisationIds: [recvOrgId],
    });
    expect(ok.status).toBe(201);
  });

  it('controller-mode default: the share is withheld until acknowledged, and only the controller/admin may acknowledge', async () => {
    const containerId = await makeDeliverable(`T137-CTRL-${Date.now()}`);
    await post(ownerSession, `/containers/${containerId}/transmittals`, { organisationIds: [recvOrgId] });

    // shared but unacknowledged — invisible to the receiving org
    expect(await libraryHas(paulSession, containerId)).toBe(false);

    // controller mode (the default) with no controller nominated: a plain
    // member cannot acknowledge…
    const paulTries = await post(paulSession, `/containers/${containerId}/acknowledgement`);
    expect(paulTries.status).toBe(403);

    // …the org admin is the fallback acknowledger, and one ack opens the whole org
    const acked = await post(adminSession, `/containers/${containerId}/acknowledgement`);
    expect(acked.status).toBe(201);
    expect(await libraryHas(paulSession, containerId)).toBe(true);
    expect(await libraryHas(quinnSession, containerId)).toBe(true);
  });

  it('open mode: any entitled participant may acknowledge', async () => {
    // the admin switches the receiving org to open mode
    const set = await patch(adminSession, `/projects/${projectId}/acknowledgement-mode`, {
      mode: 'open',
    });
    expect(set.status).toBe(200);

    const containerId = await makeDeliverable(`T137-OPEN-${Date.now()}`);
    await post(ownerSession, `/containers/${containerId}/transmittals`, { organisationIds: [recvOrgId] });
    const acked = await post(paulSession, `/containers/${containerId}/acknowledgement`);
    expect(acked.status).toBe(201);
    expect(await libraryHas(quinnSession, containerId)).toBe(true);
  });

  it('intra-org narrowing: an admin grant restricts to the named participant', async () => {
    // open mode from the previous test; an acknowledged, whole-org-visible share
    const containerId = await makeDeliverable(`T137-NARROW-${Date.now()}`);
    await post(ownerSession, `/containers/${containerId}/transmittals`, { organisationIds: [recvOrgId] });
    await post(paulSession, `/containers/${containerId}/acknowledgement`);
    expect(await libraryHas(quinnSession, containerId)).toBe(true);

    // the admin narrows to Paul only — Quinn drops out, Paul stays
    const grant = await post(adminSession, `/containers/${containerId}/participant-grants`, {
      participantId: paulParticipantId,
    });
    expect(grant.status).toBe(201);
    expect(await libraryHas(paulSession, containerId)).toBe(true);
    expect(await libraryHas(quinnSession, containerId)).toBe(false);
  });

  it('T-456 — the narrowing is readable by the receiving organisation, and absent elsewhere', async () => {
    const containerId = await makeDeliverable(`T456-READ-${Date.now()}`);
    await post(ownerSession, `/containers/${containerId}/transmittals`, { organisationIds: [recvOrgId] });
    await post(paulSession, `/containers/${containerId}/acknowledgement`);
    await post(adminSession, `/containers/${containerId}/participant-grants`, { participantId: paulParticipantId });

    // the admin and a plain member of the receiving organisation both read it
    for (const cookie of [adminSession, quinnSession]) {
      const res = await app.request(`/containers/${containerId}/participant-grants`, { headers: { cookie } });
      expect(res.status).toBe(200);
      const { items } = (await res.json()) as { items: Array<{ participantId: string; revokedAt: string | null }> };
      expect(items.map((g) => g.participantId)).toEqual([paulParticipantId]);
      expect(items[0]!.revokedAt).toBeNull();
    }
    // the owner's organisation holds no share, so the list is absence, not empty
    const ownerRes = await app.request(`/containers/${containerId}/participant-grants`, { headers: { cookie: ownerSession } });
    expect(ownerRes.status).toBe(404);
  });

  it('the standing rule auto-grants the matching participant on issue', async () => {
    // a rule keyed on a discipline code prefix, granting Quinn
    const rule = await post(adminSession, `/projects/${projectId}/grant-rules`, {
      codePattern: 'T137-GEO-%',
      participantId: quinnParticipantId,
    });
    expect(rule.status).toBe(201);

    const containerId = await makeDeliverable(`T137-GEO-${Date.now()}`);
    await post(ownerSession, `/containers/${containerId}/transmittals`, { organisationIds: [recvOrgId] });
    await post(paulSession, `/containers/${containerId}/acknowledgement`);

    // the rule granted Quinn on issue, so the narrowing is present and excludes Paul
    expect(await libraryHas(quinnSession, containerId)).toBe(true);
    expect(await libraryHas(paulSession, containerId)).toBe(false);
  });
});
