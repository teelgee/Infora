// T-041 — the coded chain (ADR-0028 §5, ADR-0027 §6): retrieve → draft →
// ground-check → cite as a fixed code spine. The ordering and each step's
// executor are code, run the same way every time — no LLM decides the plan,
// which is what makes "every grounded answer is ground-checked and cited"
// provable. One thinking leaf (draft); the rest are doing. Leaves are typed
// seams bound by T-042–T-045; agentic freedom exists only *inside* a leaf
// (the retrieval sub-agent), never over the chain.
import type { AssembledInput, Id } from '@infora/contracts';
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

export type SourceRef = { versionId: Id } | { authorityRef: string };

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
  draft: Leaf<{ request: string; retrieved: AssembledInput; mode: ChainMode }, DraftOutput>; // thinking (T-043)
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
};

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
  // outcome (docs/build/ask/03 §3, §5 step 1).
  const plan = await openPlan(db, {
    runId: run.id,
    conversationId: input.conversationId,
    projectId: input.environmentKey,
    requesterParticipantId: input.requesterParticipantId,
    question: input.request,
    stages: CODED_CHAIN_PLAN,
  });
  await markPlanRunning(db, plan.id);

  const step = async <In, Out>(
    type: 'retrieve' | 'draft' | 'ground_check' | 'cite',
    leaf: Leaf<In, Out>,
    leafInput: In,
    auditFrom: (output: Out) => StepAudit = () => ({}),
  ): Promise<Out> => {
    const planStepId = plan.stepIds[CODED_CHAIN_PLAN.findIndex((s) => s.stepType === type)]!;
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
    { request: input.request, retrieved, mode },
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
    const key = JSON.stringify(item.source);
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(item.source);
  }
  return refs;
}
