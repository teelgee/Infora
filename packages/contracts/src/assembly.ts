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

// T-271 — WHERE in the source document a passage is, so a citation is
// checkable rather than merely precise (non-negotiable 1). The spike (T-270)
// settled the shape: **store the position, compute the view.** A character
// span is the only exact locator — paragraph, section and page are all *views*
// of a position — and it is format-agnostic, where a per-format scheme needs a
// new branch for every format admitted.
export type Locator = {
  // character range into `versions.content`, the exact thing everything else
  // derives from
  span: { start: number; end: number };
  // derived, not stored: the count of newlines before `span.start`.
  // `docxToText` emits exactly one `\n` per `<w:p>`, so this is the source
  // document's own paragraph index and a reader can act on it. From a
  // paginated source it counts the extracted LINES, which is a coarser thing
  // wearing the same name — and the reason `page` below is the locator that
  // matters there.
  paragraph: number;
  // T-305 — the locator a planner actually writes ("page 14"), present only
  // where the source has pages. `pdfToText` terminates every page with a form
  // feed, so this is the count of those before `span.start`, plus one — the
  // same derivation as `paragraph`, over a different separator, which is why
  // page needed no column of its own.
  //
  // **Absent for a docx, and that is not an omission.** A Word file contains
  // no page boundaries at all: pagination is computed by the viewer from
  // fonts, margins and printer metrics. Any "page 14" from a Word source would
  // be an invention, and an invented locator is worse than none because it
  // looks checkable.
  page?: number;
  // the source text AS IT REALLY READS at that span — not the assembled
  // `content`, whose inter-sentence whitespace the chunker rewrote (T-270
  // finding 1). This is the half of non-negotiable 1 that says "either a
  // locator or the verbatim passage": here it is both, and the verbatim is
  // taken from the document rather than searched for in it.
  verbatim: string;
};

export type AssembledItem = {
  channel: 'grounded' | 'guiding' | 'informing'; // ADR-0021
  corpus?: 'library' | 'authority'; // grounded only
  source: { versionId: Id } | { authorityRef: string }; // what a citation resolves to
  // T-253 — the PASSAGE this item is, not just the document it came from
  // (finding F5). Chunk rows are immutable, so recording the id makes the
  // exact assembled text reconstructible without storing it twice. Absent on
  // items that are not library chunks (steering channels, authority refs).
  chunkId?: Id;
  // T-271 — absent means this passage resolves at VERSION grain only, which is
  // the deliberate degrade: a chunk ingested before offsets existed, or one
  // whose span no longer matches the version it points into. Never a guessed
  // locator — a quote that cannot be found is worse than none, because it looks
  // checkable.
  locator?: Locator;
  content: string;
};

export type AssembledInput = {
  items: AssembledItem[]; // grounded-first within the budget (ADR-0029 §5)
  budget: { tokenLimit: number; tokensUsed: number };
};

// The one gateway. In the skeleton, guiding and informing may return empty;
// the signature carries them so the upgrade doesn't ripple into the orchestrator.
export type Assemble = (req: AssemblyRequest) => Promise<AssembledInput>;
