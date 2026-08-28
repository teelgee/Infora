// T-258 — flake detection (evals/README.md).
//
// The nightly tier runs each case N times (default 3). Inconsistent verdicts
// across those attempts mark the case `flaky` in the result file — set by the
// runner and never by an author, which is why the case schema refuses a
// hand-written `flaky` key (§1, case.ts).
//
// THE ASYMMETRY, which is the whole point of the ticket:
//
//   * a flaky **declared**-mode case is a real bug. A declared workflow that
//     takes different routes over a frozen fixture has broken its central
//     promise (§8, 03 §1.1), so it fails the build.
//   * a flaky **model-chosen** case is not a defect. Its step sequence is not
//     repeatable by design, and gating on that would be gating on the design.
//
// And the third bucket decides the default. A run whose mode is unlabelled
// (no plan was readable for it at all) gets the DECLARED treatment, not the
// model-chosen one: the exemption needs
// evidence, and the absence of a label is not evidence. The smoke substrate is
// deterministic by construction, so a flake there is a bug whatever the mode
// turns out to have been.
import type { CaseResult } from './runner';

/**
 * Fold a case's repeated attempts into the one result the report carries.
 *
 * The reported verdict is the FIRST attempt's — recorded, not trusted. §8 says
 * a flaky case's verdict does not gate a ticket, so the gate reads `flaky`
 * (with the mode) and never this field.
 */
export function foldAttempts(attempts: CaseResult[]): CaseResult {
  if (attempts.length === 0) throw new Error('a case with no attempts has no result');
  const first = attempts[0]!;
  const verdicts = attempts.map((attempt) => attempt.verdict);
  return {
    ...first,
    attempts: verdicts,
    flaky: new Set(verdicts).size > 1,
  };
}

/** Does this case's flakiness gate the build? */
export function flakeGates(result: CaseResult): boolean {
  return result.flaky && result.mode !== 'model_chosen';
}

/** One line per flaky case, for the report's own flake section (§8). */
export function flakeNote(result: CaseResult): string {
  const verdicts = [...new Set(result.attempts)].sort().join(' / ');
  const mode = result.mode ?? 'unlabelled';
  const consequence = flakeGates(result)
    ? 'blocks the build — a repeatable sequence that was not repeatable'
    : 'expected in model-chosen mode, and not a defect there';
  return `FLAKY ${result.caseId} (${mode}) — ${result.attempts.length} attempts gave ${verdicts}; ${consequence}`;
}
