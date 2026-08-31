// T-310 acceptance, the admission rules — **the part of the checker that has to
// hold when the model is wrong.**
//
// ADR-0048 makes three promises a surface will show a reviewer: the finding
// points at real text (§2), a quoted rule is the rule verbatim (§5), and each
// input gets its own honest treatment (§7). None of those survives a model that
// is trusted to fill the fields in, so every one of them is tested here against
// a model that is trying to break it.
import { describe, expect, it } from 'vitest';
import {
  QA_DOCUMENT_CHECK,
  QA_SECTION_CHECK,
  admitContradictionFindings,
  admitSectionFindings,
  composeSectionCheckPrompt,
} from './qa-checker';
import type { CheckPassage, SectionCheckMaterial, StyleClause } from './qa-checker';
import { splitIntoSections } from './qa-sections';

const DRAFT = [
  'Assessment',
  '',
  'The Scheme delivers a 12% reduction in contaminant loading.',
  '',
  'Conclusions',
  '',
  'The Scheme delivers a 9% reduction in contaminant loading.',
].join('\n');

const sections = splitIntoSections(DRAFT);

const projectClause: StyleClause = {
  scope: 'project',
  rulebookRef: 'guide-1',
  clause: '§2.1',
  heading: 'Naming',
  text: 'Refer to the works as “the scheme”, in lower case.',
};
const firmClause: StyleClause = {
  scope: 'organisation',
  rulebookRef: 'rulebook-1',
  clause: '§4.2',
  heading: 'Voice',
  text: 'Avoid the passive voice.',
};
const passage: CheckPassage = {
  versionId: 'v-1',
  chunkId: 'c-1',
  documentReference: 'WA-ENV-WQ-001',
  text: 'Modelling shows a 9% reduction in contaminant loading.',
  citationId: 'v-1:c-1',
};

const material: SectionCheckMaterial = {
  section: sections[0]!,
  clauses: [projectClause, firmClause],
  passages: [passage],
  excerpts: [{ attachedSourceId: 'as-1', excerpt: 'the client’s own note says 9%' }],
  families: ['style', 'corpus_accuracy'],
};

const answer = (findings: unknown[], summary = 'The section asserts a 12% reduction.') =>
  JSON.stringify({ summary, findings });

describe('a finding must point INTO the text or it is discarded (ADR-0048 §2)', () => {
  it('keeps a finding whose quote is really in the section, with the verbatim read back out', () => {
    const result = admitSectionFindings(
      DRAFT,
      material,
      answer([
        {
          family: 'style',
          quote: 'The Scheme delivers',
          defect: 'The works are capitalised.',
          severity: 'advisory',
          rule: 'R1',
          replacement: 'The scheme delivers',
        },
      ]),
    );
    expect(result.findings).toHaveLength(1);
    const finding = result.findings[0]!;
    expect(DRAFT.slice(finding.anchor.span.start, finding.anchor.span.end)).toBe(
      finding.anchor.verbatim,
    );
  });

  it('discards a finding quoting text that is not there, and COUNTS the discard', () => {
    const result = admitSectionFindings(
      DRAFT,
      material,
      answer([
        {
          family: 'style',
          quote: 'a sentence the model imagined',
          defect: 'x',
          severity: 'required',
          rule: 'R1',
        },
      ]),
    );
    expect(result.findings).toHaveLength(0);
    // counted, not silently dropped: "no findings" must be distinguishable
    // from "the model answered and none of it was usable"
    expect(result.coverage.discarded.unanchored).toBe(1);
  });
});

describe('a quoted rule is OUR copy of the rule, never the model’s (ADR-0048 §5)', () => {
  it('takes the clause text and address from the loaded clause', () => {
    const result = admitSectionFindings(
      DRAFT,
      material,
      answer([
        {
          family: 'style',
          quote: 'The Scheme',
          defect: 'Capitalised.',
          severity: 'advisory',
          rule: 'R1',
          // the model's own attempt at the rule, which must not survive
          clause: '§9.9',
          quote_of_rule: 'Always capitalise the Scheme.',
        },
      ]),
    );
    const evidence = result.findings[0]!.evidence;
    expect(evidence.input).toBe('rulebook');
    if (evidence.input !== 'rulebook') throw new Error('unreachable');
    expect(evidence.quote).toBe(projectClause.text);
    expect(evidence.clause).toBe('§2.1');
    expect(evidence.rulebookRef).toBe('guide-1');
  });

  it('discards a style finding naming a rule this run did not load', () => {
    const result = admitSectionFindings(
      DRAFT,
      material,
      answer([
        { family: 'style', quote: 'The Scheme', defect: 'x', severity: 'advisory', rule: 'R9' },
      ]),
    );
    expect(result.findings).toHaveLength(0);
    expect(result.coverage.discarded.unknownRule).toBe(1);
  });

  it('carries the SCOPE that decides whether the quote crosses the wall (ADR-0053 §9)', () => {
    const project = admitSectionFindings(
      DRAFT,
      material,
      answer([
        { family: 'style', quote: 'The Scheme', defect: 'x', severity: 'advisory', rule: 'R1' },
      ]),
    );
    const firm = admitSectionFindings(
      DRAFT,
      material,
      answer([
        { family: 'style', quote: 'The Scheme', defect: 'x', severity: 'advisory', rule: 'R2' },
      ]),
    );
    const projectEvidence = project.findings[0]!.evidence;
    const firmEvidence = firm.findings[0]!.evidence;
    if (projectEvidence.input !== 'rulebook' || firmEvidence.input !== 'rulebook') {
      throw new Error('unreachable');
    }
    // the project's guide binds everyone on the project, so quoting it across
    // the wall is the point of it; the firm's manual is the firm's own IP
    expect(projectEvidence.scope).toBe('project');
    expect(firmEvidence.scope).toBe('organisation');
  });
});

describe('three inputs, three honest treatments (ADR-0048 §7)', () => {
  it('a corpus finding cites the passage this run actually saw', () => {
    const result = admitSectionFindings(
      DRAFT,
      material,
      answer([
        {
          family: 'corpus_accuracy',
          quote: '12% reduction',
          defect: 'The record gives 9%.',
          severity: 'required',
          source: 'S1',
        },
      ]),
    );
    const evidence = result.findings[0]!.evidence;
    expect(evidence.input).toBe('corpus');
    if (evidence.input !== 'corpus') throw new Error('unreachable');
    expect(evidence.citations[0]!.source).toEqual({
      versionId: 'v-1',
      documentReference: 'WA-ENV-WQ-001',
    });
  });

  it('an attached document is quoted and carries no citation to reach for (ADR-0022)', () => {
    const result = admitSectionFindings(
      DRAFT,
      material,
      answer([
        {
          family: 'corpus_accuracy',
          quote: '12% reduction',
          defect: 'The attached note gives 9%.',
          severity: 'advisory',
          source: 'A1',
        },
      ]),
    );
    const evidence = result.findings[0]!.evidence;
    expect(evidence.input).toBe('attached');
    if (evidence.input !== 'attached') throw new Error('unreachable');
    expect(evidence.attachedSourceId).toBe('as-1');
    expect('citations' in evidence).toBe(false);
  });

  it('discards a corpus finding citing a passage this run did not see', () => {
    const result = admitSectionFindings(
      DRAFT,
      material,
      answer([
        {
          family: 'corpus_accuracy',
          quote: '12% reduction',
          defect: 'x',
          severity: 'required',
          source: 'S7',
        },
      ]),
    );
    expect(result.findings).toHaveLength(0);
    expect(result.coverage.discarded.unknownSource).toBe(1);
  });

  it('discards a finding in a family this run did not ask for', () => {
    const styleOnly: SectionCheckMaterial = { ...material, families: ['style'] };
    const result = admitSectionFindings(
      DRAFT,
      styleOnly,
      answer([
        {
          family: 'corpus_accuracy',
          quote: '12% reduction',
          defect: 'x',
          severity: 'required',
          source: 'S1',
        },
      ]),
    );
    expect(result.findings).toHaveLength(0);
  });
});

describe('a malformed answer produces nothing rather than a guess', () => {
  it('returns no findings and no summary for prose where JSON was asked for', () => {
    const result = admitSectionFindings(DRAFT, material, 'I had a look and it seems fine.');
    expect(result.findings).toHaveLength(0);
    expect(result.summary).toBe('');
  });
});

describe('the section summary rides free, and the prompt states the precedence', () => {
  it('returns the summary the section call produced as a by-product', () => {
    const result = admitSectionFindings(DRAFT, material, answer([], 'Asserts a 12% reduction.'));
    expect(result.summary).toBe('Asserts a 12% reduction.');
  });

  it('states ADR-0029’s precedence in a SENTENCE, not by ordering alone', () => {
    const prompt = composeSectionCheckPrompt(material);
    expect(prompt).toContain('THE PROJECT RULE GOVERNS');
    // ordering is not an instruction — but the prompt must not argue with its
    // own sentence either
    expect(prompt.indexOf('[R1]')).toBeLessThan(prompt.indexOf('[R2]'));
    expect(prompt).toContain('project style guide');
    expect(prompt).toContain('firm rulebook');
  });

  it('marks an attached document as not a project source, on the same screen the model reads', () => {
    expect(composeSectionCheckPrompt(material)).toContain('not a project source');
  });
});

describe('a contradiction names BOTH its ends (ADR-0048 §2)', () => {
  it('anchors the section it is raised on and the one it conflicts with', () => {
    const result = admitContradictionFindings(
      DRAFT,
      sections,
      JSON.stringify({
        findings: [
          {
            section: 2,
            other_section: 1,
            defect: 'The conclusion gives 9% where the assessment gives 12%.',
            severity: 'required',
          },
        ],
      }),
    );
    expect(result.findings).toHaveLength(1);
    const evidence = result.findings[0]!.evidence;
    expect(evidence.input).toBe('draft');
    if (evidence.input !== 'draft') throw new Error('unreachable');
    expect(evidence.otherAnchor).toBeDefined();
    expect(evidence.basis).toContain('Assessment');
  });

  it('discards a contradiction naming a section that does not exist, or itself', () => {
    const missing = admitContradictionFindings(
      DRAFT,
      sections,
      JSON.stringify({ findings: [{ section: 1, other_section: 9, defect: 'x' }] }),
    );
    expect(missing.findings).toHaveLength(0);
    expect(missing.discarded).toBe(1);

    const itself = admitContradictionFindings(
      DRAFT,
      sections,
      JSON.stringify({ findings: [{ section: 1, other_section: 1, defect: 'x' }] }),
    );
    expect(itself.findings).toHaveLength(0);
  });
});

describe('the declarations say what ADR-0027 fixed at design time', () => {
  it('the document check retrieves nothing and calls no model, and says so', () => {
    expect(QA_DOCUMENT_CHECK.scopeNote).toContain('no model is called');
    expect(QA_DOCUMENT_CHECK.writes).toBe(false);
  });

  it('no checker capability writes — the checker gains no write path (ADR-0048 §3)', () => {
    expect(QA_SECTION_CHECK.writes).toBe(false);
    expect(QA_SECTION_CHECK.reach).toBe('inherited');
  });
});
