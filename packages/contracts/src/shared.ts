// Contracts §2 — shared types (docs/build/contracts.md, first cut 2026-07-04,
// carrying the 2026-07-06 rulings: Run.request, suggestions[] per-item,
// Suggestion.kind/anchor, railOutcomes.detail).

export type Id = string; // uuid
export type Surface = 'web' | 'word_addin' | 'copilot'; // ADR-0031
// T-263 — the step vocabulary as a VALUE, with the type derived from it.
//
// It was a bare union and is now an array the union is read off, for one
// reason: a union cannot be compared to anything at run time, so "the contracts
// type and the database enum cannot drift" was a sentence rather than a check.
// With the list as data it is a test (`enum-drift.test.ts` in orchestration,
// the one package that sees both contracts and the schema).
//
// The first five are the coded chain and its delegation; the rest are the Wave
// 3 workers — a worker invocation is a Step in the same append-only tree
// (ADR-0028 §3, §7). Three of them (`authority_lookup`, `web_research`,
// `verifier`) are beyond V1 and are declared anyway: the audit store cannot be
// restructured later, so the vocabulary is fixed once rather than widened per
// worker on a live table.
export const STEP_TYPES = [
  'retrieve',
  'draft',
  'ground_check',
  'cite',
  'delegate',
  'corpus_retrieval',
  'authority_lookup',
  'web_research',
  'extractor',
  'workflow_runner',
  'document_builder',
  'verifier',
] as const;
export type StepType = (typeof STEP_TYPES)[number];

// T-263 — `completed_with_failures` is the third outcome a multi-worker plan
// has and a four-step chain never did: an answer exists, and some of what was
// asked for did not run. Reporting that as `completed` hides it and reporting
// it as `failed` throws away work the user can use. The semantics — which
// dependants skip, which branches continue — are T-268.
export const RUN_STATES = ['running', 'completed', 'failed', 'completed_with_failures'] as const;
export type RunState = (typeof RUN_STATES)[number];
export type Resolution = 'accepted' | 'edited' | 'rejected';

export type Citation = {
  id: Id;
  source: { versionId: Id; documentReference: string } | { authorityRef: string };
  claimSpan?: { start: number; end: number }; // where in the content it backs
};

export type Step = {
  id: Id;
  runId: Id;
  parentStepId: Id | null;
  type: StepType;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  endedAt: string | null;
  model?: { id: string; version: string }; // the Router's choice
  // T-254 — `cost` is NULL when the deployment declared no rate for the model
  // that served this step, never 0. Zero is a price; null is "nobody priced
  // it", and conflating them is finding F7 told one level up — the arithmetic
  // succeeds, the number is plausible, and a business case is built on it.
  usage?: { tokensPrompt: number; tokensCompletion: number; cost: number | null };
  // the egress facts the model call used (ADR-0037 §6): endpoint, processing
  // region, retention posture and data classification — the per-call evidence
  // a security review requires. Absent on steps that made no model call.
  egress?: {
    endpoint: string;
    region: string;
    retention: string;
    classification: string;
  };
  // defensibility field 1 (ADR-0028 §7). T-253: at PASSAGE grain where the
  // source was a library chunk — "what did your AI see" answered exactly,
  // not at document-version grain (finding F5)
  sourceSet: Array<({ versionId: Id } | { authorityRef: string }) & { chunkId?: Id }>;
  railOutcomes: Array<{
    rail: string;
    outcome: 'passed' | 'withheld' | 'open_world';
    // 'open_world' added 2026-07-09 (T-089, labelled-channels ruling): an
    // uncited model-knowledge claim allowed through in chat, labelled — never
    // in document-targeted drafting, which stays grounded-only
    detail?: string; // defensibility field 2's carrier — e.g. the withheld claim text for the UI
  }>;
  childRunId?: Id; // when type = 'delegate'
};

export type Run = {
  id: Id;
  conversationId: Id;
  parentRunId: Id | null;
  agentId: string;
  agentProvenance: 'infora' | 'custom';
  state: RunState;
  request: string; // the prompt/task text — part of the record
  response: string | null; // the produced answer — part of the record too (added 2026-07-08, T-052; ADR-0031 §6 renders it in Copilot)
  startedAt: string;
  endedAt: string | null;
  steps: Step[]; // the append-only tree, flattened by parentStepId
  suggestions: Suggestion[]; // zero or more, per-item (ruled 2026-07-06)
  citations: Citation[]; // the answer's citations when no Suggestion carries them
  // (untargeted chat runs — cite-step citations surfaced; added 2026-07-09,
  // T-088, discharging the step-citation residual for web and M6 alike)
};

// ── The plan artefact (Drawer 3, docs/build/plan.md — Slice Ask Wave 2) ────────────────────────────
// The analysis, persisted: what the system understood and what it intends to
// do, whose steps correspond 1:1 to the Run's own top-level Step rows. Added
// with T-260; the read endpoint is T-261.
export type PlanMode = 'declared' | 'model_chosen';
export type PlanState =
  | 'draft'
  | 'awaiting_clarification'
  | 'ready'
  | 'running'
  | 'complete'
  | 'failed'
  | 'superseded';
// the named stages the progress rail shows (docs/build/plan.md — Slice Ask Wave 2) — a stage that did
// not run is never displayed as having run
export type PlanStage =
  | 'understand'
  | 'load_context'
  | 'clarify'
  | 'plan'
  | 'search_corpus'
  | 'check_authority'
  | 'research_web'
  | 'analyse'
  | 'verify'
  | 'present';
export type PlanStepState = 'pending' | 'running' | 'complete' | 'failed' | 'skipped';

export type PlanStep = {
  id: Id;
  ordinal: number;
  stage: PlanStage;
  worker: string | null; // the worker registry lands at T-269
  inputs: Record<string, unknown>;
  dependsOn: Id[]; // parallelism is expressed here, never inferred at run time
  state: PlanStepState;
  stepRowId: Id | null; // the append-only Step this intention became
  outputRef: Id | null;
  editedByParticipantId: Id | null;
  editedAt: string | null;
};
// Note what is absent: a step declares NO scope. Scope derives from the run's
// EntitledSlice and is deliberately not expressible, so no plan edit can widen
// reach (docs/build/plan.md — Slice Ask Wave 2).

export type Plan = {
  id: Id;
  runId: Id;
  conversationId: Id;
  projectId: Id; // the assembly environment (ADR-0025)
  requesterParticipantId: Id;
  mode: PlanMode; // stored, never derived — the labelling requirement is hard
  workflowId: string | null;
  workflowVersion: number | null;
  lensId: string | null;
  lensVersion: number | null;
  state: PlanState;
  question: string; // as asked
  restatement: string | null; // as understood
  assumptions: string[];
  createdAt: string;
  supersededByPlanId: Id | null;
  steps: PlanStep[];
};

export type Suggestion = {
  id: Id;
  runId: Id;
  workItemId: Id | null;
  sandboxDocumentId: Id;
  kind: 'insert' | 'replace';
  anchor?: { quote: string }; // advisory span against the sandbox head;
  // absent in the skeleton (unanchored insert)
  content: string;
  rationale: string;
  citations: Citation[];
  signal?: { resolution: Resolution; resolvedAt: string }; // set once resolved
};

// ── The project ontology (Drawer 6, ADR-0045) ───────────────────────────────
// Read shapes for the classification vocabulary and the typed edges between
// deliverables. Metadata and structure only, never a grounded corpus. The
// endpoint request/response contracts are added with the API (T-241).
export type ClassificationFacetSource = 'uniclass_2015' | 'iso_19650' | 'custom';
export type DocumentRelationshipType =
  | 'supersedes'
  | 'references'
  | 'responds_to'
  | 'is_part_of'
  | 'derived_from';

// one axis of classification (discipline, system, work_package, …), owner-owned,
// seeded by copy from the Uniclass/ISO-19650 default
export type ClassificationFacet = {
  id: Id;
  key: string; // the stable address the pre-filter uses, e.g. 'discipline'
  name: string;
  source: ClassificationFacetSource;
  sortOrder: number;
};

// a term within a facet; hierarchical (parentTermId), currency-by-state
// (retiredAt — displayed on old classifications, unavailable for new)
export type ClassificationTerm = {
  id: Id;
  facetId: Id;
  parentTermId: Id | null;
  code: string; // the scheme code, e.g. Uniclass 'Ss_25'
  label: string;
  sortOrder: number;
  retiredAt: string | null;
};

// a container's placement under a term; agent-proposed, human-editable —
// `proposed` is true while an agent suggestion is unconfirmed (setBy null)
export type ContainerClassification = {
  id: Id;
  containerId: Id;
  facetId: Id;
  termId: Id;
  proposed: boolean; // true = agent-suggested, not yet confirmed by a person
  setByParticipantId: Id | null;
  updatedAt: string;
};

// a first-class typed edge between two containers; agent-proposed /
// human-confirmed (live only once confirmed), currency-by-state (retiredAt)
export type DocumentRelationship = {
  id: Id;
  projectId: Id;
  fromContainerId: Id;
  toContainerId: Id;
  type: DocumentRelationshipType;
  proposed: boolean; // true = proposed, not yet confirmed (no effect until live)
  confirmedByParticipantId: Id | null;
  createdAt: string;
  confirmedAt: string | null;
  retiredAt: string | null;
};
