// T-250 — the `web_research` seam: the shape the worker will have (T-279) and
// the guarantees that must hold before it is built.
//
// Three of them, and each is expressed rather than asserted:
//
//   1. The worker's dependencies carry NO `Db`, NO `assemble` and NO
//      `EntitledSlice` — see WebResearchDeps below, and the package manifest,
//      which cannot even name the packages those types live in. It mirrors the
//      existing pattern where the retrieve leaf's only store reach is its
//      injected gateway (packages/orchestration/src/retrieve-leaf.ts).
//   2. Its output is `ExternalSource[]`, structurally incompatible with
//      `AssembledItem`. There is no conversion function here or anywhere.
//   3. `trust` is stamped, never computed or passed in.
import type { ExternalSource } from '@infora/contracts';

/** Constant, not computed — no publisher earns corpus trust (docs/build/ask/02 §3). */
export const WEB_RESEARCH_TRUST = 'external-untrusted' as const;

/**
 * The one capability the worker is given. A fetcher and nothing else: it takes
 * a URL and returns text, and cannot be handed a database handle, because
 * there is no field for one and no import that would produce one.
 *
 * Every fetch is egress and is recorded on the Step alongside model egress
 * (ADR-0037 §6); a sovereign-tier deployment assembles no `web_research` at all
 * (docs/build/ask/02 §9), which is why entitlement is assembly and not filtering.
 */
export type WebFetcher = {
  search(query: string, options: { recency?: 'any' | 'past_year' | 'past_month'; max: number }): Promise<
    Array<{ url: string; publisher: string; title: string; publishedDate: string | null }>
  >;
  fetch(url: string): Promise<{ text: string; retrievedAt: string }>;
};

export type WebResearchDeps = { web: WebFetcher };

export type WebResearchInput = {
  query: string;
  recency?: 'any' | 'past_year' | 'past_month';
  maxSources?: number;
};

export type WebResearchOutput = {
  sources: ExternalSource[];
  /** what was searched and what found nothing — the absence half of the answer */
  searchNote: string;
};

/**
 * Build an external source. The only constructor, and it stamps `trust`
 * itself: a caller cannot claim a fetched page is anything other than
 * untrusted, because the field is not an input.
 */
export function externalSource(fields: Omit<ExternalSource, 'trust'>): ExternalSource {
  return { ...fields, trust: WEB_RESEARCH_TRUST };
}

// Deliberately absent, and to stay absent: any function from ExternalSource to
// AssembledItem / AssembledInput. If one appears, the injected text in a
// fetched page has a route into the same context window as client data, and
// the safety case for this worker is gone. packages/external/fixtures holds
// the attempts that must fail to compile.
