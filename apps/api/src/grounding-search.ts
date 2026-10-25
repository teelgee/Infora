// T-486 (b) — the search and the cap behind `GET /projects/:id/grounding-scope`.
//
// *In plain terms: the Scope control's Documents list used to be handed every
// document the AI could read, however many that was. It is now asked for the
// ones matching what the person typed, and is sent at most fifty of them.*
//
// This is a PURE step that runs AFTER the visibility rule, never instead of it:
// `groundingSources` (the gateway's own `liveLibraryFilter`) decides which
// documents exist for this requester at all, and this only orders and cuts that
// list. There is no second visibility rule here to drift from the first, and
// nothing it returns could have been absent from the full list.
import type { GroundingSource } from '@infora/contracts';

const words = (query: string) => query.trim().toLowerCase().split(/\s+/).filter((word) => word !== '');

/**
 * The documents matching `query`, best first, at most `limit`, plus how many
 * matched. A document matches when every word typed is found in its reference,
 * its title or the description its filer wrote — the fields the picker has
 * always searched. A reference or title that STARTS with the first word comes
 * before one that merely contains it (so `geo` puts "Geotechnical interpretive
 * report" above "Hydro-geology note"); within a kind, by reference, then id, so
 * the same question always gets the same fifty.
 */
export function narrowGroundingSources(
  sources: readonly GroundingSource[],
  query: string,
  limit: number,
): { sources: GroundingSource[]; matched: number } {
  const typed = words(query);
  const first = typed[0];
  const hits = sources.filter((source) => {
    if (typed.length === 0) return true;
    const haystack = `${source.documentReference} ${source.title ?? ''} ${source.description ?? ''}`.toLowerCase();
    return typed.every((word) => haystack.includes(word));
  });
  const starts = (source: GroundingSource) =>
    first !== undefined &&
    (source.documentReference.toLowerCase().startsWith(first) || (source.title ?? '').toLowerCase().startsWith(first));
  const rank = (source: GroundingSource) => (starts(source) ? 0 : 1);
  const ordered = [...hits].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      compare(a.documentReference.toLowerCase(), b.documentReference.toLowerCase()) ||
      compare(a.containerId, b.containerId),
  );
  return { sources: ordered.slice(0, limit), matched: hits.length };
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
