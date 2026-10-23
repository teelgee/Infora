// T-459 — the register's search and paging, against the seeded corpus (and a
// ten-thousand-row synthetic project for the envelope's latency line):
// reference and title match first, a passage of the content matches through
// the same index the agent grounds on, paging carries a total, the wall holds,
// and a paged read of ten thousand rows stays interactive.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { GetLibrarySearchResponse, GetPlanResponse } from '@infora/contracts';
import { createDb, loadDbEnv, schema as s, withProjectScope } from '@infora/db';
import { buildApp } from './app';
import { FAKE_EMBED_MODEL, fakeRouter, fakeVector } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';
let owner: string;
let consultant: string;
let orgC: string;
let projectId: string;
let alphaContainerId: string;
let alphaChunkId: string | null = null;

async function login(email: string): Promise<string> {
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'wrenfield-dev' }),
  });
  if (res.status !== 204) {
    throw new Error(`seeded login failed — run \`pnpm --filter @infora/db run seed\` against ${loadDbEnv().DATABASE_URL}`);
  }
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

const search = async (cookie: string, query: string): Promise<GetLibrarySearchResponse> => {
  const res = await app.request(`/projects/${projectId}/library/search?${query}`, { headers: { cookie } });
  expect(res.status).toBe(200);
  return (await res.json()) as GetLibrarySearchResponse;
};

beforeAll(async () => {
  owner = await login('rachel.bowen@trentmoor.example');
  consultant = await login('eleanor.price@calderhale.example');
  orgC = await login('nadia.okonjo@redgate.example');
  const [project] = await db.select().from(s.projects).where(eq(s.projects.name, PROJECT)).limit(1);
  projectId = project!.id;

  // a passage only the vector arm can find: "alpha" maps to the fake router's
  // first basis vector, everything else to the second
  const [gir] = await db
    .select({ id: s.containers.id })
    .from(s.containers)
    .where(and(eq(s.containers.projectId, projectId), eq(s.containers.documentReference, 'WA-GEO-GIR-004')))
    .limit(1);
  alphaContainerId = gir!.id;
  const [current] = await db
    .select({ id: s.versions.id })
    .from(s.versions)
    .where(and(eq(s.versions.containerId, alphaContainerId), eq(s.versions.isCurrent, true)))
    .limit(1);
  const content = 'alpha — made ground thickness per parcel (T-459 search probe)';
  // the chunk index is under row-level security and the policy fails closed
  // (T-247): the write declares its project scope as retrieval's own does
  const [chunk] = await withProjectScope(db, projectId, (tx) =>
    tx
      .insert(s.versionChunks)
      .values({
        versionId: current!.id,
        chunkIndex: 9459,
        content,
        embedding: fakeVector(content),
        embeddingModelId: FAKE_EMBED_MODEL,
        embeddingModelVersion: 'fake-1',
      })
      .returning({ id: s.versionChunks.id }),
  );
  alphaChunkId = chunk!.id;
});

afterAll(async () => {
  if (alphaChunkId) await withProjectScope(db, projectId, (tx) => tx.delete(s.versionChunks).where(eq(s.versionChunks.id, alphaChunkId!)));
  await pool.end();
});

describe('library search', () => {
  it('finds a document by its code prefix, first', async () => {
    const r = await search(owner, 'q=WA-GEO');
    expect(r.q).toBe('WA-GEO');
    expect(r.total).toBeGreaterThan(0);
    expect(r.items[0]!.documentReference.startsWith('WA-GEO')).toBe(true);
    expect(r.items[0]!.match).toBe('reference');
    for (const item of r.items) expect(item.state).toBe('live');
  });

  it('finds a deliverable by a word of its title', async () => {
    // whichever titled deliverable the seed has in the owner's library
    const all = await search(owner, 'pageSize=200');
    const titled = all.items.find((i) => i.title !== null && /[A-Za-z]{5,}/.test(i.title));
    expect(titled).toBeDefined();
    const word = titled!.title!.match(/[A-Za-z]{5,}/)![0];
    const r = await search(owner, `q=${encodeURIComponent(word)}`);
    const hit = r.items.find((i) => i.containerId === titled!.containerId);
    expect(hit).toBeDefined();
    expect(['title', 'reference']).toContain(hit!.match);
  });

  it('finds a document by what it says, through the grounding index', async () => {
    const r = await search(owner, 'q=alpha');
    expect(r.items.map((i) => i.containerId)).toContain(alphaContainerId);
    expect(r.items.find((i) => i.containerId === alphaContainerId)!.match).toBe('content');
  });

  it('pages, with a total that does not move between pages', async () => {
    const page1 = await search(owner, 'pageSize=2&page=1&state=any');
    const page2 = await search(owner, 'pageSize=2&page=2&state=any');
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(page2.total);
    expect(page1.total).toBeGreaterThan(2);
    expect(page1.items[0]!.containerId).not.toBe(page2.items[0]?.containerId);
    expect(page1.pageSize).toBe(2);
  });

  it('filters by kind and sorts by issue date', async () => {
    const refs = await search(owner, 'kind=reference');
    for (const item of refs.items) expect(item.kind).toBe('reference');
    const byIssued = await search(owner, 'sort=issued&direction=desc');
    const dates = byIssued.items.map((i) => i.issuedAt);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('the wall holds: Org C never sees Calder & Hale rows, and a bad query is refused', async () => {
    const mine = await search(consultant, 'state=any&pageSize=200');
    const calder = mine.items.filter((i) => i.producerName === 'Calder & Hale').map((i) => i.containerId);
    expect(calder.length).toBeGreaterThan(0);
    const theirs = await search(orgC, 'state=any&pageSize=200');
    for (const id of calder) expect(theirs.items.map((i) => i.containerId)).not.toContain(id);
    const bad = await app.request(`/projects/${projectId}/library/search?pageSize=0`, { headers: { cookie: owner } });
    expect(bad.status).toBe(400);
  });
});

describe('plan read, paged', () => {
  it('answers as before without page, and pages with a total when asked', async () => {
    const whole = (await (await app.request(`/projects/${projectId}/plan`, { headers: { cookie: owner } })).json()) as GetPlanResponse;
    expect(whole.total).toBeUndefined();
    const paged = (await (
      await app.request(`/projects/${projectId}/plan?page=1&pageSize=2`, { headers: { cookie: owner } })
    ).json()) as GetPlanResponse;
    expect(paged.items).toHaveLength(2);
    expect(paged.total).toBe(whole.items.length);
    const searched = (await (
      await app.request(`/projects/${projectId}/plan?q=GIR`, { headers: { cookie: owner } })
    ).json()) as GetPlanResponse;
    expect(searched.items.length).toBeGreaterThan(0);
    // T-462 — the plan's search reads through the register's two arms, so the
    // code match ranks first; under the fake embedding every indexed row is a
    // content match too, so only the ordering is the substrate's to prove
    expect(`${searched.items[0]!.documentReference} ${searched.items[0]!.title ?? ''}`).toMatch(/GIR/i);
  });
});

describe('ten thousand rows stay interactive', () => {
  // the envelope's line: interactive reads p95 < 500 ms with RLS on. A
  // synthetic project of its own so nothing seeded changes shape under the
  // other suites; removed afterwards.
  let syntheticProjectId: string;
  let containerIds: string[] = [];
  const N = 10_000;

  beforeAll(async () => {
    const [trentmoor] = await db.select({ id: s.organisations.id }).from(s.organisations).where(eq(s.organisations.name, 'Trentmoor Energy')).limit(1);
    const [rachel] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, 'rachel.bowen@trentmoor.example')).limit(1);
    const [project] = await db
      .insert(s.projects)
      .values({ name: `T-459 synthetic ${Date.now()}`, ownerOrganisationId: trentmoor!.id })
      .returning({ id: s.projects.id });
    syntheticProjectId = project!.id;
    await db.insert(s.memberships).values({ projectId: syntheticProjectId, organisationId: trentmoor!.id, role: 'owner' });
    await db.insert(s.participants).values({ projectId: syntheticProjectId, userId: rachel!.id, elevated: true });
    for (let start = 0; start < N; start += 1000) {
      const batch = Array.from({ length: 1000 }, (_, i) => ({
        projectId: syntheticProjectId,
        producingOrganisationId: trentmoor!.id,
        documentReference: `SYN-${String(start + i).padStart(6, '0')}`,
        inLibrary: true,
        description: `synthetic row ${start + i}`,
      }));
      const inserted = await db.insert(s.containers).values(batch).returning({ id: s.containers.id });
      containerIds = containerIds.concat(inserted.map((r) => r.id));
      await db.insert(s.versions).values(
        inserted.map((r, i) => ({ containerId: r.id, versionReference: 'R01', content: `synthetic ${start + i}`, isCurrent: true })),
      );
    }
  }, 120_000);

  afterAll(async () => {
    if (containerIds.length === 0) return;
    // versions are append-only; the one carve-out is the purge switch (0049),
    // which is what erasing a synthetic project honestly is
    for (let i = 0; i < containerIds.length; i += 1000) {
      const slice = containerIds.slice(i, i + 1000);
      await withProjectScope(db, syntheticProjectId, async (tx) => {
        await tx.execute(sql`select set_config('infora.purge', 'on', true)`);
        await tx.delete(s.versions).where(inArray(s.versions.containerId, slice));
        await tx.delete(s.containers).where(inArray(s.containers.id, slice));
      });
    }
    await db.delete(s.participants).where(eq(s.participants.projectId, syntheticProjectId));
    await db.delete(s.memberships).where(eq(s.memberships.projectId, syntheticProjectId));
    await db.delete(s.projects).where(eq(s.projects.id, syntheticProjectId));
  }, 120_000);

  it('a paged search and a paged plan read answer under the envelope line', async () => {
    const timed = async (path: string) => {
      const t0 = performance.now();
      const res = await app.request(path, { headers: { cookie: owner } });
      const ms = performance.now() - t0;
      expect(res.status).toBe(200);
      return { ms, body: (await res.json()) as { total?: number; items: unknown[] } };
    };
    // warm once (connection, plan cache), then measure
    await timed(`/projects/${syntheticProjectId}/library/search?page=1&pageSize=50`);
    const search = await timed(`/projects/${syntheticProjectId}/library/search?page=100&pageSize=50&q=SYN-0042`);
    expect(search.body.total).toBeGreaterThan(0);
    expect(search.ms).toBeLessThan(500);
    const plan = await timed(`/projects/${syntheticProjectId}/plan?page=150&pageSize=50`);
    expect(plan.body.total).toBe(N);
    expect(plan.body.items).toHaveLength(50);
    expect(plan.ms).toBeLessThan(500);
  }, 60_000);
});
