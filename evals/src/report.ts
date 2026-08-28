// T-255/T-257 — the two outputs (evals/README.md): a human-readable
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
import { flakeNote } from './flake';
import type { CaseResult } from './runner';
import type { Tier } from './tiers';

/**
 * The modes a result is reported under. `unlabelled` is the honest third
 * bucket, not a default: from T-261 the mode is read off the run's own plan, so
 * `unlabelled` now means exactly one thing — no plan was readable for this
 * result. Folding that into `declared` because the coded chain happens to be
 * declared would put a label in the report that no run stated.
 */
export const REPORTED_MODES = ['declared', 'model_chosen', 'unlabelled'] as const;
export type ReportedMode = (typeof REPORTED_MODES)[number];

export type Tally = {
  cases: number;
  pass: number;
  fail: number;
  error: number;
  ungraded: number;
  /**
   * T-258 — counted here and NOT in pass/fail/error. §8: a flaky case's verdict
   * does not gate a ticket and it is reported in its own section rather than
   * silently counted. Folding it into `fail` would gate on a verdict nobody
   * trusts; folding it into `pass` would hide it. It gets a column.
   */
  flaky: number;
};

export type EvalReport = {
  generatedAt: string;
  /** §5's tiers — hold-out is emitted in `release` and nowhere else (§7) */
  tier: Tier;
  byCategory: Record<Category, Tally>;
  byMode: Record<ReportedMode, Tally>;
  /**
   * T-282 — §4.1's per-Lens breakdown, deferred at T-257 for want of anything
   * to key on and now live. Keyed by Lens id, with `none` for cases that named
   * none; a Lens with no cases does not appear, so an empty object is the
   * honest reading of "no case declared a Lens" rather than a row of zeroes.
   *
   * It is a breakdown, not an aggregate: the same rule as `byCategory`. A Lens
   * whose register cases regress while another's improve must be visible as
   * two rows, because the Lens layer's whole claim is that the four differ.
   */
  byLens: Record<string, Tally>;
  /**
   * T-266 — **the fall-through rate: the share of labelled runs that fell
   * through to model-chosen.** A first-class product metric, not a diagnostic.
   *
   * The largest risk in the classifier is quality, and its failure is quiet: a
   * weak classifier routes everything to model-chosen, every answer still
   * arrives grounded and cited, and the product becomes the generic agent the
   * design forbids without a single test going red. **A rising share on
   * repeated question shapes means a workflow is missing**, and the shapes
   * cluster into the ticket that declares it — which is how "avoid the generic
   * powerful agent" becomes measurable rather than aspirational.
   *
   * Null when no result carried a mode at all: 0 would read as "nothing fell
   * through", which is a claim, and "nothing was labelled" is the fact.
   */
  fallThroughRate: number | null;
  results: CaseResult[];
};

export function buildReport(results: CaseResult[], tier: Tier = 'full'): EvalReport {
  // The backstop, not the control: a hold-out case is not RUN outside a release
  // run either (tiers.ts). Two independent mechanisms, because §7's rule is
  // that the results never reach development feedback at all — not even as a
  // count, since a count is feedback.
  const emitted = tier === 'release' ? results : results.filter((result) => !result.holdOut);
  const byCategory = Object.fromEntries(
    CATEGORIES.map((category) => [category, tally(emitted.filter((r) => r.category === category))]),
  ) as Record<Category, Tally>;
  const byMode = Object.fromEntries(
    REPORTED_MODES.map((mode) => [mode, tally(emitted.filter((r) => modeOf(r) === mode))]),
  ) as Record<ReportedMode, Tally>;
  const lensKeys = [...new Set(emitted.map(lensOf))].sort();
  const byLens = Object.fromEntries(
    lensKeys.map((lens) => [lens, tally(emitted.filter((r) => lensOf(r) === lens))]),
  );
  // over LABELLED runs only — an unlabelled run is one no plan was read for,
  // and counting it either way would be inventing an observation
  const labelled = byMode.declared.cases + byMode.model_chosen.cases;
  return {
    generatedAt: new Date().toISOString(),
    tier,
    byCategory,
    byMode,
    byLens,
    fallThroughRate: labelled === 0 ? null : byMode.model_chosen.cases / labelled,
    results: emitted,
  };
}

export function modeOf(result: CaseResult): ReportedMode {
  return result.mode ?? 'unlabelled';
}

/** `none` is a bucket, not a missing value: a case that named no Lens ran under the shared core alone. */
export const NO_LENS = 'none';

export function lensOf(result: CaseResult): string {
  return result.lens ?? NO_LENS;
}

function tally(results: CaseResult[]): Tally {
  // A flaky case is counted as flaky and as nothing else: its verdict is one of
  // several the same case produced, and reporting it under that verdict would
  // state a result the run did not have.
  const settled = results.filter((r) => !r.flaky);
  const verdict = (name: CaseResult['verdict']) =>
    settled.filter((r) => r.verdict === name).length;
  return {
    cases: results.length,
    pass: verdict('pass'),
    fail: verdict('fail'),
    error: verdict('error'),
    // §6: a case whose grade could not be taken independently is reported as
    // `ungraded`, never as a pass — so it gets a column of its own here rather
    // than being folded into either side
    ungraded: verdict('ungraded'),
    flaky: results.filter((r) => r.flaky).length,
  };
}

/** The two breakdown tables, for a terminal. No aggregate row, deliberately. */
export function formatReport(report: EvalReport): string {
  const notes = report.results
    .filter((result) => !result.flaky && result.verdict !== 'pass')
    .flatMap((result) => [
      `${result.verdict.toUpperCase()} ${result.caseId} — ${result.description}`,
      ...result.failures.map((failure) => `    ${failure}`),
      ...result.grades
        .filter((grade) => grade.outcome === 'ungraded')
        .map((grade) => `    ungraded: ${JSON.stringify(grade.claim)} — ${grade.reason ?? ''}`),
    ]);

  // §8 — its own section, so a flaky case is read rather than counted. The
  // declared/model-chosen consequence is stated per case, because the two look
  // identical in a table and mean opposite things.
  const flakes = report.results.filter((result) => result.flaky).map(flakeNote);

  const lensKeys = Object.keys(report.byLens).sort();

  return [
    ...table('category', CATEGORIES, report.byCategory),
    '',
    ...table('mode', REPORTED_MODES, report.byMode),
    // T-266 — printed beside the mode table, because a share is what makes the
    // two rows mean something over time. It is NOT the aggregate this report
    // forbids: the forbidden number is a pass rate across categories, which
    // hides a bad one behind a good one. This measures which mode ran, not how
    // well anything did, and its whole job is to be looked at.
    ...(report.fallThroughRate === null
      ? []
      : [`fall-through to model-chosen: ${(report.fallThroughRate * 100).toFixed(1)}% of labelled runs`]),
    // Only when a Lens was actually named. A table whose single row is `none`
    // says nothing and trains the reader to skip the section.
    ...(lensKeys.some((key) => key !== NO_LENS) ? ['', ...table('lens', lensKeys, report.byLens)] : []),
    ...(flakes.length > 0 ? ['', ...flakes] : []),
    ...(notes.length > 0 ? ['', ...notes] : []),
  ].join('\n');
}

function table<K extends string>(
  label: string,
  keys: readonly K[],
  tallies: Record<K, Tally>,
): string[] {
  const header = [label, 'cases', 'pass', 'fail', 'error', 'ungraded', 'flaky'];
  const rows = keys
    .filter((key) => tallies[key].cases > 0)
    .map((key) => {
      const t = tallies[key];
      return [
        key,
        `${t.cases}`,
        `${t.pass}`,
        `${t.fail}`,
        `${t.error}`,
        `${t.ungraded}`,
        `${t.flaky}`,
      ];
    });
  const widths = header.map((_, column) =>
    Math.max(header[column]!.length, ...rows.map((row) => row[column]!.length)),
  );
  const line = (cells: string[]) =>
    cells.map((cell, column) => cell.padEnd(widths[column]!)).join('  ').trimEnd();

  return [line(header), line(widths.map((width) => '-'.repeat(width))), ...rows.map(line)];
}
