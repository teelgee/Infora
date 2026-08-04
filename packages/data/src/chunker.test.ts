import { describe, expect, it } from 'vitest';
import { chunkText } from './chunker';

describe('chunkText (T-012)', () => {
  it('keeps short content as one chunk', () => {
    expect(chunkText('One sentence. And another.')).toEqual([
      { index: 0, content: 'One sentence. And another.', start: 0, end: 26 },
    ]);
  });

  it('packs sentences to the cap without splitting them', () => {
    const chunks = chunkText('Alpha alpha alpha. Beta beta beta. Gamma gamma gamma.', 40);
    expect(chunks.map((c) => c.content)).toEqual([
      'Alpha alpha alpha. Beta beta beta.',
      'Gamma gamma gamma.',
    ]);
    expect(chunks.map((c) => c.index)).toEqual([0, 1]);
  });

  it('hard-splits a single oversize sentence rather than dropping it', () => {
    const chunks = chunkText('x'.repeat(2500), 1000);
    expect(chunks).toHaveLength(3);
    expect(chunks.map((c) => c.content.length)).toEqual([1000, 1000, 500]);
  });

  it('is deterministic and ignores blank runs', () => {
    const text = 'First.   \n\n  Second.\n\nThird.';
    expect(chunkText(text, 15)).toEqual(chunkText(text, 15));
    expect(chunkText('   \n \n ')).toEqual([]);
  });
});

// T-271 — the spike's own worked example (spike-locators.md), now an assertion.
// Each of T-270's three findings is a reason the offsets cannot be recovered
// afterwards, so each is a reason to check they are captured correctly here.
describe('chunk offsets (T-271)', () => {
  const SOURCE =
    '1. Introduction\nThis chapter describes the noise assessment.  It follows the NPS.\n\n' +
    '2. Method\nMonitoring ran for two weeks.\tSurvey points were selected per BS 4142.';

  it('spans the real source, on the chunk that is NOT a substring of it', () => {
    const chunks = chunkText(SOURCE, 60);
    // finding 1, restated as the reason this ticket exists: the packer rejoins
    // with a single space, so the middle chunk cannot be found by searching
    const crossing = chunks.find((c) => !SOURCE.includes(c.content));
    expect(crossing).toBeDefined();
    // ...and its span still points at real, contiguous source text — which is
    // the whole trade: the assembled rendering is not a substring, the range is
    const atSpan = SOURCE.slice(crossing!.start, crossing!.end);
    expect(atSpan).toContain('It follows the NPS.');
    expect(atSpan).toContain('Monitoring ran for two weeks.');
    // the two differ exactly in whitespace, and in nothing else
    expect(atSpan.replace(/\s+/g, ' ')).toBe(crossing!.content.replace(/\s+/g, ' '));
  });

  it('covers every chunk in order, without overlap', () => {
    const chunks = chunkText(SOURCE, 60);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.start).toBeGreaterThanOrEqual(0);
      expect(chunk.end).toBeGreaterThan(chunk.start);
      expect(chunk.end).toBeLessThanOrEqual(SOURCE.length);
    }
    for (let at = 1; at < chunks.length; at += 1) {
      expect(chunks[at]!.start).toBeGreaterThanOrEqual(chunks[at - 1]!.end);
    }
  });

  it('gives a cross-boundary quote a span, which is finding 3’s whole point', () => {
    // a claim resting on two adjacent sentences produces text in NO chunk and
    // — the surprise — in no version either, because the join the model saw was
    // manufactured by the packer. The span from the first chunk's start to the
    // last one's end is a real range in the real document regardless.
    const chunks = chunkText(SOURCE, 60);
    const [first, second] = [chunks[0]!, chunks[1]!];
    const quote = `${first.content.slice(-20)} ${second.content.slice(0, 20)}`;
    expect(SOURCE.includes(quote)).toBe(false); // finding 3, still true
    const span = SOURCE.slice(first.start, second.end);
    expect(span.length).toBeGreaterThan(0);
    expect(span.replace(/\s+/g, ' ')).toContain(first.content.slice(-20).replace(/\s+/g, ' '));
  });

  it('keeps a hard-split oversize sentence inside the source', () => {
    const text = `${'x'.repeat(2500)}.`;
    for (const chunk of chunkText(text, 1000)) {
      expect(text.slice(chunk.start, chunk.end)).toBe(chunk.content);
    }
  });
});
