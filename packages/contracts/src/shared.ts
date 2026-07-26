// Contracts §2 — shared types (docs/build/contracts.md, first cut 2026-07-04,
// carrying the 2026-07-06 rulings: Run.request, suggestions[] per-item,
// Suggestion.kind/anchor, railOutcomes.detail).

export type Id = string; // uuid
export type Surface = 'web' | 'word_addin' | 'copilot'; // ADR-0031
export type StepType = 'retrieve' | 'draft' | 'ground_check' | 'cite' | 'delegate';
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
  usage?: { tokensPrompt: number; tokensCompletion: number; cost: number };
  // the egress facts the model call used (ADR-0037 §6): endpoint, processing
  // region, retention posture and data classification — the per-call evidence
  // a security review requires. Absent on steps that made no model call.
  egress?: {
    endpoint: string;
    region: string;
    retention: string;
    classification: string;
  };
  sourceSet: Array<{ versionId: Id } | { authorityRef: string }>; // defensibility field 1 (ADR-0028 §7)
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
  state: 'running' | 'completed' | 'failed';
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
