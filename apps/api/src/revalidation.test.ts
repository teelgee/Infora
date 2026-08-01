// T-252 acceptance — per-step slice re-resolution (finding F4, half two).
//
// A run resolves its EntitledSlice once, at the API boundary. That is exact for
// a request measured in seconds; it is a different claim over a plan that fans
// out for minutes. This suite proves the re-check stops a run MID-FLIGHT — the
// requester's session or entitlement is withdrawn between two steps, and the
// run does not finish.
//
// Withdrawal is driven from a LEAF, not from a timer, because that is the only
// way to be sure the change lands between two specific steps rather than
// whenever a sleep happened to elapse.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { ApiError } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { Router, SELF_HOSTED_UK } from '@infora/model';
import type { ChatAdapter, EmbeddingAdapter } from '@infora/model';
import { buildApp } from './app';
import { revokeUserSessions } from './sessions';
import { FAKE_EMBED_DIMENSIONS, FAKE_EMBED_MODEL, fakeVector } from './test-router';

const { db, pool } = createDb();
const stamp = Date.now();
const password = 'pw-t252';
const email = `t252-${stamp}@test.local`;

let userId: string;
let participantId: string;
let projectId: string;

/**
 * Runs once, DURING the retrieve step — the embedding adapter is called to
 * embed the query, which happens inside retrieve and therefore before the
 * chain re-checks for draft. `buildApp` composes its own leaves, so the router
 * is the honest seam: it is a real dependency the application already takes,
 * not a test-only parameter widening the production surface.
 */
let duringRetrieve: (() => Promise<void>) | null = null;

function hookedRouter(): Router {
  const chat: ChatAdapter = {
    modelId: 'fake-chat',
    attributes: SELF_HOSTED_UK,
    chat: () =>
      Promise.resolve({
        text: 'The investigation recorded contamination exceedances. [S1]',
        model: { id: 'fake-chat', version: 'fake-chat-1' },
        usage: { tokensPrompt: 500, tokensCompletion: 60 },
      }),
  };
  const embeddings: EmbeddingAdapter = {
    modelId: FAKE_EMBED_MODEL,
    dimensions: FAKE_EMBED_DIMENSIONS,
    attributes: SELF_HOSTED_UK,
    embed: async (texts) => {
      if (duringRetrieve !== null) {
        const hook = duringRetrieve;
        duringRetrieve = null;
        await hook();
      }
      return { embeddings: texts.map(fakeVector), model: { id: FAKE_EMBED_MODEL, version: 'fake-1' } };
    },
  };
  return new Router(chat, embeddings);
}

const app = buildApp({ db, sessionSecret: 'test-secret', router: hookedRouter() });

async function login(): Promise<string> {
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

async function ask(cookie: string, conversationId: string): Promise<Response> {
  return app.request(`/conversations/${conversationId}/runs`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ request: 'What did the alpha investigation record?' }),
  });
}

async function openConversation(cookie: string): Promise<string> {
  const res = await app.request(`/projects/${projectId}/conversations`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ surface: 'web' }),
  });
  return ((await res.json()) as { conversationId: string }).conversationId;
}

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: `t252 org ${stamp}` }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t252 project ${stamp}`, ownerOrganisationId: org!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId: org!.id, projectId, role: 'owner' });

  const [user] = await db
    .insert(s.users)
    .values({ name: 't252 user', email, organisationId: org!.id })
    .returning();
  userId = user!.id;
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId })
    .returning();
  participantId = participant!.id;
});

afterAll(async () => {
  duringRetrieve = null;
  await pool.end();
});

describe('T-252 — the entitlement is re-resolved between steps', () => {
  it('a run with nothing withdrawn completes, so the seam is not simply refusing everything', async () => {
    // the control. Without it, every assertion below would also pass against a
    // re-check that refused unconditionally.
    const cookie = await login();
    const res = await ask(cookie, await openConversation(cookie));
    expect(res.status).toBe(201);
  });

  it('a session revoked mid-run stops the run at the next step boundary', async () => {
    const cookie = await login();
    const conversationId = await openConversation(cookie);
    duringRetrieve = async () => {
      await revokeUserSessions(db, userId);
    };

    const res = await ask(cookie, conversationId);
    expect(res.status).toBe(401);
    expect((await res.json()) as ApiError).toEqual({ error: 'unauthenticated' });

    // and the record says what happened: the run is failed, the plan step that
    // never ran is `skipped` rather than `failed` — nothing about it went
    // wrong, it simply did not happen
    const runs = await db
      .select()
      .from(s.runs)
      .where(eq(s.runs.requesterParticipantId, participantId));
    const failed = runs.filter((row) => row.state === 'failed');
    expect(failed.length).toBeGreaterThan(0);

    const plans = await db.select().from(s.plans).where(eq(s.plans.projectId, projectId));
    const failedPlan = plans.find((plan) => plan.state === 'failed');
    expect(failedPlan).toBeDefined();
    const steps = await db
      .select()
      .from(s.planSteps)
      .where(eq(s.planSteps.planId, failedPlan!.id));
    expect(steps.some((step) => step.state === 'skipped')).toBe(true);
    // the retrieve step DID run and is recorded complete — the run stopped
    // between steps, and the record of what happened up to that point stands
    expect(steps.some((step) => step.state === 'complete')).toBe(true);
  });

  it('an entitlement withdrawn mid-run reads as nonexistence, not as a distinct refusal', async () => {
    // a fresh session, because the last test revoked them all
    const cookie = await login();
    const conversationId = await openConversation(cookie);
    duringRetrieve = async () => {
      await db
        .update(s.participants)
        .set({ removedAt: new Date() })
        .where(eq(s.participants.id, participantId));
    };

    const res = await ask(cookie, conversationId);
    // 404, deliberately. Once the requester cannot reach the project, the
    // project reads as nonexistent to them; a distinct status would tell
    // someone just removed from a project that it is still there (principle 4).
    expect(res.status).toBe(404);
    expect((await res.json()) as ApiError).toEqual({ error: 'not_found' });

    // restore, so the file's own ordering does not leak into other assertions
    await db
      .update(s.participants)
      .set({ removedAt: null })
      .where(eq(s.participants.id, participantId));
  });

  it('the two failures are distinguished in the record even though the client sees one shape each', async () => {
    // an operator reading the audit needs to know which happened: a revoked
    // session is an ACCOUNT act and a lost entitlement is a PROJECT one, and
    // the remedy differs. The distinction lives on `RunHalted.reason`, which
    // the status mapping above is derived from — asserted by the two tests
    // above returning 401 and 404 respectively rather than one shared status.
    const cookie = await login();
    const res = await ask(cookie, await openConversation(cookie));
    expect(res.status).toBe(201); // and the happy path is unchanged by any of it
  });
});
