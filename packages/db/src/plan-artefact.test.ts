// T-260 acceptance at the DB layer (migration 0035), beside the T-008
// append-only suite it extends: a plan is IMMUTABLE FROM `ready` rather than
// from insertion — a draft plan is mutable while it is being clarified, and
// what it SAYS freezes when it becomes ready, leaving only what it DID to be
// written. A plan is evidence: "what did your AI do" must survive the user
// editing it afterwards.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb } from './client.js';
import * as s from './schema/index.js';

const { db, pool } = createDb();

// drizzle wraps PG errors (DrizzleQueryError); the trigger text is on .cause
async function expectDbError(promise: Promise<unknown>, pattern: RegExp) {
  const error = await promise.then(
    () => {
      throw new Error('expected the statement to be rejected');
    },
    (e: unknown) => e as Error & { cause?: Error },
  );
  expect(`${error.message} ${error.cause?.message ?? ''}`).toMatch(pattern);
}

let projectId: string;
let participantId: string;
let conversationId: string;

async function newRun(): Promise<string> {
  const [run] = await db
    .insert(s.runs)
    .values({
      conversationId,
      agentId: 'infora.grounded_draft',
      agentProvenance: 'infora',
      request: 'a question',
      environmentKey: projectId,
      requesterParticipantId: participantId,
    })
    .returning();
  return run!.id;
}

async function newPlan(
  values: Partial<typeof s.plans.$inferInsert> = {},
): Promise<typeof s.plans.$inferSelect> {
  const [plan] = await db
    .insert(s.plans)
    .values({
      runId: await newRun(),
      conversationId,
      projectId,
      requesterParticipantId: participantId,
      mode: 'declared',
      question: 'a question',
      ...values,
    })
    .returning();
  return plan!;
}

beforeAll(async () => {
  const stamp = Date.now();
  const [org] = await db.insert(s.organisations).values({ name: `t260db org ${stamp}` }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t260db project ${stamp}`, ownerOrganisationId: org!.id })
    .returning();
  projectId = project!.id;
  const [user] = await db
    .insert(s.users)
    .values({ name: 't260db', email: `t260db-${stamp}@test.local`, organisationId: org!.id })
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

describe('the plan artefact (T-260, migration 0035)', () => {
  it('a draft plan is still mutable — clarification happens here', async () => {
    const plan = await newPlan();
    const [step] = await db
      .insert(s.planSteps)
      .values({ planId: plan.id, ordinal: 0, stage: 'search_corpus' })
      .returning();

    await db.update(s.plans).set({ question: 'a clarified question' }).where(eq(s.plans.id, plan.id));
    await db.update(s.planSteps).set({ stage: 'analyse' }).where(eq(s.planSteps.id, step!.id));
    await db.delete(s.planSteps).where(eq(s.planSteps.id, step!.id));

    const [after] = await db.select().from(s.plans).where(eq(s.plans.id, plan.id));
    expect(after!.question).toBe('a clarified question');
  });

  it('freezes what the plan says once it is ready, and only then', async () => {
    const plan = await newPlan();
    await db.update(s.plans).set({ state: 'ready' }).where(eq(s.plans.id, plan.id));

    await expectDbError(
      db.update(s.plans).set({ question: 'a different question' }).where(eq(s.plans.id, plan.id)),
      /immutable from ready/,
    );
    await expectDbError(
      db.update(s.plans).set({ mode: 'model_chosen' }).where(eq(s.plans.id, plan.id)),
      /immutable from ready/,
    );
    await expectDbError(
      db.update(s.plans).set({ lensId: 'planning-environmental' }).where(eq(s.plans.id, plan.id)),
      /immutable from ready/,
    );

    // …while the execution columns stay writable: this is what a run records
    await db.update(s.plans).set({ state: 'running' }).where(eq(s.plans.id, plan.id));
    await db.update(s.plans).set({ state: 'complete' }).where(eq(s.plans.id, plan.id));
  });

  it('leaving draft is one-way, and a plan is never deleted', async () => {
    const plan = await newPlan();
    await db.update(s.plans).set({ state: 'ready' }).where(eq(s.plans.id, plan.id));

    await expectDbError(
      db.update(s.plans).set({ state: 'draft' }).where(eq(s.plans.id, plan.id)),
      /one-way/,
    );
    await expectDbError(db.delete(s.plans).where(eq(s.plans.id, plan.id)), /DELETE rejected/);
  });

  it("freezes a step's declaration but not its execution", async () => {
    const plan = await newPlan();
    const [step] = await db
      .insert(s.planSteps)
      .values({ planId: plan.id, ordinal: 0, stage: 'search_corpus' })
      .returning();
    await db.update(s.plans).set({ state: 'ready' }).where(eq(s.plans.id, plan.id));

    // frozen: otherwise "the plan is what ran" could be made true after the
    // fact, by rewriting the plan to match the outcome
    await expectDbError(
      db.update(s.planSteps).set({ stage: 'research_web' }).where(eq(s.planSteps.id, step!.id)),
      /immutable from ready/,
    );
    await expectDbError(
      db.update(s.planSteps).set({ worker: 'web_research' }).where(eq(s.planSteps.id, step!.id)),
      /immutable from ready/,
    );
    await expectDbError(
      db.delete(s.planSteps).where(eq(s.planSteps.id, step!.id)),
      /DELETE rejected/,
    );

    // written as it runs
    const stepRow = await db
      .insert(s.steps)
      .values({ runId: plan.runId, type: 'retrieve' })
      .returning();
    await db
      .update(s.planSteps)
      .set({ state: 'complete', stepRowId: stepRow[0]!.id })
      .where(eq(s.planSteps.id, step!.id));
  });

  it('one plan per run', async () => {
    const plan = await newPlan();
    await expectDbError(
      db.insert(s.plans).values({
        runId: plan.runId,
        conversationId,
        projectId,
        requesterParticipantId: participantId,
        mode: 'declared',
        question: 'a second plan on one run',
      }),
      /plans_run_unique/,
    );
  });

  it('a model-chosen plan may never name a workflow', async () => {
    // a hand-edited plan is no longer the declared workflow, and labelling it
    // as one would be a lie (docs/ask/03 §3.4)
    await expectDbError(
      newPlan({ mode: 'model_chosen', workflowId: 'project-question', workflowVersion: 1 }),
      /plans_model_chosen_names_no_workflow/,
    );
    // the converse is legal, and is what the coded chain writes until T-265
    const declared = await newPlan({ mode: 'declared' });
    expect(declared.workflowId).toBeNull();
  });

  it('a superseded plan names its successor, and only a superseded plan does', async () => {
    const original = await newPlan();
    const successor = await newPlan();
    await db.update(s.plans).set({ state: 'ready' }).where(eq(s.plans.id, original.id));

    await expectDbError(
      db.update(s.plans).set({ state: 'superseded' }).where(eq(s.plans.id, original.id)),
      /plans_superseded_names_successor/,
    );
    await expectDbError(
      db.update(s.plans).set({ supersededByPlanId: successor.id }).where(eq(s.plans.id, original.id)),
      /plans_superseded_names_successor/,
    );
    await db
      .update(s.plans)
      .set({ state: 'superseded', supersededByPlanId: successor.id })
      .where(eq(s.plans.id, original.id));
  });
});
