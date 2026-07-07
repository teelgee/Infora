import { describe, expect, it } from 'vitest';
import { groundCheck } from './ground-check';

const sourceSet = [{ versionId: 'v-gir' }, { authorityRef: 'BS-5930' }];

describe('groundCheck (T-044)', () => {
  it('passes claims whose source is in the admitted set — either corpus', () => {
    const result = groundCheck({
      claims: [
        { text: 'PAHs recorded.', sourceRef: { versionId: 'v-gir' } },
        { text: 'Logging follows the standard.', sourceRef: { authorityRef: 'BS-5930' } },
      ],
      sourceSet,
    });
    expect(result.surviving).toHaveLength(2);
    expect(result.withheld).toEqual([]);
    expect(result.railOutcomes).toEqual([{ rail: 'grounding', outcome: 'passed' }]);
  });

  it('withholds unsourced claims and sources outside the admitted set', () => {
    const result = groundCheck({
      claims: [
        { text: 'A bare assertion.' },
        { text: 'Cites a source the step never saw.', sourceRef: { versionId: 'v-elsewhere' } },
        { text: 'Grounded and kept.', sourceRef: { versionId: 'v-gir' } },
      ],
      sourceSet,
    });
    expect(result.surviving).toEqual([{ text: 'Grounded and kept.', sourceRef: { versionId: 'v-gir' } }]);
    expect(result.withheld.map((c) => c.text)).toEqual([
      'A bare assertion.',
      'Cites a source the step never saw.',
    ]);
  });

  it('records one withheld rail outcome per claim, detail carrying the text', () => {
    const result = groundCheck({
      claims: [{ text: 'First orphan.' }, { text: 'Second orphan.' }],
      sourceSet,
    });
    expect(result.railOutcomes).toEqual([
      { rail: 'grounding', outcome: 'withheld', detail: 'First orphan.' },
      { rail: 'grounding', outcome: 'withheld', detail: 'Second orphan.' },
    ]);
  });

  it('an empty source set withholds everything — deterministic, never generous', () => {
    const result = groundCheck({
      claims: [{ text: 'Anything.', sourceRef: { versionId: 'v-gir' } }],
      sourceSet: [],
    });
    expect(result.surviving).toEqual([]);
    expect(result.withheld).toHaveLength(1);
  });
});
