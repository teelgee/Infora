// T-041 — the coded chain (ADR-0028 §5, ADR-0027 §6): retrieve → draft →
// ground-check → cite. One thinking leaf (draft); the rest are doing. Leaves
// are typed seams bound by T-042–T-045; agentic freedom exists only *inside* a
// leaf (the retrieval sub-agent), never over the chain.
//
// T-262 — THE ORDERING MOVED OUT OF THIS FILE AND INTO THE PLAN. It used to be
// four `await`s; it is now `depends_on` edges the executor below walks. Nothing
// about the running system changes — the coded chain writes the same four steps
// with the same edges (`CODED_CHAIN_PLAN`) and produces the same Step rows in
// the same order — but the executor stops being specific to that one sequence,
// which is what lets an edited plan (T-267) and a declared workflow's DAG
// (T-264/T-265) run through this same loop instead of a second one written to
// resemble it.
//
// ONE THING DELIBERATELY DID NOT MOVE. The **ground-check is not a plan step**.
// It runs as code, here, immediately after drafting, on every answer in both
// orchestration modes — a plan that omits it still gets it, and there is no
// value of `plan.steps` that turns it off. ADR-0027's amendment and ADR-0028 §5
// both rest on exactly this: what model-chosen mode costs is repeatability of
// the step sequence and NOTHING ELSE, and that sentence is only true while the
// guarantee sits outside the thing the planner chooses. The plan's `verify`
// step is the RECORD of the check, bound to the Step row the check wrote; it is
// never an instruction the executor consults. Asserted by `chain.test.ts`
// against a plan with no `verify` step at all.
import type {
  AssembledInput,
  Id,
  Lens,
  PlanMode,
  PlanStage,
  StepType,
  WorkerDeclaration,
  WorkflowLabelPropagation,
  WorkflowWrites,
} from '@infora/contracts';
import type { Db } from '@infora/db';
import {
  CODED_CHAIN_PLAN,
  finishPlan,
  finishPlanStep,
  markPlanRunning,
  openPlan,
  startPlanStep,
} from './plan-writer';
import { orderPlanSteps, PlanNotExecutable } from './plan-order';
import type { PlannedStep } from './plan-order';
import { finishRun, finishStep, openRun, openStep } from './run-writer';
import type { RunRow, StepAudit } from './run-writer';

export const CHAIN_AGENT_ID = 'infora.grounded_draft';

// T-253 — a recorded source carries the passage it was, where it had one: the
// Step row's source_set is the audit answer to "what did it see", and a
// version id answers that at document grain only (finding F5).
export type SourceRef = ({ versionId: Id } | { authorityRef: string }) & { chunkId?: Id };

// A claim is a draft sentence bound (or not) to the source it rests on; the
// claim→source markers are produced by the draft leaf for the verifier.
export type DraftClaim = { text: string; sourceRef?: SourceRef };
export type DraftOutput = { claims: DraftClaim[] };
// The chain's two modes (labelled-channels ruling, 2026-07-09): a
// document-targeted run drafts grounded-only; an untargeted chat run may
// keep model-knowledge claims, labelled open-world — never cited.
export type ChainMode = 'document' | 'chat';
export type GroundCheckOutput = {
  surviving: Array<{ text: string; sourceRef?: SourceRef }>; // no ref = labelled open-world
  withheld: DraftClaim[];
};
export type CiteOutput = {
  suggestionIds: Id[];
  answer: string | null; // the grounded, cited answer text — the run's response
};

export type LeafContext = {
  db: Db;
  run: RunRow; // the open run — the retrieval sub-agent opens child runs against it
  stepId: Id; // the executing step — a delegating leaf records it as the parent
};

// A leaf returns its output plus what the Step row must record (ADR-0028 §7).
export type Leaf<In, Out> = (ctx: LeafContext, input: In) => Promise<{ output: Out; audit?: StepAudit }>;

export type ChainLeaves = {
  retrieve: Leaf<{ request: string }, AssembledInput>; // doing — the gateway (T-042)
  // T-299 — the Lens rides the leaf's INPUT, not its construction: the draft
  // leaf is built once at app composition (`createDraftLeaf`), so a Lens bound
  // there could only ever be a deployment default, never this request's.
  draft: Leaf<
    { request: string; retrieved: AssembledInput; mode: ChainMode; lens: Lens | null },
    DraftOutput
  >; // thinking (T-043)
  groundCheck: Leaf<
    { draft: DraftOutput; retrieved: AssembledInput; mode: ChainMode },
    GroundCheckOutput
  >; // doing (T-044)
  cite: Leaf<
    { checked: GroundCheckOutput; retrieved: AssembledInput; sandboxDocumentId: Id | null },
    CiteOutput
  >; // doing (T-045)
};

/**
 * T-396 — A CAPABILITY, AS THE EXECUTOR SEES IT (ADR-0053 §7).
 *
 * `declaration` is the same `WorkerDeclaration` the registry holds — read for
 * one thing only, `writes`, which decides whether this capability may run at
 * all in this workflow. The executor never judges whether a capability is code
 * or a model call: ADR-0027 fixes that per capability at design time and the
 * declaration is where it is fixed.
 *
 * `run` has the leaf's own shape on purpose. A capability step is a Step row in
 * the same append-only tree as every other step, opened by the executor — which
 * is exactly why per-step COST starts working here and could not before: a cost
 * is recorded on a Step row, and until now nothing opened one for a worker.
 */
export type Capability = {
  declaration: WorkerDeclaration;
  run: (
    ctx: LeafContext,
    inputs: Record<string, unknown>,
  ) => Promise<{ output: unknown; audit?: StepAudit }>;
};

/**
 * The CLOSED registry of built capabilities. It is a lookup and nothing more:
 * it cannot invent a capability, and there is no shape in which a plan hands it
 * one — which is why the executor is a dispatcher rather than the generic
 * worker non-negotiable 8 forbids.
 */
export type CapabilityRegistry = { get(name: string): Capability | undefined };

/**
 * Why a plan naming a capability was refused, BEFORE anything ran.
 *
 * Three reasons and not one message, because they are three different events
 * and an operator reading the record needs to know which: a deployment that has
 * not built the thing, a requester who may not use it, and a workflow that
 * never declared it writes.
 *
 * `not_entitled` is **the entitlement refusal**, deliberately distinguished
 * from a generic error (ADR-0053 §7). It extends `PlanNotExecutable` so every
 * caller that already refuses an unrunnable plan keeps working unchanged.
 */
export class CapabilityRefused extends PlanNotExecutable {
  constructor(
    readonly reason: 'not_built' | 'not_entitled' | 'writes_undeclared',
    message: string,
  ) {
    super(message);
    this.name = 'CapabilityRefused';
  }
}

export type ChainInput = {
  conversationId: Id;
  request: string;
  environmentKey: string; // the project the run executes in (ADR-0025)
  requesterParticipantId: Id;
  sandboxDocumentId?: Id | null;
  // T-299 — resolved at the API boundary from the request's `lensId`, already
  // validated against the registry. Null is the honest value for a run that
  // named none; there is no default substituted here, because a Lens the user
  // did not ask for would be recorded on the plan as though they had.
  lens?: Lens | null;
  /**
   * T-252 — re-resolve the requester's entitlement BEFORE each step runs
   * (finding F4, half two).
   *
   * A run resolves its `EntitledSlice` once, at the API boundary. That is
   * exact for a request measured in seconds; a plan that fans out over
   * minutes (T-266 onward) is a different proposition, and "the access facts
   * held when this started" is not the same claim as "they hold now".
   *
   * THE CHAIN DOES NOT RESOLVE ITS OWN PERMISSIONS — component 2's rule. It
   * calls back to the boundary that already did, and does nothing with the
   * answer but stop. Nothing about the slice is passed IN or read here: this
   * seam can refuse a step and can never widen one, which is why it is a
   * predicate returning a reason rather than a slice.
   *
   * Absent means no re-check, which is exactly what the system did before
   * this ticket — so an existing caller keeps its old behaviour rather than
   * silently gaining a control it never asked for.
   */
  revalidate?: Revalidate;
  /**
   * T-262 — the stages this run's plan declares, defaulting to the coded
   * chain. Every caller passes nothing today, which is why this ticket changes
   * no behaviour; the declared workflow (T-265) and the classifier (T-266) are
   * its real callers.
   *
   * It exists now, one ticket early, because the guarantee this ticket is
   * about — **the ground-check runs whether or not the plan declares it** — is
   * not assertable against a plan the caller cannot vary. A guarantee tested
   * only against the one plan that happens to include the thing is not tested.
   */
  stages?: ReadonlyArray<{
    stage: PlanStage;
    worker?: string | null;
    inputs?: Record<string, unknown>;
    /**
     * T-396 — the declaring workflow's own step id, so `{{steps.x.output}}`
     * resolves between steps of one run. In memory for the walk only: a step
     * output is a value in flight, not a record.
     */
    key?: string | null;
  }>;
  /**
   * T-265 — the declared workflow these stages came from. Recorded on the plan
   * beside the stages themselves, so the evidence names the file and the
   * version rather than only the shape.
   */
  workflow?: {
    id: string;
    version: number;
    /**
     * T-396 — what the workflow declared it does to the record, and how the
     * label travels. The executor reads them to make **validator rule 4 bite**:
     * a capability that writes may run only inside a workflow that declared
     * both. Absent means a plan that came from no workflow, which declares
     * nothing and therefore may run no writing capability at all.
     */
    writes?: WorkflowWrites;
    labelPropagation?: WorkflowLabelPropagation;
  } | null;
  /**
   * T-396 — the closed registry of capabilities this deployment has BUILT.
   * Absent means this deployment executes none, and a plan naming one is
   * refused rather than silently running the orchestrator's own leaf — the
   * wrong answer nobody is told about that the interim validator guard existed
   * to prevent.
   */
  capabilities?: CapabilityRegistry;
  /**
   * T-396 — the capability names ASSEMBLED for this requester (T-269), by the
   * boundary that resolved their access. The chain does not resolve its own
   * permissions (component 2): it is handed the set and can only refuse
   * against it, never widen it.
   *
   * **Absent is empty, and that is the fail-safe direction.** A caller that
   * supplied no assembled set has performed no entitlement check, and a step
   * naming a capability is refused — rather than admitted because nobody said
   * otherwise.
   */
  entitledCapabilities?: readonly string[];
  /**
   * T-266 — the orchestration mode this run was classified into. Stored on the
   * plan, never derived, because the labelling requirement is hard: a user must
   * never be unable to tell which kind of answer they are holding.
   */
  mode?: PlanMode;
  /** T-266 — assumptions the answer opens with, never a footer. */
  assumptions?: string[];
};

/**
 * The re-check the API installs. `ok: false` stops the run at the NEXT step
 * boundary — never mid-step, because a step that has already called a model
 * has already spent the money and already seen the context, and pretending
 * otherwise would put a false claim in the audit record.
 */
export type Revalidate = () => Promise<{ ok: true } | { ok: false; reason: RevalidationFailure }>;

/**
 * Why a run stopped. Distinguished because they are genuinely different
 * events: a revoked session is an account act, a lost entitlement is a
 * project one, and an operator reading the record needs to know which.
 */
export type RevalidationFailure = 'session_ended' | 'entitlement_lost';

/** Thrown by the chain when a re-check refuses. Carries the reason to the API. */
export class RunHalted extends Error {
  constructor(readonly reason: RevalidationFailure) {
    super(`run halted before the next step: ${reason}`);
    this.name = 'RunHalted';
  }
}

/**
 * Runs the spine, writing each Step row with its audit fields as it runs.
 * A leaf failure finishes that step 'failed', the run 'failed', and stops
 * the chain; the record of what happened up to the failure stands.
 *
 * T-396 — `outputs` hands back what each CAPABILITY step returned, keyed on the
 * declaring workflow's step id. A tool's caller needs the worker's own typed
 * output (a manifest, a computed label, a list of unreachable sources) and
 * cannot read it off the Run record, which stores an answer and an audit rather
 * than a worker's return value. It is deliberately not persisted: a step output
 * is a value in flight, and the durable facts — cost, model, source set — are
 * already Step columns.
 */
export async function runChain(
  db: Db,
  leaves: ChainLeaves,
  input: ChainInput,
): Promise<{ run: RunRow; suggestionIds: Id[]; outputs: Record<string, unknown> }> {
  const run = await openRun(db, {
    conversationId: input.conversationId,
    agentId: CHAIN_AGENT_ID,
    agentProvenance: 'infora',
    request: input.request,
    environmentKey: input.environmentKey,
    requesterParticipantId: input.requesterParticipantId,
  });

  // T-260 — the plan artefact: the four steps are written down, in order, and
  // sealed BEFORE the first one runs, then each is bound to the Step row it
  // became. Behaviour is unchanged; the record gains the intention beside the
  // outcome (docs/build/plan.md — Slice Ask Wave 2 step 1).
  const plan = await openPlan(db, {
    runId: run.id,
    conversationId: input.conversationId,
    projectId: input.environmentKey,
    requesterParticipantId: input.requesterParticipantId,
    question: input.request,
    stages: input.stages ?? CODED_CHAIN_PLAN,
    workflow: input.workflow ?? null,
    ...(input.mode !== undefined && { mode: input.mode }),
    ...(input.assumptions !== undefined && { assumptions: input.assumptions }),
    // the evidence half (T-299): which Lens produced this answer, and which
    // version of it, recorded on the plan before the draft step runs
    lens: input.lens ?? null,
  });
  await markPlanRunning(db, plan.id);

  /**
   * One executed step: re-check, open the Step row, bind the plan step it
   * realises, run the leaf, record. `plannedStepId` is nullable because the
   * ground-check runs whether or not the plan named it — an unbound Step row is
   * the honest record of a check that ran outside the plan.
   */
  const step = async <In, Out>(
    // T-396 — widened from the four chain types to the whole Step vocabulary:
    // a capability invocation is a Step row of its own kind, which migration
    // 0055 fixed the words for a wave early.
    type: StepType,
    plannedStepId: Id | null,
    leaf: Leaf<In, Out>,
    leafInput: In,
    auditFrom: (output: Out) => StepAudit = () => ({}),
  ): Promise<{ ok: true; output: Out } | { ok: false; reason: string }> => {
    // T-252 — re-resolve BEFORE the step opens. Before, not after: a step that
    // has opened has already been recorded as attempted, and a step that has
    // run has already spent a model call and already seen the context. The
    // only honest place to stop is at the boundary between them.
    if (input.revalidate !== undefined) {
      const check = await input.revalidate();
      if (!check.ok) {
        // The plan step is `skipped`, not `failed`: nothing about it went
        // wrong, and it did not run. The RUN is failed, because the answer it
        // would have produced does not exist — an incomplete answer offered as
        // a complete one is the failure mode this whole slice exists to avoid.
        if (plannedStepId !== null) await finishPlanStep(db, plannedStepId, 'skipped');
        await finishPlan(db, plan.id, 'failed');
        await finishRun(db, run.id, 'failed');
        throw new RunHalted(check.reason);
      }
    }

    const row = await openStep(db, { runId: run.id, type });
    if (plannedStepId !== null) await startPlanStep(db, plannedStepId, row.id);
    try {
      const { output, audit } = await leaf({ db, run, stepId: row.id }, leafInput);
      await finishStep(db, row.id, 'completed', { ...auditFrom(output), ...audit });
      if (plannedStepId !== null) await finishPlanStep(db, plannedStepId, 'complete');
      return { ok: true, output };
    } catch (error) {
      // T-268 — a failed step no longer stops the run. The step and its plan
      // step are recorded failed and the WALK decides what that costs: its
      // dependants are skipped and independent branches carry on. The run's
      // outcome is settled at the end, once it is known whether anything
      // survived.
      await finishStep(db, row.id, 'failed');
      if (plannedStepId !== null) await finishPlanStep(db, plannedStepId, 'failed');
      return { ok: false, reason: reasonOf(error) };
    }
  };

  const fail = async (reason: string): Promise<never> => {
    await finishPlan(db, plan.id, 'failed');
    await finishRun(db, run.id, 'failed');
    throw new PlanNotExecutable(reason);
  };

  // T-396 — what each capability step produced, keyed by the DECLARING step's
  // id, so `{{steps.retrieve.output}}` on a later step resolves to the thing
  // the earlier one actually returned, and so a tool's caller can read its
  // worker's own typed output. In memory for the life of the walk.
  const outputs = new Map<string, unknown>();

  // ── the walk ──────────────────────────────────────────────────────────────
  let ordered: PlannedStep[];
  try {
    ordered = orderPlanSteps(plan.steps);
  } catch (error) {
    if (!(error instanceof PlanNotExecutable)) throw error;
    // Nothing has run. A plan that cannot be ordered is refused whole rather
    // than executed as far as it happens to be orderable, which would produce
    // an answer built from an analysis nobody wrote.
    return fail(error.message);
  }

  // A plan that can produce no answer at all is refused BEFORE anything runs
  // rather than after: that is a defect in the plan, not a failure during it,
  // and spending a retrieval and a model call to discover it would be paying
  // for the discovery. T-268's partial-failure semantics are about steps that
  // fail, and a step that was never declared did not fail.
  if (!ordered.some((planned) => planned.stage === 'present')) {
    return fail('the plan produced no answer — it declared no "present" step');
  }

  // ── T-396: THE THREE CAPABILITY GUARDS, ALL BEFORE ANY SPEND ──────────────
  //
  // Same reasoning as the refusal above, one ticket along: an unbuilt
  // capability, an unentitled one and a write nobody declared are all defects
  // in the PLAN. Discovering them half way through, with a retrieval and a
  // model call already paid for, would be paying to learn something knowable
  // for nothing — and, for the entitlement one, would mean a step had already
  // run on behalf of somebody not entitled to the next.
  const entitled = new Set(input.entitledCapabilities ?? []);
  const declaresWrites = input.workflow?.writes !== undefined && input.workflow.writes !== 'none';
  for (const planned of ordered) {
    if (planned.worker === null) continue;
    const capability = input.capabilities?.get(planned.worker);
    if (capability === undefined) {
      await finishPlan(db, plan.id, 'failed');
      await finishRun(db, run.id, 'failed');
      throw new CapabilityRefused(
        'not_built',
        `plan step "${planned.stage}" names the capability '${planned.worker}', which this deployment has not built. The executor dispatches over a closed registry and cannot invent one`,
      );
    }
    if (!entitled.has(planned.worker)) {
      // THE ENTITLEMENT REFUSAL, not a generic error (ADR-0053 §7). The set was
      // assembled for this requester (T-269) and a capability outside it is
      // absent, not disabled — so the message says the requester is not
      // entitled to it and does not enumerate what they could have had.
      await finishPlan(db, plan.id, 'failed');
      await finishRun(db, run.id, 'failed');
      throw new CapabilityRefused(
        'not_entitled',
        `plan step "${planned.stage}" names the capability '${planned.worker}', which this requester is not entitled to`,
      );
    }
    if (capability.declaration.writes && !declaresWrites) {
      // Validator rule 4, biting for the first time: a workflow that writes has
      // to have said so AND said how the label travels, and it is only now that
      // anything could actually write. A writing capability inside a workflow
      // declaring `writes: none` would put a document in a sandbox under a
      // recipe that promised it would not.
      await finishPlan(db, plan.id, 'failed');
      await finishRun(db, run.id, 'failed');
      throw new CapabilityRefused(
        'writes_undeclared',
        `plan step "${planned.stage}" names '${planned.worker}', which writes, but the workflow this plan came from declared \`writes: ${input.workflow?.writes ?? 'none'}\`. A capability that writes runs only inside a workflow that declared its write and its label-propagation behaviour`,
      );
    }
  }

  const mode: ChainMode = input.sandboxDocumentId != null ? 'document' : 'chat';
  // The `verify` step is the ground-check's RECORD, held aside before the walk
  // so it is never reached as an instruction. If the plan names none, the check
  // still runs and writes an unbound Step row.
  const verifyStep = ordered.find((planned) => planned.stage === 'verify') ?? null;

  let retrieved: AssembledInput | null = null;
  let sourceSet: SourceRef[] = [];
  let checked: GroundCheckOutput | null = null;
  let cited: CiteOutput | null = null;
  const withSources = () => ({ sourceSet });

  // T-268 — what failed, and what therefore did not run. Both are carried to
  // the end rather than thrown, because the run's outcome is not knowable until
  // the walk finishes: an answer may still survive a failure on a branch that
  // did not feed it.
  const failures: Array<{ stage: PlanStage; reason: string }> = [];
  const failed = new Set<Id>();

  for (const planned of ordered) {
    // a step whose dependencies did not run does not run either, and is
    // recorded `skipped` rather than `failed`: nothing about it went wrong
    if (planned.dependsOn.some((id) => failed.has(id))) {
      failed.add(planned.id);
      // `skipped`, not `failed` and not left `pending`: nothing about this step
      // went wrong, and it did not run. `pending` would read as "not reached
      // yet", which is a claim about a run that has finished.
      await finishPlanStep(db, planned.id, 'skipped');
      continue;
    }

    // ── T-396 — THE EXECUTOR RULE: THE STEP NAMES A CAPABILITY, IT RUNS ─────
    //
    // Before the stage switch, deliberately. Stage keeps exactly two jobs from
    // here: deciding what runs a step naming NO capability, and being the
    // vocabulary the plan and the completion footer are written in. It has lost
    // the job of choosing an executor for a step that named one — which is the
    // whole rule, and the reason the drafting stage used to run the draft leaf
    // whatever a step said.
    if (planned.worker !== null) {
      const capability = input.capabilities!.get(planned.worker)!;
      const ran = await step(
        planned.worker as StepType,
        planned.id,
        (ctx, inputs: Record<string, unknown>) => capability.run(ctx, inputs),
        resolveStepInputs(planned.inputs, outputs),
      );
      if (!ran.ok) {
        failed.add(planned.id);
        failures.push({ stage: planned.stage, reason: ran.reason });
        continue;
      }
      if (planned.key !== null) outputs.set(planned.key, ran.output);
      // A capability on the `present` stage IS the run's product — a built
      // document rather than a cited answer. `answer: null` is the honest value
      // and not a gap: the same shape a document-targeted chain run already
      // produces, where the deliverable is the document and not the prose.
      if (planned.stage === 'present') cited = { suggestionIds: [], answer: null };
      continue;
    }

    switch (planned.stage) {
      case 'verify':
        continue; // the record, not an instruction — see the ground-check below

      case 'search_corpus': {
        // every step records the access-resolved source set it saw
        // (ADR-0028 §7): the retrieve step what it admitted, every later step
        // what it worked from
        const result = await step(
          'retrieve',
          planned.id,
          leaves.retrieve,
          { request: input.request },
          (out) => ({ sourceSet: sourcesOf(out) }),
        );
        if (!result.ok) {
          failed.add(planned.id);
          failures.push({ stage: planned.stage, reason: result.reason });
          continue;
        }
        retrieved = result.output;
        sourceSet = sourcesOf(retrieved);
        continue;
      }

      case 'analyse': {
        if (retrieved === null) {
          // no retrieval reached this step. That is a plan defect when nothing
          // failed, and an already-reported outage when something did — so it
          // is only a refusal in the first case.
          if (failures.length > 0) {
            failed.add(planned.id);
            await finishPlanStep(db, planned.id, 'skipped');
            continue;
          }
          return fail('plan step "analyse" has nothing to draft from — no retrieval ran before it');
        }
        const drafted = await step(
          'draft',
          planned.id,
          leaves.draft,
          { request: input.request, retrieved, mode, lens: input.lens ?? null },
          withSources,
        );
        if (!drafted.ok) {
          failed.add(planned.id);
          failures.push({ stage: planned.stage, reason: drafted.reason });
          continue;
        }

        // ── THE GROUND-CHECK, OUTSIDE THE PLAN ────────────────────────────
        // Code, here, immediately after drafting, on every answer in both
        // orchestration modes. `verifyStep` supplies the plan step to bind
        // when the plan named one and `null` when it did not; either way the
        // check runs. There is no branch above this line that skips it — and
        // T-268 does not add one: a run with no draft has no ANSWER, so the
        // guarantee ("every answer is ground-checked") is untouched by the
        // check not running where there is nothing to check.
        const verified = await step(
          'ground_check',
          verifyStep?.id ?? null,
          leaves.groundCheck,
          { draft: drafted.output, retrieved, mode },
          withSources,
        );
        if (!verified.ok) {
          if (verifyStep !== null) failed.add(verifyStep.id);
          failures.push({ stage: 'verify', reason: verified.reason });
          continue;
        }
        checked = verified.output;
        continue;
      }

      case 'present': {
        if (retrieved === null || checked === null) {
          if (failures.length > 0) {
            failed.add(planned.id);
            await finishPlanStep(db, planned.id, 'skipped');
            continue;
          }
          return fail('plan step "present" has nothing to cite — no drafted, ground-checked claims reached it');
        }
        const presented = await step(
          'cite',
          planned.id,
          leaves.cite,
          { checked, retrieved, sandboxDocumentId: input.sandboxDocumentId ?? null },
          withSources,
        );
        if (!presented.ok) {
          failed.add(planned.id);
          failures.push({ stage: planned.stage, reason: presented.reason });
          continue;
        }
        cited = presented.output;
        continue;
      }

      default:
        // A stage with no executor is refused loudly. Only CODED_CHAIN_PLAN is
        // written today, so this cannot fire in the running system; it fires
        // the moment a workflow (T-265) or a classifier (T-266) writes a stage
        // ahead of the code that runs it, which is exactly when a silent skip
        // would be most expensive.
        return fail(`plan step "${planned.stage satisfies PlanStage}" has no executor`);
    }
  }

  // ── T-268: the outcome ────────────────────────────────────────────────────
  //
  // Three states, not two. `failed` where no answer survived — an incomplete
  // answer offered as a complete one is the failure this slice exists to avoid.
  // `completed_with_failures` where one did AND something did not run: reporting
  // that as `completed` hides it, and as `failed` throws away work the user can
  // act on.
  // `cited === null` and not `cited.answer === null`: a document-targeted run
  // legitimately produces suggestions and no answer text, and treating that as
  // "nothing survived" would fail every drafting run.
  if (cited === null) {
    await finishPlan(db, plan.id, 'failed');
    const finished = await finishRun(db, run.id, 'failed');
    if (failures.length > 0) throw new StepsFailed(failures);
    return { run: finished, suggestionIds: [], outputs: Object.fromEntries(outputs) };
  }

  if (failures.length === 0) {
    await finishPlan(db, plan.id, 'complete');
    const finished = await finishRun(db, run.id, 'completed', { response: cited.answer });
    return { run: finished, suggestionIds: cited.suggestionIds, outputs: Object.fromEntries(outputs) };
  }

  // **The answer body reports what did not run**, not only the footer. This is
  // absence detection (non-negotiable, Lens shared core 1.5) applied to the
  // system's OWN failures: an answer that silently omits the half a failed step
  // would have contributed reads as a complete answer, and a reader has no way
  // to know it is not. A footer would not do — it is read after the answer has
  // already been believed.
  const skipped = ordered.filter(
    (planned) => failed.has(planned.id) && !failures.some((f) => f.stage === planned.stage),
  );
  const answer = [
    cited.answer,
    '',
    `Not everything in this analysis ran. ${describeFailures(failures)}${
      skipped.length === 0
        ? ''
        : ` ${skipped.length === 1 ? 'One further step was' : `${skipped.length} further steps were`} skipped because ${skipped.length === 1 ? 'it depended' : 'they depended'} on what failed.`
    } Treat this answer as covering less than it was asked to.`,
  ].join('\n');

  await finishPlan(db, plan.id, 'complete');
  const finished = await finishRun(db, run.id, 'completed_with_failures', { response: answer });
  return { run: finished, suggestionIds: cited.suggestionIds, outputs: Object.fromEntries(outputs) };
}

/**
 * T-268 — thrown only where NOTHING survived. A partial answer returns
 * normally, because it is an answer; a run with none is a failure the caller
 * has to see as one.
 */
export class StepsFailed extends Error {
  constructor(readonly failures: ReadonlyArray<{ stage: PlanStage; reason: string }>) {
    super(`the run produced no answer: ${describeFailures(failures)}`);
    this.name = 'StepsFailed';
  }
}

/** Named in words, not codes: this text reaches the user in the answer body. */
function describeFailures(failures: ReadonlyArray<{ stage: PlanStage; reason: string }>): string {
  return failures
    .map((failure) => `The ${STAGE_NAMES[failure.stage]} step failed (${failure.reason}).`)
    .join(' ');
}

const STAGE_NAMES: Record<PlanStage, string> = {
  understand: 'understanding',
  load_context: 'context-loading',
  clarify: 'scoping',
  plan: 'planning',
  search_corpus: 'library search',
  check_authority: 'authority check',
  research_web: 'web research',
  analyse: 'analysis',
  verify: 'verification',
  present: 'citation',
};

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function sourcesOf(retrieved: AssembledInput): SourceRef[] {
  const seen = new Set<string>();
  const refs: SourceRef[] = [];
  for (const item of retrieved.items) {
    if (item.channel !== 'grounded') continue; // only grounded sources back claims (ADR-0021)
    // T-308 — and a guiding item has no `source` at all, which is the same
    // ruling stated as a type. Both are checked: the channel is the rule, the
    // absence is what makes a rule impossible to record as a source.
    if (item.source === undefined) continue;
    const ref: SourceRef =
      item.chunkId === undefined ? item.source : { ...item.source, chunkId: item.chunkId };
    // passage grain: two chunks of one version are two distinct sources seen
    const key = JSON.stringify(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(ref);
  }
  return refs;
}

/**
 * T-396 — `{{steps.x.output}}`, resolved at run time and nowhere else.
 *
 * `bindWorkflow` deliberately leaves these alone: step outputs do not exist
 * until the plan runs, and resolving them at bind time would mean inventing
 * them. A reference to a step that produced nothing resolves to `undefined`
 * rather than to the literal template — a capability handed the string
 * `"{{steps.retrieve.output}}"` would treat it as data, and the validator has
 * already refused a reference that could not resolve.
 */
export function resolveStepInputs(
  inputs: Record<string, unknown>,
  outputs: ReadonlyMap<string, unknown>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(inputs)) {
    if (typeof value !== 'string') {
      resolved[field] = value;
      continue;
    }
    const reference = /^\{\{\s*steps\.([A-Za-z0-9_#-]+)\.output\s*\}\}$/.exec(value);
    resolved[field] = reference === null ? value : outputOf(outputs, reference[1]!);
  }
  return resolved;
}

/**
 * T-336 — **a reference to a FANNED-OUT step resolves to the array of its
 * expansions' outputs.**
 *
 * `bindWorkflow` keys expansions `check#0`, `check#1`… so a step naming
 * `{{steps.check.output}}` would otherwise resolve to `undefined` — and the
 * checker's comparison step exists precisely to read what every section read
 * produced. Collecting them is the natural completion of the fan-out rather
 * than a new mechanism: the width was computed in code before the run, so the
 * array's length is the same number the plan already stated.
 *
 * The exact key wins where one exists, so nothing that references an ordinary
 * step changes. The expansions come back in **plan order**, because a
 * comparison over sections in an arbitrary order would produce a different
 * answer for the same document — the guarantee this whole path exists for.
 */
function outputOf(outputs: ReadonlyMap<string, unknown>, key: string): unknown {
  if (outputs.has(key)) return outputs.get(key);
  const prefix = `${key}#`;
  const expansions: unknown[] = [];
  for (const [name, output] of outputs) if (name.startsWith(prefix)) expansions.push(output);
  return expansions.length === 0 ? undefined : expansions;
}
