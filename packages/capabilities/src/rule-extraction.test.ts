// T-424 acceptance — the admission rules, the gap-filling and the pattern
// guard, with no model and no database in sight.
//
// *In plain terms: this checks what Infora does with the AI's answer when it
// turns your standard into rules. A rule that points at a clause we never
// showed it is thrown away. A rule that claims to come from your document
// always carries the exact words it came from. And the rules Infora adds itself
// are marked as Infora's own and can never pretend your guide said them.*
import { describe, expect, it } from 'vitest';
import {
  admitExtractedRules,
  composeRuleExtractionPrompt,
  fillGaps,
  INFORA_BASELINE,
  usablePattern,
} from './rule-extraction';
import type { ExtractableClause } from './rule-extraction';

const clauses: ExtractableClause[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    clause: '4.2',
    heading: 'Terminology',
    content: 'Refer to the works as the scheme throughout; never as the project.',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    clause: '9',
    heading: 'Voice',
    content: 'Write in the active voice, keep sentences short, and avoid contractions.',
  },
];

const answer = (rules: unknown[]) => JSON.stringify({ rules });

describe('T-424 — the pointer comes from OUR copy, never from the model', () => {
  it('resolves a named marker to our clause id and our verbatim wording', () => {
    const result = admitExtractedRules(
      clauses,
      ['technical'],
      'required',
      answer([
        {
          clause: 'C1',
          kind: 'term',
          statement: 'Use “scheme”, not “project”.',
          scope: 'sentence',
          register: 'all',
          enforcement: 'raises_findings',
          excepted_contexts: ['quotations'],
          excepted_terms: ['the Project Board'],
          payload: { preferred: 'scheme', replaces: ['project'] },
        },
      ]),
    );
    expect(result.rules).toHaveLength(1);
    const rule = result.rules[0]!;
    expect(rule.origin).toBe('extracted');
    expect(rule.clauseId).toBe(clauses[0]!.id);
    // 🔒 byte for byte, from the clause we loaded — not the model's restatement
    expect(rule.clauseWording).toBe(clauses[0]!.content);
    expect(rule.clause).toBe('4.2');
    expect(rule.exceptedTerms).toEqual(['the Project Board']);
  });

  it('discards a rule naming a clause this run never showed it, and counts it', () => {
    const result = admitExtractedRules(
      clauses,
      ['technical'],
      'required',
      answer([
        { clause: 'C9', kind: 'term', statement: 'Invented.', scope: 'sentence', register: 'all' },
        { kind: 'term', statement: 'No marker at all.', scope: 'sentence', register: 'all' },
      ]),
    );
    expect(result.rules).toHaveLength(0);
    expect(result.discarded.unknownClause).toBe(2);
  });

  it('never lets the model set the origin — an extracted rule is extracted', () => {
    const result = admitExtractedRules(
      clauses,
      ['technical'],
      'advisory',
      answer([
        {
          clause: 'C1',
          kind: 'judgement',
          origin: 'infora_proposed',
          statement: 'Something.',
          scope: 'sentence',
          register: 'all',
        },
      ]),
    );
    expect(result.rules[0]!.origin).toBe('extracted');
    // and the default severity is the client's answer, never the model's
    expect(result.rules[0]!.severity).toBe('advisory');
  });

  it('discards a rule of a kind that is not one of the five', () => {
    const result = admitExtractedRules(
      clauses,
      ['technical'],
      'required',
      answer([{ clause: 'C1', kind: 'tone', statement: 'Be nice.', scope: 'sentence' }]),
    );
    expect(result.rules).toHaveLength(0);
    expect(result.discarded.unknownKind).toBe(1);
  });
});

describe('T-424 — a pattern the matcher will not run is demoted, never dropped', () => {
  it('keeps a workable expression as a pattern rule', () => {
    const result = admitExtractedRules(
      clauses,
      ['technical'],
      'required',
      answer([
        {
          clause: 'C2',
          kind: 'pattern',
          statement: 'No contractions.',
          scope: 'sentence',
          register: 'all',
          payload: { expression: "\\b\\w+n't\\b" },
        },
      ]),
    );
    expect(result.rules[0]!.kind).toBe('pattern');
  });

  it('demotes a catastrophically backtracking expression to a judgement rule', () => {
    // the obligation the clause imposed is real; a person decides on the review
    // screen what to do with it, and the matcher never runs the expression
    const result = admitExtractedRules(
      clauses,
      ['technical'],
      'required',
      answer([
        {
          clause: 'C2',
          kind: 'pattern',
          statement: 'No contractions.',
          scope: 'sentence',
          register: 'all',
          payload: { expression: '(a+)+$' },
        },
      ]),
    );
    expect(result.rules[0]!.kind).toBe('judgement');
    expect(result.rules[0]!.payload.expression).toBeUndefined();
  });

  it('refuses an expression that will not compile, and one that is absurdly long', () => {
    expect(usablePattern('(unclosed')).toBe(false);
    expect(usablePattern('a'.repeat(400))).toBe(false);
    expect(usablePattern('\\bfoo\\b')).toBe(true);
  });

  it('ships no baseline pattern the guard would refuse', () => {
    for (const rule of INFORA_BASELINE) {
      if (rule.kind !== 'pattern') continue;
      expect(usablePattern(rule.payload?.expression)).toBe(true);
    }
  });
});

describe('T-424 — gap-filling is Infora’s own, marked, and only where the guide is silent', () => {
  it('proposes a baseline rule the extracted set does not cover', () => {
    const proposed = fillGaps(['technical'], [{ topic: 'active-voice', register: 'all' }], 'advisory');
    const topics = proposed.map((rule) => rule.statement);
    expect(topics).not.toContain('Write in the active voice where the meaning allows it.');
    expect(topics).toContain('Sentences average no more than 25 words.');
  });

  it('marks every proposed rule as Infora’s own and gives it NO client wording', () => {
    const proposed = fillGaps(['simple-english'], [], 'required');
    expect(proposed.length).toBeGreaterThan(0);
    for (const rule of proposed) {
      expect(rule.origin).toBe('infora_proposed');
      // 🔒 it can never claim the client's guide said it — and the store's own
      // CHECK would refuse the row if it tried
      expect(rule.clauseId).toBeUndefined();
      expect(rule.clauseWording).toBeUndefined();
      expect(rule.severity).toBe('required');
    }
  });

  it('proposes a register’s own rules only for the registers that were selected', () => {
    const technical = fillGaps(['technical'], [], 'advisory').map((rule) => rule.statement);
    const plain = fillGaps(['simple-english'], [], 'advisory').map((rule) => rule.statement);
    // unit spacing is a technical-writing rule; the grade-10 target is not
    expect(technical).toContain('Leave a space between a number and its unit — 50 m, not 50m.');
    expect(technical).not.toContain('The text reads at about a grade-10 reading level.');
    expect(plain).toContain('The text reads at about a grade-10 reading level.');
    expect(plain).not.toContain('Leave a space between a number and its unit — 50 m, not 50m.');
  });
});

describe('T-424 — the prompt says the thing the whole extraction rests on', () => {
  const prompt = composeRuleExtractionPrompt(clauses, ['technical', 'simple-english']);

  it('tells the model to SPLIT a clause that says three things', () => {
    expect(prompt).toContain('SPLIT');
    expect(prompt).toContain('THREE rules');
    expect(prompt).toContain('answerable yes or no');
  });

  it('shows each clause under a marker, verbatim', () => {
    expect(prompt).toContain('[C1] (4.2) Terminology');
    expect(prompt).toContain(clauses[0]!.content);
  });

  it('names the registers the set must cover, and no others', () => {
    expect(prompt).toContain('technical, simple-english');
    expect(prompt).not.toContain('"non-technical"');
  });

  it('states why exceptions exist, in the case that produces them', () => {
    expect(prompt).toContain('Project Board');
  });
});
