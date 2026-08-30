// T-396 — THE EXECUTOR RULE: a plan step executes the capability it names
// (ADR-0053 §7), against the live dev database.
//
// Five guards, and each is a separate `it` because each is a separate promise:
//
//   1. the step's named capability is what runs — and, before this ticket, was
//      not: `runChain` dispatched on stage and read `worker` never, so the
//      drafting stage ran the draft leaf whatever a step said;
//   2. stage keeps its two remaining jobs, and only those;
//   3. the capability is resolved through the set ASSEMBLED for this requester
//      (T-269), and one outside it fails with the entitlement refusal rather
//      than a generic error;
//   4. a capability that writes runs only inside a workflow that declared
//      `writes` — validator rule 4, biting for the first time;
//   5. per-step COST is recorded, because the row a cost lives on is opened by
//      the executor and nothing opened one for a worker until now.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import type { AssembledInput, WorkerDeclaration } from '@infora/contracts';
import { createDb, schema as s } from '@infora/db';
import { CapabilityRefused, resolveStepInputs, runChain } from './chain';
import type { Capability, CapabilityRegistry, ChainInput, ChainLeaves } from './chain';

const { db, pool } = createDb();

let projectId: string;
let participantId: string;
let conversationId: string;
let versionId: string;

const retrieved: AssembledInput = { items: [], budget: { tokenLimit: 12000, tokensUsed: 5 } };

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: 't396 org' }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't396 project', ownerOrganisationId: org!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId: org!.id, projectId, role: 'owner' });
  const [user] = await db
    .insert(s.users)
    .values({ name: 't396', email: `t396-${Date.now()}@test.local`, organisationId: org!.id })
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
  const [container] = await db
    .insert(s.containers)
    .values({
      projectId,
      producingOrganisationId: org!.id,
      documentReference: `T396-${Date.now()}`,
      inLibrary: true,
    })
    .returning();
  const [version] = await db
    .insert(s.versions)
    .values({ containerId: container!.id, versionReference: 'v1', content: 'source content' })
    .returning();
  versionId = version!.id;
  retrieved.items.push({
    channel: 'grounded',
    corpus: 'library',
    source: { versionId },
    content: 'source content',
  });
});

afterAll(async () => {
  await pool.end();
});

/** the coded chain's leaves, each recording that it was the thing that ran */
function stubLeaves(calls: string[]): ChainLeaves {
  return {
    retrieve: async () => {
      calls.push('leaf:retrieve');
      return { output: retrieved };
    },
    draft: async () => {
      calls.push('leaf:draft');
      return { output: { claims: [{ text: 'a claim.', sourceRef: { versionId } }] } };
    },
    groundCheck: async () => {
      calls.push('leaf:groundCheck');
      return { output: { surviving: [{ text: 'a claim.', sourceRef: { versionId } }], withheld: [] } };
    },
    cite: async () => {
      calls.push('leaf:cite');
      return { output: { suggestionIds: [], answer: 'answer' } };
    },
  };
}

const declaration = (name: string, writes = false): WorkerDeclaration => ({
  name,
  purpose: 'a test capability',
  tier: 'triage',
  inputSchema: {},
  outputSchema: {},
  tools: [],
  reach: 'inherited',
  scopeNote: 'inherited',
  leaf: true,
  writes,
  cacheable: false,
  externalEgress: false,
  requiresAuthorityShelf: false,
});

function registry(calls: string[], extra: Record<string, Capability> = {}): CapabilityRegistry {
  const built: Record<string, Capability> = {
    corpus_retrieval: {
      declaration: declaration('corpus_retrieval'),
      run: async (_ctx, inputs) => {
        calls.push(`capability:corpus_retrieval(${JSON.stringify(inputs)})`);
        return { output: { passages: [{ versionId }] } };
      },
    },
    document_builder: {
      declaration: declaration('document_builder', true),
      run: async (_ctx, inputs) => {
        calls.push(`capability:document_builder(${JSON.stringify(inputs)})`);
        return {
          output: { documentId: 'written' },
          audit: {
            model: { id: 'stub-model', version: 'stub-1' },
            usage: { tokensPrompt: 90, tokensCompletion: 40, cost: 0.042 },
          },
        };
      },
    },
    ...extra,
  };
  return { get: (name) => built[name] };
}

const run = (
  calls: string[],
  stages: NonNullable<ChainInput['stages']>,
  overrides: Partial<ChainInput> = {},
) =>
  runChain(db, stubLeaves(calls), {
    conversationId,
    request: 'the request',
    environmentKey: projectId,
    requesterParticipantId: participantId,
    capabilities: registry(calls),
    entitledCapabilities: ['corpus_retrieval', 'document_builder'],
    stages,
    ...overrides,
  });

const stepTypes = async (runId: string) =>
  (
    await db
      .select({ type: s.steps.type })
      .from(s.steps)
      .where(eq(s.steps.runId, runId))
      .orderBy(asc(s.steps.startedAt))
  ).map((row) => row.type);

describe('the executor rule (T-396, ADR-0053 §7)', () => {
  it('GUARD 1 — the capability a step names is what runs, on the stage whose leaf used to win', async () => {
    // `analyse` is the drafting stage, and ADR-0053 §7 names it: it "runs the
    // draft leaf whatever a step names". Not any more.
    const calls: string[] = [];
    const { run: record } = await run(
      calls,
      [
        { stage: 'analyse', worker: 'corpus_retrieval', inputs: { query: 'q' }, key: 'a' },
        { stage: 'present', worker: 'document_builder', inputs: {}, key: 'b' },
      ],
      {
        workflow: { id: 'w', version: 1, writes: 'sandbox_document', labelPropagation: 'refuse' },
      },
    );
    expect(calls).not.toContain('leaf:draft');
    expect(calls[0]).toBe('capability:corpus_retrieval({"query":"q"})');
    // and the Step row is of the capability's own kind (migration 0055)
    expect(await stepTypes(record.id)).toEqual(['corpus_retrieval', 'document_builder']);
  });

  it('a plan mixing a capability retrieval with the orchestrator\'s own drafting leaf is REFUSED, loudly', async () => {
    // The honest consequence of guard 1: a leaf reads the chain's own state,
    // and a capability's output is not that state. Refusing names the step; the
    // alternative — drafting from nothing and reporting success — is the
    // failure the whole executor rule was written against.
    const calls: string[] = [];
    const refusal = await run(calls, [
      { stage: 'search_corpus', worker: 'corpus_retrieval', inputs: {}, key: 'r' },
      { stage: 'analyse', inputs: {} },
      { stage: 'present', inputs: {} },
    ]).catch((error: unknown) => error);
    expect(String(refusal)).toContain('has nothing to draft from');
  });

  it('GUARD 2 — stage still runs a step that names NO capability, and nothing else', async () => {
    const calls: string[] = [];
    await run(calls, [
      { stage: 'search_corpus', inputs: {} },
      { stage: 'analyse', inputs: {} },
      { stage: 'present', inputs: {} },
    ]);
    // unchanged behaviour for the coded chain: three named leaves plus the
    // ground-check, which is code outside the plan either way
    expect(calls).toEqual(['leaf:retrieve', 'leaf:draft', 'leaf:groundCheck', 'leaf:cite']);
  });

  it('GUARD 3 — a capability outside the ASSEMBLED set fails with the entitlement refusal', async () => {
    const calls: string[] = [];
    const refusal = await run(
      calls,
      [
        { stage: 'search_corpus', worker: 'corpus_retrieval', inputs: {}, key: 'r' },
        { stage: 'analyse', inputs: {} },
        { stage: 'present', inputs: {} },
      ],
      { entitledCapabilities: [] },
    ).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(CapabilityRefused);
    expect((refusal as CapabilityRefused).reason).toBe('not_entitled');
    // BEFORE ANY SPEND: nothing ran at all
    expect(calls).toEqual([]);
  });

  it('GUARD 3 — an absent assembled set is EMPTY, not permissive', async () => {
    const calls: string[] = [];
    const refusal = await run(
      calls,
      [
        { stage: 'search_corpus', worker: 'corpus_retrieval', inputs: {}, key: 'r' },
        { stage: 'present', inputs: {} },
      ],
      { entitledCapabilities: undefined },
    ).catch((error: unknown) => error);
    expect((refusal as CapabilityRefused).reason).toBe('not_entitled');
  });

  it('GUARD 3 — a capability this deployment has not built is refused as unbuilt, not as unentitled', async () => {
    const calls: string[] = [];
    const refusal = await run(
      calls,
      [
        { stage: 'search_corpus', worker: 'nothing_like_this', inputs: {} },
        { stage: 'present', inputs: {} },
      ],
      { entitledCapabilities: ['nothing_like_this'] },
    ).catch((error: unknown) => error);
    expect((refusal as CapabilityRefused).reason).toBe('not_built');
  });

  it('GUARD 4 — a writing capability is REFUSED where the workflow declared no write', async () => {
    const calls: string[] = [];
    const refusal = await run(calls, [
      { stage: 'search_corpus', inputs: {} },
      { stage: 'present', worker: 'document_builder', inputs: {}, key: 'b' },
    ]).catch((error: unknown) => error);

    expect((refusal as CapabilityRefused).reason).toBe('writes_undeclared');
    expect(calls).toEqual([]);
  });

  it('GUARD 4 — and RUNS where the workflow declared `writes` and its label propagation', async () => {
    const calls: string[] = [];
    const { run: record } = await run(
      calls,
      [
        { stage: 'search_corpus', worker: 'corpus_retrieval', inputs: { query: 'q' }, key: 'r' },
        { stage: 'present', worker: 'document_builder', inputs: { sources: '{{steps.r.output}}' }, key: 'b' },
      ],
      {
        workflow: {
          id: 'document-creation',
          version: 1,
          writes: 'sandbox_document',
          labelPropagation: 'refuse',
        },
      },
    );
    expect(calls[1]).toContain('capability:document_builder');
    expect(record.state).toBe('completed');
  });

  it('GUARD 5 — the executor opens the Step row, so per-step cost is recorded', async () => {
    const calls: string[] = [];
    const { run: record } = await run(
      calls,
      [{ stage: 'present', worker: 'document_builder', inputs: {}, key: 'b' }],
      {
        workflow: { id: 'w', version: 1, writes: 'sandbox_document', labelPropagation: 'refuse' },
      },
    );
    const [step] = await db
      .select()
      .from(s.steps)
      .where(eq(s.steps.runId, record.id))
      .orderBy(asc(s.steps.startedAt));
    expect(step!.type).toBe('document_builder');
    expect(step!.cost).toBe('0.042');
    expect(step!.modelId).toBe('stub-model');
  });

  it('carries a step output to the step that reads it — {{steps.x.output}} resolves at RUN time', async () => {
    const calls: string[] = [];
    await run(
      calls,
      [
        { stage: 'search_corpus', worker: 'corpus_retrieval', inputs: { query: 'q' }, key: 'r' },
        { stage: 'present', worker: 'document_builder', inputs: { sources: '{{steps.r.output}}' }, key: 'b' },
      ],
      {
        workflow: { id: 'w', version: 1, writes: 'sandbox_document', labelPropagation: 'refuse' },
      },
    );
    expect(calls[1]).toContain(`"sources":{"passages":[{"versionId":"${versionId}"}]}`);
  });
});

describe('resolveStepInputs (T-396)', () => {
  it('resolves a step reference and leaves everything else exactly as it was', () => {
    const outputs = new Map<string, unknown>([['retrieve', { passages: [1] }]]);
    expect(
      resolveStepInputs({ a: '{{steps.retrieve.output}}', b: 'plain', c: 3 }, outputs),
    ).toEqual({ a: { passages: [1] }, b: 'plain', c: 3 });
  });

  it('resolves a reference to a step that produced nothing to undefined, never to the template', () => {
    // a capability handed the literal string would treat it as data, which is
    // the empty-input-reporting-success failure the validator refuses at load
    expect(resolveStepInputs({ a: '{{steps.missing.output}}' }, new Map())).toEqual({
      a: undefined,
    });
  });
});
