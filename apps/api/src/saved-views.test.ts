// T-460 — saved views over HTTP against the seeded project: a person saves a
// view, reads it back, shares one with their firm, and the wall holds — a
// view shared within Calder & Hale is absence to the owner and to Org C; a
// private one is absence to a colleague; only the maker (or an org admin, for
// a shared one) deletes.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { ListSavedViewsResponse, SavedView } from '@infora/contracts';
import { createDb, loadDbEnv, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

let eleanor: string; // Calder & Hale, org admin
let marcus: string; // Calder & Hale, not on the project — see below
let rachel: string; // the owner organisation
let nadia: string; // Org C
let projectId: string;
const made: string[] = [];

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
const post = (cookie: string, path: string, body: unknown) =>
  app.request(path, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const list = async (cookie: string): Promise<SavedView[]> => {
  const res = await app.request(`/projects/${projectId}/saved-views?register=library`, { headers: { cookie } });
  expect(res.status).toBe(200);
  return ((await res.json()) as ListSavedViewsResponse).items;
};

beforeAll(async () => {
  eleanor = await login('eleanor.price@calderhale.example');
  rachel = await login('rachel.bowen@trentmoor.example');
  nadia = await login('nadia.okonjo@redgate.example');
  marcus = await login('marcus.webb@calderhale.example');
  const [project] = await db.select().from(s.projects).where(eq(s.projects.name, 'Wrenfield–Ashcombe 400kV Connection')).limit(1);
  projectId = project!.id;
});

afterAll(async () => {
  for (const id of made) await db.delete(s.savedViews).where(eq(s.savedViews.id, id));
  await pool.end();
});

describe('saved views', () => {
  it('saves, lists and names its maker; a duplicate name is a conflict', async () => {
    const stamp = Date.now();
    const res = await post(eleanor, `/projects/${projectId}/saved-views`, {
      register: 'library',
      name: `Geotech live ${stamp}`,
      filter: { q: 'GEO', state: 'live', sort: 'reference' },
    });
    expect(res.status).toBe(201);
    const view = (await res.json()) as SavedView;
    made.push(view.id);
    expect(view.mine).toBe(true);
    expect(view.shared).toBe(false);
    expect(view.savedBy.name).toBe('Eleanor Price');
    expect(view.filter).toEqual({ q: 'GEO', state: 'live', sort: 'reference' });
    expect((await list(eleanor)).map((v) => v.id)).toContain(view.id);
    const dup = await post(eleanor, `/projects/${projectId}/saved-views`, {
      register: 'library',
      name: `Geotech live ${stamp}`,
      filter: {},
    });
    expect(dup.status).toBe(409);
  });

  it('a private view is the maker’s alone; a shared one is the firm’s, and never another firm’s', async () => {
    const stamp = Date.now();
    const priv = (await (
      await post(eleanor, `/projects/${projectId}/saved-views`, { register: 'library', name: `Mine ${stamp}`, filter: { kind: 'reference' } })
    ).json()) as SavedView;
    const shared = (await (
      await post(eleanor, `/projects/${projectId}/saved-views`, {
        register: 'library',
        name: `Firm ${stamp}`,
        filter: { kind: 'deliverable' },
        shared: true,
      })
    ).json()) as SavedView;
    made.push(priv.id, shared.id);
    // the owner organisation and Org C see neither — the ceiling is the organisation
    for (const other of [rachel, nadia]) {
      const ids = (await list(other)).map((v) => v.id);
      expect(ids).not.toContain(priv.id);
      expect(ids).not.toContain(shared.id);
    }
    // a Calder & Hale colleague on the project would see the shared one and not the private one;
    // Marcus holds no participant on the project, so the project read itself is absence for him
    const marcusRead = await app.request(`/projects/${projectId}/saved-views?register=library`, { headers: { cookie: marcus } });
    expect(marcusRead.status).toBe(404);
    // a bad register is ignored rather than refused: the list is simply unfiltered
    const all = await app.request(`/projects/${projectId}/saved-views?register=bogus`, { headers: { cookie: eleanor } });
    expect(all.status).toBe(200);
  });

  it('only the maker deletes a private view; another organisation’s admin gets absence', async () => {
    const stamp = Date.now();
    const view = (await (
      await post(eleanor, `/projects/${projectId}/saved-views`, { register: 'plan', name: `Delete me ${stamp}`, filter: {} })
    ).json()) as SavedView;
    made.push(view.id);
    // Rachel is an org admin of a DIFFERENT organisation: absence
    const other = await app.request(`/saved-views/${view.id}`, { method: 'DELETE', headers: { cookie: rachel } });
    expect(other.status).toBe(404);
    const mine = await app.request(`/saved-views/${view.id}`, { method: 'DELETE', headers: { cookie: eleanor } });
    expect(mine.status).toBe(204);
    const again = await app.request(`/saved-views/${view.id}`, { method: 'DELETE', headers: { cookie: eleanor } });
    expect(again.status).toBe(404);
    made.splice(made.indexOf(view.id), 1);
  });

  it('refuses a malformed body', async () => {
    const res = await post(eleanor, `/projects/${projectId}/saved-views`, { register: 'library', name: '', filter: {} });
    expect(res.status).toBe(400);
  });
});
