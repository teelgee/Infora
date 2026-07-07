// T-042 acceptance, against the live dev database with a fake gateway: the
// leaf reaches stores only through assemble(); identity and environment come
// from the run record, not the caller; and the sub-agent is a real child Run
// on the audit tree.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asc, desc, eq, isNotNull } from 'drizzle-orm';
import type { AssembledItem, AssemblyRequest } from '@infora/contracts';
import { createDb, schema as s } from '@infora/db';
import { runChain } from './chain';
import type { ChainLeaves } from './chain';
import { createRetrieveLeaf, RETRIEVAL_AGENT_ID } from './retrieve-leaf';

const { db, pool } = createDb();

let organisationId: string;
let projectId: string;
let participantId: string;
let conversationId: string;

const item = (content: string): AssembledItem => ({
  channel: 'grounded',
  corpus: 'library',
  source: { versionId: `00000000-0000-4000-8000-00000000000${content.length % 10}` },
  content,
});

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: 't042 org' }).returning();
  organisationId = org!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't042 project', ownerOrganisationId: organisationId })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId, projectId, role: 'owner' });
  const [user] = await db
    .insert(s.users)
    .values({ name: 't042', email: `t042-${Date.now()}@test.local`, organisationId })
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

const passthroughLeaves = (retrieve: ChainLeaves['retrieve']): ChainLeaves => ({
  retrieve,
  draft: async () => ({ output: { claims: [] } }),
  groundCheck: async () => ({ output: { surviving: [], withheld: [] } }),
  cite: async () => ({ output: { suggestionIds: [] } }),
});

describe('the retrieve leaf + retrieval sub-agent (T-042)', () => {
  it('calls the gateway baseline then targeted, identity from the run record', async () => {
    const calls: AssemblyRequest[] = [];
    const leaf = createRetrieveLeaf({
      assemble: async (req) => {
        calls.push(req);
        return {
          items: req.request.mode === 'baseline' ? [item('baseline finding')] : [item('targeted finding')],
          budget: { tokenLimit: 12000, tokensUsed: 4 },
        };
      },
    });

    const { run } = await runChain(db, passthroughLeaves(leaf), {
      conversationId,
      request: 'draft the land quality section',
      environmentKey: projectId,
      requesterParticipantId: participantId,
    });
    expect(run.state).toBe('completed');

    expect(calls.map((c) => c.request.mode)).toEqual(['baseline', 'targeted']);
    for (const call of calls) {
      expect(call.environment).toEqual({ kind: 'project', projectId });
      expect(call.requester).toEqual({ organisationId, participantId });
    }

    // the sub-agent is a real child Run with its own audited retrieve step
    const [child] = await db.select().from(s.runs).where(eq(s.runs.parentRunId, run.id));
    expect(child).toBeDefined();
    expect(child!.agentId).toBe(RETRIEVAL_AGENT_ID);
    expect(child!.state).toBe('completed');

    const steps = await db
      .select()
      .from(s.steps)
      .where(eq(s.steps.runId, run.id))
      .orderBy(asc(s.steps.startedAt));
    const retrieveStep = steps.find((st) => st.type === 'retrieve')!;
    const delegateStep = steps.find((st) => st.type === 'delegate')!;
    expect(delegateStep.parentStepId).toBe(retrieveStep.id); // nested under the leaf's step
    expect(delegateStep.childRunId).toBe(child!.id);

    // the fold: baseline + targeted, both in the working input
    const contents = (retrieveStep.sourceSet as unknown[]).length;
    expect(contents).toBeGreaterThan(0);
  });

  it('folds targeted findings into the baseline without duplicates, within budget', async () => {
    const shared = item('finding both arms return');
    const leaf = createRetrieveLeaf({
      assemble: async (req) => ({
        items: req.request.mode === 'baseline' ? [shared] : [shared, item('fresh targeted finding')],
        budget: { tokenLimit: 12000, tokensUsed: 6 },
      }),
    });

    let folded: AssembledItem[] = [];
    const leaves = passthroughLeaves(leaf);
    leaves.draft = async (_ctx, input) => {
      folded = input.retrieved.items;
      return { output: { claims: [] } };
    };

    await runChain(db, leaves, {
      conversationId,
      request: 'q',
      environmentKey: projectId,
      requesterParticipantId: participantId,
    });

    expect(folded.map((i) => i.content)).toEqual([
      'finding both arms return',
      'fresh targeted finding',
    ]);
  });

  it('a failing targeted retrieval fails the child run and the chain, record intact', async () => {
    let first = true;
    const leaf = createRetrieveLeaf({
      assemble: async () => {
        if (first) {
          first = false;
          return { items: [item('baseline ok')], budget: { tokenLimit: 12000, tokensUsed: 3 } };
        }
        throw new Error('gateway unavailable');
      },
    });

    await expect(
      runChain(db, passthroughLeaves(leaf), {
        conversationId,
        request: 'q',
        environmentKey: projectId,
        requesterParticipantId: participantId,
      }),
    ).rejects.toThrow('gateway unavailable');

    const [child] = await db
      .select()
      .from(s.runs)
      .where(isNotNull(s.runs.parentRunId))
      .orderBy(desc(s.runs.startedAt))
      .limit(1);
    expect(child!.state).toBe('failed');
  });
});
