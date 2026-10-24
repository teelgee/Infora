// T-476 — a judgement finding names its rule or its second passage; the checker
// body carries the optional disproving pass; the strength map covers every rule
// kind and every check family.
import { describe, expect, it } from 'vitest';
import { CHECK_FAMILIES, FAMILY_STRENGTH, RULE_KIND_STRENGTH, STRENGTH_LABEL } from './checker';
import { qaCheckBody } from './endpoints';
import { namesRuleOrPassage } from './finding';
import { RULE_KINDS } from './rule-set';

const anchor = { span: { start: 0, end: 3 }, paragraph: 0, verbatim: 'abc' };

describe('a judgement finding names its rule or its second passage (T-476)', () => {
  it('refuses a style finding with draft evidence and no rule', () => {
    expect(
      namesRuleOrPassage({ checkFamily: 'style', evidence: { input: 'draft', basis: 'a typed rule' } }),
    ).toBe(false);
    expect(
      namesRuleOrPassage({ checkFamily: 'style', evidence: { input: 'draft', basis: 'x', ruleId: '' } }),
    ).toBe(false);
  });

  it('accepts one that names its rule, and a contradiction that carries its second place', () => {
    expect(
      namesRuleOrPassage({ checkFamily: 'style', evidence: { input: 'draft', basis: 'x', ruleId: 'r-1' } }),
    ).toBe(true);
    expect(
      namesRuleOrPassage({
        checkFamily: 'self_contradiction',
        evidence: { input: 'draft', basis: 'section 3', otherAnchor: anchor },
      }),
    ).toBe(true);
    expect(
      namesRuleOrPassage({ checkFamily: 'self_contradiction', evidence: { input: 'draft', basis: 's3' } }),
    ).toBe(false);
  });

  it('does not ask the arithmetic checks, nor a finding that carries its own proof', () => {
    expect(
      namesRuleOrPassage({ checkFamily: 'readability', evidence: { input: 'draft', basis: 'grade 14' } }),
    ).toBe(true);
    expect(
      namesRuleOrPassage({ checkFamily: 'corpus_accuracy', evidence: { input: 'corpus', citations: [] } }),
    ).toBe(true);
  });
});

describe('the checker body (T-476)', () => {
  const base = { sandboxDocumentId: '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b', families: ['style'], depth: 'quick' };
  it('the disproving pass is OFF unless asked for', () => {
    expect(qaCheckBody.parse(base).disprovingPass).toBe(false);
    expect(qaCheckBody.parse({ ...base, disprovingPass: true }).disprovingPass).toBe(true);
  });
});

describe('the strength map (T-476, ADR-0053 A8)', () => {
  it('has a row for every rule kind and every check family, each marked one way or the other', () => {
    expect(RULE_KIND_STRENGTH.map((entry) => entry.key)).toEqual([...RULE_KINDS]);
    expect(FAMILY_STRENGTH.map((entry) => entry.key)).toEqual([...CHECK_FAMILIES]);
    for (const entry of [...RULE_KIND_STRENGTH, ...FAMILY_STRENGTH]) {
      expect(['code', 'model']).toContain(entry.strength);
      expect(entry.sentence.length).toBeGreaterThan(10);
    }
    expect(STRENGTH_LABEL).toEqual({ code: 'Settled in code', model: 'The model’s reading' });
  });

  it('marks only judgement among the kinds as the model’s reading (ADR-0054 §4)', () => {
    expect(RULE_KIND_STRENGTH.filter((entry) => entry.strength === 'model').map((entry) => entry.key)).toEqual(['judgement']);
  });
});
