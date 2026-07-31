// T-257 acceptance — model-graded assertions and the independence rule
// (docs/build/ask/07 §6, 04 §3). No provider: the graders here are stubs of a
// stated family, which is the only property the rule turns on.
import { describe, expect, it, vi } from 'vitest';
import { evaluateAssertions } from './assertions';
import type { AssertionContext, Observation } from './assertions';
import { claimOf, gradeClaims, isGraded } from './grading';
import type { Grader } from './grading';

const ANSWER = 'The survey recorded 0.41 mg/l of phosphate at HB-04, against a baseline of 0.09.';

/** A grader of a stated family that answers however the test tells it to. */
const graderOf = (family: string, present: boolean, reason?: string): Grader => ({
  family,
  model: `${family}-judge-1`,
  grade: vi.fn(async () => ({ present, ...(reason !== undefined && { reason }) })),
});

const observation = (over: Partial<Observation> = {}): Observation => ({
  answer: ANSWER,
  citations: [],
  sourceSet: [],
  retrieved: [],
  railOutcomes: [{ rail: 'grounding', outcome: 'passed' }],
  workersCalled: null,
  ...over,
});

const context = (grading?: AssertionContext['grading']): AssertionContext => ({
  observation: observation(),
  resolveRef: () => {
    throw new Error('no refs in these cases');
  },
  resolveChunk: () => {
    throw new Error('no chunks in these cases');
  },
  ...(grading !== undefined && { grading }),
});

describe('the ~claim form', () => {
  it('separates a graded claim from a substring and a regex', () => {
    expect(isGraded('~the answer states the exceedance is against a baseline')).toBe(true);
    expect(isGraded('0.41 mg/l')).toBe(false);
    expect(isGraded('/HB-\\d\\d/')).toBe(false);
    expect(claimOf('~  the answer marks the date as inferred ')).toBe(
      'the answer marks the date as inferred',
    );
  });
});

describe('the independence rule (§6)', () => {
  it('grades with an independent family, and records which one', async () => {
    const grader = graderOf('other-family', true);
    const { failures, grades } = await gradeClaims(
      [{ assertion: 'must_contain', pattern: '~the exceedance is stated against a baseline' }],
      ANSWER,
      { producerFamily: 'producing-family', grader },
    );

    expect(failures).toEqual([]);
    expect(grades).toEqual([
      {
        assertion: 'must_contain',
        claim: 'the exceedance is stated against a baseline',
        grader: { family: 'other-family', model: 'other-family-judge-1' },
        outcome: 'present',
      },
    ]);
    expect(grader.grade).toHaveBeenCalledWith({
      claim: 'the exceedance is stated against a baseline',
      answer: ANSWER,
      assertion: 'must_contain',
    });
  });

  it('refuses a grader of the producing family — it never calls it', async () => {
    // Same-family grading is largely self-agreement: the failure it cannot see
    // is the failure it just made. Refusing is the whole rule, and refusing
    // means NOT DISPATCHING, not dispatching and discounting the answer.
    const grader = graderOf('producing-family', true);
    const { failures, grades } = await gradeClaims(
      [{ assertion: 'must_contain', pattern: '~anything at all' }],
      ANSWER,
      { producerFamily: 'producing-family', grader },
    );

    expect(grader.grade).not.toHaveBeenCalled();
    expect(grades[0]!.outcome).toBe('ungraded');
    expect(grades[0]!.grader).toBeNull();
    expect(grades[0]!.reason).toContain('self-agreement');
    // ungraded is not a failure of the answer, so it adds no failure — the
    // runner turns it into the `ungraded` verdict instead
    expect(failures).toEqual([]);
  });

  it('is ungraded when no grader is configured at all', async () => {
    const { grades } = await gradeClaims(
      [{ assertion: 'must_contain', pattern: '~anything at all' }],
      ANSWER,
      { producerFamily: 'producing-family' },
    );
    expect(grades[0]!.outcome).toBe('ungraded');
    expect(grades[0]!.reason).toContain('no grader is configured');
  });
});

describe('graded claims decide the assertion', () => {
  const grading = (present: boolean) => ({
    producerFamily: 'producing-family',
    grader: graderOf('other-family', present),
  });

  it('fails must_contain when the grader says the claim is absent, and passes when present', async () => {
    const declared = { must_contain: ['~the exceedance is against a baseline'] };

    const held = await evaluateAssertions(declared, context(grading(true)));
    expect(held.failures).toEqual([]);
    expect(held.grades[0]!.outcome).toBe('present');

    const missing = await evaluateAssertions(declared, context(grading(false)));
    expect(missing.failures).toEqual([
      'must_contain (graded): the answer does not claim "the exceedance is against a baseline"',
    ]);
    expect(missing.grades[0]!.outcome).toBe('absent');
  });

  it('fails must_not_contain when the grader says the claim IS made', async () => {
    const declared = { must_not_contain: ['~the reservoir will pass examination'] };

    expect((await evaluateAssertions(declared, context(grading(false)))).failures).toEqual([]);
    expect((await evaluateAssertions(declared, context(grading(true)))).failures).toEqual([
      'must_not_contain (graded): the answer claims "the reservoir will pass examination"',
    ]);
  });

  it('keeps the deterministic and graded halves of one list apart', async () => {
    // The failure this guards: a `~claim` matched as a literal substring — it
    // would never appear in an answer, so every graded assertion would fail for
    // a reason that has nothing to do with grading.
    const report = await evaluateAssertions(
      {
        must_contain: ['0.41 mg/l', '/HB-\\d\\d/', '~the exceedance is against a baseline'],
        must_not_contain: ['dissolved metals'],
      },
      context(grading(true)),
    );

    expect(report.failures).toEqual([]);
    expect(report.grades).toHaveLength(1);
    expect(report.grades[0]!.claim).toBe('the exceedance is against a baseline');
  });

  it('records nothing when a case declares no graded claim', async () => {
    const report = await evaluateAssertions({ must_contain: ['0.41 mg/l'] }, context());
    expect(report.grades).toEqual([]);
  });
});
