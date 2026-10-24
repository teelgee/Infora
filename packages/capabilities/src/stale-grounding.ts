// T-474 — the stale-grounding check (ADR-0048's amendment (a), ADR-0053 A7).
//
// *In plain terms: every sentence in a draft that an accepted AI suggestion
// wrote carries a record of the source it rested on. If that source has since
// been superseded, withdrawn or replaced by a newer revision, this finds the
// sentence and says so. No AI is involved — it is a comparison of two lists.*
//
// 🔒 **PURE, AND DELIBERATELY SO.** The caller reads the draft's recorded
// citations and the library's present state; this only compares them. That is
// what lets the checker run it as a stored family and the editor run it live,
// from one function, and never disagree about what counts as stale.
import { UNLOCATED_WORDS, staleReasonOf, staleReasonWords } from '@infora/contracts';
import type {
  CitedVersionState,
  GroundedClaim,
  Locator,
  StaleGroundingItem,
} from '@infora/contracts';

export type StaleGroundingInput = {
  content: string;
  claims: readonly GroundedClaim[];
  states: readonly CitedVersionState[];
};

export type StaleGroundingResult = {
  items: StaleGroundingItem[];
  /** claims that cited a library version — what was actually examined */
  claimsChecked: number;
};

export function staleGroundingCheck(input: StaleGroundingInput): StaleGroundingResult {
  const stateOf = new Map(input.states.map((state) => [state.versionId, state]));
  const items: StaleGroundingItem[] = [];
  const seen = new Set<string>();
  let claimsChecked = 0;
  for (const claim of input.claims) {
    const cited = claim.citations.filter((c) => stateOf.has(c.versionId));
    if (cited.length === 0) continue;
    claimsChecked += 1;
    const found = claim.text === null ? -1 : input.content.indexOf(claim.text);
    for (const citation of cited) {
      const state = stateOf.get(citation.versionId)!;
      const reason = staleReasonOf(state);
      if (reason === null) continue;
      const located = found !== -1 && claim.text !== null;
      // one result per sentence and source; an unlocatable claim has no
      // sentence to be unique by, so it is one result per source
      const key = `${located ? claim.text : 'document'}|${state.versionId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const anchor = located
        ? locate(input.content, found, claim.text!.length)
        : firstLine(input.content);
      items.push({
        anchor,
        located,
        defect: located
          ? staleReasonWords(state, reason)
          : `${staleReasonWords(state, reason)} ${UNLOCATED_WORDS}`,
        severity: reason === 'replaced' ? 'advisory' : 'required',
        reason,
        citation: {
          id: citation.id,
          versionId: citation.versionId,
          documentReference: state.documentReference,
          ...(citation.chunkId !== undefined && { chunkId: citation.chunkId }),
        },
      });
    }
  }
  return { items, claimsChecked };
}

function locate(content: string, start: number, length: number): Locator {
  const end = start + length;
  let paragraph = 0;
  for (let at = 0; at < start; at += 1) if (content[at] === '\n') paragraph += 1;
  return { span: { start, end }, paragraph, verbatim: content.slice(start, end) };
}

/** Where a result with no sentence to point at is pinned: the document's first line. */
function firstLine(content: string): Locator {
  const lead = content.length - content.trimStart().length;
  const rest = content.slice(lead);
  const newline = rest.indexOf('\n');
  const length = newline === -1 ? rest.length : newline;
  return locate(content, lead, length);
}
