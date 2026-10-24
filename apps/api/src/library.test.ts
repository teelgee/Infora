// T-086 — the library list against the seeded corpus (requires migrate +
// seed, as in CI and the first-day path): one row per live container with its
// current version; the withdrawn container and the superseded version never
// appear — the list shows exactly what grounding admits (contracts §Library).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { GetLibraryResponse, GetPassageResponse, GetVersionResponse } from '@infora/contracts';
import { createDb, hashPassword, loadDbEnv, schema as s, withProjectScope } from '@infora/db';
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

  it('a one- or two-letter search answers (review of T-471): no embedding is made for it, and the sort must not order by the null that leaves', async () => {
    // the palette and the scope control search on the first keystroke; the
    // e2e server's log showed every such search failing with Postgres's
    // "non-integer constant in ORDER BY" until the distance arm was dropped
    // from the sort when there is no vector
    const res = await app.request(`/projects/${projectId}/library/search?q=ge`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const { items } = (await res.json()) as { items: Array<{ documentReference: string }> };
    expect(items.some((item) => item.documentReference === 'WA-GEO-GIR-004')).toBe(true);
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

// T-468 — the passage a citation recorded, read by id. A project of this test's
// own making, so the outsider is a real user of another project (the seeded
// Wrenfield consultant) rather than a missing session.
describe('T-468 — GET /versions/:versionId/passages/:chunkId', () => {
  const stamp = Date.now();
  // page one, a form feed, page two — the cited sentence sits on page two
  const CONTENT = 'Intro paragraph.\fThe scheme delivers a 12% reduction in peak flow.\nTail.';
  const CITED = 'The scheme delivers a 12% reduction in peak flow.';
  let ownCookie: string;
  let ownProjectId: string;
  let versionId: string;
  let chunkId: string;
  let otherVersionChunkId: string;

  beforeAll(async () => {
    const [org] = await db.insert(s.organisations).values({ name: `t468 org ${stamp}` }).returning();
    const [project] = await db
      .insert(s.projects)
      .values({ name: `t468 project ${stamp}`, ownerOrganisationId: org!.id })
      .returning();
    ownProjectId = project!.id;
    await db.insert(s.memberships).values({ organisationId: org!.id, projectId: project!.id, role: 'owner' });
    const [user] = await db
      .insert(s.users)
      .values({ name: 't468 user', email: `t468-${stamp}@test.local`, organisationId: org!.id })
      .returning();
    await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword('pw-t468') });
    await db.insert(s.participants).values({ userId: user!.id, projectId: project!.id });

    const admit = async (reference: string, content: string) => {
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
      const [version] = await db
        .insert(s.versions)
        .values({ containerId: container!.id, versionReference: 'C01', content, isCurrent: true })
        .returning();
      return version!.id;
    };
    versionId = await admit(`T468-${stamp}`, CONTENT);
    const otherVersionId = await admit(`T468B-${stamp}`, 'Another document entirely.');
    const embedding = Array.from({ length: 1024 }, () => 0.01);
    const start = CONTENT.indexOf(CITED);
    // version_chunks is row-level secured: write inside the project's scope
    const [[chunk], [other]] = await withProjectScope(db, ownProjectId, async (tx) => [
      await tx
      .insert(s.versionChunks)
      .values({
        versionId,
        chunkIndex: 0,
        // the chunker rewrites whitespace; the card must show the source's own text
        content: CITED.replace('12% reduction', '12%   reduction'),
        embedding,
        embeddingModelId: 'test-t468',
        embeddingModelVersion: 't1',
        startOffset: start,
        endOffset: start + CITED.length,
      })
      .returning(),
      await tx
      .insert(s.versionChunks)
      .values({
        versionId: otherVersionId,
        chunkIndex: 0,
        content: 'Another document entirely.',
        embedding,
        embeddingModelId: 'test-t468',
        embeddingModelVersion: 't1',
        startOffset: 0,
        endOffset: 5,
      })
      .returning(),
    ]);
    chunkId = chunk!.id;
    otherVersionChunkId = other!.id;

    const login = await app.request('/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `t468-${stamp}@test.local`, password: 'pw-t468' }),
    });
    ownCookie = login.headers.get('set-cookie')!.split(';')[0]!;
  });

  afterAll(async () => {
    await withProjectScope(db, ownProjectId, (tx) =>
      tx.delete(s.versionChunks).where(eq(s.versionChunks.embeddingModelId, 'test-t468')),
    );
  });

  it('returns the recorded passage verbatim, with its page and the document facts', async () => {
    const res = await app.request(`/versions/${versionId}/passages/${chunkId}`, { headers: { cookie: ownCookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as GetPassageResponse;
    expect(body).toMatchObject({
      versionId,
      chunkId,
      documentReference: `T468-${stamp}`,
      versionReference: 'C01',
      containerState: 'live',
      isCurrent: true,
      held: true,
    });
    // the source text as it really reads, never the chunker's rewritten content
    expect(body.passage).toMatchObject({ chunkIndex: 0, page: 2, verbatim: CITED });
    expect(body.passage!.span).toEqual({ start: CONTENT.indexOf(CITED), end: CONTENT.indexOf(CITED) + CITED.length });
  });

  it('a chunk that has gone (re-ingested since the run) is held:false with no passage — not a neighbour', async () => {
    const res = await app.request(`/versions/${versionId}/passages/00000000-0000-4000-8000-000000000000`, {
      headers: { cookie: ownCookie },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ passage: null, held: false });
  });

  it('a chunk id belonging to a different version is a 404 — the chunk must be the named version’s', async () => {
    const res = await app.request(`/versions/${versionId}/passages/${otherVersionChunkId}`, {
      headers: { cookie: ownCookie },
    });
    expect(res.status).toBe(404);
  });

  it('a requester outside the version’s project gets 404, the same as for the version itself', async () => {
    const res = await app.request(`/versions/${versionId}/passages/${chunkId}`, { headers: { cookie } });
    expect(res.status).toBe(404);
  });
});
