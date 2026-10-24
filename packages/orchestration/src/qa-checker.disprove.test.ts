// T-476 (ADR-0053 addendum A9) — the optional disproving pass, end to end through
// the section check against the dev database.
//
// *In plain terms: the model raises two findings about a section. With the
// pass off, both come back and the model is asked once. With it on, the model
// is asked to argue against each; the one it can disprove is withdrawn — and
// the step's output says which, and why — while the other stands. The pass can
// only remove: an unreadable answer leaves a finding standing.*
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Assemble, AssembledInput } from '@infora/contracts';
import { createDb, schema as s } from '@infora/db';
import { Router, SELF_HOSTED_UK } from '@infora/model';
import type { ChatAdapter, EmbeddingAdapter } from '@infora/model';
import { createQaSectionCheck } from './qa-checker';

const { db, pool } = createDb();

let organisationId: string;
let participantId: string;
let projectId: string;
let sandboxDocumentId: string;
let versionId: string;

const embeddings: EmbeddingAdapter = {
  modelId: 'fake-embed',
  dimensions: 4,
  attributes: SELF_HOSTED_UK,
  embed: async (texts) => ({
    embeddings: texts.map(() => [0, 0, 0, 0]),
    model: { id: 'fake-embed', version: '1' },
  }),
};

const CONTENT = 'Assessment\n\nThe survey recorded three exceedances. The cap is 2 m thick.';

/** answers the section check with two findings, and each disproving call by its defect */
const calls: string[] = [];
const chat: ChatAdapter = {
  modelId: 'fake-chat',
  attributes: SELF_HOSTED_UK,
  chat: async (request: { system?: string }) => {
    const system = request.system ?? '';
    calls.push(system.includes('You are testing a finding') ? 'disprove' : 'check');
    const usage = { tokensPrompt: 10, tokensCompletion: 5 };
    const model = { id: 'fake-chat', version: '1' };
    if (system.includes('You are testing a finding')) {
      return {
        text: system.includes('cap is thinner')
          ? '{"holds": false, "reasoning": "The record gives 2 m, so the sentence is right."}'
          : '{"holds": true, "reasoning": "The record says three."}',
        model,
        usage,
      };
    }
    return {
      text: JSON.stringify({
        summary: 'The section reports exceedances and a cap.',
        findings: [
          { family: 'corpus_accuracy', quote: 'three exceedances', defect: 'The record says four.', severity: 'required', source: 'S1' },
          { family: 'corpus_accuracy', quote: 'The cap is 2 m thick', defect: 'The cap is thinner in the record.', severity: 'advisory', source: 'S1' },
        ],
      }),
      model,
      usage,
    };
  },
} as unknown as ChatAdapter;
const router = new Router(chat, embeddings);

beforeAll(async () => {
  const stamp = Date.now();
  const [org] = await db.insert(s.organisations).values({ name: `t476 qa ${stamp}` }).returning();
  organisationId = org!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t476 qa ${stamp}`, ownerOrganisationId: organisationId })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId, projectId, role: 'owner' });
  const [user] = await db
    .insert(s.users)
    .values({ name: 't476 qa', email: `t476-qa-${stamp}@test.local`, organisationId })
    .returning();
  const [participant] = await db.insert(s.participants).values({ userId: user!.id, projectId }).returning();
  participantId = participant!.id;
  const [sandbox] = await db
    .insert(s.sandboxes)
    .values({
      projectId,
      owningOrganisationId: organisationId,
      scope: 'single_org',
      name: 't476 qa',
      createdByParticipantId: participantId,
    })
    .returning();
  const [document] = await db
    .insert(s.sandboxDocuments)
    .values({
      projectId,
      organisationId,
      sandboxId: sandbox!.id,
      title: 't476 draft',
      content: CONTENT,
      createdByParticipantId: participantId,
    })
    .returning();
  sandboxDocumentId = document!.id;
  const [container] = await db
    .insert(s.containers)
    .values({ projectId, producingOrganisationId: organisationId, documentReference: `T476-${stamp}`, inLibrary: true })
    .returning();
  const [version] = await db
    .insert(s.versions)
    .values({ containerId: container!.id, versionReference: 'P01', content: 'x', isCurrent: true })
    .returning();
  versionId = version!.id;
});

afterAll(async () => {
  await pool.end();
});

const passage = (): AssembledInput['items'][number] => ({
  channel: 'grounded',
  corpus: 'library',
  source: { versionId },
  chunkId: `${versionId}-c0`,
  descriptor: { documentReference: 'T476', documentTitle: null, versionReference: 'P01', superseded: false },
  content: 'The survey recorded four exceedances. The cap is 3 m thick.',
});

const run = async (disprove: boolean) => {
  calls.length = 0;
  const assemble = vi.fn<Assemble>(async () => ({
    items: [passage()],
    budget: { tokenLimit: 12000, tokensUsed: 0 },
  }));
  return createQaSectionCheck({ db, router, assemble })(
    { organisationId: organisationId as never, participantId: participantId as never },
    { projectId: projectId as never },
    {
      sandboxDocumentId: sandboxDocumentId as never,
      section: 1,
      families: ['corpus_accuracy'],
      depth: 'quick',
      ...(disprove && { disprove: true }),
    },
  );
};

describe('the disproving pass (T-476)', () => {
  it('off: both findings come back, one model call is made, and nothing about the pass appears', async () => {
    const result = await run(false);
    expect(result.findings).toHaveLength(2);
    expect(calls).toEqual(['check']);
    expect(result.withdrawn).toBeUndefined();
    expect(result.coverage.disproving).toBeUndefined();
    expect(result.coverage.discarded.withdrawn).toBe(0);
  });

  it('on: asks once per model-raised finding, withdraws the one it disproves, keeps the other', async () => {
    const result = await run(true);
    expect(calls).toEqual(['check', 'disprove', 'disprove']);
    expect(result.findings.map((finding) => finding.defect)).toEqual(['The record says four.']);
    expect(result.withdrawn).toEqual([
      expect.objectContaining({
        defect: 'The cap is thinner in the record.',
        quote: 'The cap is 2 m thick',
        reasoning: 'The record gives 2 m, so the sentence is right.',
      }),
    ]);
    expect(result.coverage.disproving).toEqual({ raised: 2, withdrawn: 1 });
    expect(result.coverage.discarded.withdrawn).toBe(1);
    // the step's usage covers all three calls
    expect(result.audit!.usage.tokensPrompt).toBe(30);
  });
});
