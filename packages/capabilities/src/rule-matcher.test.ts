// T-428 acceptance — the in-house matcher, with no model and no database.
//
// *In plain terms: this is the half of the writing check that costs nothing.
// It checks that a word rule finds the wrong word and leaves the Project Board
// alone; that a rule lifted from the client's document quotes that document's
// own words in the finding; and that a rule Infora proposed, or a person typed,
// quotes nothing at all — because an invented quotation looks identical to a
// real one on screen.*
import { describe, expect, it } from 'vitest';
import { splitIntoSections } from './workers/qa-sections';
import {
  applyMeasuredRules,
  applyRulesToSection,
  applyStructureRules,
  evidenceFor,
  maskContexts,
  maskTerms,
  scopedLines,
} from './rule-matcher';
import type { AcceptedRule } from './rule-matcher';

const CONTENT = [
  'Introduction',
  '',
  'The project is assessed for land quality. The Project Board approved the works on 12/03/2026.',
  '',
  'Assessment',
  '',
  'The report notes “the project delivers a 12% reduction” and the project continues.',
].join('\n');

const sections = splitIntoSections(CONTENT);

const term = (over: Partial<AcceptedRule> = {}): AcceptedRule => ({
  id: 'r1',
  kind: 'term',
  origin: 'extracted',
  statement: 'Use “scheme”, not “project”.',
  scope: 'sentence',
  exceptedContexts: [],
  exceptedTerms: [],
  register: 'all',
  enforcement: 'raises_findings',
  severity: 'required',
  payload: { preferred: 'scheme', replaces: ['project'] },
  styleGuideId: 'guide-1',
  clause: '4.2',
  clauseWording: 'Refer to the works as the scheme throughout; never as the project.',
  ...over,
});

describe('T-428 — a term rule is settled by code, and carries a mechanical fix', () => {
  it('finds the wrong wording and proposes the right one', () => {
    const findings = applyRulesToSection(CONTENT, sections[0]!, [term()]);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.checkFamily).toBe('style');
    // 🔒 the replacement is what makes this fix MECHANICAL at the store, where
    // `classifyFix` decides — the model never self-certifies into the bulk lane
    expect(findings[0]!.replacement).toBe('scheme');
    expect(findings[0]!.anchor.verbatim).toBe('project');
  });

  it('leaves an EXCEPTED TERM alone — the honest proper-name mechanism', () => {
    const spared = applyRulesToSection(CONTENT, sections[0]!, [
      term({ exceptedTerms: ['the Project Board'] }),
    ]);
    // "the project is assessed" still fires; "the Project Board" does not
    expect(spared).toHaveLength(1);
    const anchors = spared.map((finding) => finding.anchor.span.start);
    const boardAt = CONTENT.indexOf('Project Board');
    expect(anchors).not.toContain(boardAt);
  });

  it('leaves an EXCEPTED CONTEXT alone — a quoted document is not the draft’s prose', () => {
    const inQuotes = applyRulesToSection(CONTENT, sections[1]!, [term()]);
    const spared = applyRulesToSection(CONTENT, sections[1]!, [
      term({ exceptedContexts: ['quotations'] }),
    ]);
    // the second section says "project" twice — once inside a quotation
    expect(inQuotes.length).toBe(2);
    expect(spared.length).toBe(1);
  });

  it('does not fire on text that is already the preferred wording', () => {
    const findings = applyRulesToSection(
      'Introduction\n\nThe scheme is assessed.',
      splitIntoSections('Introduction\n\nThe scheme is assessed.')[0]!,
      [term({ payload: { preferred: 'scheme', replaces: ['scheme', 'project'] } })],
    );
    expect(findings).toHaveLength(0);
  });
});

describe('T-428 — a pattern rule is settled by code, and proposes nothing', () => {
  const pattern = (): AcceptedRule =>
    term({
      id: 'r2',
      kind: 'pattern',
      statement: 'Write a date as 12 March 2026, never 12/03/2026.',
      payload: { expression: '\\b\\d{1,2}/\\d{1,2}/\\d{2,4}\\b' },
    });

  it('finds the breach and states the rule as the defect', () => {
    const findings = applyRulesToSection(CONTENT, sections[0]!, [pattern()]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.anchor.verbatim).toBe('12/03/2026');
    expect(findings[0]!.defect).toContain('12 March 2026');
  });

  it('carries NO replacement, so it can never ride an accept-all', () => {
    // a pattern says what is wrong and does not write the prose; a fix nobody
    // proposed cannot be accepted in bulk (ADR-0053 §6)
    expect(applyRulesToSection(CONTENT, sections[0]!, [pattern()])[0]!.replacement).toBeUndefined();
  });

  it('refuses an expression the guard would not run, rather than hanging', () => {
    const findings = applyRulesToSection(CONTENT, sections[0]!, [
      pattern2('(a+)+$'),
      pattern2('(unclosed'),
    ]);
    expect(findings).toHaveLength(0);
  });

  const pattern2 = (expression: string): AcceptedRule =>
    term({ kind: 'pattern', statement: 'x', payload: { expression } });
});

describe('T-428 — a rule that only steers drafting raises nothing', () => {
  it('is applied by no code pass at all', () => {
    expect(
      applyRulesToSection(CONTENT, sections[0]!, [term({ enforcement: 'steers_only' })]),
    ).toHaveLength(0);
  });
});

describe('T-428 — scope narrows where a rule may fire', () => {
  it('a heading-scoped rule looks only at heading lines', () => {
    const spans = scopedLines(sections[0]!.text, sections[0]!, 'heading');
    expect(spans).toHaveLength(1);
    expect(sections[0]!.text.slice(spans[0]!.start, spans[0]!.end)).toBe('Introduction');
  });

  it('a sentence-scoped rule may look at the whole section', () => {
    const spans = scopedLines(sections[0]!.text, sections[0]!, 'sentence');
    expect(spans).toEqual([{ start: 0, end: sections[0]!.text.length }]);
  });

  it('a heading-scoped term rule does not fire in the body', () => {
    expect(applyRulesToSection(CONTENT, sections[0]!, [term({ scope: 'heading' })])).toHaveLength(0);
  });
});

describe('T-428 — the mask preserves offsets, which is what makes anchoring safe', () => {
  it('replaces an excepted context with the same number of spaces', () => {
    const text = 'He said “the project” loudly.';
    const masked = maskContexts(text, sections[0]!, ['quotations']);
    expect(masked).toHaveLength(text.length);
    expect(masked).not.toContain('project');
  });

  it('does the same for an excepted term', () => {
    const text = 'the Project Board met';
    const masked = maskTerms(text, ['the Project Board']);
    expect(masked).toHaveLength(text.length);
    expect(masked.trim()).toBe('met');
  });
});

// ── the four origins, and what each finding may say ─────────────────────────

describe('T-428 — a finding’s evidence follows the rule’s ORIGIN and only that', () => {
  it('an EXTRACTED rule quotes the client’s clause, byte for byte', () => {
    const rule = term();
    const evidence = evidenceFor(rule);
    expect(evidence.input).toBe('rulebook');
    expect(evidence).toMatchObject({
      clause: '4.2',
      // 🔒 the clause's stored text, never the rule's own statement
      quote: 'Refer to the works as the scheme throughout; never as the project.',
      rulebookRef: 'guide-1',
      scope: 'project',
    });
    expect(JSON.stringify(evidence)).not.toContain(rule.statement);
  });

  it('a TYPED rule quotes NOTHING — no clause, no quote, no reference', () => {
    const rule = term({ origin: 'typed', clause: null });
    delete (rule as { clauseWording?: string }).clauseWording;
    const evidence = evidenceFor(rule);
    expect(evidence.input).toBe('draft');
    expect(evidence).not.toHaveProperty('quote');
    expect(evidence).not.toHaveProperty('clause');
    expect(evidence).not.toHaveProperty('rulebookRef');
    expect(evidence).toMatchObject({ basis: expect.stringContaining('typed onto this project') });
  });

  it('an INFORA-PROPOSED rule says whose rule it is, and quotes no guide', () => {
    const rule = term({ origin: 'infora_proposed', clause: null });
    delete (rule as { clauseWording?: string }).clauseWording;
    const evidence = evidenceFor(rule);
    expect(evidence.input).toBe('draft');
    expect(evidence).not.toHaveProperty('quote');
    expect(evidence).toMatchObject({
      basis: expect.stringContaining('Infora proposed and this project accepted'),
    });
  });

  it('carries that difference all the way onto the finding', () => {
    const rule = term({ origin: 'typed', clause: null });
    delete (rule as { clauseWording?: string }).clauseWording;
    const [typed] = applyRulesToSection(CONTENT, sections[0]!, [rule]);
    const [extracted] = applyRulesToSection(CONTENT, sections[0]!, [term()]);
    expect(extracted!.evidence.input).toBe('rulebook');
    expect(typed!.evidence.input).toBe('draft');
    // 🔒 the client's guide is nowhere in a finding it did not produce
    expect(JSON.stringify(typed!.evidence)).not.toContain('Refer to the works');
  });
});

describe('T-428 — structure routes into completeness and measured into readability', () => {
  it('a structure rule reports a missing section as a completeness finding', () => {
    const rule = term({
      kind: 'structure',
      statement: 'Every report carries a Limitations section.',
      scope: 'document',
      payload: { requires: ['Limitations'] },
    });
    const findings = applyStructureRules(CONTENT, sections, [rule]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.checkFamily).toBe('completeness');
    expect(findings[0]!.defect).toContain('Limitations');
  });

  it('a measured rule is scored and its finding is ALWAYS advisory, never a verdict', () => {
    const rule = term({
      kind: 'measured',
      severity: 'required',
      statement: 'Sentences run to no more than 5 words.',
      scope: 'sentence',
      payload: { measure: 'sentence-length', target: 5 },
    });
    const findings = applyMeasuredRules(CONTENT, sections, [rule], () => 12);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((finding) => finding.checkFamily === 'readability')).toBe(true);
    // 🔒 ADR-0053 §2 is unchanged: readability is scored with outliers flagged
    // and NEVER pass/fail, so a `required` rule cannot make it a verdict
    expect(findings.every((finding) => finding.severity === 'advisory')).toBe(true);
  });
});
