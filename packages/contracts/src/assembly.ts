// Contracts §1 — the Context-assembly contract (ADR-0029). Not an HTTP
// endpoint: the one call at the knowledge/orchestration package boundary;
// every retrieval — baseline and sub-agent — goes through it (ADR-0028 §4).
// packages/knowledge implements the signature (T-030); access resolution runs
// INSIDE the call, before retrieval (ADR-0029 §1–2).

import type { Id } from './shared';

export type AssemblyEnvironment =
  | { kind: 'project'; projectId: Id }
  | { kind: 'workspace'; organisationId: Id }; // ADR-0025; workspace unused in the skeleton

export type AssemblyRequest = {
  request: { text: string; mode: 'baseline' | 'targeted' }; // ADR-0029 §4
  environment: AssemblyEnvironment;
  requester: { organisationId: Id; participantId: Id };
};

export type AssembledItem = {
  channel: 'grounded' | 'guiding' | 'informing'; // ADR-0021
  corpus?: 'library' | 'authority'; // grounded only
  source: { versionId: Id } | { authorityRef: string }; // what a citation resolves to
  // T-253 — the PASSAGE this item is, not just the document it came from
  // (docs/build/ask/09 R5). Chunk rows are immutable, so recording the id makes the
  // exact assembled text reconstructible without storing it twice. Absent on
  // items that are not library chunks (steering channels, authority refs).
  chunkId?: Id;
  content: string;
};

export type AssembledInput = {
  items: AssembledItem[]; // grounded-first within the budget (ADR-0029 §5)
  budget: { tokenLimit: number; tokensUsed: number };
};

// The one gateway. In the skeleton, guiding and informing may return empty;
// the signature carries them so the upgrade doesn't ripple into the orchestrator.
export type Assemble = (req: AssemblyRequest) => Promise<AssembledInput>;
