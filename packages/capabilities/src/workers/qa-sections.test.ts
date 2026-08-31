// T-310 acceptance, the deterministic half: sectioning, anchoring, and the two
// families that cost nothing.
//
// **These tests are the guarantee ADR-0053 §4 rests on.** The planner's width
// is the section count, so a splitter that answered differently on two
// identical inputs would make the plan shown before a run stop describing the
// run — and the declared-workflow promise (same inputs, same steps, same order)
// would be gone one file below where anybody was looking for it.
import { describe, expect, it } from 'vitest';
import {
  anchorInto,
  completenessCheck,
  fleschKincaidGrade,
  readabilityCheck,
  splitIntoSections,
} from './qa-sections';
import type { DocumentTemplate } from './templates';

const DRAFT = [
  'Introduction',
  '',
  'This chapter assesses land quality across the scheme.',
  '',
  'Baseline conditions',
  '',
  'The site was formerly a gasworks. Made ground extends to 4 m below ground level.',
  '',
  'Assessment',
  '',
  'The Scheme delivers a 12% reduction in contaminant loading. The Scheme is compliant.',
].join('\n');

describe('a draft is cut into sections the same way every time (ADR-0053 §4)', () => {
  it('finds a heading as a short line standing alone', () => {
    const sections = splitIntoSections(DRAFT);
    expect(sections.map((section) => section.heading)).toEqual([
      'Introduction',
      'Baseline conditions',
      'Assessment',
    ]);
    expect(sections.map((section) => section.index)).toEqual([1, 2, 3]);
  });

  it('spans are real offsets into the document, not a second search', () => {
    const sections = splitIntoSections(DRAFT);
    for (const section of sections) {
      expect(DRAFT.slice(section.start, section.end)).toBe(section.text);
    }
    // and they tile the document with no gap: a run that reported reading the
    // document must not have dropped a paragraph between two sections
    expect(sections[0]!.start).toBe(0);
    expect(sections[sections.length - 1]!.end).toBe(DRAFT.length);
  });

  it('is deterministic — the same text twice is the same cut twice', () => {
    expect(splitIntoSections(DRAFT)).toEqual(splitIntoSections(DRAFT));
  });

  it('a draft with no headings is ONE section, which is what makes the short shape fall out', () => {
    const sections = splitIntoSections('One paragraph, no headings at all, written straight through.');
    expect(sections).toHaveLength(1);
    expect(sections[0]!.heading).toBeNull();
  });

  it('material before the first heading is a section, never dropped', () => {
    const sections = splitIntoSections(['A preamble sentence.', '', 'Heading', '', 'Body.'].join('\n'));
    expect(sections).toHaveLength(2);
    expect(sections[0]!.heading).toBeNull();
    expect(sections[0]!.text).toContain('A preamble sentence.');
  });

  it('a sentence is not a heading, however short', () => {
    const sections = splitIntoSections(['It rained.', '', 'It stopped.'].join('\n'));
    expect(sections).toHaveLength(1);
  });
});

describe('an anchor is resolved against the real text and never supplied (ADR-0048 §2)', () => {
  const sections = splitIntoSections(DRAFT);

  it('resolves a quote to a span whose verbatim comes back out of the document', () => {
    const anchor = anchorInto(DRAFT, sections[2]!, 'The Scheme delivers a 12% reduction');
    expect(anchor).not.toBeNull();
    expect(DRAFT.slice(anchor!.span.start, anchor!.span.end)).toBe(anchor!.verbatim);
    expect(anchor!.verbatim).toBe('The Scheme delivers a 12% reduction');
  });

  it('refuses a quote that is not in the section — a finding with no anchor is dropped', () => {
    expect(anchorInto(DRAFT, sections[0]!, 'a sentence the model invented')).toBeNull();
  });

  it('carries no page, a sandbox document having no pagination to derive one from', () => {
    const anchor = anchorInto(DRAFT, sections[1]!, 'gasworks');
    expect(anchor).not.toBeNull();
    expect(anchor!.page).toBeUndefined();
  });
});

describe('readability is scored, never passed or failed (ADR-0053 §2)', () => {
  it('scores every section whether or not anything is flagged', () => {
    const sections = splitIntoSections(DRAFT);
    const { scores } = readabilityCheck(DRAFT, sections, 14);
    expect(scores).toHaveLength(sections.length);
    // the coverage statement has to be able to say the family ran
    expect(scores.every((score) => typeof score.grade === 'number')).toBe(true);
  });

  it('is deterministic', () => {
    const sections = splitIntoSections(DRAFT);
    expect(readabilityCheck(DRAFT, sections, 14)).toEqual(readabilityCheck(DRAFT, sections, 14));
  });

  it('flags nothing where the whole draft reads the same way, however dense', () => {
    // a correctly-written technical document scores badly ALL THE WAY THROUGH,
    // and flagging every section of it would be a verdict on the document
    const dense = [
      'One',
      '',
      'Hydrogeological characterisation demonstrates preferential contaminant migration pathways.',
      '',
      'Two',
      '',
      'Geoenvironmental interpretation substantiates conceptual site model recalibration requirements.',
    ].join('\n');
    const sections = splitIntoSections(dense);
    const { scores, findings } = readabilityCheck(dense, sections, 8);
    expect(scores.every((score) => score.grade > 8)).toBe(true);
    expect(findings).toHaveLength(0);
  });

  it('every readability finding is advisory and rests on the draft, never on a citation', () => {
    const mixed = [
      'Plain',
      '',
      'The site is old. We dug holes. We found tar.',
      '',
      'Dense',
      '',
      'Notwithstanding the aforementioned hydrogeological characterisation, preferential contaminant migration pathway substantiation necessitates comprehensive conceptual site model recalibration incorporating multifaceted geoenvironmental interpretation methodologies.',
    ].join('\n');
    const sections = splitIntoSections(mixed);
    const { findings } = readabilityCheck(mixed, sections, 10);
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(finding.severity).toBe('advisory');
      expect(finding.evidence.input).toBe('draft');
      expect(finding.checkFamily).toBe('readability');
    }
  });
});

describe('completeness states which half of itself ran (ADR-0053 §5)', () => {
  const template: DocumentTemplate = {
    id: 'technical-note',
    version: 1,
    label: 'Technical note',
    description: 'x',
    sections: [
      { id: 'introduction', heading: 'Introduction', guidance: 'x' },
      { id: 'baseline', heading: 'Baseline conditions', guidance: 'x' },
      { id: 'assessment', heading: 'Assessment', guidance: 'x' },
      { id: 'mitigation', heading: 'Mitigation', guidance: 'x' },
    ],
  };

  it('names the template section the draft does not have', () => {
    const sections = splitIntoSections(DRAFT);
    const { coverage, findings } = completenessCheck(DRAFT, sections, template);
    expect(coverage.missingSections).toEqual(['Mitigation']);
    expect(findings.some((finding) => finding.defect.includes('Mitigation'))).toBe(true);
  });

  it('with NO template, runs the placeholder half and says the other did not run', () => {
    const sections = splitIntoSections(DRAFT);
    const { coverage } = completenessCheck(DRAFT, sections);
    // null, not [] — "nothing missing" and "nothing was compared" are opposite
    // claims and a clean empty array would make them read the same
    expect(coverage.missingSections).toBeNull();
  });

  it('finds placeholder text and anchors each occurrence', () => {
    const withHoles = ['Assessment', '', 'The figure is TBC and the appendix is TODO.'].join('\n');
    const sections = splitIntoSections(withHoles);
    const { coverage, findings } = completenessCheck(withHoles, sections);
    expect(coverage.placeholders).toBe(2);
    for (const finding of findings) {
      expect(withHoles.slice(finding.anchor.span.start, finding.anchor.span.end)).toBe(
        finding.anchor.verbatim,
      );
    }
  });
});

describe('the grade is arithmetic, and the same arithmetic every time', () => {
  it('is stable across calls', () => {
    const text = 'The scheme delivers a reduction in peak flow. The assessment is complete.';
    expect(fleschKincaidGrade(text)).toBe(fleschKincaidGrade(text));
  });

  it('scores denser prose higher', () => {
    expect(
      fleschKincaidGrade('Notwithstanding hydrogeological characterisation methodologies.'),
    ).toBeGreaterThan(fleschKincaidGrade('The site is old. We dug holes.'));
  });
});
