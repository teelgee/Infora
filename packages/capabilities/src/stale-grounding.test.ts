// T-474 — the stale-grounding comparison. Pure: lists in, results out.
import { describe, expect, it } from 'vitest';
import type { CitedVersionState, GroundedClaim } from '@infora/contracts';
import { staleGroundingCheck } from './stale-grounding';

const state = (over: Partial<CitedVersionState> = {}): CitedVersionState => ({
  versionId: 'v-1',
  containerId: 'c-1',
  documentReference: 'WA-GEO-GIR-004',
  versionReference: 'v2',
  recordState: 'live',
  isCurrent: true,
  currentVersionReference: 'v2',
  supersededByReference: null,
  ...over,
});
const claim = (text: string | null, versionId = 'v-1', id = 'cit-1'): GroundedClaim => ({
  text,
  citations: [{ id, versionId }],
});
const content = 'Intro.\n\nMade ground was found to 2.4 m.\n\nA second sentence stands alone.';

describe('staleGroundingCheck', () => {
  it('raises nothing while the source is live and current, and counts what it examined', () => {
    const result = staleGroundingCheck({ content, claims: [claim('Made ground was found to 2.4 m.')], states: [state()] });
    expect(result.items).toEqual([]);
    expect(result.claimsChecked).toBe(1);
  });

  it('anchors a superseded source on the citing sentence, as required', () => {
    const result = staleGroundingCheck({
      content,
      claims: [claim('Made ground was found to 2.4 m.')],
      states: [state({ recordState: 'superseded', supersededByReference: 'WA-GEO-GIR-005' })],
    });
    expect(result.items).toHaveLength(1);
    const [item] = result.items;
    expect(item!.located).toBe(true);
    expect(item!.anchor.verbatim).toBe('Made ground was found to 2.4 m.');
    expect(item!.anchor.span.start).toBe(content.indexOf('Made ground'));
    expect(item!.anchor.paragraph).toBe(2);
    expect(item!.severity).toBe('required');
    expect(item!.reason).toBe('superseded');
    expect(item!.defect).toBe('WA-GEO-GIR-004 v2 has been superseded by WA-GEO-GIR-005, and this sentence still rests on it.');
  });

  it('reads a withdrawn source and a replaced revision differently', () => {
    const withdrawn = staleGroundingCheck({ content, claims: [claim('Made ground was found to 2.4 m.')], states: [state({ recordState: 'withdrawn' })] });
    expect(withdrawn.items[0]!.reason).toBe('withdrawn');
    const replaced = staleGroundingCheck({
      content,
      claims: [claim('Made ground was found to 2.4 m.')],
      states: [state({ isCurrent: false, currentVersionReference: 'v3' })],
    });
    expect(replaced.items[0]!.reason).toBe('replaced');
    expect(replaced.items[0]!.severity).toBe('advisory');
    expect(replaced.items[0]!.defect).toContain('replaced by v3');
  });

  it('anchors on the document, and says so, where the claim cannot be located', () => {
    const result = staleGroundingCheck({
      content,
      claims: [claim('A sentence that was rewritten away.')],
      states: [state({ recordState: 'superseded' })],
    });
    expect(result.items[0]!.located).toBe(false);
    expect(result.items[0]!.defect).toContain('The cited passage could not be located in the current text.');
    expect(result.items[0]!.anchor.verbatim).toBe('Intro.');
  });

  it('anchors a claim with no recorded text on the document, once per stale source', () => {
    const result = staleGroundingCheck({
      content,
      claims: [claim(null, 'v-1', 'a'), claim(null, 'v-1', 'b')],
      states: [state({ recordState: 'superseded' })],
    });
    expect(result.items).toHaveLength(1);
    expect(result.claimsChecked).toBe(2);
  });

  it('is silent about a citation to something it holds no library state for', () => {
    const result = staleGroundingCheck({ content, claims: [claim('Made ground was found to 2.4 m.', 'v-unknown')], states: [state({ recordState: 'superseded' })] });
    expect(result).toEqual({ items: [], claimsChecked: 0 });
  });

  it('gives one result per sentence and source, not one per citation row', () => {
    const twice: GroundedClaim = {
      text: 'Made ground was found to 2.4 m.',
      citations: [
        { id: 'a', versionId: 'v-1' },
        { id: 'b', versionId: 'v-1' },
      ],
    };
    const result = staleGroundingCheck({ content, claims: [twice], states: [state({ recordState: 'superseded' })] });
    expect(result.items).toHaveLength(1);
  });
});
