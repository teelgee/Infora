// T-047 — the M3 acceptance test: the real chain (all four leaves), the real
// assembly gateway over the live dev database, a deterministic fake Router.
// Asserts the milestone's invariants in one place: same order every time;
// unsupported claims withheld; every surviving claim cites a live Version;
// the Run/Step tree complete and immutable with both defensibility fields
// populated; the sub-agent a real child Run.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { createDb, schema as s } from '@infora/db';
import { createAssembler } from '@infora/knowledge';
import { Router, SELF_HOSTED_UK } from '@infora/model';
import type { ChatAdapter, EmbeddingAdapter } from '@infora/model';
import { runChain } from './chain';
import type { ChainLeaves } from './chain';
import { createCiteLeaf } from './cite-leaf';
import { createDraftLeaf } from './draft-leaf';
import { createGroundCheckLeaf } from './ground-check-leaf';
import { createRetrieveLeaf } from './retrieve-leaf';

const { db, pool } = createDb();

// deterministic providers: the draft cites its first source, then asserts
// one unsupported figure the verifier must withhold
const DRAFT_REPLY =
  'The investigation recorded elevated PAH concentrations at three trial pits. [S1] ' +
  'Remediation will cost approximately £2m.';
const chat: ChatAdapter = {
  modelId: 'fake-chat',
  attributes: SELF_HOSTED_UK,
  chat: () =>
    Promise.resolve({
      text: DRAFT_REPLY,
      model: { id: 'fake-chat', version: 'fake-chat-1' },
      usage: { tokensPrompt: 800, tokensCompletion: 90 },
    }),
};
const embeddings: EmbeddingAdapter = {
  modelId: 'fake-embed',
  dimensions: 1024,
  attributes: SELF_HOSTED_UK,
  embed: (texts) =>
    Promise.resolve({
      embeddings: texts.map(() => {
        const v = new Array<number>(1024).fill(0);
        v[0] = 1;
        return v;
      }),
      model: { id: 'fake-embed', version: 'fake-1' },
    }),
};
const router = new Router(chat, embeddings);

const leaves: ChainLeaves = {
  retrieve: createRetrieveLeaf({ assemble: createAssembler({ db, router }) }),
  draft: createDraftLeaf(router),
  groundCheck: createGroundCheckLeaf(),
  cite: createCiteLeaf(),
};

let projectId: string;
let participantId: string;
let conversationId: string;
let sandboxDocumentId: string;
let liveVersionId: string;

beforeAll(async () => {
  const stamp = Date.now();
  const [org] = await db.insert(s.organisations).values({ name: 't047 org' }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't047 project', ownerOrganisationId: org!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId: org!.id, projectId, role: 'owner' });
  const [user] = await db
    .insert(s.users)
    .values({ name: 't047', email: `t047-${stamp}@test.local`, organisationId: org!.id })
    .returning();
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId })
    .returning();
  participantId = participant!.id;

  const [workItem] = await db
    .insert(s.workItems)
    .values({ projectId, type: 'document_production', title: 't047', status: 'in_production' })
    .returning();
  const [conversation] = await db
    .insert(s.conversations)
    .values({ projectId, surface: 'web', workItemId: workItem!.id })
    .returning();
  conversationId = conversation!.id;
  const [doc] = await db
    .insert(s.sandboxDocuments)
    .values({ projectId, organisationId: org!.id, title: 't047 draft', createdByParticipantId: participantId })
    .returning();
  sandboxDocumentId = doc!.id;

  // one live library document, indexed under the fake model; a superseded
  // version of the same container exists and must never be cited
  const [container] = await db
    .insert(s.containers)
    .values({ projectId, producingOrganisationId: org!.id, documentReference: `T47-GEO-GIR-${stamp}`, inLibrary: true })
    .returning();
  for (const v of [
    { ref: 'v1', current: false, content: 'Superseded: no exceedances were recorded.' },
    { ref: 'v2', current: true, content: 'Elevated PAH concentrations at three trial pits.' },
  ]) {
    const [version] = await db
      .insert(s.versions)
      .values({ containerId: container!.id, versionReference: v.ref, content: v.content, isCurrent: v.current })
      .returning();
    if (v.current) liveVersionId = version!.id;
    await db.insert(s.versionChunks).values({
      versionId: version!.id,
      chunkIndex: 0,
      content: v.content,
      embedding: (await embeddings.embed([v.content], 'document')).embeddings[0]!,
      embeddingModelId: 'fake-embed',
      embeddingModelVersion: 'fake-1',
    });
  }
});

afterAll(async () => {
  await pool.end();
});

const input = () => ({
  conversationId,
  request: 'Draft the contamination summary',
  environmentKey: projectId,
  requesterParticipantId: participantId,
  sandboxDocumentId,
});

describe('M3 acceptance (T-047)', () => {
  it('holds every milestone invariant across two identical runs', async () => {
    for (let round = 0; round < 2; round++) {
      const { run, suggestionIds } = await runChain(db, leaves, input());
      expect(run.state).toBe('completed');

      const steps = await db
        .select()
        .from(s.steps)
        .where(eq(s.steps.runId, run.id))
        .orderBy(asc(s.steps.startedAt));

      // 1 — the chain runs the same order every time
      expect(steps.map((st) => st.type)).toEqual([
        'retrieve',
        'delegate',
        'draft',
        'ground_check',
        'cite',
      ]);

      // 2 — the unsupported claim is withheld, recorded on rail_outcomes
      const groundCheck = steps.find((st) => st.type === 'ground_check')!;
      expect(groundCheck.railOutcomes).toEqual([
        { rail: 'grounding', outcome: 'withheld', detail: 'Remediation will cost approximately £2m.' },
      ]);

      // 3 — every surviving claim cites a live Version
      expect(suggestionIds).toHaveLength(1);
      const citations = await db
        .select({ versionId: s.citations.versionId, isCurrent: s.versions.isCurrent, state: s.containers.state })
        .from(s.citations)
        .innerJoin(s.versions, eq(s.citations.versionId, s.versions.id))
        .innerJoin(s.containers, eq(s.versions.containerId, s.containers.id))
        .where(eq(s.citations.suggestionId, suggestionIds[0]!));
      expect(citations.length).toBeGreaterThan(0);
      for (const citation of citations) {
        expect(citation.versionId).toBe(liveVersionId);
        expect(citation.isCurrent).toBe(true);
        expect(citation.state).toBe('live');
      }

      // 4 — the tree is complete with both defensibility fields populated…
      for (const step of steps) {
        expect(step.status).toBe('completed');
        expect(step.endedAt).not.toBeNull();
        expect(Array.isArray(step.sourceSet)).toBe(true);
        expect(Array.isArray(step.railOutcomes)).toBe(true);
      }
      expect(steps.find((st) => st.type === 'draft')!.sourceSet).toEqual([
        { versionId: liveVersionId },
      ]);
      expect(steps.find((st) => st.type === 'draft')!.modelId).toBe('fake-chat');

      // …and immutable: the record cannot be quietly rewritten
      await expect(
        db.update(s.runs).set({ state: 'failed' }).where(eq(s.runs.id, run.id)),
      ).rejects.toThrow();
      await expect(
        db.update(s.steps).set({ status: 'failed' }).where(eq(s.steps.id, steps[0]!.id)),
      ).rejects.toThrow();

      // 5 — the sub-agent appears as a real child Run
      const [child] = await db.select().from(s.runs).where(eq(s.runs.parentRunId, run.id));
      expect(child!.state).toBe('completed');
      expect(steps.find((st) => st.type === 'delegate')!.childRunId).toBe(child!.id);
      const childSteps = await db.select().from(s.steps).where(eq(s.steps.runId, child!.id));
      expect(childSteps.map((st) => st.type)).toEqual(['retrieve']);
    }
  }, 30000);
});
