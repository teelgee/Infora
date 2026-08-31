// T-285 — a fallback that fired is visible in the record.
//
// The property under test is not "the router failed over" (that is model's own
// suite) but "the ATTEMPT reached the audit trail". A chain that recovers
// silently is the failure mode: the answer arrives, the cost report shows one
// call, and nobody can tell that a UK endpoint went dark for an hour.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { createDb, schema as s } from '@infora/db';
import { Router, SELF_HOSTED_UK } from '@infora/model';
import type { ChatAdapter, EmbeddingAdapter } from '@infora/model';
import type { AssembledInput } from '@infora/contracts';
import { createDraftLeaf } from './draft-leaf';
import { openRun, openStep } from './run-writer';
import type { RunRow } from './run-writer';

const { db, pool } = createDb();

let conversationId: string;
let participantId: string;
let projectId: string;

const retrieved: AssembledInput = { items: [], budget: { tokenLimit: 12000, tokensUsed: 0 } };

const answering = (modelId: string): ChatAdapter => ({
  modelId,
  attributes: SELF_HOSTED_UK,
  endpoint: `https://${modelId}.example`,
  chat: async () => ({
    text: 'a claim [S1].',
    model: { id: modelId, version: `${modelId}-1` },
    usage: { tokensPrompt: 10, tokensCompletion: 5 },
  }),
});
const unavailable = (modelId: string): ChatAdapter => ({
  modelId,
  attributes: SELF_HOSTED_UK,
  endpoint: `https://${modelId}.example`,
  chat: async () => {
    throw Object.assign(new Error('rate limited'), { status: 429 });
  },
});
const embeddings: EmbeddingAdapter = {
  modelId: 'fake-embed',
  dimensions: 4,
  attributes: SELF_HOSTED_UK,
  embed: async (texts) => ({
    embeddings: texts.map(() => [0, 0, 0, 0]),
    model: { id: 'fake-embed', version: 'fake-embed-1' },
  }),
};

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: 't285 org' }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't285 project', ownerOrganisationId: org!.id })
    .returning();
  projectId = project!.id;
  const [user] = await db
    .insert(s.users)
    .values({ name: 't285', email: `t285-${Date.now()}@test.local`, organisationId: org!.id })
    .returning();
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId })
    .returning();
  participantId = participant!.id;
  const [conversation] = await db
    .insert(s.conversations)
    .values({ projectId, surface: 'web' })
    .returning();
  conversationId = conversation!.id;
});

afterAll(async () => {
  await pool.end();
});

async function openDraftStep(): Promise<{ run: RunRow; stepId: string }> {
  const run = await openRun(db, {
    conversationId,
    agentId: 'infora.grounded_draft',
    agentProvenance: 'infora',
    request: 'draft it',
    environmentKey: projectId,
    requesterParticipantId: participantId,
  });
  const step = await openStep(db, { runId: run.id, type: 'draft' });
  return { run, stepId: step.id };
}

const children = (runId: string, stepId: string) =>
  db
    .select()
    .from(s.steps)
    .where(eq(s.steps.parentStepId, stepId))
    .orderBy(asc(s.steps.startedAt))
    .then((rows) => rows.filter((row) => row.runId === runId));

describe('the draft leaf records what the router attempted (T-285)', () => {
  it('writes a child Step, with egress facts, for a route that was unavailable', async () => {
    const router = new Router(
      [{ adapter: unavailable('first') }, { adapter: answering('second') }],
      embeddings,
    );
    const { run, stepId } = await openDraftStep();

    const result = await createDraftLeaf(router)(
      { db, run, stepId, attachments: [] },
      { request: 'draft it', retrieved, mode: 'chat', lens: null },
    );

    // the successful call is the draft step itself — never duplicated, or a
    // one-route call would read as two model calls in every cost report
    expect(result.audit?.egress?.endpoint).toBe('https://second.example');
    const rows = await children(run.id, stepId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('failed');
    expect(rows[0]!.egressEndpoint).toBe('https://first.example');
    expect(rows[0]!.egressRegion).toBe('uk');
  });

  it('writes nothing extra when the first route answered', async () => {
    const router = new Router([{ adapter: answering('only') }], embeddings);
    const { run, stepId } = await openDraftStep();

    await createDraftLeaf(router)(
      { db, run, stepId, attachments: [] },
      { request: 'draft it', retrieved, mode: 'chat', lens: null },
    );

    expect(await children(run.id, stepId)).toHaveLength(0);
  });

  // the case the record is worth most in: nothing answered, and the run is
  // about to carry on around a failed step (T-268)
  it('records every attempt when the chain exhausts, and still fails the step', async () => {
    const router = new Router(
      [{ adapter: unavailable('first') }, { adapter: unavailable('second') }],
      embeddings,
    );
    const { run, stepId } = await openDraftStep();

    await expect(
      createDraftLeaf(router)(
        { db, run, stepId, attachments: [] },
        { request: 'draft it', retrieved, mode: 'chat', lens: null },
      ),
    ).rejects.toThrow(/every conforming route failed/);

    const rows = await children(run.id, stepId);
    expect(rows.map((row) => row.egressEndpoint)).toEqual([
      'https://first.example',
      'https://second.example',
    ]);
  });
});
