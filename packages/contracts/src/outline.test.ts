// T-412 — an outline read flat, and the one traversal everything else uses.
//
// *In plain terms: a section can carry sub-sections, and a sub-section is a
// section of its own with a parent. Every part of the creator that counts an
// outline — the splitter, the manifest, both coverage sentences, the plan's
// proposed document and the drafting prompt — reads that outline through the
// one function pinned here. A second traversal written somewhere else is how
// two counts of one outline start disagreeing, so this is the file that has to
// hold.*
import { describe, expect, it } from 'vitest';
import type { DocumentSection } from './creator';
import { flattenOutline, outlineEntryName, withBriefAt } from './creator';
import { documentCreationBody } from './endpoints';

const nested: DocumentSection[] = [
  {
    heading: 'Purpose',
    purpose: 'State what question this note answers.',
  },
  {
    heading: 'Baseline',
    purpose: 'Set out what the record says.',
    subSections: [
      { heading: '2025 survey', purpose: 'What the survey found.' },
      { heading: 'Earlier work', purpose: 'What preceded it.' },
    ],
  },
];

describe('the outline reads flat, parents before their children', () => {
  it('puts a section’s sub-sections immediately under it, in the document’s own order', () => {
    expect(flattenOutline(nested).map((entry) => entry.heading)).toEqual([
      'Purpose',
      'Baseline',
      '2025 survey',
      'Earlier work',
    ]);
  });

  it('COUNTS AT WHATEVER DEPTH — which is what both coverage sentences rest on', () => {
    // the board's words: "the coverage sentence counts what the outline holds,
    // at whatever depth". Two sections and two sub-sections is four parts to
    // draft, not two.
    expect(flattenOutline(nested)).toHaveLength(4);
  });

  it('marks a sub-section’s depth and names its parent', () => {
    const [, , survey] = flattenOutline(nested);
    expect(survey!.depth).toBe(1);
    expect(survey!.parentHeading).toBe('Baseline');
    expect(survey!.sectionIndex).toBe(1);
    expect(survey!.subSectionIndex).toBe(0);
  });

  it('names a sub-section UNDER its parent, and a section by itself', () => {
    // a manifest entry a reader cannot locate is not a manifest entry: "2025
    // survey" is a heading three sections of one outline could share
    const flat = flattenOutline(nested);
    expect(outlineEntryName(flat[1]!)).toBe('Baseline');
    expect(outlineEntryName(flat[2]!)).toBe('Baseline — 2025 survey');
  });

  it('leaves a flat outline exactly as it was — nothing about the old case moves', () => {
    const flat: DocumentSection[] = [{ heading: 'One', purpose: 'a' }];
    expect(flattenOutline(flat)).toHaveLength(1);
    expect(flattenOutline(flat)[0]!.depth).toBe(0);
    expect(flattenOutline(flat)[0]!.parentHeading).toBeNull();
  });
});

describe('🔒 there is ONE door into a brief, at either depth', () => {
  // A2's guarantee: a typed correction and an agent revision are the same
  // parameter set the same way, so they cannot produce two plans. The plan's
  // proposed document is flat, so the index is flat, and `withBriefAt` is what
  // turns that back into an outline.
  it('sets a top-level section’s brief by its flattened index', () => {
    const next = withBriefAt(nested, 1, 'set the baseline out as a table');
    expect(next[1]!.brief).toBe('set the baseline out as a table');
    expect(next[1]!.subSections![0]!.brief).toBeUndefined();
  });

  it('sets a SUB-SECTION’s brief by its flattened index, leaving its parent alone', () => {
    const next = withBriefAt(nested, 2, 'one bullet per trial pit');
    expect(next[1]!.brief).toBeUndefined();
    expect(next[1]!.subSections![0]!.brief).toBe('one bullet per trial pit');
    expect(next[1]!.subSections![1]!.brief).toBeUndefined();
  });

  it('clears a brief rather than storing an empty one — absent means "the planner’s stands"', () => {
    const set = withBriefAt(nested, 2, 'one bullet per trial pit');
    const cleared = withBriefAt(set, 2, undefined);
    expect('brief' in cleared[1]!.subSections![0]!).toBe(false);
  });

  it('an index outside the outline leaves it unchanged rather than throwing', () => {
    // a plan and a surface that have drifted apart is a bug to see on screen,
    // not a crash on the way to it
    expect(withBriefAt(nested, 99, 'nowhere')).toEqual(nested);
  });
});

describe('the wire allows one level and no more', () => {
  const request = (sections: unknown) => ({
    sections,
    brief: 'what did the record say?',
    purpose: 'technical-note',
    language: 'technical',
    documentType: 'whole-document',
    styleGuideIds: [],
    destinationSandboxId: '00000000-0000-4000-8000-000000000000',
    title: 'a note',
  });

  it('accepts a section carrying sub-sections', () => {
    expect(documentCreationBody.safeParse(request(nested)).success).toBe(true);
  });

  it('STRIPS a second level at the parse — the request is honoured to the depth V1 has', () => {
    // one level is V1's rule. A second level is not refused: zod drops what
    // the schema does not declare, so the deeper material is gone before any
    // handler sees it. This test exists so the behaviour is pinned AS a strip
    // — a reader who needs a refusal must build one, not trust the door
    // (title corrected in review, 2026-09-01: it previously claimed the
    // refusal the body never asserted).
    const tooDeep = [
      {
        heading: 'Baseline',
        purpose: 'what the record says',
        subSections: [
          {
            heading: '2025 survey',
            purpose: 'what it found',
            subSections: [{ heading: 'Trial pits', purpose: 'the pits' }],
          },
        ],
      },
    ];
    const parsed = documentCreationBody.safeParse(request(tooDeep));
    expect(parsed.success).toBe(true);
    // zod strips what the schema does not declare, so the deeper level is gone
    // rather than carried — the request is honoured to the depth V1 has
    expect(
      (parsed.data!.sections[0]!.subSections![0] as { subSections?: unknown }).subSections,
    ).toBeUndefined();
  });

  it('refuses a sub-section with no heading or no purpose, as a section is refused', () => {
    expect(
      documentCreationBody.safeParse(
        request([
          { heading: 'Baseline', purpose: 'x', subSections: [{ heading: '', purpose: 'y' }] },
        ]),
      ).success,
    ).toBe(false);
  });
});
