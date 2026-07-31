// T-258 acceptance, part 2 — flake detection and the mode asymmetry
// (evals/README.md). Pure folding over attempts: the interesting behaviour is what
// several verdicts for one case mean, not how they were produced.
import { describe, expect, it } from 'vitest';
import { flakeGates, flakeNote, foldAttempts } from './flake';
import { buildReport, formatReport } from './report';
import type { CaseResult, Verdict } from './runner';

const attempt = (verdict: Verdict, over: Partial<CaseResult> = {}): CaseResult => ({
  caseId: 'ROUTE-01',
  category: 'happy',
  description: 'a declared workflow routes into itself',
  verdict,
  failures: verdict === 'fail' ? ['something did not hold'] : [],
  flaky: false,
  attempts: [verdict],
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

describe('folding repeated attempts', () => {
  it('is not flaky when every attempt agrees', () => {
    const folded = foldAttempts([attempt('pass'), attempt('pass'), attempt('pass')]);
    expect(folded.flaky).toBe(false);
    expect(folded.attempts).toEqual(['pass', 'pass', 'pass']);
  });

  it('is flaky when the verdicts disagree, and keeps every verdict', () => {
    const folded = foldAttempts([attempt('pass'), attempt('fail'), attempt('pass')]);
    expect(folded.flaky).toBe(true);
    expect(folded.attempts).toEqual(['pass', 'fail', 'pass']);
    // the reported verdict is the first attempt's — recorded, not trusted; §8
    // says a flaky case's verdict does not gate, so nothing reads this field
    expect(folded.verdict).toBe('pass');
  });

  it('records a single attempt as not-flaky rather than as proven stable', () => {
    const folded = foldAttempts([attempt('pass')]);
    expect(folded.flaky).toBe(false);
    expect(folded.attempts).toHaveLength(1);
  });
});

describe('the mode asymmetry (§8)', () => {
  it('gates on a flaky declared case and not on a flaky model-chosen one', () => {
    // A declared workflow taking different routes over a frozen fixture has
    // broken its central promise. A model-chosen one doing the same is
    // behaving as designed, and gating on it would be gating on the design.
    const declared = foldAttempts([attempt('pass', { mode: 'declared' }), attempt('fail', { mode: 'declared' })]);
    const chosen = foldAttempts([
      attempt('pass', { mode: 'model_chosen' }),
      attempt('fail', { mode: 'model_chosen' }),
    ]);

    expect(flakeGates(declared)).toBe(true);
    expect(flakeGates(chosen)).toBe(false);
    expect(flakeNote(declared)).toContain('blocks the build');
    expect(flakeNote(chosen)).toContain('not a defect there');
  });

  it('treats an unlabelled run as declared — the exemption needs evidence', () => {
    // Nothing labels a mode until T-266. Absence of a label is not a claim that
    // the sequence was model-chosen, so the exemption does not apply, and a
    // flake on the deterministic smoke substrate is a bug whatever it was.
    const unlabelled = foldAttempts([attempt('pass'), attempt('error')]);
    expect(unlabelled.mode).toBeNull();
    expect(flakeGates(unlabelled)).toBe(true);
  });

  it('never gates on a case whose attempts all agreed, in either mode', () => {
    expect(flakeGates(foldAttempts([attempt('fail'), attempt('fail')]))).toBe(false);
  });
});

describe('flake in the report (§8)', () => {
  const flaky = foldAttempts([attempt('pass', { mode: 'declared' }), attempt('fail', { mode: 'declared' })]);

  it('counts in its own column and in none of the verdict columns', () => {
    const report = buildReport([flaky]);
    expect(report.byCategory.happy).toEqual({
      cases: 1,
      pass: 0,
      fail: 0,
      error: 0,
      ungraded: 0,
      flaky: 1,
    });
  });

  it('gets its own section, with the mode and the consequence stated', () => {
    const printed = formatReport(buildReport([flaky]));
    expect(printed).toContain('FLAKY ROUTE-01 (declared)');
    expect(printed).toContain('blocks the build');
    // and it is NOT listed among the ordinary failures — its verdict is one of
    // several the same case produced, so quoting the failure text would state a
    // result the run did not have
    expect(printed).not.toContain('something did not hold');
  });
});
