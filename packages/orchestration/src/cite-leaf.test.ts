// T-045 acceptance, against the live dev database: the real ground-check and
// cite leaves run in the chain (retrieve and draft stubbed), proving the
// Suggestion write and that citations attach to grounded sources only.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { AssembledInput } from '@infora/contracts';
import { createDb, schema as s } from '@infora/db';
import { runChain } from './chain';
import type { ChainLeaves } from './chain';
import { createCiteLeaf } from './cite-leaf';
import { createGroundCheckLeaf } from './ground-check-leaf';
import { openRun, openStep } from './run-writer';

const { db, pool } = createDb();

let projectId: string;
let participantId: string;
let workItemId: string;
let conversationId: string; // bound to the work item
let adHocConversationId: string;
let sandboxDocumentId: string;
let versionId: string;

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: 't045 org' }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't045 project', ownerOrganisationId: org!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId: org!.id, projectId, role: 'owner' });
  const [user] = await db
    .insert(s.users)
    .values({ name: 't045', email: `t045-${Date.now()}@test.local`, organisationId: org!.id })
    .returning();
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId })
    .returning();
  participantId = participant!.id;

  const [workItem] = await db
    .insert(s.workItems)
    .values({ projectId, type: 'document_production', title: 't045', status: 'in_production' })
    .returning();
  workItemId = workItem!.id;
  const [bound] = await db
    .insert(s.conversations)
    .values({ projectId, surface: 'web', workItemId })
    .returning();
  conversationId = bound!.id;
  const [adHoc] = await db
    .insert(s.conversations)
    .values({ projectId, surface: 'web' })
    .returning();
  adHocConversationId = adHoc!.id;

  const [sandbox] = await db
    .insert(s.sandboxes)
    .values({
      projectId,
      name: 't045 sandbox',
      scope: 'single_org',
      owningOrganisationId: org!.id,
      createdByParticipantId: participantId,
    })
    .returning();
  const [doc] = await db
    .insert(s.sandboxDocuments)
    .values({
      projectId,
      organisationId: org!.id,
      sandboxId: sandbox!.id,
      title: 't045 draft',
      createdByParticipantId: participantId,
    })
    .returning();
  sandboxDocumentId = doc!.id;

  const [container] = await db
    .insert(s.containers)
    .values({ projectId, producingOrganisationId: org!.id, documentReference: `T045-${Date.now()}`, inLibrary: true })
    .returning();
  const [version] = await db
    .insert(s.versions)
    .values({ containerId: container!.id, versionReference: 'v1', content: 'source' })
    .returning();
  versionId = version!.id;
});

afterAll(async () => {
  await pool.end();
});

const retrieved = (): AssembledInput => ({
  items: [{ channel: 'grounded', corpus: 'library', source: { versionId }, content: 'source' }],
  budget: { tokenLimit: 12000, tokensUsed: 2 },
});

// retrieve and draft stubbed; ground-check and cite are the real leaves
const leaves = (): ChainLeaves => ({
  retrieve: async () => ({ output: retrieved() }),
  draft: async () => ({
    output: {
      claims: [
        { text: 'Grounded claim one.', sourceRef: { versionId } },
        { text: 'Grounded claim two.', sourceRef: { versionId } },
        { text: 'An unsupported figure.' }, // withheld by the real verifier
      ],
    },
  }),
  groundCheck: createGroundCheckLeaf(),
  cite: createCiteLeaf(),
});

describe('cite resolution + Suggestion write (T-045)', () => {
  it('a document-targeted run writes one unanchored insert Suggestion with citations', async () => {
    const { run, suggestionIds } = await runChain(db, leaves(), {
      conversationId,
      request: 'draft the section',
      environmentKey: projectId,
      requesterParticipantId: participantId,
      sandboxDocumentId,
    });
    expect(run.state).toBe('completed');
    expect(suggestionIds).toHaveLength(1);

    const [suggestion] = await db
      .select()
      .from(s.suggestions)
      .where(eq(s.suggestions.id, suggestionIds[0]!));
    expect(suggestion).toMatchObject({
      runId: run.id,
      workItemId, // inherited from the bound conversation
      sandboxDocumentId,
      kind: 'insert',
      anchor: null,
      content: 'Grounded claim one.\n\nGrounded claim two.',
    });
    expect(suggestion!.rationale).toContain('1 unsupported claim was withheld');

    const citations = await db
      .select()
      .from(s.citations)
      .where(eq(s.citations.suggestionId, suggestion!.id));
    expect(citations).toHaveLength(2); // the withheld claim earns no citation
    expect(citations.every((c) => c.versionId === versionId && c.authorityRef === null)).toBe(true);
    expect(citations.map((c) => c.claimSpan)).toEqual([
      { start: 0, end: 'Grounded claim one.'.length },
      {
        start: 'Grounded claim one.\n\n'.length,
        end: 'Grounded claim one.\n\nGrounded claim two.'.length,
      },
    ]);
  });

  it('an untargeted chat run attaches citations to the cite step, no Suggestion', async () => {
    const { run, suggestionIds } = await runChain(db, leaves(), {
      conversationId: adHocConversationId,
      request: 'what did the GIR find?',
      environmentKey: projectId,
      requesterParticipantId: participantId,
    });
    expect(suggestionIds).toEqual([]);

    const [citeStep] = await db
      .select()
      .from(s.steps)
      .where(eq(s.steps.runId, run.id))
      .then((rows) => rows.filter((r) => r.type === 'cite'));
    const citations = await db
      .select()
      .from(s.citations)
      .where(eq(s.citations.stepId, citeStep!.id));
    expect(citations).toHaveLength(2);
    expect(citations.every((c) => c.suggestionId === null)).toBe(true);
  });

  it('nothing surviving writes nothing', async () => {
    const withered = leaves();
    withered.draft = async () => ({ output: { claims: [{ text: 'All unsupported.' }] } });
    const { suggestionIds, run } = await runChain(db, withered, {
      conversationId,
      request: 'q',
      environmentKey: projectId,
      requesterParticipantId: participantId,
      sandboxDocumentId,
    });
    expect(suggestionIds).toEqual([]);
    const rows = await db.select().from(s.suggestions).where(eq(s.suggestions.runId, run.id));
    expect(rows).toEqual([]);
  });
});

// T-273 — mandatory flagging at the point of use. The flag is CODE, not a
// prompt instruction, which is the only way "mandatory" is a property rather
// than a hope: the model is never asked to remember it.
async function openCiteStep() {
  const run = await openRun(db, {
    conversationId: adHocConversationId,
    agentId: 'infora.grounded_draft',
    agentProvenance: 'infora',
    request: 'q',
    environmentKey: projectId,
    requesterParticipantId: participantId,
  });
  const step = await openStep(db, { runId: run.id, type: 'cite' });
  return { run, stepId: step.id };
}

describe('a superseded source is flagged in the prose (T-273)', () => {
  const retrieved = (superseded: boolean): AssembledInput => ({
    items: [
      {
        channel: 'grounded' as const,
        corpus: 'library' as const,
        source: { versionId },
        chunkId: 'chunk-1',
        descriptor: {
          documentReference: 'WA-GEO-GIR-004',
          documentTitle: null,
          versionReference: 'P01',
          superseded,
        },
        content: 'the passage',
      },
    ],
    budget: { tokenLimit: 12000, tokensUsed: 0 },
  });

  // built per test, not at describe time: `versionId` is set in beforeAll
  const claim = () => ({
    text: 'Three pits exceeded the threshold.',
    sourceRef: { versionId },
  });

  it('marks the sentence itself, not only the manifest', async () => {
    const { run, stepId } = await openCiteStep();
    const result = await createCiteLeaf()(
      { db, run, stepId },
      {
        checked: { surviving: [claim()], withheld: [] },
        retrieved: retrieved(true),
        sandboxDocumentId: null,
      },
    );
    // in the prose, inside the sentence, before its full stop — a footer is
    // read after the sentence has already been believed
    expect(result.output.answer).toBe(
      'Three pits exceeded the threshold (from a superseded document).',
    );
  });

  it('leaves a current source alone — a mark on everything makes the mark invisible', async () => {
    const { run, stepId } = await openCiteStep();
    const result = await createCiteLeaf()(
      { db, run, stepId },
      {
        checked: { surviving: [claim()], withheld: [] },
        retrieved: retrieved(false),
        sandboxDocumentId: null,
      },
    );
    expect(result.output.answer).toBe('Three pits exceeded the threshold.');
  });

  // the flag travels with the claim into the citation's own span, so a written
  // answer cannot lose it
  it('the citation span covers the flagged text, not the unflagged text', async () => {
    const { run, stepId } = await openCiteStep();
    const result = await createCiteLeaf()(
      { db, run, stepId },
      {
        checked: { surviving: [claim()], withheld: [] },
        retrieved: retrieved(true),
        sandboxDocumentId: null,
      },
    );
    const [citation] = await db.select().from(s.citations).where(eq(s.citations.stepId, stepId));
    const span = citation!.claimSpan as { start: number; end: number };
    expect(result.output.answer!.slice(span.start, span.end)).toContain('(from a superseded document)');
  });
});
