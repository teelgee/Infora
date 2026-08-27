// T-312 — the two properties that make generated background safe to put in a
// frozen fixture. Both are the kind that fail silently if nobody checks:
//
//   * it is DETERMINISTIC, or the fixture is not frozen and §3 is a comment;
//   * it CANNOT ANSWER A CASE, or an eval that reports a hit cannot say whether
//     the hit was right — which is worse than measuring too little.
import { describe, expect, it } from 'vitest';
import { expandBackground, reservedTermsIn, RESERVED_TERMS } from './background';

const audience = {
  project: 'hollowfield',
  shares: [{ organisation: 'ashcombe', granted_by: 'p_owner' }],
  acknowledged_by: [{ organisation: 'ashcombe', participant: 'p_env' }],
};
const recipe = { count: 280, seed: 312, producer: 'brackenmoor', prefix: 'HOL' };

describe('expandBackground (T-312)', () => {
  const generated = expandBackground(recipe, audience);

  it('produces the declared count, with unique keys and references', () => {
    expect(generated).toHaveLength(280);
    expect(new Set(generated.map((c) => c.key)).size).toBe(280);
    expect(new Set(generated.map((c) => c.reference)).size).toBe(280);
  });

  it('is deterministic — the same seed gives the same corpus, byte for byte', () => {
    // this is what lets a fixture be frozen (§3) without listing 280 documents
    expect(expandBackground(recipe, audience)).toEqual(generated);
  });

  it('changes when the seed changes, or the seed would be decoration', () => {
    const other = expandBackground({ ...recipe, seed: 313 }, audience);
    expect(other.map((c) => c.versions[0]!.content)).not.toEqual(
      generated.map((c) => c.versions[0]!.content),
    );
  });

  it('NEVER contains a term a case turns on', () => {
    // the load-bearing property. A filler document mentioning phosphate would
    // not make HAPPY-01 harder, it would make it ambiguous.
    const offenders = generated
      .map((c) => ({ key: c.key, terms: reservedTermsIn(c.versions[0]!.content) }))
      .filter((row) => row.terms.length > 0);
    expect(offenders).toEqual([]);
  });

  it('is reachable by the acting user, or it competes with nothing', () => {
    // background nobody can see is filtered out before the vector comparison,
    // and precision measured against it would be measuring the wall instead
    for (const container of generated) {
      expect(container.in_library).toBe(true);
      expect(container.shares).toEqual(audience.shares);
      expect(container.versions[0]!.acknowledged_by).toEqual(audience.acknowledged_by);
    }
  });

  it('is shaped like a scheme document set, which is what retrieval cuts through', () => {
    const kinds = new Set(generated.map((c) => c.reference.split('-')[1]));
    expect(kinds.size).toBeGreaterThan(4);
    for (const container of generated) {
      expect(container.versions[0]!.content.length).toBeGreaterThan(120);
    }
  });
});

describe('RESERVED_TERMS (T-312)', () => {
  it('is a lower-case list, because the check lower-cases the text', () => {
    for (const term of RESERVED_TERMS) expect(term).toBe(term.toLowerCase());
  });

  it('detects a term wherever it sits in a sentence', () => {
    expect(reservedTermsIn('Works at the Northern Compound are assessed.')).toEqual([
      'northern compound',
    ]);
    expect(reservedTermsIn('Nothing reserved here at all.')).toEqual([]);
  });
});
