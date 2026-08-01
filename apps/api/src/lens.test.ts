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
import type { ApiError, Plan, Run } from '@infora/contracts';
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
