// T-472 — the intake proposer's two pure halves. Compose says what the model is
// shown; admit decides what of its answer is kept. The admission rule is the
// one that matters: a term the scheme does not have is dropped, never invented,
// and confidence is a word.
import { describe, expect, it } from 'vitest';
import { admitIntakeProposal, composeIntakePrompt, INTAKE_READ_CHARS } from './reference-intake';
import type { IntakeFacet } from './reference-intake';

const FACETS: IntakeFacet[] = [
  {
    id: 'f-type',
    key: 'document_type',
    name: 'Document type',
    terms: [
      { id: 't-std', code: 'STD', label: 'Standard' },
      { id: 't-gdn', code: 'GDN', label: 'Guidance' },
    ],
  },
  {
    id: 'f-disc',
    key: 'discipline',
    name: 'Discipline',
    terms: [
      { id: 't-v', code: 'V', label: 'Environmental' },
      { id: 't-g', code: 'G', label: 'Geotechnical' },
    ],
  },
  { id: 'f-wp', key: 'work_package', name: 'Work package', terms: [] },
];

describe('composeIntakePrompt', () => {
  it('shows the model the file name, the project\'s own vocabulary by code, and only the opening of the text', () => {
    const { system, prompt } = composeIntakePrompt('BS-5228-1.pdf', 'x'.repeat(INTAKE_READ_CHARS + 500), FACETS);
    expect(prompt).toContain('File name: BS-5228-1.pdf');
    expect(prompt).toContain('document_type — Document type:');
    expect(prompt).toContain('  STD = Standard');
    expect(prompt).toContain('  V = Environmental');
    // a facet with nothing to choose from is not offered
    expect(prompt).not.toContain('work_package');
    // the opening only
    expect(prompt.match(/x/g)!.length).toBe(INTAKE_READ_CHARS);
    // the three confidence words, and no number
    expect(system).toContain('confident');
    expect(system).toContain('Never a number');
    expect(system).toContain('Never invent a term');
  });
});

describe('admitIntakeProposal', () => {
  const good = JSON.stringify({
    title: '  BS 5228-1 Noise and vibration control  ',
    classifications: [
      { facet: 'document_type', term: 'STD', confidence: 'confident' },
      { facet: 'discipline', term: 'V', confidence: 'likely' },
    ],
  });

  it('takes the ids from the scheme it holds, and the title tidied', () => {
    const admitted = admitIntakeProposal(good, FACETS);
    expect(admitted.title).toBe('BS 5228-1 Noise and vibration control');
    expect(admitted.classifications).toEqual([
      { facetId: 'f-type', termId: 't-std', confidence: 'confident' },
      { facetId: 'f-disc', termId: 't-v', confidence: 'likely' },
    ]);
    expect(admitted.dropped).toBe(0);
  });

  it('DROPS a term the scheme does not have — never invents one — and counts it', () => {
    const admitted = admitIntakeProposal(
      JSON.stringify({
        title: 'X',
        classifications: [
          { facet: 'document_type', term: 'WHITEPAPER', confidence: 'confident' },
          { facet: 'hydrology', term: 'H', confidence: 'confident' },
          { facet: 'discipline', term: 'G', confidence: 'unsure' },
        ],
      }),
      FACETS,
    );
    expect(admitted.classifications).toEqual([{ facetId: 'f-disc', termId: 't-g', confidence: 'unsure' }]);
    expect(admitted.dropped).toBe(2);
  });

  it('confidence is one of three words — anything else (a number included) becomes "unsure"', () => {
    const admitted = admitIntakeProposal(
      JSON.stringify({
        title: 'X',
        classifications: [
          { facet: 'document_type', term: 'STD', confidence: 0.93 },
          { facet: 'discipline', term: 'V', confidence: 'Very High' },
        ],
      }),
      FACETS,
    );
    expect(admitted.classifications.map((c) => c.confidence)).toEqual(['unsure', 'unsure']);
  });

  it('one term per facet: the first stands', () => {
    const admitted = admitIntakeProposal(
      JSON.stringify({
        title: 'X',
        classifications: [
          { facet: 'document_type', term: 'STD', confidence: 'confident' },
          { facet: 'document_type', term: 'GDN', confidence: 'confident' },
        ],
      }),
      FACETS,
    );
    expect(admitted.classifications).toEqual([{ facetId: 'f-type', termId: 't-std', confidence: 'confident' }]);
  });

  it('reads a term by its label, in a fenced answer, and survives nonsense', () => {
    const fenced = admitIntakeProposal('```json\n{"title":"T","classifications":[{"facet":"discipline","term":"geotechnical","confidence":"likely"}]}\n```', FACETS);
    expect(fenced.classifications).toEqual([{ facetId: 'f-disc', termId: 't-g', confidence: 'likely' }]);
    expect(admitIntakeProposal('I cannot tell.', FACETS)).toEqual({ title: null, classifications: [], dropped: 0 });
    expect(admitIntakeProposal('{"title": 7, "classifications": "no"}', FACETS)).toEqual({ title: null, classifications: [], dropped: 0 });
  });
});
