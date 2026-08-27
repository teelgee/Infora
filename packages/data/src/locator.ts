// T-271 — turning a stored character span into a locator a reader can act on.
//
// The spike's rule (T-270): **store the position, compute the view.** The span
// is the only exact thing; paragraph is derived from it, and page and section
// arrive when the formats that carry them do.
//
// T-305 brought the first of those: a PDF ingest path exists, `pdfToText`
// terminates each page with a form feed, and **page is therefore the same
// derivation as paragraph over a different separator** — which is why the rule
// held and the schema did not move. Section (§12.4.7) still waits on Word's
// numbering algebra. Neither is guessed: a docx has no pages at all, so any
// "page 14" from a Word source would be an invention.
//
// The verification below is the point of the ticket rather than defensive
// tidying. Non-negotiable 1 is that a claim resolves to a document, a version
// and either a locator or the verbatim passage — where the property that
// matters is that a reader can *check* it. A span that no longer lines up with
// its version would render a citation that looks checkable and is not, which is
// worse than shipping none. So a locator is produced only when the span is
// demonstrated to still point at the passage, and otherwise the citation
// degrades to version grain.
import type { Locator } from '@infora/contracts';

/**
 * Inter-sentence whitespace is rewritten by the chunker — the splitter eats the
 * run after a terminator and the packer rejoins with one space — so a chunk is
 * NOT a substring of its version (T-270 finding 1). Collapsing whitespace on
 * both sides compares what the two actually claim: the same words, in the same
 * order, from the same place.
 */
const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

export type StoredSpan = {
  startOffset: number | null;
  endOffset: number | null;
  /** the assembled text, as the model was shown it */
  content: string;
  /** `versions.content` sliced at the stored span, read from the store */
  verbatim: string | null;
  /** newlines before `startOffset`, counted in the store */
  paragraph: number | null;
  /**
   * form feeds before `startOffset`, plus one, counted in the store — and
   * `null` for a source with no pages at all, which the store answers by
   * looking for a single form feed anywhere in the version.
   */
  page?: number | null;
};

/**
 * A locator, or `null` for the deliberate degrade to version grain. Null means
 * one of exactly three things, and none of them is an error worth failing a
 * retrieval over:
 *
 *   - the chunk predates T-271 and carries no span;
 *   - the span falls outside the version it points into;
 *   - the text at the span is not the passage any more.
 */
export function resolveLocator(stored: StoredSpan): Locator | null {
  const { startOffset, endOffset, verbatim, paragraph } = stored;
  if (startOffset === null || endOffset === null) return null;
  if (verbatim === null || paragraph === null) return null;
  if (startOffset < 0 || endOffset <= startOffset) return null;
  // the store slices at the span; a short result means the span ran past the
  // end of the version, which is the same failure as a mismatch
  if (verbatim.length !== endOffset - startOffset) return null;
  if (collapse(verbatim) !== collapse(stored.content)) return null;
  // page rides the same verification: it is only ever reported for a span that
  // has just been shown to still point at this passage
  const page = stored.page ?? null;
  return {
    span: { start: startOffset, end: endOffset },
    paragraph,
    ...(page !== null && page > 0 && { page }),
    verbatim,
  };
}
