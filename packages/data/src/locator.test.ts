// T-271 — the resolver's job is to REFUSE, most of the time it does anything
// interesting. A locator that renders and does not resolve is worse than none,
// because it looks checkable, so the degrade paths carry more of this ticket's
// weight than the happy one.
import { describe, expect, it } from 'vitest';
import { chunkText } from './chunker';
import { resolveLocator, type StoredSpan } from './locator';

const SOURCE =
  '1. Introduction\nThis chapter describes the noise assessment.  It follows the NPS.\n\n' +
  '2. Method\nMonitoring ran for two weeks.\tSurvey points were selected per BS 4142.';

/** what the store returns for a chunk: the span, plus the slice at it */
function stored(chunk: { content: string; start: number; end: number }): StoredSpan {
  const before = SOURCE.slice(0, chunk.start);
  return {
    startOffset: chunk.start,
    endOffset: chunk.end,
    content: chunk.content,
    verbatim: SOURCE.slice(chunk.start, chunk.end),
    paragraph: before.length - before.replaceAll('\n', '').length,
  };
}

describe('resolveLocator (T-271)', () => {
  const chunks = chunkText(SOURCE, 60);

  it('resolves every chunk the current chunker produces', () => {
    for (const chunk of chunks) {
      const locator = resolveLocator(stored(chunk));
      expect(locator).not.toBeNull();
      expect(locator!.span).toEqual({ start: chunk.start, end: chunk.end });
      // the verbatim is the SOURCE's own text, not the assembled rendering —
      // that is the difference a reader checks against
      expect(locator!.verbatim).toBe(SOURCE.slice(chunk.start, chunk.end));
    }
  });

  it('resolves the chunk that is not a substring of its version', () => {
    // the case a naive `indexOf` implementation fails on, which is why the
    // offsets are stored rather than recovered (T-270 finding 1)
    const crossing = chunks.find((c) => !SOURCE.includes(c.content))!;
    expect(resolveLocator(stored(crossing))).not.toBeNull();
  });

  it('counts paragraphs from the source’s own newlines', () => {
    // docxToText emits exactly one \n per <w:p>, so this is the document's
    // paragraph index and not an invented one
    const first = resolveLocator(stored(chunks[0]!))!;
    expect(first.paragraph).toBe(0);
    const last = resolveLocator(stored(chunks[chunks.length - 1]!))!;
    expect(last.paragraph).toBeGreaterThan(0);
  });

  it('degrades to version grain for a chunk ingested before spans existed', () => {
    expect(
      resolveLocator({
        startOffset: null,
        endOffset: null,
        content: 'anything',
        verbatim: null,
        paragraph: null,
      }),
    ).toBeNull();
  });

  it('refuses a span whose text is no longer the passage', () => {
    // the failure this exists to catch: the span still parses, the slice still
    // returns text, and the text is about something else
    const chunk = chunks[0]!;
    expect(
      resolveLocator({ ...stored(chunk), verbatim: 'Entirely different words here.' }),
    ).toBeNull();
  });

  it('refuses a span that runs past the end of the version', () => {
    // the store slices to whatever exists, so a short result IS the overrun
    const chunk = chunks[0]!;
    expect(
      resolveLocator({ ...stored(chunk), endOffset: chunk.end + 500 }),
    ).toBeNull();
  });

  it('refuses an inverted or negative span', () => {
    const chunk = chunks[0]!;
    expect(resolveLocator({ ...stored(chunk), startOffset: chunk.end, endOffset: chunk.start })).toBeNull();
    expect(resolveLocator({ ...stored(chunk), startOffset: -1 })).toBeNull();
  });

  it('accepts a whitespace difference, because that difference is the chunker’s own', () => {
    // the packer rewrote inter-sentence whitespace; insisting on byte equality
    // would refuse every chunk that crossed a paragraph break — which is most
    // of them in a real document
    const chunk = chunks.find((c) => !SOURCE.includes(c.content))!;
    const locator = resolveLocator(stored(chunk))!;
    expect(locator.verbatim).not.toBe(chunk.content); // genuinely different bytes
    expect(locator.verbatim.replace(/\s+/g, ' ')).toBe(chunk.content.replace(/\s+/g, ' '));
  });
});
