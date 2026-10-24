// T-292 — GET /projects/:projectId/grounding-scope, the read behind the
// composer's Data sources and Context chips.
//
// The whole ticket rests on one property: **the chip cannot show a document
// the answer could not have used, and cannot omit one it could.** That is only
// true if the endpoint runs retrieval's own pre-filter rather than a second
// definition of it, so the cases below are exactly the ways the library list
// and the grounding scope come apart — a document with no chunks under the
// deployment's pinned model, and another organisation's unshared deliverable.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { GetGroundingScopeResponse } from '@infora/contracts';
import { ingestVersion } from '@infora/data';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const router = fakeRouter();
const app = buildApp({ db, sessionSecret: 'test-secret', router });

const stamp = Date.now();
const password = 'pw-t292';
let cookie: string;
let projectId: string;
let indexedReference: string;
let unindexedReference: string;
let otherOrgReference: string;

async function container(reference: string, producingOrganisationId: string, content: string) {
  const [row] = await db
    .insert(s.containers)
    .values({
      projectId,
      producingOrganisationId,
      documentReference: reference,
      inLibrary: true,
      scope: 'library',
      state: 'live',
    })
    .returning();
  const [version] = await db
    .insert(s.versions)
    .values({ containerId: row!.id, versionReference: 'P01', content, isCurrent: true })
    .returning();
  return { containerId: row!.id, versionId: version!.id };
}

beforeAll(async () => {
  // three organisations, and the requester is a MEMBER — not the owner. The
  // owner reads every deliverable in its own library (ADR-0016), so an
  // owner-org requester could never show the wall holding: the negative case
  // below would pass on a broken filter.
  const [owner] = await db.insert(s.organisations).values({ name: `t292 owner ${stamp}` }).returning();
  const [mine] = await db.insert(s.organisations).values({ name: `t292 mine ${stamp}` }).returning();
  const [theirs] = await db.insert(s.organisations).values({ name: `t292 theirs ${stamp}` }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t292 project ${stamp}`, ownerOrganisationId: owner!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: owner!.id, projectId, role: 'owner' },
    { organisationId: mine!.id, projectId, role: 'member' },
    { organisationId: theirs!.id, projectId, role: 'member' },
  ]);
  const [user] = await db
    .insert(s.users)
    .values({ name: 't292 asker', email: `t292-${stamp}@test.local`, organisationId: mine!.id })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  await db.insert(s.participants).values({ userId: user!.id, projectId });

  indexedReference = `T292-IDX-${stamp}`;
  unindexedReference = `T292-RAW-${stamp}`;
  otherOrgReference = `T292-OTH-${stamp}`;

  const indexed = await container(indexedReference, mine!.id, 'The survey recorded three exceedances.');
  await ingestVersion(db, router, indexed.versionId);
  // deliberately NOT ingested: in the library, live, current — and reachable by
  // no grounded answer, because it has no chunks under the pinned model
  await container(unindexedReference, mine!.id, 'A document nobody indexed.');
  // another organisation's, indexed, and shared with nobody
  const other = await container(otherOrgReference, theirs!.id, 'Their working conclusion.');
  await ingestVersion(db, router, other.versionId);

  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `t292-${stamp}@test.local`, password }),
  });
  cookie = res.headers.get('set-cookie')!.split(';')[0]!;
});

afterAll(async () => {
  await pool.end();
});

async function scope(): Promise<GetGroundingScopeResponse> {
  const res = await app.request(`/projects/${projectId}/grounding-scope`, { headers: { cookie } });
  expect(res.status).toBe(200);
  return (await res.json()) as GetGroundingScopeResponse;
}

describe('T-292 — the scope control (T-470; formerly the Data sources chip) reads the grounding scope, not the library', () => {
  it('lists the indexed document and states the assembly budget', async () => {
    const { sources, assemblyTokenBudget } = await scope();
    expect(sources.map((source) => source.documentReference)).toContain(indexedReference);
    expect(assemblyTokenBudget).toBeGreaterThan(0);
  });

  it('omits a library document with no chunks under the pinned model', async () => {
    // it IS on the library list — live, in the library, current — and no
    // grounded answer can reach it. A chip built from the library list would
    // count it, and would be naming a source the answer could not have used.
    const list = await app.request(`/projects/${projectId}/library`, { headers: { cookie } });
    const { items } = (await list.json()) as { items: Array<{ documentReference: string }> };
    expect(items.map((item) => item.documentReference)).toContain(unindexedReference);

    const { sources } = await scope();
    expect(sources.map((source) => source.documentReference)).not.toContain(unindexedReference);
  });

  it('never names another organisation’s unshared deliverable', async () => {
    const { sources } = await scope();
    expect(sources.map((source) => source.documentReference)).not.toContain(otherOrgReference);
  });
});

describe('T-292, T-469 — the scope narrows and cannot widen (T-248)', () => {
  const openConversation = async () =>
    (
      (await (
        await app.request(`/projects/${projectId}/conversations`, {
          method: 'POST',
          headers: { cookie, 'content-type': 'application/json' },
          body: JSON.stringify({ surface: 'web' }),
        })
      ).json()) as { conversationId: string }
    ).conversationId;
  const ask = async (scope: unknown) =>
    app.request(`/conversations/${await openConversation()}/runs`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ request: 'What did the survey record?', scope }),
    });
  const containerOf = async (reference: string) =>
    (
      await db
        .select({ id: s.containers.id })
        .from(s.containers)
        .where(eq(s.containers.documentReference, reference))
        .limit(1)
    )[0]!.id;

  it('a scope naming only an unreachable container leaves nothing to read — refused in words, before any spend', async () => {
    // the guarantee stated as a test: the ids are intersected INTO the
    // grounded pre-filter's own `and()`, so naming a container the requester
    // cannot see narrows the set to nothing instead of opening it. It is not
    // validated (validating would mean answering "does this container exist",
    // which deny-as-404 exists to refuse): it simply admits nothing, and a scope
    // that admits nothing is refused with the same words however it got there.
    const res = await ask({ containerIds: [await containerOf(otherOrgReference)] });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { detail: string }).detail).toContain('Your scope leaves nothing to read');
  });

  it('naming a reachable AND an unreachable container reads the first and counts only the first', async () => {
    const res = await ask({
      containerIds: [await containerOf(indexedReference), await containerOf(otherOrgReference)],
    });
    expect(res.status).toBe(201);
    const run = (await res.json()) as {
      steps: Array<{ type: string; sourceSet: Array<{ versionId?: string }> }>;
      reach?: { visibleLive: number; inScope: number; leftOutByScope: number; read: number };
    };
    const retrieved = run.steps.filter((step) => step.type === 'retrieve').flatMap((s) => s.sourceSet);
    expect(retrieved.length).toBeGreaterThan(0);
    // the other organisation's document is neither read nor counted
    expect(run.reach).toMatchObject({ visibleLive: 1, inScope: 1, leftOutByScope: 0, read: 1 });
  });

  it('an empty scope is a 400 in words — and no scope at all reads the whole visible library', async () => {
    const empty = await ask({ containerIds: [] });
    expect(empty.status).toBe(400);
    expect(((await empty.json()) as { detail: string }).detail).toContain('a scope must name at least one');
    expect((await ask(undefined)).status).toBe(201);
  });
});
