import { describe, expect, it } from 'vitest';
import { blankGapLines, gapLineFor, gapMarkers, paragraphsOf, parseGapLine, provenanceStatement } from './gap';
import type { PassageProvenance } from './gap';

describe('gapMarkers (T-475)', () => {
  it('finds a marker on its own line, with its offsets and line number', () => {
    const text = 'First para.\n\n[Gap: the record does not give the made-ground thickness]\n\nLast.';
    const [gap, ...rest] = gapMarkers(text);
    expect(rest).toEqual([]);
    expect(gap!.text).toBe('the record does not give the made-ground thickness');
    expect(text.slice(gap!.start, gap!.end)).toBe(
      '[Gap: the record does not give the made-ground thickness]',
    );
    expect(gap!.line).toBe(3);
  });

  it('counts every marker, including one a person typed', () => {
    expect(gapMarkers('[Gap: a]\n\n[Gap: b]\nplain\n  [Gap: c]  ').map((g) => g.text)).toEqual(['a', 'b', 'c']);
  });

  it('ignores look-alikes', () => {
    const lookAlikes = [
      'see [Gap: inline] here',
      '[Gap:]',
      '[Gap:   ]',
      '[gap: lower case]',
      'Gap: no brackets',
      '[Gap: unclosed',
      '> [Gap: quoted]',
      '[Gaps: plural]',
    ];
    for (const line of lookAlikes) expect(gapMarkers(line)).toEqual([]);
  });

  it('handles windows line endings', () => {
    expect(gapMarkers('a\r\n[Gap: x]\r\nb').map((g) => g.text)).toEqual(['x']);
  });

  it('parseGapLine reads one line', () => {
    expect(parseGapLine('[Gap: x]')).toBe('x');
    expect(parseGapLine('x [Gap: x]')).toBeNull();
  });
});

describe('gapLineFor (T-475)', () => {
  it('writes the withheld claim itself, on one line, and is read back as a gap', () => {
    const line = gapLineFor('The thickness is\n12 m [see appendix] on every parcel.');
    expect(line).not.toContain('\n');
    expect(gapMarkers(line)).toHaveLength(1);
    expect(gapMarkers(line)[0]!.text).toContain('12 m (see appendix) on every parcel.');
  });
  it('quotes the claim, so it reads as a rejected proposal, and keeps quotes out of the quotation', () => {
    const line = gapLineFor('The "safe" depth is 4 m.');
    expect(line).toBe('[Gap: the record does not support "The \'safe\' depth is 4 m."]');
  });
  it('blankGapLines removes the text of a gap line and keeps every offset', () => {
    const text = 'Real.\n\n[Gap: the record does not support "Invented 99%"]\n\nMore.';
    const blanked = blankGapLines(text);
    expect(blanked).toHaveLength(text.length);
    expect(blanked).not.toContain('Invented');
    expect(blanked).toContain('Real.');
    expect(blanked).toContain('More.');
  });
  it('clips a very long claim', () => {
    expect(gapLineFor('x'.repeat(1000)).length).toBeLessThan(300);
  });
});

describe('paragraphsOf', () => {
  it('splits on blank lines and keeps offsets into the original', () => {
    const text = 'One.\nstill one.\n\n\nTwo.  \n\nThree.';
    const paras = paragraphsOf(text);
    expect(paras.map((p) => p.text)).toEqual(['One.\nstill one.', 'Two.', 'Three.']);
    for (const p of paras) expect(text.slice(p.start, p.end)).toBe(p.text);
  });
});

describe('provenanceStatement', () => {
  const base: PassageProvenance = {
    start: 0, end: 1, origin: 'agent', runId: 'abcdef12-0000-4000-8000-000000000000',
    draftedAt: '2026-10-20T10:00:00Z', acceptedByName: 'Eleanor Price', acceptedAt: '2026-10-21T09:00:00Z',
    edited: false, savedByName: null, savedAt: null,
  };
  it('names run, acceptor and dates', () => {
    expect(provenanceStatement(base)).toBe(
      'Drafted by the agent in run abcdef12 on 2026-10-20, accepted by Eleanor Price on 2026-10-21',
    );
    expect(provenanceStatement({ ...base, edited: true })).toContain('edited and accepted by Eleanor Price');
  });
  it('says written by hand otherwise', () => {
    expect(
      provenanceStatement({ ...base, origin: 'hand', runId: null, savedByName: 'Owen Vance', savedAt: '2026-10-22T00:00:00Z' }),
    ).toBe('Written by hand — by Owen Vance on 2026-10-22');
  });
});
