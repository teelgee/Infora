// Contracts §1 — the Context-assembly contract (ADR-0029). Not an HTTP
// endpoint: the one call at the knowledge/orchestration package boundary;
// every retrieval — baseline and sub-agent — goes through it (ADR-0028 §4).
// packages/knowledge implements the signature (T-030); access resolution runs
// INSIDE the call, before retrieval (ADR-0029 §1–2).

import type { ReachCounts, Scope } from './scope';
import type { Id } from './shared';

export type AssemblyEnvironment =
  | { kind: 'project'; projectId: Id }
  | { kind: 'workspace'; organisationId: Id }; // ADR-0025; workspace unused in the skeleton

export type AssemblyRequest = {
  // ADR-0029 §4. T-469 — `scope` is the person's declared narrowing (ADR-0029's
  // addendum of 2026-10-24). It is NOT a widening parameter: the gateway
  // resolves the wall, record state and the entitled slice FIRST and
  // intersects the scope with that set, so `scope ∩ visible == what is
  // retrieved` and a scope naming a document the requester may not see
  // retrieves, and counts, nothing from it. Absent means the whole visible
  // library; a present scope names at least one term or container.
  request: { text: string; mode: 'baseline' | 'targeted'; scope?: Scope };
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

// T-308 — a guiding-channel rule, carried so a finding can quote it (ADR-0048
// §5). Deliberately NOT part of `source` below: `source` is *what a citation
// resolves to*, and the whole of §5 is that a quoted rule is **not a citation**
// and must not render as a source chip. Putting the rulebook in `source` would
// be the mistake the ruling exists to prevent, made in the one place the whole
// pipeline reads.
//
// Pairs with `RulebookEvidence` in finding.ts: `clause` is the address the
// manual gives the rule (`4.2`; the `§` is rendering), null where the manual
// numbers nothing — steers, but cannot be quoted with a reference.
export type AssembledRule = { rulebookRef: Id; clause: string | null; heading: string | null };

export type AssembledItem = {
  channel: 'grounded' | 'guiding' | 'informing'; // ADR-0021
  corpus?: 'library' | 'authority'; // grounded only
  // what a citation resolves to.
  //
  // T-308 — OPTIONAL, and absent means **this item is not citable**. That is
  // exactly true of guiding material (ADR-0021: guiding steers and is never
  // cited as project fact), and making it a type rather than a convention is
  // what stops a rule reaching the citation register: `sourcesOf` already skips
  // every non-grounded channel, so a guiding item contributes nothing to the
  // recorded source set and nothing the ground-check will admit a claim against.
  source?: { versionId: Id } | { authorityRef: string };
  /** T-308 — set on a guiding item that is a rulebook clause; never citable */
  rule?: AssembledRule;
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
  // T-272 — how the source READS, so a structured worker output can name the
  // document rather than only its id. An OUTPUT-side annotation on rows the
  // pre-filter had already returned, exactly as `chunkId` and `locator` are: it
  // carries no predicate and can no more widen a slice than they can.
  //
  // `superseded` is FALSE for everything the default filter returns — live
  // record state and current version are pre-filter clauses. It exists because
  // T-273's deliberate opt-in is the only thing that can make it true, and a
  // flag that appeared with the feature would leave every consumer written
  // against a world where superseded material could not arrive.
  descriptor?: {
    documentReference: string;
    /** the deliverable's title; null for reference material, which has no work item */
    documentTitle: string | null;
    versionReference: string;
    superseded: boolean;
  };
  // T-272 — the similarity score, absent where the passage was matched by
  // DOCUMENT REFERENCE rather than by similarity (ADR-0022's lexical arm).
  // Absent means "not ranked", never "ranked zero".
  relevance?: number;
  content: string;
};

/**
 * T-313 — what the embedding call this assembly made actually cost in tokens.
 *
 * The retrieval half of a run is a real model call and was invisible: nothing
 * in `EmbedResult` carried usage at all, so no rate table could price it and a
 * run's "cost" silently meant its DRAFTING cost. This is the fact that makes
 * the other half priceable.
 *
 * **Optional, and absent means UNKNOWN rather than free** — T-254's rule
 * applied one layer down. An assembly that made no embedding call, or a
 * provider that reported no usage, must not read as an assembly that cost
 * nothing, because the arithmetic would succeed and the number would be
 * plausible.
 *
 * The model identity is spelled out here rather than imported: `contracts`
 * depends on nothing, and this shape is what crosses the boundary.
 */
export type EmbeddingUsage = {
  model: { id: string; version: string };
  /** the provider's own token count for the embedded text */
  tokens: number;
};

/**
 * T-272 — what the retrieval actually looked at, so absence can be reported
 * rather than inferred from an empty list.
 *
 * The mechanism behind absence detection: an empty result and a result from an
 * empty corpus are indistinguishable to a reader, and they mean opposite
 * things. `candidates` is how many chunks the access + state pre-filter
 * admitted BEFORE ranking cut to the top few, so "we searched 4,000 passages
 * and none matched" reads differently from "your library has nothing in it".
 *
 * `unmatchedReferences` is the deliverable codes the question NAMED and the
 * corpus did not have — the sharpest kind of absence, because the asker
 * believed the document was there.
 */
export type AssemblyCoverage = {
  /** chunks the pre-filter admitted, before ranking */
  candidates: number;
  /** deliverable references the question named */
  requestedReferences: string[];
  /** …of those, the ones nothing in the reachable corpus matched */
  unmatchedReferences: string[];
  /**
   * T-469 — the same assembly's DOCUMENT counts (not chunks), taken under the
   * requester's own visibility: what they may see and what record state kept
   * out, never what exists. The reach sentence is rendered from these.
   */
  reach: ReachCounts;
};

export type AssembledInput = {
  items: AssembledItem[]; // grounded-first within the budget (ADR-0029 §5)
  budget: { tokenLimit: number; tokensUsed: number };
  /** T-313 — the embedding call this assembly made, where it made one */
  embedding?: EmbeddingUsage;
  /** T-272 — what was searched, for the coverage note */
  coverage?: AssemblyCoverage;
};

// The one gateway. In the skeleton, guiding and informing may return empty;
// the signature carries them so the upgrade doesn't ripple into the orchestrator.
export type Assemble = (req: AssemblyRequest) => Promise<AssembledInput>;
