// T-255 — the two outputs (docs/build/ask/07 §4): a human-readable per-category
// table, and a machine-readable result file.
//
// PER CATEGORY, NEVER A SINGLE AGGREGATE (§4.1). 95% overall with permission
// cases at 80% is not a good result, it is a serious one, and an aggregate is
// exactly the number that hides it. So this module has no total row and the
// result file has no total field — asserted by a test at T-257, and worth not
// introducing in the meantime.
//
// Hold-out (§7) is not emitted outside a release run — not even as a count,
// because a count is feedback. The runner enforces that here rather than
// leaving it to a process rule.
import { CATEGORIES } from './case';
import type { Category } from './case';
import type { CaseResult } from './runner';

export type CategoryTally = { cases: number; pass: number; fail: number; error: number };

export type EvalReport = {
  generatedAt: string;
  /** 'development' hides hold-out entirely; 'release' includes it */
  tier: 'development' | 'release';
  byCategory: Record<Category, CategoryTally>;
  results: CaseResult[];
};

export function buildReport(
  results: CaseResult[],
  tier: 'development' | 'release' = 'development',
): EvalReport {
  const emitted = tier === 'release' ? results : results.filter((result) => !result.holdOut);
  const byCategory = Object.fromEntries(
    CATEGORIES.map((category) => [category, tally(emitted.filter((r) => r.category === category))]),
  ) as Record<Category, CategoryTally>;
  return { generatedAt: new Date().toISOString(), tier, byCategory, results: emitted };
}

function tally(results: CaseResult[]): CategoryTally {
  return {
    cases: results.length,
    pass: results.filter((r) => r.verdict === 'pass').length,
    fail: results.filter((r) => r.verdict === 'fail').length,
    error: results.filter((r) => r.verdict === 'error').length,
  };
}

/** The per-category table, for a terminal. No aggregate row, deliberately. */
export function formatReport(report: EvalReport): string {
  const header = ['category', 'cases', 'pass', 'fail', 'error'];
  const rows = CATEGORIES.filter((category) => report.byCategory[category].cases > 0).map(
    (category) => {
      const t = report.byCategory[category];
      return [category, `${t.cases}`, `${t.pass}`, `${t.fail}`, `${t.error}`];
    },
  );
  const widths = header.map((_, column) =>
    Math.max(header[column]!.length, ...rows.map((row) => row[column]!.length)),
  );
  const line = (cells: string[]) =>
    cells.map((cell, column) => cell.padEnd(widths[column]!)).join('  ').trimEnd();

  const table = [line(header), line(widths.map((width) => '-'.repeat(width))), ...rows.map(line)];
  const notes = report.results
    .filter((result) => result.verdict !== 'pass')
    .flatMap((result) => [
      `${result.verdict.toUpperCase()} ${result.caseId} — ${result.description}`,
      ...result.failures.map((failure) => `    ${failure}`),
    ]);
  return [...table, ...(notes.length > 0 ? ['', ...notes] : [])].join('\n');
}
