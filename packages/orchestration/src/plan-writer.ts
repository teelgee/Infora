// T-260 — the plan writer (docs/build/plan.md — Slice Ask Wave 2): every run records the analysis it
// performed, as a first-class artefact rather than as an inference from its
// Step rows.
//
// THIS TICKET CHANGES NO BEHAVIOUR, deliberately (03 §5, step 1). The chain
// still runs the same four steps in the same order; what is new is that the
// sequence is now written down before it runs and linked to the record it
// produced. T-262 makes the executor walk the plan instead of the hard-coded
// sequence — which is only safe to do once the plan provably describes what
// already happens.
//
// A sub-agent's child Run carries NO plan of its own: it executes inside a
// step of its parent's plan, and a delegation is not a request. The 1:1
// correspondence the acceptance names is therefore between a plan's steps and
// its run's TOP-LEVEL Step rows (the delegate step hangs beneath one of them,
// parent_step_id, and is part of that step's execution).
import { asc, eq } from 'drizzle-orm';
import type { Id, Lens, Plan, PlanStage, PlanStepState, StepType } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';

export type PlanRow = typeof s.plans.$inferSelect;
export type PlanStepRow = typeof s.planSteps.$inferSelect;

/**
 * The coded chain as a plan (ADR-0028 §5's fixed spine). One entry per step
 * the chain runs, mapped to the stage it occupies in the orchestration
 * vocabulary (03 §2) — the mapping the progress rail and the declared
 * workflow (T-265) will both read.
 *
 * The ground-check appears here as a RECORD of what ran, not as an instruction
 * the executor may decline: it stays code, outside any plan a planner could
 * edit, in both orchestration modes (03 §1.1, asserted at T-262).
 */
export const CODED_CHAIN_PLAN: ReadonlyArray<{ stepType: StepType; stage: PlanStage }> = [
  { stepType: 'retrieve', stage: 'search_corpus' },
  { stepType: 'draft', stage: 'analyse' },
  { stepType: 'ground_check', stage: 'verify' },
  { stepType: 'cite', stage: 'present' },
];

export type OpenPlanInput = {
  runId: Id;
  conversationId: Id;
  projectId: Id;
  requesterParticipantId: Id;
  question: string;
  stages: ReadonlyArray<{ stage: PlanStage }>;
  /** T-299 — the Lens this run was asked for, or null if it named none. */
  lens?: Lens | null;
};

/** The plan for a run: written `draft`, then sealed `ready` before execution. */
export type OpenedPlan = { id: Id; stepIds: Id[] };

export async function openPlan(db: Db, input: OpenPlanInput): Promise<OpenedPlan> {
  const [plan] = await db
    .insert(s.plans)
    .values({
      runId: input.runId,
      conversationId: input.conversationId,
      projectId: input.projectId,
      requesterParticipantId: input.requesterParticipantId,
      // The coded chain is pre-declared and repeatable — same inputs, same
      // steps, same order (03 §1). `workflow_id` stays null until T-265
      // declares it as a DAG in packages/workflows; a declared plan naming no
      // workflow is legal, a model-chosen one naming one is not (CHECK, 0035).
      mode: 'declared',
      // T-299 — the evidence half: the Lens the request named, and the
      // VERSION of it, so a register complaint against v1 is never read as one
      // about v3. Null stays the honest value for a run that named no Lens; a
      // default substituted here would put a Lens in the evidence that never
      // applied to the answer.
      lensId: input.lens?.id ?? null,
      lensVersion: input.lens?.version ?? null,
      question: input.question,
      // nothing restates the question until the classifier lands (T-266), and
      // echoing the question as its own restatement would be a fabrication
      restatement: null,
      assumptions: [],
    })
    .returning();

  // Inserted in order, each depending on the one before: the chain's sequence
  // stated as EDGES rather than left to ordinal order, because the executor at
  // T-262 walks depends_on and an implicit ordering would quietly become the
  // real one.
  const stepIds: Id[] = [];
  for (const [ordinal, stage] of input.stages.entries()) {
    const [step] = await db
      .insert(s.planSteps)
      .values({
        planId: plan!.id,
        ordinal,
        stage: stage.stage,
        worker: null, // the worker registry lands at T-269
        dependsOn: ordinal === 0 ? [] : [stepIds[ordinal - 1]!],
      })
      .returning();
    stepIds.push(step!.id as Id);
  }

  // sealed: from here the plan says what it says, and only what it DID may
  // still be written (trigger, migration 0035)
  await db.update(s.plans).set({ state: 'ready' }).where(eq(s.plans.id, plan!.id));

  return { id: plan!.id as Id, stepIds };
}

/** Bind a plan step to the append-only Step row it became, and mark it running. */
export async function startPlanStep(db: Db, planStepId: Id, stepRowId: Id): Promise<void> {
  await db
    .update(s.planSteps)
    .set({ state: 'running', stepRowId })
    .where(eq(s.planSteps.id, planStepId));
}

export async function finishPlanStep(
  db: Db,
  planStepId: Id,
  state: Extract<PlanStepState, 'complete' | 'failed' | 'skipped'>,
): Promise<void> {
  await db.update(s.planSteps).set({ state }).where(eq(s.planSteps.id, planStepId));
}

export async function markPlanRunning(db: Db, planId: Id): Promise<void> {
  await db.update(s.plans).set({ state: 'running' }).where(eq(s.plans.id, planId));
}

export async function finishPlan(
  db: Db,
  planId: Id,
  state: 'complete' | 'failed',
): Promise<void> {
  await db.update(s.plans).set({ state }).where(eq(s.plans.id, planId));
}

/**
 * The plan a run wrote, in contracts shape. A store read and nothing more —
 * it resolves no permissions, exactly like readRun; the API decides who may
 * ask (T-261, the producer-private scope the run read already carries).
 */
export async function readPlanForRun(db: Db, runId: Id): Promise<Plan | null> {
  const [plan] = await db.select().from(s.plans).where(eq(s.plans.runId, runId)).limit(1);
  if (!plan) return null;
  const steps = await db
    .select()
    .from(s.planSteps)
    .where(eq(s.planSteps.planId, plan.id))
    .orderBy(asc(s.planSteps.ordinal));
  return {
    id: plan.id,
    runId: plan.runId,
    conversationId: plan.conversationId,
    projectId: plan.projectId,
    requesterParticipantId: plan.requesterParticipantId,
    mode: plan.mode,
    workflowId: plan.workflowId,
    workflowVersion: plan.workflowVersion,
    lensId: plan.lensId,
    lensVersion: plan.lensVersion,
    state: plan.state,
    question: plan.question,
    restatement: plan.restatement,
    assumptions: plan.assumptions as string[],
    createdAt: plan.createdAt.toISOString(),
    supersededByPlanId: plan.supersededByPlanId,
    steps: steps.map((step) => ({
      id: step.id,
      ordinal: step.ordinal,
      stage: step.stage,
      worker: step.worker,
      inputs: step.inputs as Record<string, unknown>,
      dependsOn: step.dependsOn as Id[],
      state: step.state,
      stepRowId: step.stepRowId,
      outputRef: step.outputRef,
      editedByParticipantId: step.editedByParticipantId,
      editedAt: step.editedAt?.toISOString() ?? null,
    })),
  };
}

/**
 * T-261 — may this requester re-run the plan as themselves?
 *
 * Reading and re-running are deliberately different rights on the same record.
 * A colleague in the same organisation may read a plan — the run is
 * producer-private, and the producing organisation is the unit — but a re-run
 * is a NEW Run with a NEW requester, and the record has to say who asked. If a
 * reader could re-run "the plan", the audit trail would carry a run attributed
 * to the person whose question it was not.
 *
 * Pure, and it takes ids rather than rows: the API has already resolved the
 * slice and established the producing organisation by then, and this must not
 * become a second place that resolves permissions (component 2's rule).
 */
export function canRerunPlan(plan: { requesterParticipantId: Id }, requesterParticipantId: Id): boolean {
  return plan.requesterParticipantId === requesterParticipantId;
}
