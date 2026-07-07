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
  sourceSet: Array<{ versionId: Id } | { authorityRef: string }>; // defensibility field 1 (ADR-0028 §7)
  railOutcomes: Array<{
    rail: string;
    outcome: 'passed' | 'withheld';
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
  startedAt: string;
  endedAt: string | null;
  steps: Step[]; // the append-only tree, flattened by parentStepId
  suggestions: Suggestion[]; // zero or more, per-item (ruled 2026-07-06)
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
