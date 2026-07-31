// T-255/T-257 — the two outputs (docs/build/ask/07 §4): a human-readable
// per-category table, and a machine-readable result file.
//
// PER CATEGORY, NEVER A SINGLE AGGREGATE (§4.1). 95% overall with permission
// cases at 80% is not a good result, it is a serious one, and an aggregate is
// exactly the number that hides it. So this module has no total row and the
// result file has no total field — asserted structurally in report.test.ts,
// against the shape rather than against the wording, so a `passRate` added in
// good faith later cannot slip past a test that only looked for "total".
//
// AND BY MODE, ALWAYS SEPARATELY (§4.1). Declared and model-chosen runs are not
// comparable: a declared workflow that takes a different route over a frozen
// fixture has broken its central promise, and a model-chosen one that does is
// behaving as designed (§8). Reporting them together lets a gain in one mask a
// regression in the other, which is the same failure as the aggregate one
// table up.
//
// Hold-out (§7) is not emitted outside a release run — not even as a count,
// because a count is feedback. The runner enforces that here rather than
// leaving it to a process rule.
import { CATEGORIES } from './case';
import type { Category } from './case';
import type { CaseResult } from './runner';

/**
 * The modes a result is reported under. `unlabelled` is the honest third
 * bucket, not a default: a run carries no mode until the classifier labels one
 * (T-266) and nothing reads a plan's stored mode over HTTP until T-261. Folding
 * those into `declared` because the coded chain happens to be declared would
 * put a label in the report that no run stated.
 */
export const REPORTED_MODES = ['declared', 'model_chosen', 'unlabelled'] as const;
export type ReportedMode = (typeof REPORTED_MODES)[number];

export type Tally = { cases: number; pass: number; fail: number; error: number; ungraded: number };

export type EvalReport = {
  generatedAt: string;
  /** 'development' hides hold-out entirely; 'release' includes it */
  tier: 'development' | 'release';
  byCategory: Record<Category, Tally>;
  byMode: Record<ReportedMode, Tally>;
  results: CaseResult[];
};

export function buildReport(
  results: CaseResult[],
  tier: 'development' | 'release' = 'development',
): EvalReport {
  const emitted = tier === 'release' ? results : results.filter((result) => !result.holdOut);
  const byCategory = Object.fromEntries(
    CATEGORIES.map((category) => [category, tally(emitted.filter((r) => r.category === category))]),
  ) as Record<Category, Tally>;
  const byMode = Object.fromEntries(
    REPORTED_MODES.map((mode) => [mode, tally(emitted.filter((r) => modeOf(r) === mode))]),
  ) as Record<ReportedMode, Tally>;
  return { generatedAt: new Date().toISOString(), tier, byCategory, byMode, results: emitted };
}

export function modeOf(result: CaseResult): ReportedMode {
  return result.mode ?? 'unlabelled';
}

function tally(results: CaseResult[]): Tally {
  return {
    cases: results.length,
    pass: results.filter((r) => r.verdict === 'pass').length,
    fail: results.filter((r) => r.verdict === 'fail').length,
    error: results.filter((r) => r.verdict === 'error').length,
    // §6: a case whose grade could not be taken independently is reported as
    // `ungraded`, never as a pass — so it gets a column of its own here rather
    // than being folded into either side
    ungraded: results.filter((r) => r.verdict === 'ungraded').length,
  };
}

/** The two breakdown tables, for a terminal. No aggregate row, deliberately. */
export function formatReport(report: EvalReport): string {
  const notes = report.results
    .filter((result) => result.verdict !== 'pass')
    .flatMap((result) => [
      `${result.verdict.toUpperCase()} ${result.caseId} — ${result.description}`,
      ...result.failures.map((failure) => `    ${failure}`),
      ...result.grades
        .filter((grade) => grade.outcome === 'ungraded')
        .map((grade) => `    ungraded: ${JSON.stringify(grade.claim)} — ${grade.reason ?? ''}`),
    ]);

  return [
    ...table('category', CATEGORIES, report.byCategory),
    '',
    ...table('mode', REPORTED_MODES, report.byMode),
    ...(notes.length > 0 ? ['', ...notes] : []),
  ].join('\n');
}

function table<K extends string>(
  label: string,
  keys: readonly K[],
  tallies: Record<K, Tally>,
): string[] {
  const header = [label, 'cases', 'pass', 'fail', 'error', 'ungraded'];
  const rows = keys
    .filter((key) => tallies[key].cases > 0)
    .map((key) => {
      const t = tallies[key];
      return [key, `${t.cases}`, `${t.pass}`, `${t.fail}`, `${t.error}`, `${t.ungraded}`];
    });
  const widths = header.map((_, column) =>
    Math.max(header[column]!.length, ...rows.map((row) => row[column]!.length)),
  );
  const line = (cells: string[]) =>
    cells.map((cell, column) => cell.padEnd(widths[column]!)).join('  ').trimEnd();

  return [line(header), line(widths.map((width) => '-'.repeat(width))), ...rows.map(line)];
}
