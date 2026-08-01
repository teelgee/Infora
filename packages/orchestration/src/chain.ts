// T-041 — the coded chain (ADR-0028 §5, ADR-0027 §6): retrieve → draft →
// ground-check → cite as a fixed code spine. The ordering and each step's
// executor are code, run the same way every time — no LLM decides the plan,
// which is what makes "every grounded answer is ground-checked and cited"
// provable. One thinking leaf (draft); the rest are doing. Leaves are typed
// seams bound by T-042–T-045; agentic freedom exists only *inside* a leaf
// (the retrieval sub-agent), never over the chain.
import type { AssembledInput, Id, Lens } from '@infora/contracts';
import type { Db } from '@infora/db';
import {
  CODED_CHAIN_PLAN,
  finishPlan,
  finishPlanStep,
  markPlanRunning,
  openPlan,
  startPlanStep,
} from './plan-writer';
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
 */
export async function runChain(
  db: Db,
  leaves: ChainLeaves,
  input: ChainInput,
): Promise<{ run: RunRow; suggestionIds: Id[] }> {
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
    stages: CODED_CHAIN_PLAN,
    // the evidence half (T-299): which Lens produced this answer, and which
    // version of it, recorded on the plan before the draft step runs
    lens: input.lens ?? null,
  });
  await markPlanRunning(db, plan.id);

  const step = async <In, Out>(
    type: 'retrieve' | 'draft' | 'ground_check' | 'cite',
    leaf: Leaf<In, Out>,
    leafInput: In,
    auditFrom: (output: Out) => StepAudit = () => ({}),
  ): Promise<Out> => {
    const planStepId = plan.stepIds[CODED_CHAIN_PLAN.findIndex((s) => s.stepType === type)]!;

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
        await finishPlanStep(db, planStepId, 'skipped');
        await finishPlan(db, plan.id, 'failed');
        await finishRun(db, run.id, 'failed');
        throw new RunHalted(check.reason);
      }
    }

    const row = await openStep(db, { runId: run.id, type });
    await startPlanStep(db, planStepId, row.id);
    try {
      const { output, audit } = await leaf({ db, run, stepId: row.id }, leafInput);
      await finishStep(db, row.id, 'completed', { ...auditFrom(output), ...audit });
      await finishPlanStep(db, planStepId, 'complete');
      return output;
    } catch (error) {
      await finishStep(db, row.id, 'failed');
      await finishPlanStep(db, planStepId, 'failed');
      await finishPlan(db, plan.id, 'failed');
      await finishRun(db, run.id, 'failed');
      throw error;
    }
  };

  // every step records the access-resolved source set it saw (ADR-0028 §7):
  // the retrieve step what it admitted, every later step what it worked from
  const retrieved = await step('retrieve', leaves.retrieve, { request: input.request }, (out) => ({
    sourceSet: sourcesOf(out),
  }));
  const sourceSet = sourcesOf(retrieved);
  const withSources = () => ({ sourceSet });

  const mode: ChainMode = input.sandboxDocumentId != null ? 'document' : 'chat';
  const draft = await step(
    'draft',
    leaves.draft,
    { request: input.request, retrieved, mode, lens: input.lens ?? null },
    withSources,
  );
  const checked = await step(
    'ground_check',
    leaves.groundCheck,
    { draft, retrieved, mode },
    withSources,
  );
  const cited = await step(
    'cite',
    leaves.cite,
    { checked, retrieved, sandboxDocumentId: input.sandboxDocumentId ?? null },
    withSources,
  );

  await finishPlan(db, plan.id, 'complete');
  const finished = await finishRun(db, run.id, 'completed', { response: cited.answer });
  return { run: finished, suggestionIds: cited.suggestionIds };
}

export function sourcesOf(retrieved: AssembledInput): SourceRef[] {
  const seen = new Set<string>();
  const refs: SourceRef[] = [];
  for (const item of retrieved.items) {
    if (item.channel !== 'grounded') continue; // only grounded sources back claims (ADR-0021)
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
