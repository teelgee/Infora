// T-476 — a judgement finding names its rule or its passage, and the optional
// disproving pass (ADR-0053 addendum A9) argues a finding wrong before it is
// shown. *In plain terms: the admitter drops a model's finding that names no
// rule and no second place; and the prompt that asks the model to disprove a
// finding is built the same way every time from the same inputs.*
import { describe, expect, it } from 'vitest';
import {
  admitContradictionFindings,
  admitSectionFindings,
  composeDisprovePrompt,
  disproveBasisOf,
  parseDisproveVerdict,
} from './qa-checker';
import type { SectionCheckMaterial } from './qa-checker';
import { splitIntoSections } from './qa-sections';
import type { DraftFinding } from './qa-sections';

const DRAFT = [
  'Assessment',
  '',
  'A conceptual site model has been prepared for each land parcel.',
  '',
  'Conclusions',
  '',
  'The model was not prepared for every parcel.',
].join('\n');
const sections = splitIntoSections(DRAFT);

const material = (judgementEvidence: SectionCheckMaterial['judgementEvidence']): SectionCheckMaterial => ({
  section: sections[0]!,
  clauses: [],
  passages: [],
  excerpts: [],
  families: ['style'],
  judgementRules: [{ id: 'rule-1', statement: 'Prefer the active voice.', scope: 'sentence' }],
  ...(judgementEvidence !== undefined && { judgementEvidence }),
});

const answer = JSON.stringify({
  summary: 's',
  findings: [
    {
      family: 'style',
      quote: 'A conceptual site model has been prepared',
      defect: 'This sentence is passive.',
      severity: 'advisory',
      rule: 'J1',
    },
  ],
});

describe('the admitter drops a model finding that names neither a rule nor a passage first (T-476)', () => {
  it('drops it and counts it, rather than raising it', () => {
    // evidence with NO rule id: what `evidenceFor` returned before this ticket
    const result = admitSectionFindings(
      DRAFT,
      material(() => ({ input: 'draft', basis: 'a rule typed onto the standard' })),
      answer,
    );
    expect(result.findings).toHaveLength(0);
    expect(result.coverage.discarded.noRuleOrPassage).toBe(1);
  });

  it('keeps one that names its rule, and marks it as the model’s reading', () => {
    const result = admitSectionFindings(
      DRAFT,
      material((ruleId) => ({ input: 'draft', basis: 'a rule typed onto the standard', ruleId })),
      answer,
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.modelRaised).toBe(true);
    expect(result.findings[0]!.evidence).toMatchObject({ input: 'draft', ruleId: 'rule-1' });
    expect(result.coverage.discarded.noRuleOrPassage).toBe(0);
  });

  it('a contradiction carries both places and is marked as the model’s reading', () => {
    const result = admitContradictionFindings(
      DRAFT,
      sections,
      JSON.stringify({
        findings: [{ section: 1, other_section: 2, defect: 'They disagree.', severity: 'required' }],
      }),
    );
    expect(result.findings).toHaveLength(1);
    const finding = result.findings[0]!;
    expect(finding.modelRaised).toBe(true);
    expect(finding.evidence.input === 'draft' && finding.evidence.otherAnchor).toBeTruthy();
  });
});

describe('the disproving prompt is composed purely (ADR-0053 A9)', () => {
  const finding: Pick<DraftFinding, 'checkFamily' | 'defect' | 'anchor'> = {
    checkFamily: 'style',
    defect: 'This sentence is passive.',
    anchor: { span: { start: 12, end: 40 }, paragraph: 2, verbatim: 'A conceptual site model' },
  };

  it('is the same text for the same inputs, and carries the finding, the rule and the section', () => {
    const input = { sectionText: 'Assessment\n\nA conceptual site model has been prepared.', finding, basis: 'The rule: Prefer the active voice.' };
    const first = composeDisprovePrompt(input);
    expect(composeDisprovePrompt(input)).toBe(first);
    expect(first).toContain('You are testing a finding');
    expect(first).toContain('This sentence is passive.');
    expect(first).toContain('Prefer the active voice.');
    expect(first).toContain('A conceptual site model has been prepared.');
    expect(first).toContain('"holds"');
  });

  it('finds the rule the finding rests on from the material the first reader had', () => {
    const rule: DraftFinding = {
      checkFamily: 'style',
      anchor: finding.anchor,
      defect: finding.defect,
      severity: 'advisory',
      evidence: { input: 'draft', basis: 'b', ruleId: 'rule-1' },
    };
    expect(disproveBasisOf(rule, material(undefined))).toBe('The rule: Prefer the active voice.');
  });
});

describe('the pass only ever removes, and only on an unambiguous answer', () => {
  it('withdraws on holds:false with a reason', () => {
    expect(parseDisproveVerdict('{"holds": false, "reasoning": "The sentence names the author."}')).toEqual({
      withdrawn: true,
      reasoning: 'The sentence names the author.',
    });
  });

  it.each([
    ['holds', '{"holds": true, "reasoning": "It is passive."}'],
    ['no reason given', '{"holds": false}'],
    ['not JSON', 'I think the finding is wrong.'],
    ['a string, not a boolean', '{"holds": "false", "reasoning": "x"}'],
  ])('leaves the finding standing when the answer is %s', (_name, raw) => {
    expect(parseDisproveVerdict(raw).withdrawn).toBe(false);
  });
});
