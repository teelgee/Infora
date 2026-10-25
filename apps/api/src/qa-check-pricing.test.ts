// T-486 (c) — the checker's plan prices its steps at the model its calls will
// really be routed to, not at the deployment's drafting model.
//
// *In plain terms: before a check runs, the plan says roughly what it will cost.
// The model calls that judge a draft (the section reads, the comparison, the
// second look) go through the "verify" route, so the figure must be worked out
// at that route's model. (At full depth each section read also makes one short
// "triage" call to list its assertions; the plan counts it but adds no cost for
// it, a small inaccuracy that predates this and is left as it was.) It used to
// be worked out at the deployment's drafting model, which can be a different
// (and differently priced) one — so the price beside the second-look switch
// could be wrong. A model with no price on file still shows no figure, never
// zero.*
//
// Repeatable on one seed: fresh organisation and project; every lookup by an id
// this file created.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { QaCheckPlanResponse } from '@infora/contracts';
import { createWorkerRegistry } from '@infora/capabilities';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { Router, SELF_HOSTED_UK, costOf } from '@infora/model';
import type { ChatAdapter, EmbeddingAdapter, ModelRates } from '@infora/model';
import { loadWorkflows } from '@infora/workflows';
import { buildApp } from './app';
import { FAKE_EMBED_DIMENSIONS, FAKE_EMBED_MODEL, FAKE_EMBED_VERSION, fakeVector } from './test-router';

const { db, pool } = createDb();
const workflows = loadWorkflows({ workers: createWorkerRegistry(), production: true });

const chatAt = (modelId: string): ChatAdapter => ({
  modelId,
  attributes: SELF_HOSTED_UK,
  chat: () =>
    Promise.resolve({
      text: '{}',
      model: { id: modelId, version: `${modelId}-1` },
      usage: { tokensPrompt: 1, tokensCompletion: 1 },
    }),
});
const embeddings: EmbeddingAdapter = {
  modelId: FAKE_EMBED_MODEL,
  dimensions: FAKE_EMBED_DIMENSIONS,
  attributes: SELF_HOSTED_UK,
  embed: (texts) =>
    Promise.resolve({
      embeddings: texts.map(fakeVector),
      model: { id: FAKE_EMBED_MODEL, version: FAKE_EMBED_VERSION },
      usage: { tokens: texts.length },
    }),
};

/** a small triage model first in the list, the frontier model that `verify` wants second */
const router = new Router(
  [
    { adapter: chatAt('t486-small-triage'), serves: ['triage'] },
    { adapter: chatAt('t486-big-frontier'), serves: ['frontier'] },
  ],
  embeddings,
);

const RATES: ModelRates = {
  't486-big-frontier': { promptPerMTok: 10, completionPerMTok: 20 },
  't486-small-triage': { promptPerMTok: 1, completionPerMTok: 2 },
  // what the old wiring priced at: the deployment's configured drafting model
  't486-configured-drafter': { promptPerMTok: 500, completionPerMTok: 900 },
};

const stamp = Date.now();
const LONG = 'The survey recorded three exceedances and the cap is two metres thick. '.repeat(280);
let projectId: string;
let cookie: string;
let documentId: string;

const withRates = (modelRates: ModelRates | undefined) =>
  buildApp({
    db,
    sessionSecret: 'test-secret',
    router,
    workflows,
    workers: createWorkerRegistry(),
    draftModelId: 't486-configured-drafter',
    ...(modelRates !== undefined && { modelRates }),
  });

async function plan(app: ReturnType<typeof withRates>, over: Record<string, unknown> = {}) {
  const res = await app.request(`/projects/${projectId}/tools/qa-check/plan`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      sandboxDocumentId: documentId,
      families: ['corpus_accuracy', 'self_contradiction'],
      depth: 'full',
      disprovingPass: true,
      ...over,
    }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as QaCheckPlanResponse).plan;
}

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: `t486c org ${stamp}` }).returning();
  const organisationId = org!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t486c project ${stamp}`, ownerOrganisationId: organisationId })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId, projectId, role: 'owner' });
  const [user] = await db
    .insert(s.users)
    .values({ name: 't486c-eleanor', email: `t486c-${stamp}@test.local`, organisationId })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword('pw-t486c') });
  const [participant] = await db.insert(s.participants).values({ userId: user!.id, projectId, elevated: true }).returning();
  const login = await withRates(undefined).request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user!.email, password: 'pw-t486c' }),
  });
  cookie = login.headers.get('set-cookie')!.split(';')[0]!;
  const [area] = await db
    .insert(s.sandboxes)
    .values({ projectId, name: `t486c area ${stamp}`, scope: 'single_org', owningOrganisationId: organisationId, createdByParticipantId: participant!.id })
    .returning();
  const [draft] = await db
    .insert(s.sandboxDocuments)
    .values({
      projectId,
      organisationId,
      sandboxId: area!.id,
      title: `t486c draft ${stamp}`,
      // two sections, long enough together that the check cannot read the draft in
      // one call — so the plan carries a comparison step as well as the section reads
      content: ['Assessment', '', LONG, '', 'Method', '', LONG].join('\n'),
      createdByParticipantId: participant!.id,
    })
    .returning();
  documentId = draft!.id;
});

afterAll(async () => {
  await pool.end();
});

describe('the plan prices at the model the verify route uses (T-486 c)', () => {
  it('the router says which model that is: the frontier one, not the first route in the list', () => {
    expect(router.modelIdFor('verify')).toBe('t486-big-frontier');
  });

  it('every model step — section reads, the comparison, the second look — is priced at that model, and not at the configured drafting model', async () => {
    const p = await plan(withRates(RATES));
    const modelSteps = p.steps.filter((step) => /^(check|compare|disprove)/.test(step.key));
    // the plan really has all three kinds of step
    expect(new Set(modelSteps.map((step) => step.key.replace(/#\d+$/, '')))).toEqual(new Set(['check', 'compare', 'disprove']));
    for (const step of modelSteps) {
      const { cost, calls, ...usage } = step.estimate;
      void calls;
      expect(cost).not.toBeNull();
      expect(cost).toBeCloseTo(costOf(RATES, 't486-big-frontier', usage)!, 10);
      // and it is NOT what the drafting model's rate would have said
      expect(cost).not.toBeCloseTo(costOf(RATES, 't486-configured-drafter', usage)!, 6);
    }
    expect(p.cost.priced).toBe(true);
  });

  it('a deployment with no rate for that model stays unpriced: null on every model step, never zero', async () => {
    // a rate exists for the OTHER models, but not for the one verify uses
    const p = await plan(withRates({ 't486-small-triage': RATES['t486-small-triage']!, 't486-configured-drafter': RATES['t486-configured-drafter']! }));
    const modelSteps = p.steps.filter((step) => /^(check|compare|disprove)/.test(step.key));
    expect(modelSteps.length).toBeGreaterThan(0);
    for (const step of modelSteps) expect(step.estimate.cost).toBeNull();
    expect(p.cost).toMatchObject({ total: null, priced: false });
  });
});
