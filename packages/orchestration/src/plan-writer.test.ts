// T-260 acceptance, against the live dev database: every run the chain drives
// writes a plan, its steps correspond 1:1 to the run's own top-level Step
// rows, and the plan is immutable from `ready`.
//
// The behaviour half of the acceptance — that this changes nothing observable
// — is proved where it can be: the eval smoke set (evals/, T-255), whose
// PERM-02 result is pinned response-by-citation and re-run here on every
// build, and the pre-existing chain suites, which are untouched.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asc, eq, isNull, and } from 'drizzle-orm';
import type { AssembledInput } from '@infora/contracts';
import { createDb, schema as s } from '@infora/db';
import { runChain } from './chain';
import type { ChainLeaves } from './chain';
import { CODED_CHAIN_PLAN, readPlanForRun } from './plan-writer';

const { db, pool } = createDb();

let projectId: string;
let participantId: string;
let conversationId: string;
let versionId: string;

const retrieved: AssembledInput = { items: [], budget: { tokenLimit: 12000, tokensUsed: 25 } };

beforeAll(async () => {
  const stamp = Date.now();
  const [org] = await db.insert(s.organisations).values({ name: `t260 org ${stamp}` }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t260 project ${stamp}`, ownerOrganisationId: org!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId: org!.id, projectId, role: 'owner' });
  const [user] = await db
    .insert(s.users)
    .values({ name: 't260', email: `t260-${stamp}@test.local`, organisationId: org!.id })
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
    .values({ projectId, producingOrganisationId: org!.id, documentReference: `T260-${stamp}`, inLibrary: true })
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

function stubLeaves(): ChainLeaves {
  return {
    retrieve: async () => ({ output: retrieved }),
    draft: async () => ({
      output: { claims: [{ text: 'a grounded claim.', sourceRef: { versionId } }] },
    }),
    groundCheck: async (_ctx, input) => ({
      output: {
        surviving: [{ text: input.draft.claims[0]!.text, sourceRef: { versionId } }],
        withheld: [],
      },
    }),
    cite: async () => ({ output: { suggestionIds: [], answer: 'a grounded claim.' } }),
  };
}

const input = () => ({
  conversationId,
  request: 'draft the section',
  environmentKey: projectId,
  requesterParticipantId: participantId,
});

describe('the plan artefact (T-260)', () => {
  it('writes a plan for the run, sealed and complete, naming the chain as declared', async () => {
    const { run } = await runChain(db, stubLeaves(), input());
    const plan = (await readPlanForRun(db, run.id))!;

    expect(plan.runId).toBe(run.id);
    expect(plan.conversationId).toBe(conversationId);
    expect(plan.projectId).toBe(projectId); // the assembly environment (ADR-0025)
    expect(plan.requesterParticipantId).toBe(participantId);
    expect(plan.question).toBe('draft the section');
    expect(plan.state).toBe('complete');
    // the coded chain is pre-declared and repeatable; the DAG that declares it
    // formally is T-265, and the Lens does not exist until T-281 — both are
    // recorded as absent rather than invented
    expect(plan.mode).toBe('declared');
    expect(plan.workflowId).toBeNull();
    expect(plan.lensId).toBeNull();
    expect(plan.restatement).toBeNull();
    expect(plan.supersededByPlanId).toBeNull();
  });

  it('its steps correspond 1:1 to the run\'s top-level Step rows, in order', async () => {
    const { run } = await runChain(db, stubLeaves(), input());
    const plan = (await readPlanForRun(db, run.id))!;
    const stepRows = await db
      .select()
      .from(s.steps)
      // the delegate step hangs BENEATH the retrieve step (parent_step_id), so
      // it is part of that step's execution, not a step of the plan
      .where(and(eq(s.steps.runId, run.id), isNull(s.steps.parentStepId)))
      .orderBy(asc(s.steps.startedAt));

    expect(plan.steps).toHaveLength(stepRows.length);
    expect(plan.steps.map((step) => step.stage)).toEqual(CODED_CHAIN_PLAN.map((s) => s.stage));
    expect(plan.steps.map((step) => step.stepRowId)).toEqual(stepRows.map((row) => row.id));
    expect(plan.steps.every((step) => step.state === 'complete')).toBe(true);
    // no step declares a worker yet (T-269), and none may ever declare a scope
    expect(plan.steps.every((step) => step.worker === null)).toBe(true);
    expect(plan.steps.every((step) => !('scope' in step))).toBe(true);
  });

  it('states the sequence as edges, not as an implicit ordinal order', async () => {
    const { run } = await runChain(db, stubLeaves(), input());
    const plan = (await readPlanForRun(db, run.id))!;

    expect(plan.steps[0]!.dependsOn).toEqual([]);
    for (const [ordinal, step] of plan.steps.entries()) {
      if (ordinal === 0) continue;
      expect(step.dependsOn).toEqual([plan.steps[ordinal - 1]!.id]);
    }
  });

  // The stored integrity — immutability from `ready`, the CHECKs and the
  // one-plan-per-run index — is enforced by the database and tested there,
  // beside the T-008 append-only suite: packages/db/src/plan-artefact.test.ts.

  it('a failed run leaves a failed plan, the failing step marked and its dependants SKIPPED', async () => {
    const leaves = stubLeaves();
    leaves.draft = async () => {
      throw new Error('model unavailable');
    };
    await expect(runChain(db, leaves, input())).rejects.toThrow('model unavailable');

    const [run] = await db
      .select()
      .from(s.runs)
      .where(eq(s.runs.conversationId, conversationId))
      .orderBy(asc(s.runs.startedAt))
      .then((rows) => rows.slice(-1));
    const plan = (await readPlanForRun(db, run!.id))!;

    expect(plan.state).toBe('failed');
    // T-268 changed the last two from `pending` to `skipped`, and the change is
    // the point: `pending` reads as "not reached yet", which is a claim about a
    // run that has finished. `skipped` says what actually happened — nothing
    // went wrong with them and they did not run, because what they depended on
    // failed. Neither is ever shown as having run.
    expect(plan.steps.map((step) => step.state)).toEqual([
      'complete', // search_corpus
      'failed', // analyse
      'skipped', // verify — depended on the draft that failed
      'skipped', // present
    ]);
  });

  // A sub-agent's child Run carries no plan of its own: it executes inside a
  // step of its parent's plan, and a delegation is not a request. The stub
  // leaves here do not delegate, so a child run is opened directly.
  it('a sub-agent child run carries no plan of its own — a delegation is not a request', async () => {
    const { run } = await runChain(db, stubLeaves(), input());
    const [child] = await db
      .insert(s.runs)
      .values({
        conversationId,
        parentRunId: run.id,
        agentId: 'infora.retrieval',
        agentProvenance: 'infora',
        request: 'a delegated sub-question',
        environmentKey: projectId,
        requesterParticipantId: participantId,
      })
      .returning();
    expect(await readPlanForRun(db, child!.id)).toBeNull();
  });

});
