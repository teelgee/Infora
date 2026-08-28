// T-254 acceptance — real cost attribution (finding F7).
//
// F7 was that every step in the running system recorded a cost of exactly
// zero. Token counts were real; the rates defaulted to 0 and the draft leaf was
// bound with no options, so the multiplication was always by nothing. A pilot
// cannot be priced off that.
//
// The assertions below therefore come in pairs: one that a priced run costs
// something, and one that an UNPRICED run says so rather than saying zero.
// Getting only the first would replace F7 with a subtler version of itself.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OrganisationCostsResponse, Run } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { parseModelRates } from '@infora/model';
import { buildApp } from './app';
import { FAKE_EMBED_MODEL, fakeRouter, fakeVector } from './test-router';

const { db, pool } = createDb();
const stamp = Date.now();
const password = 'pw-t254';

// T-313 — the embedding model is priced too. Before this ticket the retrieval
// half of every run carried no token count at all, so no rate could reach it.
const RATES = {
  'fake-chat': { promptPerMTok: 3, completionPerMTok: 15 },
  'fake-embed': { promptPerMTok: 0.06, completionPerMTok: 0 },
};
const priced = buildApp({
  db,
  sessionSecret: 'test-secret',
  router: fakeRouter(),
  modelRates: RATES,
});
// the state the system was in before this ticket, kept as a control
const unpriced = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

let projectId: string;
let adminCookie: string;
let memberCookie: string;
let organisationId: string;

async function makeUser(name: string, orgRole: 'admin' | 'member', on = priced): Promise<string> {
  const email = `${name}-${stamp}@test.local`;
  const [user] = await db
    .insert(s.users)
    .values({ name, email, organisationId, orgRole })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  await db.insert(s.participants).values({ userId: user!.id, projectId });
  const res = await on.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

async function ask(cookie: string, on = priced): Promise<Run> {
  const { conversationId } = (await (
    await on.request(`/projects/${projectId}/conversations`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ surface: 'web' }),
    })
  ).json()) as { conversationId: string };
  return (await (
    await on.request(`/conversations/${conversationId}/runs`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ request: 'What did the alpha investigation record?' }),
    })
  ).json()) as Run;
}

const costs = (cookie: string, on = priced) =>
  on.request('/organisation/costs', { headers: { cookie } });

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: `t254 org ${stamp}` }).returning();
  organisationId = org!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t254 project ${stamp}`, ownerOrganisationId: org!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId: org!.id, projectId, role: 'owner' });

  const [container] = await db
    .insert(s.containers)
    .values({
      projectId,
      producingOrganisationId: org!.id,
      documentReference: `T254-GEO-GIR-${stamp}`,
      inLibrary: true,
    })
    .returning();
  const [version] = await db
    .insert(s.versions)
    .values({
      containerId: container!.id,
      versionReference: 'v1',
      content: 'The alpha investigation recorded contamination exceedances.',
    })
    .returning();
  await db.insert(s.versionChunks).values({
    versionId: version!.id,
    chunkIndex: 0,
    content: 'The alpha investigation recorded contamination exceedances.',
    embedding: fakeVector('alpha'),
    embeddingModelId: FAKE_EMBED_MODEL,
    embeddingModelVersion: 'fake-1',
  });

  adminCookie = await makeUser('t254-admin', 'admin');
  memberCookie = await makeUser('t254-member', 'member');
});

afterAll(async () => {
  await pool.end();
});

describe('T-254 — a run costs money, and the record says how much', () => {
  it('a priced run records a real, non-zero cost on the step that called the model', async () => {
    const run = await ask(adminCookie);
    const draft = run.steps.find((step) => step.type === 'draft')!;

    expect(draft.usage).toBeDefined();
    expect(draft.usage!.tokensPrompt).toBeGreaterThan(0);
    // the whole of F7 in one assertion: this was exactly 0 before the ticket
    expect(draft.usage!.cost).toBeGreaterThan(0);
    expect(draft.usage!.cost).toBeCloseTo(
      (draft.usage!.tokensPrompt * 3 + draft.usage!.tokensCompletion * 15) / 1_000_000,
      12,
    );
  });

  it('an UNPRICED run records null, not zero — the mistake one level up from F7', async () => {
    const cookie = await makeUser('t254-nopricing', 'admin', unpriced);
    const run = await ask(cookie, unpriced);
    const draft = run.steps.find((step) => step.type === 'draft')!;

    // a rate table that returned 0 for a model it does not know would be the
    // same lie with more steps: the arithmetic succeeds, the number is
    // plausible, and nobody notices until a provider changes a model id
    expect(draft.usage!.cost).toBeNull();
    expect(draft.usage!.tokensPrompt).toBeGreaterThan(0); // the tokens were always real
  });

  it('a step that called no model is neither priced nor unpriced', async () => {
    const run = await ask(adminCookie);
    // T-313 changed which steps these are. `retrieve` DOES call a model — an
    // embedding — and now says so; `ground_check` and `cite` are pure code and
    // still carry no model. Counting a modelless step as a pricing gap would
    // report half of every run as unpriced and drown the number that matters.
    const check = run.steps.find((step) => step.type === 'ground_check')!;
    expect(check.model).toBeUndefined();
    expect(run.steps.find((step) => step.type === 'cite')!.model).toBeUndefined();
  });

  // T-313 — the retrieval half, which was invisible: `EmbedResult` carried no
  // usage at all, so a run's recorded "cost" silently meant its DRAFTING cost.
  it('the retrieve step records the embedding call it made, priced', async () => {
    const run = await ask(adminCookie);
    const retrieve = run.steps.find((step) => step.type === 'retrieve')!;

    expect(retrieve.model?.id).toBe(FAKE_EMBED_MODEL);
    expect(retrieve.usage!.tokensPrompt).toBeGreaterThan(0);
    // an embedding produces no completion — 0 is the fact, not a placeholder
    expect(retrieve.usage!.tokensCompletion).toBe(0);
    expect(retrieve.usage!.cost).toBeGreaterThan(0);
  });

  it('an unpriced embedding model records null, exactly as an unpriced chat model does', async () => {
    const cookie = await makeUser('t313-nopricing', 'admin', unpriced);
    const run = await ask(cookie, unpriced);
    const retrieve = run.steps.find((step) => step.type === 'retrieve')!;
    expect(retrieve.usage!.cost).toBeNull();
    expect(retrieve.usage!.tokensPrompt).toBeGreaterThan(0);
  });

  describe('aggregation at organisation and user grain', () => {
    it('reports the organisation total and a row per user', async () => {
      await ask(adminCookie);
      await ask(memberCookie);

      const body = (await (await costs(adminCookie)).json()) as OrganisationCostsResponse;
      expect(body.organisationId).toBe(organisationId);
      expect(body.cost).toBeGreaterThan(0);
      expect(body.pricedSteps).toBeGreaterThan(0);
      // contains, not equals: this organisation also carries the unpriced
      // control users, which is the point of the next test
      const names = body.users.map((row) => row.userName);
      expect(names).toContain('t254-admin');
      expect(names).toContain('t254-member');
      // the total is the sum of the rows, and no row is invented
      expect(body.cost).toBeCloseTo(
        body.users.reduce((total, row) => total + row.cost, 0),
        12,
      );
    });

    it('carries the unpriced count beside the total, so a total is never read alone', async () => {
      const cookie = await makeUser('t254-gap-admin', 'admin', unpriced);
      await ask(cookie, unpriced);

      const body = (await (await costs(cookie, unpriced)).json()) as OrganisationCostsResponse;
      // the number that keeps the total honest — this organisation's spend is
      // NOT zero, it is unmeasured, and the report says which it is
      expect(body.unpricedSteps).toBeGreaterThan(0);
      expect(body.unpricedModels).toContain('fake-chat');
      const row = body.users.find((entry) => entry.userName === 't254-gap-admin')!;
      expect(row.unpricedSteps).toBeGreaterThan(0);
      expect(row.cost).toBe(0);
    });

    it('is org-scoped by construction — it takes no parameter that could widen it', async () => {
      // the organisation comes off the resolved requester, never the request
      // (contracts principle 3). A second organisation's spend is not reachable
      // from here by any argument, because there is no argument.
      const [other] = await db
        .insert(s.organisations)
        .values({ name: `t254 other ${stamp}` })
        .returning();
      const outsiderEmail = `t254-outsider-${stamp}@test.local`;
      const [outsider] = await db
        .insert(s.users)
        .values({
          name: 't254-outsider',
          email: outsiderEmail,
          organisationId: other!.id,
          orgRole: 'admin',
        })
        .returning();
      await db
        .insert(s.userCredentials)
        .values({ userId: outsider!.id, passwordHash: hashPassword(password) });
      const cookie = (
        await priced.request('/auth/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: outsiderEmail, password }),
        })
      ).headers
        .get('set-cookie')!
        .split(';')[0]!;

      const body = (await (await costs(cookie)).json()) as OrganisationCostsResponse;
      expect(body.organisationId).toBe(other!.id);
      expect(body.users).toEqual([]);
      expect(body.cost).toBe(0);
    });

    it('is org-admin only — a member reading it would be reading colleagues', async () => {
      expect((await costs(memberCookie)).status).toBe(404);
    });
  });

  describe('the rate table refuses to be wrong quietly', () => {
    it('parses a well-formed table', () => {
      expect(parseModelRates('{"m":{"promptPerMTok":1,"completionPerMTok":2}}')).toEqual({
        m: { promptPerMTok: 1, completionPerMTok: 2 },
      });
    });

    for (const [why, source] of [
      ['not JSON', '{oops'],
      ['not an object', '[1,2]'],
      ['a missing field', '{"m":{"promptPerMTok":1}}'],
      ['a non-number', '{"m":{"promptPerMTok":"1","completionPerMTok":2}}'],
      // a negative rate would make a total go DOWN as usage went up, and
      // nobody reading the report would suspect the table
      ['a negative rate', '{"m":{"promptPerMTok":-1,"completionPerMTok":2}}'],
    ] as const) {
      it(`refuses ${why} rather than reporting a confident wrong number`, () => {
        expect(() => parseModelRates(source)).toThrow(/MODEL_RATES/);
      });
    }
  });
});
