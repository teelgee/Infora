// T-463 — the transparency table and the switch, against the seeded project:
// the owner's super user turns the checker off with a reason; the tile leaves
// Tools, the endpoint refuses in words, the audit names who and why; another
// organisation's super user cannot throw it; the table exports as a document.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { AiTransparencyResponse, ListToolsResponse } from '@infora/contracts';
import { createDb, schema as s } from '@infora/db';
import { createWorkerRegistry } from '@infora/capabilities';
import { loadWorkflows } from '@infora/workflows';
import { Router, SELF_HOSTED_UK, TIER_POLICIES, securityForTier } from '@infora/model';
import type { ChatAdapter, EmbeddingAdapter, RouteAttributes } from '@infora/model';
import { buildApp } from './app';
import { docxToText } from './extract';
import { FAKE_EMBED_DIMENSIONS, FAKE_EMBED_MODEL, fakeRouter, fakeVector } from './test-router';

const { db, pool } = createDb();
const app = buildApp({
  db,
  sessionSecret: 'test-secret',
  router: fakeRouter(),
  workflows: loadWorkflows({ workers: createWorkerRegistry(), production: true }),
  workers: createWorkerRegistry(),
});
let rachel: string; // the owner organisation's super user
let eleanor: string; // Calder & Hale's super user — not the owner
let nadia: string;
let projectId: string;

async function login(email: string): Promise<string> {
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'wrenfield-dev' }),
  });
  if (res.status !== 204) throw new Error(`seeded login failed for ${email} — run the seed`);
  return res.headers.get('set-cookie')!.split(';')[0]!;
}
const put = (cookie: string, path: string, body: unknown) =>
  app.request(path, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const table = async (cookie: string) =>
  (await (await app.request(`/projects/${projectId}/ai-transparency`, { headers: { cookie } })).json()) as AiTransparencyResponse;

beforeAll(async () => {
  rachel = await login('rachel.bowen@trentmoor.example');
  eleanor = await login('eleanor.price@calderhale.example');
  nadia = await login('nadia.okonjo@redgate.example');
  const [project] = await db.select().from(s.projects).where(eq(s.projects.name, 'Wrenfield–Ashcombe 400kV Connection')).limit(1);
  projectId = project!.id;
});

afterAll(async () => {
  // the record is append-only, so the switch goes back on with a row of its own
  await put(rachel, `/projects/${projectId}/ai-features/qa_checker`, { enabled: true, reason: 'test teardown — restored' });
  await pool.end();
});

describe('the AI transparency table and the feature switch (T-463)', () => {
  it('states every feature and the deployment posture; only the owner super user may configure', async () => {
    const mine = await table(rachel);
    expect(mine.mayConfigure).toBe(true);
    expect(mine.tier.tier).toBe('standard');
    expect(mine.features.map((f) => f.key)).toContain('qa_checker');
    expect(mine.features.every((f) => f.trains === 'never')).toBe(true);
    const theirs = await table(eleanor);
    expect(theirs.mayConfigure).toBe(false);
    // the workspace's table: the same facts, no project and no switch
    const ws = (await (await app.request('/ai-transparency', { headers: { cookie: eleanor } })).json()) as AiTransparencyResponse;
    expect(ws.mayConfigure).toBe(false);
    expect(ws.features.length).toBe(mine.features.length);
  });

  it('switching the checker off removes it from Tools, refuses its endpoint in words, and the audit names who and why', async () => {
    const before = (await (await app.request(`/projects/${projectId}/tools`, { headers: { cookie: eleanor } })).json()) as ListToolsResponse;
    expect(before.items.some((t) => t.label === 'QA checker')).toBe(true);

    const refused = await put(eleanor, `/projects/${projectId}/ai-features/qa_checker`, { enabled: false, reason: 'not mine to throw' });
    expect(refused.status).toBe(403);
    const noReason = await put(rachel, `/projects/${projectId}/ai-features/qa_checker`, { enabled: false, reason: '' });
    expect(noReason.status).toBe(400);
    const bogus = await put(rachel, `/projects/${projectId}/ai-features/time_machine`, { enabled: false, reason: 'x' });
    expect(bogus.status).toBe(404);

    const thrown = await put(rachel, `/projects/${projectId}/ai-features/qa_checker`, { enabled: false, reason: 'Client has not yet agreed automated checking on its documents' });
    expect(thrown.status).toBe(200);
    const after = (await thrown.json()) as AiTransparencyResponse;
    const checker = after.features.find((f) => f.key === 'qa_checker')!;
    expect(checker.enabled).toBe(false);
    expect(checker.lastChange?.name).toBe('Rachel Bowen');
    expect(checker.lastChange?.reason).toMatch(/Client has not yet agreed/);
    expect(after.history[0]).toMatchObject({ key: 'qa_checker', enabled: false, name: 'Rachel Bowen' });

    const tools = (await (await app.request(`/projects/${projectId}/tools`, { headers: { cookie: eleanor } })).json()) as ListToolsResponse;
    expect(tools.items.some((t) => t.label === 'QA checker')).toBe(false);
    const plan = await app.request(`/projects/${projectId}/tools/qa-check/plan`, {
      method: 'POST',
      headers: { cookie: eleanor, 'content-type': 'application/json' },
      body: JSON.stringify({ documentId: '00000000-0000-0000-0000-000000000000' }),
    });
    expect(plan.status).toBe(403);
    expect(((await plan.json()) as { detail: string }).detail).toBe('ai_feature_off');
    // everyone on the project reads the history — Org C included
    const seen = await table(nadia);
    expect(seen.history.some((h) => h.key === 'qa_checker' && h.name === 'Rachel Bowen')).toBe(true);
  });

  it('exports the table as a document', async () => {
    const res = await app.request(`/projects/${projectId}/ai-transparency/export`, { headers: { cookie: rachel } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('how-the-ai-works-here.docx');
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  });
});

// T-487 (walk defect 1) — the page used to describe what the tier ALLOWS (UK,
// zero retention) whether or not any model route was declared to meet it, so on
// a fresh setup it described calls that were all being refused. The read now
// says whether a route qualifies, and why not.
describe('whether any model route qualifies (T-487)', () => {
  const embeddings: EmbeddingAdapter = {
    modelId: FAKE_EMBED_MODEL,
    dimensions: FAKE_EMBED_DIMENSIONS,
    attributes: SELF_HOSTED_UK,
    embed: (texts) =>
      Promise.resolve({
        embeddings: texts.map(fakeVector),
        model: { id: FAKE_EMBED_MODEL, version: 'fake-1' },
        usage: { tokens: 0 },
      }),
  };
  const chatWith = (attributes?: RouteAttributes): ChatAdapter => ({
    modelId: 'route-under-test',
    ...(attributes !== undefined && { attributes }),
    chat: () => Promise.reject(new Error('never called')),
  });
  const appOver = (router: Router) =>
    buildApp({
      db,
      sessionSecret: 'test-secret',
      router,
      workflows: loadWorkflows({ workers: createWorkerRegistry(), production: true }),
      workers: createWorkerRegistry(),
    });
  const readWorkspace = async (over: ReturnType<typeof appOver>) =>
    (await (await over.request('/ai-transparency', { headers: { cookie: eleanor } })).json()) as AiTransparencyResponse;
  const readProject = async (over: ReturnType<typeof appOver>) =>
    (await (await over.request(`/projects/${projectId}/ai-transparency`, { headers: { cookie: eleanor } })).json()) as AiTransparencyResponse;

  it('a scripted stand-in model attributed to a UK self-hosted route: one qualifies, nothing to explain', async () => {
    const ws = await readWorkspace(app);
    expect(ws.routes).toEqual({ anyQualifies: true, problems: [] });
    expect((await table(rachel)).routes).toEqual({ anyQualifies: true, problems: [] });
  });

  it('a router whose only route declares nothing: none qualifies, and it says which settings are unset', async () => {
    const undeclared = appOver(new Router(chatWith(), embeddings));
    for (const read of [readWorkspace, readProject]) {
      const body = await read(undeclared);
      expect(body.routes.anyQualifies).toBe(false);
      expect(body.routes.problems).toEqual([
        'MODEL_REGION is not set',
        'MODEL_RETENTION is not set',
        'MODEL_JURISDICTION is not set',
        'MODEL_ELIGIBILITY is not set',
      ]);
      // the page still shows what the tier ALLOWS — the warning is what makes it honest
      expect(body.tier.tier).toBe('standard');
    }
  });

  it('a route declared in the US with transient retention under the standard tier: none qualifies, and the reasons name the region and the retention', async () => {
    const usRoute: RouteAttributes = {
      region: 'us',
      retention: 'transient',
      jurisdiction: 'foreign-reachable',
      eligibility: 'enterprise-zdr',
    };
    const body = await readWorkspace(appOver(new Router(chatWith(usRoute), embeddings)));
    expect(body.routes.anyQualifies).toBe(false);
    expect(body.routes.problems).toEqual([
      'region us is not allowed under the standard tier (it allows uk)',
      'retention transient is not allowed under the standard tier (it allows zero)',
    ]);
  });

  it('the same route is accepted under a tier that allows it — the reasons are about the tier, not the route', async () => {
    const ukZdr: RouteAttributes = {
      region: 'uk',
      retention: 'zero',
      jurisdiction: 'foreign-reachable',
      eligibility: 'enterprise-zdr',
    };
    expect(TIER_POLICIES.standard.jurisdiction).toContain('foreign-reachable');
    expect((await readWorkspace(appOver(new Router(chatWith(ukZdr), embeddings)))).routes.anyQualifies).toBe(true);
    const sovereign = await readWorkspace(appOver(new Router(chatWith(ukZdr), embeddings, securityForTier('sovereign'))));
    expect(sovereign.routes.anyQualifies).toBe(false);
    expect(sovereign.routes.problems.join(' ')).toContain('sovereign');
  });

  it('never carries an endpoint, a host or a key — only the names of settings and the values declared', async () => {
    const adapter: ChatAdapter = { ...chatWith(), endpoint: 'https://secret-host.example/v1' };
    const body = await readWorkspace(appOver(new Router(adapter, embeddings)));
    expect(JSON.stringify(body.routes)).not.toContain('secret-host');
  });

  it('the export of the page says so too, instead of describing calls that are all being refused', async () => {
    const res = await appOver(new Router(chatWith(), embeddings)).request(`/projects/${projectId}/ai-transparency/export`, {
      headers: { cookie: rachel },
    });
    expect(res.status).toBe(200);
    const text = docxToText(Buffer.from(await res.arrayBuffer()))!;
    expect(text).toContain('Not working on this setup: no model route meets the standard security tier');
    expect(text).toContain('MODEL_REGION is not set');
    // and a setup where a route qualifies prints no such line
    const fine = await app.request(`/projects/${projectId}/ai-transparency/export`, { headers: { cookie: rachel } });
    expect(docxToText(Buffer.from(await fine.arrayBuffer()))!).not.toContain('Not working on this setup');
  });
});
