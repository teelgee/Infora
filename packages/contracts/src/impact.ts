// T-474 — supersede impact, and stale grounding (ADR-0049's amendment of
// 2026-10-24, ADR-0048's amendment (a), ADR-0053 A7).
//
// *In plain terms: when a library document is replaced or withdrawn, other
// people's work may rest on it. This file is the shapes for saying so — which
// drafts and past answers rest on a document, and which sentences in one draft
// rest on a source that has since been replaced.*
//
// **Every list here is one organisation's slice, never a total.** The owner's
// dialog never learns that another firm's draft cites the document; a firm is
// told only about its own work. There is deliberately no field anywhere in this
// file that counts across organisations.
import type { Locator } from './assembly';
import type { ContainerRelationshipRead } from './endpoints';
import type { Id } from './shared';

/** What kind of thing rests on a document. */
export type ImpactKind =
  /** a working document holding an accepted AI suggestion (or built by the creator) that cites it */
  | 'draft'
  /** a past answer whose recorded citations name it */
  | 'run'
  /** a library revision whose working document accepted such a suggestion before the revision was made */
  | 'library-version';

/** One affected thing, as a person reads it: a title and a date. */
export type ImpactItem = {
  kind: ImpactKind;
  /** the sandbox document, run or version id (by kind) */
  id: Id;
  title: string;
  /** when it was last edited, asked or made */
  at: string;
  /** the library document, for a `library-version` */
  containerId?: Id;
};

/** `GET /containers/:id/impact` — the owner's dialog. Library edges and the owner's own work only. */
export type ContainerImpactResponse = {
  /** confirmed library relationships pointing at it that the requester may see */
  edges: ContainerRelationshipRead[];
  /** the OWNER ORGANISATION's own affected work — never another organisation's */
  ownWork: ImpactItem[];
};

/** `GET /containers/:id/cited-by` — the Relationships tab. What the requester may see that cites it. */
export type ContainerCitedByResponse = { items: ImpactItem[] };

// ── stale grounding ─────────────────────────────────────────────────────────

/** Why a cited source is no longer the live current one. */
export type StaleReason = 'superseded' | 'withdrawn' | 'replaced';

/** The state of one cited version, as the library holds it now. */
export type CitedVersionState = {
  versionId: Id;
  containerId: Id;
  documentReference: string;
  versionReference: string;
  /** the container's record state */
  recordState: 'live' | 'superseded' | 'withdrawn' | 'rejected';
  /** false once a newer revision exists */
  isCurrent: boolean;
  /** the reference of the live revision, where a newer one replaced it */
  currentVersionReference?: string | null;
  /** the reference of the document that superseded it, where one did */
  supersededByReference?: string | null;
};

/** Null when the source is still the live current one. */
export function staleReasonOf(state: CitedVersionState): StaleReason | null {
  if (state.recordState === 'withdrawn') return 'withdrawn';
  if (state.recordState === 'superseded') return 'superseded';
  if (!state.isCurrent) return 'replaced';
  return null;
}

/** The sentence a person reads about one stale source. Used by the checker and the editor alike. */
export function staleReasonWords(state: CitedVersionState, reason: StaleReason): string {
  const name = `${state.documentReference} ${state.versionReference}`;
  if (reason === 'withdrawn') return `${name} has been withdrawn, and this sentence still rests on it.`;
  if (reason === 'superseded') {
    return state.supersededByReference
      ? `${name} has been superseded by ${state.supersededByReference}, and this sentence still rests on it.`
      : `${name} has been superseded, and this sentence still rests on it.`;
  }
  return state.currentVersionReference
    ? `${name} has been replaced by ${state.currentVersionReference}, and this sentence still rests on it.`
    : `${name} has been replaced by a newer revision, and this sentence still rests on it.`;
}

/** One claim the draft's accepted suggestions (or the creator) recorded, with what it cited. */
export type GroundedClaim = {
  /** the claim's own text as recorded; null where the record holds no text to find it by */
  text: string | null;
  citations: Array<{ id: Id; versionId: Id; chunkId?: Id }>;
};

export const UNLOCATED_WORDS = 'The cited passage could not be located in the current text.';

/** One stale-grounding result: the same shape live and stored. */
export type StaleGroundingItem = {
  anchor: Locator;
  /** false where the claim's text could not be found, so the item points at the document */
  located: boolean;
  defect: string;
  severity: 'required' | 'advisory';
  reason: StaleReason;
  citation: { id: Id; versionId: Id; documentReference: string; chunkId?: Id };
};

/** `GET /sandbox-documents/:id/stale-grounding` — computed now, never stored. */
export type StaleGroundingResponse = {
  computedAt: string;
  /** how many cited claims were examined, so a clean list can be told from an unexamined one */
  claimsChecked: number;
  items: StaleGroundingItem[];
};
