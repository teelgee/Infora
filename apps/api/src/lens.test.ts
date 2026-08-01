// T-299 acceptance, end to end against the live dev database.
//
// THE ACCEPTANCE IS THE PAIR, NOT EITHER HALF: the same question under two
// Lenses returns two visibly different answers AND an identical source set.
// Either half alone proves the wrong thing — different answers with different
// sources is a retrieval filter wearing a preference's clothes, and identical
// answers with identical sources is a Lens that did nothing.
//
// This is the API-level twin of eval case PERM-05, and it exists here as well
// because the eval harness cannot yet observe the prompt.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import type { ApiError, ListLensesResponse, Plan, Run } from '@infora/contracts';
import { createDb, hashPassword, schema as s, withProjectScope } from '@infora/db';
import { loadLenses } from '@infora/lenses';
import { readPlanForRun } from '@infora/orchestration';
import { buildApp } from './app';
import { FAKE_EMBED_MODEL, fakeRouter, fakeVector } from './test-router';

const { db, pool } = createDb();
const lenses = loadLenses({ production: true });

// The router answers with a fingerprint of the system prompt it was handed, so
// "the answer reads differently" is observable at the HTTP boundary rather
// than only inside the capability's unit tests.
const app = buildApp({
  db,
  sessionSecret: 'test-secret',
  router: fakeRouter((system) => {
    const reader = /Write for this reader: ([^.]+)\./.exec(system)?.[1] ?? 'no lens';
    return `Answering for ${reader}. [S1]`;
  }),
  lenses,
  defaultLensId: 'planning-environmental',
});

const stamp = Date.now();
const password = 'pw-t299';
let projectId: string;
let cookie: string;
let conversationId: string;
let versionId: string;

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: `t299 org ${stamp}` }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t299 project ${stamp}`, ownerOrganisationId: org!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId: org!.id, projectId, role: 'owner' });

  const [user] = await db
    .insert(s.users)
    .values({ name: 't299 user', email: `t299-${stamp}@test.local`, organisationId: org!.id })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  await db.insert(s.participants).values({ userId: user!.id, projectId });
  cookie = (
    await app.request('/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `t299-${stamp}@test.local`, password }),
    })
  ).headers
    .get('set-cookie')!
    .split(';')[0]!;

  const [container] = await db
    .insert(s.containers)
    .values({
      projectId,
      producingOrganisationId: org!.id,
      documentReference: `T299-GEO-GIR-${stamp}`,
      inLibrary: true,
    })
    .returning();
  const [version] = await db
    .insert(s.versions)
    .values({
      containerId: container!.id,
      versionReference: 'v1',
      content: 'The alpha investigation recorded contamination exceedances at three trial pits.',
    })
    .returning();
  versionId = version!.id;
  await db.insert(s.versionChunks).values({
    versionId: version!.id,
    chunkIndex: 0,
    content: 'The alpha investigation recorded contamination exceedances at three trial pits.',
    embedding: fakeVector('alpha'),
    embeddingModelId: FAKE_EMBED_MODEL,
    embeddingModelVersion: 'fake-1',
  });
  await withProjectScope(db, projectId, async (tx) =>
    tx.select().from(s.versionChunks).where(eq(s.versionChunks.versionId, version!.id)),
  );

  conversationId = (
    (await (
      await app.request(`/projects/${projectId}/conversations`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ surface: 'web' }),
      })
    ).json()) as { conversationId: string }
  ).conversationId;
});

afterAll(async () => {
  await pool.end();
});

const QUESTION = 'What did the alpha investigation record?';

async function ask(lensId?: string): Promise<Response> {
  return app.request(`/conversations/${conversationId}/runs`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ request: QUESTION, ...(lensId !== undefined && { lensId }) }),
  });
}

/** The run's own source set, at the grain the record keeps it. */
function sourcesOf(run: Run): string[] {
  const retrieve = run.steps.find((step) => step.type === 'retrieve')!;
  return retrieve.sourceSet.map((source) => JSON.stringify(source)).sort();
}

// T-283 — what the picker may offer, and the config default.
describe('T-283 — the Lens list and the configured default', () => {
  it('offers the four active Lenses as summaries, and no prompt material', async () => {
    const res = await app.request('/lenses', { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ListLensesResponse;

    expect(body.lenses.map((l) => l.id).sort()).toEqual([
      'communications',
      'engineer',
      'planning-environmental',
      'project-manager',
    ]);
    // summaries ONLY: prohibitions and worked exchanges are prompt material
    // and have no business on the wire
    for (const summary of body.lenses) {
      expect(Object.keys(summary).sort()).toEqual(['description', 'id', 'label', 'version']);
    }
  });

  it('reports the deployment default, which is config and not code', async () => {
    const res = await app.request('/lenses', { headers: { cookie } });
    expect(((await res.json()) as ListLensesResponse).defaultLensId).toBe('planning-environmental');

    // a deployment naming none offers the shared core — the state the product
    // shipped in before the Lens layer existed, and a valid configuration
    const noDefault = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter(), lenses });
    const bare = await noDefault.request('/lenses', { headers: { cookie } });
    expect(((await bare.json()) as ListLensesResponse).defaultLensId).toBeNull();
  });

  it('never reports a default the registry does not carry', async () => {
    // a typo in DEFAULT_LENS_ID must not preselect an id the picker cannot
    // offer and the run endpoint would then refuse with a 400
    const misconfigured = buildApp({
      db,
      sessionSecret: 'test-secret',
      router: fakeRouter(),
      lenses,
      defaultLensId: 'planing-environmental',
    });
    const res = await misconfigured.request('/lenses', { headers: { cookie } });
    expect(((await res.json()) as ListLensesResponse).defaultLensId).toBeNull();
  });

  it('requires a session, like every route but login and health', async () => {
    expect((await app.request('/lenses')).status).toBe(401);
  });

  it('is the same list for every requester — a list that varied would be a reach control', async () => {
    // the wall's shape is irrelevant here BY DESIGN: the Lens set is a property
    // of the deployment, and this test exists to keep it that way
    const first = (await (await app.request('/lenses', { headers: { cookie } })).json()) as ListLensesResponse;
    const second = (await (await app.request('/lenses', { headers: { cookie } })).json()) as ListLensesResponse;
    expect(first).toEqual(second);
  });
});

describe('T-283 — switching changes the next answer, never a past one', () => {
  it('two turns in one conversation may carry different Lenses', async () => {
    // persistence is PER RUN, in the plan record — there is no conversation
    // column, because an answer's Lens is a property of the answer
    const first = (await (await ask('planning-environmental')).json()) as Run;
    const second = (await (await ask('communications')).json()) as Run;

    const firstPlan = (await readPlanForRun(db, first.id)) as Plan;
    const secondPlan = (await readPlanForRun(db, second.id)) as Plan;
    expect(firstPlan.lensId).toBe('planning-environmental');
    // the earlier answer is untouched by the later switch
    expect(secondPlan.lensId).toBe('communications');
    expect(first.response).not.toBe(second.response);

    const reread = (await readPlanForRun(db, first.id)) as Plan;
    expect(reread.lensId).toBe('planning-environmental');
  });
});

describe('T-299 — the Lens through the request and into the prompt', () => {
  it('the same question under two Lenses: two different answers, one identical source set', async () => {
    const planning = (await (await ask('planning-environmental')).json()) as Run;
    const communications = (await (await ask('communications')).json()) as Run;

    // half one — it reads differently
    expect(planning.response).not.toBe(communications.response);
    expect(planning.response).toContain('planning and environmental practitioner');
    expect(communications.response).toContain('Professional communicator');

    // half two — and it saw exactly the same thing
    expect(sourcesOf(planning)).toEqual(sourcesOf(communications));
    expect(sourcesOf(planning).length).toBeGreaterThan(0);
    for (const source of planning.steps.find((s2) => s2.type === 'retrieve')!.sourceSet) {
      expect(source).toMatchObject({ versionId });
    }
  });

  it('all four active Lenses return an identical source set — the PERM-05 guarantee', async () => {
    const runs: Run[] = [];
    for (const lens of lenses.list()) {
      runs.push((await (await ask(lens.id)).json()) as Run);
    }
    expect(runs).toHaveLength(4);
    const sets = runs.map(sourcesOf);
    for (const set of sets) expect(set).toEqual(sets[0]);
    // and four distinct answers, so the identical source set is not merely the
    // consequence of nothing having happened
    expect(new Set(runs.map((r) => r.response)).size).toBe(4);
  });

  it('records the Lens and its VERSION on the plan — the evidence half', async () => {
    const run = (await (await ask('engineer')).json()) as Run;
    const plan = (await readPlanForRun(db, run.id)) as Plan;
    expect(plan.lensId).toBe('engineer');
    expect(plan.lensVersion).toBe(lenses.get('engineer')!.version);
  });

  it('a run naming no Lens records none — never a default written in as though asked for', async () => {
    const run = (await (await ask()).json()) as Run;
    const plan = (await readPlanForRun(db, run.id)) as Plan;
    expect(plan.lensId).toBeNull();
    expect(plan.lensVersion).toBeNull();
    expect(run.response).toContain('no lens');
  });

  describe('an unavailable Lens is a refusal, never a silent fall-back', () => {
    it('rejects an unknown id with 400 and no run at all', async () => {
      const before = (
        await db.select().from(s.runs).where(eq(s.runs.conversationId, conversationId))
      ).length;
      const res = await ask('not-a-lens');
      expect(res.status).toBe(400);
      expect(((await res.json()) as ApiError).detail).toBe('unknown lens: not-a-lens');
      // the refusal lands BEFORE the run opens: a rejected request must not
      // leave a half-run in the audit record, and must not spend a model call
      const after = await db
        .select()
        .from(s.runs)
        .where(eq(s.runs.conversationId, conversationId))
        .orderBy(asc(s.runs.startedAt));
      expect(after).toHaveLength(before);
    });

    it('rejects a draft Lens in a production registry — commercial is authored but not offered', async () => {
      // `commercial` exists on disk and loads outside production; a deployment
      // running production semantics has no such id, so asking for it is the
      // same refusal as asking for one that was never written
      expect(loadLenses({ production: false }).get('commercial')).toBeDefined();
      const res = await ask('commercial');
      expect(res.status).toBe(400);
      expect(((await res.json()) as ApiError).detail).toBe('unknown lens: commercial');
    });
  });
});
