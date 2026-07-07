// T-022 — the wall on the native surface, against the *seeded* subjects
// (requires migrate + seed, as in CI and the first-day path): Marcus Webb
// (member org, no Participant) and Priya Nair (third organisation, no
// Membership) resolve to nothing on every endpoint, while the consultant —
// the positive control — passes the same boundary. Proves there is no code
// path admitting a scope the predicate did not.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { MeResponse } from '@infora/contracts';
import { createDb, loadDbEnv, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const password = 'wrenfield-dev'; // the seed's dev password
let projectId: string;
let workItemId: string;
let consultant: string;
let marcus: string;
let priya: string;

async function session(email: string): Promise<string> {
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 204) {
    throw new Error(
      `seeded login failed for ${email} — run \`pnpm --filter @infora/db run seed\` against ${loadDbEnv().DATABASE_URL}`,
    );
  }
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

beforeAll(async () => {
  const [project] = await db
    .select()
    .from(s.projects)
    .where(eq(s.projects.name, 'Wrenfield–Ashcombe 400kV Connection'))
    .limit(1);
  projectId = project!.id;
  const [workItem] = await db
    .select()
    .from(s.workItems)
    .where(eq(s.workItems.projectId, projectId))
    .limit(1);
  workItemId = workItem!.id;

  [consultant, marcus, priya] = await Promise.all([
    session('eleanor.price@calderhale.example'),
    session('marcus.webb@calderhale.example'),
    session('priya.nair@halvern.example'),
  ]);
});

afterAll(async () => {
  await pool.end();
});

// Every scoped endpoint, addressed with the seeded ids where the seed has the
// resource and ghost uuids where it does not (conversations, runs, sandbox
// documents and suggestions hold no seed rows) — the answer to an unentitled
// requester must be the same 404 either way.
const ghost = '00000000-0000-4000-8000-000000000000';
const routes = (): Array<[string, string]> => [
  ['POST', `/projects/${projectId}/conversations`],
  ['POST', `/conversations/${ghost}/runs`],
  ['GET', `/conversations/${ghost}`],
  ['GET', `/runs/${ghost}`],
  ['GET', `/projects/${projectId}/work-items`],
  ['GET', `/work-items/${workItemId}`],
  ['POST', `/projects/${projectId}/sandbox-documents`],
  ['GET', `/sandbox-documents/${ghost}`],
  ['PATCH', `/sandbox-documents/${ghost}`],
  ['POST', `/suggestions/${ghost}/resolution`],
  ['GET', `/projects/${projectId}/library`],
];

const hit = (cookie: string, method: string, path: string) =>
  app.request(path, { method, headers: { cookie } });

describe('T-022 — the seeded wall subjects resolve to nothing', () => {
  it.each([
    ['the no-Participant member-org user', () => marcus],
    ['the membership-less third-org user', () => priya],
  ])('%s gets 404 on every endpoint', async (_label, cookie) => {
    for (const [method, path] of routes()) {
      const res = await hit(cookie(), method, path);
      expect(`${method} ${path} → ${res.status}`).toBe(`${method} ${path} → 404`);
      expect(await res.json()).toEqual({ error: 'not_found' });
    }
  });

  it('both authenticate, and /me shows an empty entitlement — not a hidden one', async () => {
    for (const cookie of [marcus, priya]) {
      const res = await hit(cookie, 'GET', '/me');
      expect(res.status).toBe(200);
      expect(((await res.json()) as MeResponse).participants).toEqual([]);
    }
  });

  it('the consultant — the positive control — passes the same boundary everywhere', async () => {
    const me = (await (await hit(consultant, 'GET', '/me')).json()) as MeResponse;
    expect(me.participants).toHaveLength(1);
    expect(me.participants[0]!.projectId).toBe(projectId);

    for (const [method, path] of routes()) {
      const res = await hit(consultant, method, path);
      // ghost-addressed resources are 404 for everyone alike; live routes
      // reach their handlers (bodyless POSTs validate to 400); the rest
      // are still 501 placeholders
      const expected = path.includes(ghost)
        ? 404
        : method === 'POST' && path.endsWith('/conversations')
          ? 400
          : path.includes('work-items')
            ? 200
            : 501;
      expect(`${method} ${path} → ${res.status}`).toBe(`${method} ${path} → ${expected}`);
    }
  });
});
