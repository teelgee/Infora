// T-086 — the library list against the seeded corpus (requires migrate +
// seed, as in CI and the first-day path): one row per live container with its
// current version; the withdrawn container and the superseded version never
// appear — the list shows exactly what grounding admits (contracts §Library).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { GetLibraryResponse, GetVersionResponse } from '@infora/contracts';
import { createDb, loadDbEnv, schema as s } from '@infora/db';
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
