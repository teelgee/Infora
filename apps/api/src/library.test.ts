// T-086 — the library list against the seeded corpus (requires migrate +
// seed, as in CI and the first-day path): one row per live container with its
// current version; the withdrawn container and the superseded version never
// appear — the list shows exactly what grounding admits (contracts §Library).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { GetLibraryResponse, GetVersionResponse } from '@infora/contracts';
import { createDb, hashPassword, loadDbEnv, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

let cookie: string;
let projectId: string;
let girContainerId: string;
let girCurrentVersionId: string;
let girSupersededVersionId: string;
let withdrawnContainerId: string;

beforeAll(async () => {
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'eleanor.price@calderhale.example', password: 'wrenfield-dev' }),
  });
  if (res.status !== 204) {
    throw new Error(
      `seeded login failed — run \`pnpm --filter @infora/db run seed\` against ${loadDbEnv().DATABASE_URL}`,
    );
  }
  cookie = res.headers.get('set-cookie')!.split(';')[0]!;

  const [project] = await db
    .select()
    .from(s.projects)
    .where(eq(s.projects.name, 'Wrenfield–Ashcombe 400kV Connection'))
    .limit(1);
  projectId = project!.id;

  // the two-version container: v2 current, v1 superseded (T-033's subject)
  const [gir] = await db
    .select()
    .from(s.containers)
    .where(
      and(eq(s.containers.projectId, projectId), eq(s.containers.documentReference, 'WA-GEO-GIR-004')),
    )
    .limit(1);
  girContainerId = gir!.id;
  const versions = await db.select().from(s.versions).where(eq(s.versions.containerId, girContainerId));
  girCurrentVersionId = versions.find((v) => v.isCurrent)!.id;
  girSupersededVersionId = versions.find((v) => !v.isCurrent)!.id;

  const [withdrawn] = await db
    .select()
    .from(s.containers)
    .where(and(eq(s.containers.projectId, projectId), eq(s.containers.state, 'withdrawn')))
    .limit(1);
  withdrawnContainerId = withdrawn!.id;
});

afterAll(async () => {
  await pool.end();
});

describe('T-086 — GET /projects/:projectId/library', () => {
  it('lists one row per live container, ordered by reference, current version only', async () => {
    const res = await app.request(`/projects/${projectId}/library`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const { items } = (await res.json()) as GetLibraryResponse;

    const references = items.map((item) => item.documentReference);
    expect(references).toEqual([...references].sort());
    expect(new Set(items.map((item) => item.containerId)).size).toBe(items.length);
    for (const item of items) expect(item.state).toBe('live');

    const gir = items.find((item) => item.containerId === girContainerId);
    expect(gir).toMatchObject({
      documentReference: 'WA-GEO-GIR-004',
      currentVersionId: girCurrentVersionId,
    });
  });

  it('omits the withdrawn container and the superseded version — the list shows what grounds', async () => {
    const res = await app.request(`/projects/${projectId}/library`, { headers: { cookie } });
    const { items } = (await res.json()) as GetLibraryResponse;
    expect(items.some((item) => item.containerId === withdrawnContainerId)).toBe(false);
    expect(items.some((item) => item.currentVersionId === girSupersededVersionId)).toBe(false);
  });

  // T-304 — the seeded library is itself the case, and worth pinning where a
  // reader will see it: the seed's own comment calls it *"owner-added
  // reference material (ADR-0011)"*, and until this ticket the Documents view
  // listed all of it under "Live deliverables" beside things a firm produced.
  it('marks the seeded library as the received material it says it is', async () => {
    const res = await app.request(`/projects/${projectId}/library`, { headers: { cookie } });
    const { items } = (await res.json()) as GetLibraryResponse;
    // named rows rather than "every row": other suites promote real
    // deliverables into this project, so an every-row assertion would be
    // pinning the order the test files happened to run in
    for (const reference of ['WA-GEO-GIR-004', 'WA-ENV-BAS-003', 'WA-WAT-FRA-001']) {
      expect(items.find((item) => item.documentReference === reference)?.kind).toBe('reference');
    }
  });
});

// T-094 — the cited source, readable: the version read behind the same wall
describe('T-094 — GET /versions/:versionId', () => {
  it('reads the current version with its state facts', async () => {
    const res = await app.request(`/versions/${girCurrentVersionId}`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as GetVersionResponse;
    expect(body).toMatchObject({
      versionId: girCurrentVersionId,
      documentReference: 'WA-GEO-GIR-004',
      versionReference: 'v2',
      containerState: 'live',
      isCurrent: true,
    });
    expect(body.content.length).toBeGreaterThan(0);
  });

  it('a superseded version stays readable — the immutable record must resolve', async () => {
    const res = await app.request(`/versions/${girSupersededVersionId}`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as GetVersionResponse;
    expect(body.isCurrent).toBe(false);
    expect(body.versionReference).toBe('v1');
  });
});

// T-304 — the marker, on a project of this test's own making so both kinds
// exist side by side. The distinguishing fact is an ABSENCE (the 2026-07-31
// ruling), so what is actually under test is that the absence is read out and
// nothing is stored: one container with a work item, one without, identical in
// every other respect including the wall.
describe('T-304 — reference material is told from the produced record', () => {
  let ownItems: GetLibraryResponse['items'];
  let referenceId: string;
  let deliverableId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const [org] = await db.insert(s.organisations).values({ name: `t304 org ${stamp}` }).returning();
    const [project] = await db
      .insert(s.projects)
      .values({ name: `t304 project ${stamp}`, ownerOrganisationId: org!.id })
      .returning();
    await db
      .insert(s.memberships)
      .values({ organisationId: org!.id, projectId: project!.id, role: 'owner' });
    const [user] = await db
      .insert(s.users)
      .values({ name: 't304 user', email: `t304-${stamp}@test.local`, organisationId: org!.id })
      .returning();
    await db
      .insert(s.userCredentials)
      .values({ userId: user!.id, passwordHash: hashPassword('pw-t304') });
    await db.insert(s.participants).values({ userId: user!.id, projectId: project!.id });

    const admit = async (reference: string, title: string | null) => {
      const [container] = await db
        .insert(s.containers)
        .values({
          projectId: project!.id,
          producingOrganisationId: org!.id,
          documentReference: reference,
          inLibrary: true,
          state: 'live',
        })
        .returning();
      await db.insert(s.versions).values({
        containerId: container!.id,
        versionReference: title === null ? 'R01' : 'C01',
        content: `${reference} content.`,
        isCurrent: true,
      });
      if (title !== null) {
        await db.insert(s.workItems).values({
          projectId: project!.id,
          type: 'document_production',
          title,
          status: 'in_production',
          containerId: container!.id,
        });
      }
      return container!.id;
    };
    referenceId = await admit(`REF-${stamp}`, null);
    deliverableId = await admit(`DEL-${stamp}`, 'Ground Investigation Report');

    const login = await app.request('/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `t304-${stamp}@test.local`, password: 'pw-t304' }),
    });
    const ownCookie = login.headers.get('set-cookie')!.split(';')[0]!;
    const res = await app.request(`/projects/${project!.id}/library`, {
      headers: { cookie: ownCookie },
    });
    ownItems = ((await res.json()) as GetLibraryResponse).items;
  });

  it('reads the marker off the missing work item, and stores nothing', async () => {
    const received = ownItems.find((item) => item.containerId === referenceId)!;
    const produced = ownItems.find((item) => item.containerId === deliverableId)!;
    expect(received.kind).toBe('reference');
    expect(produced.kind).toBe('deliverable');

    // both are in the library, both live, both current, both behind the same
    // wall branch — the ONLY difference between them is the work item
    const [refRow] = await db.select().from(s.containers).where(eq(s.containers.id, referenceId));
    const [delRow] = await db.select().from(s.containers).where(eq(s.containers.id, deliverableId));
    expect(refRow!.inLibrary).toBe(delRow!.inLibrary);
    expect(refRow!.state).toBe(delRow!.state);
    expect(refRow!.metadata).toEqual(delRow!.metadata); // nothing was written to mark it
  });

  it('leaves reference material grounding exactly as a deliverable does', async () => {
    // the ruling is that received material rides every existing access and
    // state pre-filter unchanged — being marked must not make it a second class
    const received = ownItems.find((item) => item.containerId === referenceId)!;
    expect(received.state).toBe('live');
    expect(received.currentVersionId).toBeTruthy();
  });
});
