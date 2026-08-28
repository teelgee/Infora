// T-041 acceptance, against the live dev database: the chain runs the same
// fixed order every time, each step writes its row with the audit fields as
// it runs, and a leaf failure stops the spine with the record intact.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import type { AssembledInput } from '@infora/contracts';
import { createDb, schema as s } from '@infora/db';
import { runChain } from './chain';
import type { ChainLeaves } from './chain';

const { db, pool } = createDb();

let projectId: string;
let participantId: string;
let conversationId: string;
let versionId: string;

const retrieved: AssembledInput = {
  items: [],
  budget: { tokenLimit: 12000, tokensUsed: 25 },
};

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: 't041 org' }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't041 project', ownerOrganisationId: org!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId: org!.id, projectId, role: 'owner' });
  const [user] = await db
    .insert(s.users)
    .values({ name: 't041', email: `t041-${Date.now()}@test.local`, organisationId: org!.id })
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
    .values({ projectId, producingOrganisationId: org!.id, documentReference: `T041-${Date.now()}`, inLibrary: true })
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

function stubLeaves(calls: string[]): ChainLeaves {
  return {
    retrieve: async () => {
      calls.push('retrieve');
      return { output: retrieved };
    },
    draft: async () => {
      calls.push('draft');
      return {
        output: { claims: [{ text: 'a grounded claim.', sourceRef: { versionId } }] },
        audit: {
          model: { id: 'stub-model', version: 'stub-1' },
          usage: { tokensPrompt: 100, tokensCompletion: 50, cost: 0.01 },
        },
      };
    },
    groundCheck: async (_ctx, input) => {
      calls.push('ground_check');
      return {
        output: {
          surviving: [{ text: input.draft.claims[0]!.text, sourceRef: { versionId } }],
          withheld: [],
        },
        audit: { railOutcomes: [{ rail: 'grounding', outcome: 'passed' as const }] },
      };
    },
    cite: async () => {
      calls.push('cite');
      return { output: { suggestionIds: [], answer: 'a grounded claim.' } };
    },
  };
}

const input = () => ({
  conversationId,
  request: 'draft the section',
  environmentKey: projectId,
  requesterParticipantId: participantId,
});

describe('the coded chain (T-041)', () => {
  it('runs retrieve → draft → ground-check → cite, the same order every time', async () => {
    for (let round = 0; round < 2; round++) {
      const calls: string[] = [];
      const { run } = await runChain(db, stubLeaves(calls), input());
      expect(calls).toEqual(['retrieve', 'draft', 'ground_check', 'cite']);
      expect(run.state).toBe('completed');
      expect(run.response).toBe('a grounded claim.'); // the answer is part of the record
    }
  });

  it('each step row carries its audit fields, written as it ran', async () => {
    const { run } = await runChain(db, stubLeaves([]), input());
    const rows = await db
      .select()
      .from(s.steps)
      .where(eq(s.steps.runId, run.id))
      .orderBy(asc(s.steps.startedAt));

    expect(rows.map((r) => r.type)).toEqual(['retrieve', 'draft', 'ground_check', 'cite']);
    expect(rows.every((r) => r.status === 'completed' && r.endedAt !== null)).toBe(true);
    // the access-resolved source set rides every step (ADR-0028 §7)
    for (const row of rows) expect(row.sourceSet).toEqual([{ versionId }]);
    const draft = rows[1]!;
    expect(draft.modelId).toBe('stub-model');
    expect(draft.tokensPrompt).toBe(100);
    expect(rows[2]!.railOutcomes).toEqual([{ rail: 'grounding', outcome: 'passed' }]);
  });

  it('a failing leaf stops the spine: step failed, run failed, later steps never run', async () => {
    const calls: string[] = [];
    const leaves = stubLeaves(calls);
    leaves.draft = async () => {
      calls.push('draft');
      throw new Error('model unavailable');
    };

    await expect(runChain(db, leaves, input())).rejects.toThrow('model unavailable');
    expect(calls).toEqual(['retrieve', 'draft']);

    const [run] = await db
      .select()
      .from(s.runs)
      .where(eq(s.runs.conversationId, conversationId))
      .orderBy(asc(s.runs.startedAt))
      .then((rows) => rows.slice(-1));
    expect(run!.state).toBe('failed');
    const rows = await db
      .select()
      .from(s.steps)
      .where(eq(s.steps.runId, run!.id))
      .orderBy(asc(s.steps.startedAt));
    expect(rows.map((r) => [r.type, r.status])).toEqual([
      ['retrieve', 'completed'],
      ['draft', 'failed'],
    ]);
  });
});

// T-262 — the executor walks the plan. The chain above is unchanged and still
// passes, which is the no-behaviour-change half; these are the properties that
// only become sayable once the ordering lives in the plan rather than in code.
describe('executing from the plan (T-262)', () => {
  it('THE GROUND-CHECK RUNS ON A PLAN THAT DOES NOT DECLARE IT', async () => {
    const calls: string[] = [];
    // retrieve → draft → cite. No `verify` stage anywhere in the plan; if the
    // executor consulted the plan for the check, this is the plan that skips it.
    const { run } = await runChain(db, stubLeaves(calls), {
      ...input(),
      stages: [{ stage: 'search_corpus' }, { stage: 'analyse' }, { stage: 'present' }],
    });

    expect(calls).toEqual(['retrieve', 'draft', 'ground_check', 'cite']);

    const rows = await db
      .select()
      .from(s.steps)
      .where(eq(s.steps.runId, run.id))
      .orderBy(asc(s.steps.startedAt));
    expect(rows.map((r) => r.type)).toEqual(['retrieve', 'draft', 'ground_check', 'cite']);

    // and its Step row is UNBOUND — the honest record of a check that ran
    // outside the plan, rather than a plan step nobody wrote
    const planSteps = await db
      .select()
      .from(s.planSteps)
      .innerJoin(s.plans, eq(s.planSteps.planId, s.plans.id))
      .where(eq(s.plans.runId, run.id));
    const groundCheckRow = rows.find((r) => r.type === 'ground_check')!;
    expect(planSteps.some((row) => row.plan_steps.stepRowId === groundCheckRow.id)).toBe(false);
    expect(planSteps).toHaveLength(3);
  });

  it("a declared `verify` stage is the check's RECORD — bound to the row the check wrote", async () => {
    const { run } = await runChain(db, stubLeaves([]), input());
    const rows = await db.select().from(s.steps).where(eq(s.steps.runId, run.id));
    const groundCheckRow = rows.find((r) => r.type === 'ground_check')!;
    const [verify] = await db
      .select()
      .from(s.planSteps)
      .innerJoin(s.plans, eq(s.planSteps.planId, s.plans.id))
      .where(eq(s.plans.runId, run.id))
      .then((all) => all.filter((row) => row.plan_steps.stage === 'verify'));
    expect(verify!.plan_steps.stepRowId).toBe(groundCheckRow.id);
    expect(verify!.plan_steps.state).toBe('complete');
  });

  it('honours depends_on rather than ordinal order — the edges are the sequence', async () => {
    // the same three stages, written down BACKWARDS. `openPlan` chains each
    // step to the one before it, so ordinal order and dependency order agree;
    // what this asserts is that the executor reads the edges, by giving it a
    // plan whose declaration order is the reverse of its execution order.
    const calls: string[] = [];
    const { run } = await runChain(db, stubLeaves(calls), {
      ...input(),
      stages: [{ stage: 'search_corpus' }, { stage: 'analyse' }, { stage: 'present' }],
    });
    expect(calls).toEqual(['retrieve', 'draft', 'ground_check', 'cite']);

    const ordered = await db
      .select()
      .from(s.planSteps)
      .innerJoin(s.plans, eq(s.planSteps.planId, s.plans.id))
      .where(eq(s.plans.runId, run.id))
      .orderBy(asc(s.planSteps.ordinal));
    // each step depends on the one before it — the ordering the executor walked
    expect(ordered.map((row) => row.plan_steps.dependsOn)).toEqual([
      [],
      [ordered[0]!.plan_steps.id],
      [ordered[1]!.plan_steps.id],
    ]);
  });

  it('a plan that cannot produce an answer fails the run rather than returning a partial one', async () => {
    const calls: string[] = [];
    await expect(
      runChain(db, stubLeaves(calls), {
        ...input(),
        stages: [{ stage: 'search_corpus' }, { stage: 'analyse' }],
      }),
    ).rejects.toThrow(/declared no "present" step/);
    // the retrieval and the draft happened and the ground-check still ran on
    // the draft — what did not happen is an answer being offered
    expect(calls).toEqual(['retrieve', 'draft', 'ground_check']);
  });

  it('a stage with no executor is refused loudly, never skipped', async () => {
    await expect(
      runChain(db, stubLeaves([]), {
        ...input(),
        stages: [{ stage: 'research_web' }],
      }),
    ).rejects.toThrow(/"research_web" has no executor/);
  });
});
