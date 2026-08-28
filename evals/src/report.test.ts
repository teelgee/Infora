// T-257 acceptance — the report's shape. Pure functions over CaseResult[], so
// no database and no harness: what is under test is what the report is allowed
// to say, not what any run did.
//
// Two of these tests are structural rather than behavioural, deliberately. "No
// aggregate" and "the modes are always separate" are properties a future change
// erodes by addition — a `passRate` field added in good faith, a mode folded
// into another because the third bucket looked untidy — and a test that only
// checked today's numbers would not notice either.
import { describe, expect, it } from 'vitest';
import { CATEGORIES } from './case';
import type { Category } from './case';
import { buildReport, formatReport, NO_LENS, REPORTED_MODES } from './report';
import type { CaseResult, Verdict } from './runner';

const result = (over: Partial<CaseResult> = {}): CaseResult => ({
  caseId: 'X-01',
  category: 'happy',
  description: 'a case',
  verdict: 'pass',
  failures: [],
  flaky: false,
  attempts: ['pass'],
  holdOut: false,
  fixture: { id: 'f', version: 1, instance: 'f-v1-abcd' },
  routingTable: { chat: 'fake-chat', chatFamily: 'fake', embedding: 'eval-embed' },
  lens: null,
  mode: null,
  plan: null,
  workersCalled: null,
  steps: [],
  retrieval: null,
  grades: [],
  run: null,
  ...over,
});

describe('per category, and never a single aggregate (§4.1)', () => {
  it('carries all five categories, including the ones with no cases', () => {
    const report = buildReport([result({ category: 'permission' })]);
    expect(Object.keys(report.byCategory).sort()).toEqual([...CATEGORIES].sort());
    expect(report.byCategory.permission).toEqual({
      cases: 1,
      pass: 1,
      fail: 0,
      error: 0,
      ungraded: 0,
      flaky: 0,
    });
    // a category with no cases is 0/0, not absent: an absent row reads as
    // "nothing to report" where it means "nothing was tested"
    expect(report.byCategory.trap).toEqual({ cases: 0, pass: 0, fail: 0, error: 0, ungraded: 0, flaky: 0 });
  });

  it('has no aggregate field anywhere in the report, by shape not by name', () => {
    const results: CaseResult[] = [
      result({ caseId: 'A', category: 'happy', verdict: 'pass' }),
      result({ caseId: 'B', category: 'permission', verdict: 'fail' }),
    ];
    const report = buildReport(results);

    expect(Object.keys(report)).toEqual([
      'generatedAt',
      'tier',
      'byCategory',
      'byMode',
      'byLens',
      // T-266 — a share, and deliberately not one of the aggregates this test
      // forbids. The banned number is a PASS RATE across categories, which
      // hides a bad category behind a good one; this measures which mode ran,
      // not how well anything did, and its whole job is to be looked at.
      'fallThroughRate',
      'results',
    ]);
    // 95% overall with permission at 80% is not a good result, it is a serious
    // one — and the number that hides it is the one nobody may add
    const aggregate = /total|overall|aggregate|summary|pass_?rate|score|combined|^all$/i;
    expect(Object.keys(report).filter((key) => aggregate.test(key))).toEqual([]);
    expect(Object.keys(report.byCategory).filter((key) => aggregate.test(key))).toEqual([]);
    expect(Object.keys(report.byMode).filter((key) => aggregate.test(key))).toEqual([]);
    expect(Object.keys(report.byLens).filter((key) => aggregate.test(key))).toEqual([]);

    const printed = formatReport(report);
    expect(printed).not.toMatch(aggregate);
    // and no table row sums the others: every counted row is a named breakdown
    const counted = printed.split('\n').filter((line) => /^\S+(\s+\d+)+\s*$/.test(line));
    expect(counted.length).toBeGreaterThan(0);
    for (const row of counted) {
      expect([...CATEGORIES, ...REPORTED_MODES, ...Object.keys(report.byLens)]).toContain(
        row.split(/\s+/)[0]!,
      );
    }
  });
});

// T-282 — §4.1's per-Lens breakdown, deferred at T-257 for want of anything to
// key on. The Lens layer's whole claim is that the four read differently, so a
// regression in one that another's improvement hides is precisely the result
// this table exists to prevent.
describe('the per-Lens breakdown (§4.1, T-282)', () => {
  it('reports each Lens separately, and a Lens with no cases does not appear', () => {
    const report = buildReport([
      result({ caseId: 'L1', lens: 'planning-environmental', verdict: 'pass' }),
      result({ caseId: 'L2', lens: 'planning-environmental', verdict: 'fail' }),
      result({ caseId: 'L3', lens: 'communications', verdict: 'pass' }),
    ]);

    expect(Object.keys(report.byLens).sort()).toEqual(['communications', 'planning-environmental']);
    expect(report.byLens['planning-environmental']).toEqual({
      cases: 2,
      pass: 1,
      fail: 1,
      error: 0,
      ungraded: 0,
      flaky: 0,
    });
    // no `engineer` row of zeroes: unlike a category, a Lens set is open and a
    // zero row would claim the Lens was covered by a suite that never named it
    expect(report.byLens['engineer']).toBeUndefined();
    expect(formatReport(report)).toContain('planning-environmental');
  });

  it('a case that named no Lens is bucketed as `none`, never dropped', () => {
    const report = buildReport([result({ caseId: 'N1', lens: null })]);
    expect(report.byLens[NO_LENS]).toEqual({
      cases: 1,
      pass: 1,
      fail: 0,
      error: 0,
      ungraded: 0,
      flaky: 0,
    });
  });

  it('prints no Lens table when no case named one', () => {
    const printed = formatReport(buildReport([result({ caseId: 'N1', lens: null })]));
    // a table whose only row is `none` says nothing and trains the reader to
    // skip the section
    expect(printed).not.toContain('lens ');
  });
});

describe('the mode split (§4.1)', () => {
  it('reports declared and model-chosen separately, always', () => {
    const report = buildReport([
      result({ caseId: 'D1', mode: 'declared', verdict: 'pass' }),
      result({ caseId: 'D2', mode: 'declared', verdict: 'fail' }),
      result({ caseId: 'M1', mode: 'model_chosen', verdict: 'pass' }),
    ]);

    expect(report.byMode.declared).toEqual({ cases: 2, pass: 1, fail: 1, error: 0, ungraded: 0, flaky: 0 });
    expect(report.byMode.model_chosen).toEqual({
      cases: 1,
      pass: 1,
      fail: 0,
      error: 0,
      ungraded: 0,
      flaky: 0,
    });
    // the point of the split: a 2/3 pass rate exists nowhere in this report,
    // because a gain in one mode may not mask a regression in the other
    expect(formatReport(report)).toContain('model_chosen');
  });

  it('reports an unlabelled run as unlabelled rather than assuming declared', () => {
    // A run carries a mode from T-261 (read off its plan); `unlabelled` now
    // means exactly one thing — no plan was readable — and the coded chain
    // being declared in fact is still not the same as a run having said so.
    const report = buildReport([result({ mode: null })]);
    expect(report.byMode.unlabelled.cases).toBe(1);
    expect(report.byMode.declared.cases).toBe(0);
  });

  // T-266 — the fall-through rate. The classifier's failure is QUIET: a weak
  // one routes everything to model-chosen, every answer still arrives grounded
  // and cited, and nothing goes red. This is the number that goes up.
  it('reports the fall-through rate over LABELLED runs only', () => {
    const report = buildReport([
      result({ caseId: 'D1', mode: 'declared', verdict: 'pass' }),
      result({ caseId: 'D2', mode: 'declared', verdict: 'pass' }),
      result({ caseId: 'M1', mode: 'model_chosen', verdict: 'pass' }),
      // unlabelled: no plan was read, so it is not evidence either way and
      // counting it would be inventing an observation
      result({ caseId: 'U1', mode: null, verdict: 'pass' }),
    ]);
    expect(report.fallThroughRate).toBeCloseTo(1 / 3);
    expect(formatReport(report)).toContain('fall-through to model-chosen: 33.3%');
  });

  it('reports NULL rather than 0 when nothing was labelled', () => {
    // 0 reads as "nothing fell through", which is a claim; "nothing was
    // labelled" is the fact
    expect(buildReport([result({ mode: null })]).fallThroughRate).toBeNull();
    expect(formatReport(buildReport([result({ mode: null })]))).not.toContain('fall-through');
  });

  it('applies the hold-out rule to the mode table too', () => {
    // §7: not even as a count — and a mode table that counted a hidden case
    // would be exactly that count
    const held = result({ mode: 'declared', holdOut: true });
    expect(buildReport([held]).byMode.declared.cases).toBe(0);
    expect(buildReport([held], 'release').byMode.declared.cases).toBe(1);
  });
});

describe('the ungraded verdict (§6)', () => {
  it('counts in its own column, never as a pass', () => {
    const verdicts: Verdict[] = ['pass', 'fail', 'error', 'ungraded'];
    const report = buildReport(
      verdicts.map((verdict, index) =>
        result({ caseId: `V${index}`, category: 'behaviour', verdict }),
      ),
    );

    expect(report.byCategory.behaviour).toEqual({
      cases: 4,
      pass: 1,
      fail: 1,
      error: 1,
      ungraded: 1,
      flaky: 0,
    });
    expect(formatReport(report)).toContain('ungraded');
  });

  it('states in the notes why a grade was not taken', () => {
    const report = buildReport([
      result({
        caseId: 'BEH-X',
        category: 'behaviour',
        verdict: 'ungraded',
        grades: [
          {
            assertion: 'must_contain',
            claim: 'the answer marks the inferred date',
            grader: null,
            outcome: 'ungraded',
            reason: 'no grader is configured for this run, so the claim was not assessed',
          },
        ],
      }),
    ]);

    const printed = formatReport(report);
    expect(printed).toContain('UNGRADED BEH-X');
    expect(printed).toContain('no grader is configured');
  });
});

// the categories are the five in §2 and the report is keyed by exactly them —
// a sixth would be a design change, not a data change
it('pins the five categories', () => {
  const expected: Category[] = ['happy', 'negative', 'trap', 'behaviour', 'permission'];
  expect([...CATEGORIES]).toEqual(expected);
});
