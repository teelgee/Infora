// T-474 — the vocabulary: the new check family, the fourth notification event,
// and the one sentence a stale source is told in.
import { describe, expect, it } from 'vitest';
import { CHECK_FAMILIES, CHECK_FAMILY_CATALOGUE } from './checker';
import { staleReasonOf, staleReasonWords } from './impact';
import type { CitedVersionState } from './impact';
import type { NotificationEventType } from './notification';

const state = (over: Partial<CitedVersionState> = {}): CitedVersionState => ({
  versionId: 'v',
  containerId: 'c',
  documentReference: 'WA-GEO-GIR-004',
  versionReference: 'v2',
  recordState: 'live',
  isCurrent: true,
  ...over,
});

describe('the stale-grounding family (ADR-0053 A7)', () => {
  it('is in the catalogue as code, at the grain of the citing sentence', () => {
    expect(CHECK_FAMILIES).toContain('stale_grounding');
    const entry = CHECK_FAMILY_CATALOGUE.find((e) => e.family === 'stale_grounding')!;
    expect(entry.execution).toBe('code');
    expect(entry.grain).toBe('sentence');
    // every family in the list has a catalogue entry, and the other way round
    expect(CHECK_FAMILY_CATALOGUE.map((e) => e.family).sort()).toEqual([...CHECK_FAMILIES].sort());
  });

  it('the fourth pilot event is a member of the closed set', () => {
    const event: NotificationEventType = 'cited-document-superseded';
    expect(event).toBe('cited-document-superseded');
  });
});

describe('when a cited source counts as stale', () => {
  it('a live current version is not stale', () => {
    expect(staleReasonOf(state())).toBeNull();
  });
  it('withdrawn and superseded beat "replaced"', () => {
    expect(staleReasonOf(state({ recordState: 'withdrawn', isCurrent: false }))).toBe('withdrawn');
    expect(staleReasonOf(state({ recordState: 'superseded' }))).toBe('superseded');
    expect(staleReasonOf(state({ isCurrent: false }))).toBe('replaced');
  });
  it('names the document and what replaced it', () => {
    expect(staleReasonWords(state({ supersededByReference: 'WA-GEO-GIR-005' }), 'superseded')).toBe(
      'WA-GEO-GIR-004 v2 has been superseded by WA-GEO-GIR-005, and this sentence still rests on it.',
    );
    expect(staleReasonWords(state(), 'withdrawn')).toContain('has been withdrawn');
  });
});
