// T-334 acceptance — the Tools section, assembled rather than filtered.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, hashPassword, schema as s } from '@infora/db';
import type { ListToolsResponse } from '@infora/contracts';
import { createWorkerRegistry } from '@infora/capabilities';
import { loadWorkflows } from '@infora/workflows';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const workflows = loadWorkflows({ workers: createWorkerRegistry(), production: true });
const full = buildApp({
  db,
  sessionSecret: 'test-secret',
  router: fakeRouter(),
  workflows,
  workers: createWorkerRegistry(),
});
/** a deployment that built no `document_builder` — the tool must be ABSENT */
const withoutBuilder = buildApp({
  db,
  sessionSecret: 'test-secret',
  router: fakeRouter(),
  workflows,
  workers: createWorkerRegistry([]),
});

const stamp = Date.now();
const password = 'pw-t334';
let projectId: string;
let cookie: string;
let strangerCookie: string;

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: `t334 org ${stamp}` }).returning();
  const [outside] = await db.insert(s.organisations).values({ name: `t334 out ${stamp}` }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t334 project ${stamp}`, ownerOrganisationId: org!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId: org!.id, projectId, role: 'owner' });

  const make = async (name: string, organisationId: string, onProject: string | null) => {
    const email = `${name}-${stamp}@test.local`;
    const [user] = await db.insert(s.users).values({ name, email, organisationId }).returning();
    await db
      .insert(s.userCredentials)
      .values({ userId: user!.id, passwordHash: hashPassword(password) });
    if (onProject !== null) {
      await db.insert(s.participants).values({ userId: user!.id, projectId: onProject });
    }
    const res = await full.request('/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return res.headers.get('set-cookie')!.split(';')[0]!;
  };
  cookie = await make('t334-ada', org!.id, projectId);
  strangerCookie = await make('t334-sam', outside!.id, null);
});

afterAll(async () => {
  await pool.end();
});

const tools = async (app: typeof full, who: string) =>
  (await (
    await app.request(`/projects/${projectId}/tools`, { headers: { cookie: who } })
  ).json()) as ListToolsResponse;

describe('the Tools section (T-334)', () => {
  it('carries the document creator, live, with somewhere to go', async () => {
    const { items } = await tools(full, cookie);
    const creator = items.find((tool) => tool.id === 'document-creation')!;
    expect(creator.state).toBe('available');
    expect(creator.href).toBe(`/projects/${projectId}/tools/document-creation`);
  });

  it('says out loud that the checker is not built, and what it waits on', async () => {
    // a Tools section with one tile and no explanation reads as a product with
    // one tool; the note names the ticket so the copy cannot go stale silently
    const { items } = await tools(full, cookie);
    const checker = items.find((tool) => tool.id === 'qa-checker')!;
    expect(checker.state).toBe('unbuilt');
    expect(checker.waitsOn).toContain('T-336');
    expect(checker.href).toBeUndefined();
  });

  it('OFFERS NO EXTRACTOR AT ALL — its tool is Q-049 and unspecified', async () => {
    // a tile promising a screen nobody has designed is worse than no tile
    const { items } = await tools(full, cookie);
    expect(items.map((tool) => tool.id)).not.toContain('extractor');
  });

  it('ASSEMBLED, NOT FILTERED: an unentitled tool is absent, never disabled', async () => {
    const { items } = await tools(withoutBuilder, cookie);
    expect(items.map((tool) => tool.id)).not.toContain('document-creation');
    // and nothing in the payload says it exists but is off
    expect(JSON.stringify(items)).not.toContain('document-creation');
  });

  it('somebody not on the project reads nothing at all', async () => {
    const res = await full.request(`/projects/${projectId}/tools`, {
      headers: { cookie: strangerCookie },
    });
    expect(res.status).toBe(404);
  });
});
