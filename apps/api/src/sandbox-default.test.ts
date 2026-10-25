// T-486 (h) — "the organisation's default working area" is a RULE, not whatever
// the database reads first.
//
// The twice-seen failure: `sandbox-collab.test.ts` ("an upload lands where the
// person was") expected a 404 for a folder that belongs to one of the
// organisation's areas and got a 201 — in a full parallel run, never alone. The
// cause is the pick in `ensureDefaultSandbox`: it was a bare `LIMIT 1` with no
// ORDER BY over a table with no index on those columns, so Postgres answered in
// heap order (the order rows physically sit in the table), and that is not
// creation order: an UPDATE writes a row's new version at a new place, and space
// freed by earlier updates is reused by later inserts, so a row made last can sit
// first. An organisation with several single-organisation areas on a project
// therefore had a different "default" from one request to the next.
//
// These tests PROVE the cause rather than wait for it: two areas are written in
// ONE insert with the newer first, so the database itself lays them out
// newer-then-older, and the old unordered query is shown to return the newer one
// (the precondition — that is the old code's pick, read from Postgres). The
// rule then has to answer "the oldest", every time.
//
// Fresh organisations and a fresh project per test; every row is looked up by an
// id this file made, never by title.
import { afterAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import type { SandboxDocument } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';
import { ensureDefaultSandbox } from './sandbox';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t486h';
const DAY = 24 * 60 * 60 * 1000;
const asJson = (cookie: string) => ({ cookie, 'content-type': 'application/json' });

afterAll(async () => {
  await pool.end();
});

/** A fresh organisation, project and one signed-in member of it. */
async function makeWorld(label: string) {
  const [org] = await db.insert(s.organisations).values({ name: `t486h ${label}` }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t486h ${label} project`, ownerOrganisationId: org!.id })
    .returning();
  const projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId: org!.id, projectId, role: 'owner' });
  const [user] = await db
    .insert(s.users)
    .values({ name: `t486h-${label}`, email: `t486h-${label}-${stamp}@test.local`, organisationId: org!.id })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db.insert(s.participants).values({ userId: user!.id, projectId, elevated: true }).returning();
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user!.email, password }),
  });
  const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
  return { orgId: org!.id, projectId, participantId: participant!.id, cookie };
}

/**
 * Two single-organisation areas in ONE multi-row insert. The insert order is the
 * heap order, so a query with no ORDER BY meets the first-listed one first: the
 * NEWER by default (the order that made the old pick wrong), or the older when
 * `olderFirst` says so. Each holds a live grant for the organisation (as every
 * area made through the product does), and a folder lives in the newer one.
 */
async function twoAreas(world: Awaited<ReturnType<typeof makeWorld>>, heapOrder: 'newerFirst' | 'olderFirst' = 'newerFirst') {
  const base = {
    projectId: world.projectId,
    scope: 'single_org' as const,
    owningOrganisationId: world.orgId,
    createdByParticipantId: world.participantId,
  };
  const newerValues = { ...base, name: 'newer area', createdAt: new Date(Date.now() - 1000) };
  const olderValues = { ...base, name: 'older area', createdAt: new Date(Date.now() - DAY) };
  const inserted = await db
    .insert(s.sandboxes)
    .values(heapOrder === 'newerFirst' ? [newerValues, olderValues] : [olderValues, newerValues])
    .returning();
  const newer = inserted.find((r) => r.name === 'newer area');
  const older = inserted.find((r) => r.name === 'older area');
  const grants = await db
    .insert(s.sandboxScopeGrants)
    .values(
      [newer!, older!].map((sb) => ({
        sandboxId: sb.id,
        granteeType: 'organisation' as const,
        organisationId: world.orgId,
        grantedByParticipantId: world.participantId,
      })),
    )
    .returning();
  const [folder] = await db
    .insert(s.sandboxFolders)
    .values({ sandboxId: newer!.id, name: 'in the newer area', createdByParticipantId: world.participantId })
    .returning();
  return {
    newerId: newer!.id,
    olderId: older!.id,
    newerFolderId: folder!.id,
    olderGrantId: grants.find((g) => g.sandboxId === older!.id)!.id,
    newerGrantId: grants.find((g) => g.sandboxId === newer!.id)!.id,
  };
}

/** The OLD pick, written out exactly as `ensureDefaultSandbox` had it. */
async function oldUnorderedPick(world: Awaited<ReturnType<typeof makeWorld>>): Promise<string> {
  const rows = await db.execute(sql`
    SELECT id FROM sandboxes
    WHERE project_id = ${world.projectId}
      AND owning_organisation_id = ${world.orgId}
      AND scope = 'single_org'
    LIMIT 1`);
  return (rows.rows[0] as { id: string }).id;
}

const uploadFile = async (cookie: string, projectId: string, fields: Record<string, string>) => {
  const { textToDocx } = await import('./renditions.js');
  const form = new FormData();
  form.append('file', new File([new Uint8Array(textToDocx('Default area check.'))], 'Default.docx'));
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return app.request(`/projects/${projectId}/sandbox-uploads`, { method: 'POST', headers: { cookie }, body: form });
};
const createDocument = (cookie: string, projectId: string) =>
  app.request(`/projects/${projectId}/sandbox-documents`, {
    method: 'POST',
    headers: asJson(cookie),
    body: JSON.stringify({ title: 't486h new draft' }),
  });

describe('the default working area is the organisation’s OLDEST live one (T-486 h)', () => {
  it('the database lays the newer area out first, and the old unordered pick returns it (the cause)', async () => {
    const world = await makeWorld('cause');
    const areas = await twoAreas(world);
    // The precondition IS the finding: with two areas in this order and no
    // ORDER BY, Postgres hands back the NEWER one. That is what the old
    // `ensureDefaultSandbox` returned, whatever the clock said.
    expect(await oldUnorderedPick(world)).toBe(areas.newerId);
    // The rule does not follow the database's order: it follows creation order.
    expect(await ensureDefaultSandbox(db, world.projectId, world.orgId, world.participantId)).toBe(areas.olderId);
  });

  it('an upload naming only a folder of the NEWER area is refused: that folder is not the default’s', async () => {
    const world = await makeWorld('upload-folder');
    const areas = await twoAreas(world);
    expect(await oldUnorderedPick(world)).toBe(areas.newerId); // precondition (the old pick)
    const before = await db.select().from(s.sandboxDocuments).where(eq(s.sandboxDocuments.projectId, world.projectId));
    const res = await uploadFile(world.cookie, world.projectId, { folderId: areas.newerFolderId });
    expect(res.status).toBe(404);
    const after = await db.select().from(s.sandboxDocuments).where(eq(s.sandboxDocuments.projectId, world.projectId));
    expect(after.length).toBe(before.length); // nothing written
  });

  it('an upload and a new draft with no area named land in the OLDER area', async () => {
    const world = await makeWorld('lands-oldest');
    const areas = await twoAreas(world);
    expect(await oldUnorderedPick(world)).toBe(areas.newerId); // precondition (the old pick)

    const uploaded = await uploadFile(world.cookie, world.projectId, {});
    expect(uploaded.status).toBe(201);
    expect(((await uploaded.json()) as SandboxDocument).sandboxId).toBe(areas.olderId);

    const created = await createDocument(world.cookie, world.projectId);
    expect(created.status).toBe(201);
    expect(((await created.json()) as SandboxDocument).sandboxId).toBe(areas.olderId);

    // and the same again: the answer does not vary between requests
    const again = await createDocument(world.cookie, world.projectId);
    expect(((await again.json()) as SandboxDocument).sandboxId).toBe(areas.olderId);
  });

  it('an area whose organisation grant was revoked is skipped; with none left a fresh one is made, once', async () => {
    const world = await makeWorld('revoked');
    // here the OLDER area is laid out first, so the old pick would meet it first
    const areas = await twoAreas(world, 'olderFirst');
    expect(await oldUnorderedPick(world)).toBe(areas.olderId); // precondition (the old pick)

    // revoke the OLDEST area's grant through the product's own door
    const revoked = await app.request(`/sandbox-scope-grants/${areas.olderGrantId}/revocation`, {
      method: 'POST',
      headers: { cookie: world.cookie },
    });
    expect(revoked.status).toBe(200);
    // the old pick never looked at the grant: it still answers with the revoked area
    expect(await oldUnorderedPick(world)).toBe(areas.olderId);
    const skipped = await createDocument(world.cookie, world.projectId);
    expect(skipped.status).toBe(201);
    expect(((await skipped.json()) as SandboxDocument).sandboxId).toBe(areas.newerId); // not the revoked older one

    // close the newer area's grant too (the product refuses to let the person do
    // it — they would have revoked their own way in — so it is done in the table)
    await db
      .update(s.sandboxScopeGrants)
      .set({ removedAt: new Date() })
      .where(eq(s.sandboxScopeGrants.id, areas.newerGrantId));
    const fresh = await createDocument(world.cookie, world.projectId);
    expect(fresh.status).toBe(201);
    const freshId = ((await fresh.json()) as SandboxDocument).sandboxId as string;
    expect([areas.olderId, areas.newerId]).not.toContain(freshId);
    // the made area holds the organisation's live grant, and is the default from now on
    const [grant] = await db
      .select()
      .from(s.sandboxScopeGrants)
      .where(eq(s.sandboxScopeGrants.sandboxId, freshId));
    expect(grant).toMatchObject({ granteeType: 'organisation', organisationId: world.orgId, removedAt: null });
    expect(await ensureDefaultSandbox(db, world.projectId, world.orgId, world.participantId)).toBe(freshId);
  });

  it('another organisation’s area, and a personal or shared area of this one, are never the default', async () => {
    const world = await makeWorld('neighbours');
    const other = await makeWorld('neighbours-other');
    // the OTHER organisation's area, on this project, older than anything of ours
    const [foreign] = await db
      .insert(s.sandboxes)
      .values({
        projectId: world.projectId,
        name: 'foreign area',
        scope: 'single_org',
        owningOrganisationId: other.orgId,
        createdByParticipantId: other.participantId,
        createdAt: new Date(Date.now() - 5 * DAY),
      })
      .returning();
    await db.insert(s.sandboxScopeGrants).values({
      sandboxId: foreign!.id,
      granteeType: 'organisation',
      organisationId: other.orgId,
      grantedByParticipantId: other.participantId,
    });
    // a shared (multi-organisation) area of ours, also older
    const [shared] = await db
      .insert(s.sandboxes)
      .values({
        projectId: world.projectId,
        name: 'shared area',
        scope: 'multi_org',
        owningOrganisationId: world.orgId,
        createdByParticipantId: world.participantId,
        createdAt: new Date(Date.now() - 4 * DAY),
      })
      .returning();
    await db.insert(s.sandboxScopeGrants).values({
      sandboxId: shared!.id,
      granteeType: 'organisation',
      organisationId: world.orgId,
      grantedByParticipantId: world.participantId,
    });
    // the person's PERSONAL workspace, as the product makes it (named_user scope,
    // granted to the one participant, flagged personal) and older than everything
    // else here: the oldest area on the project, and still never the default
    const [personal] = await db
      .insert(s.sandboxes)
      .values({
        projectId: world.projectId,
        name: 'Personal workspace',
        scope: 'named_user',
        owningOrganisationId: world.orgId,
        createdByParticipantId: world.participantId,
        isPersonal: true,
        createdAt: new Date(Date.now() - 6 * DAY),
      })
      .returning();
    await db.insert(s.sandboxScopeGrants).values({
      sandboxId: personal!.id,
      granteeType: 'participant',
      participantId: world.participantId,
      grantedByParticipantId: world.participantId,
    });
    const areas = await twoAreas(world);
    const picked = await ensureDefaultSandbox(db, world.projectId, world.orgId, world.participantId);
    expect(picked).toBe(areas.olderId);
    expect([foreign!.id, shared!.id, personal!.id]).not.toContain(picked);
  });
});
