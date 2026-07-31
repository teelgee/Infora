// T-255/T-258 — `pnpm --filter @infora/evals run eval`: run a tier's cases
// against a live database, print the tables, write the result file.
//
//   --tier smoke|full|release   which cases run (docs/build/ask/07 §5); default full
//   --repeats N                 attempts per case for flake detection (§8)
//
// The tier selects CASES and REPEATS here, not providers: every tier runs on
// the deterministic fake router until a deployment configures a real one. What
// the tier already decides for real is what may run and what may be emitted —
// hold-out at release only, model-graded cases never in smoke.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flakeGates } from './flake';
import { startHarness } from './harness';
import { buildReport, formatReport } from './report';
import { loadCases, prepareFixtures, runCases } from './suite';
import { defaultRepeats, isTier, selectCases, TIERS } from './tiers';
import type { Tier } from './tiers';

const resultsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'results');

const flag = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};

const requested = flag('tier') ?? 'full';
if (!isTier(requested)) {
  console.error(`unknown tier '${requested}' — expected one of ${TIERS.join(', ')}`);
  process.exit(2);
}
const tier: Tier = requested;
const repeats = Number(flag('repeats') ?? defaultRepeats(tier));

const harness = await startHarness();
try {
  const { selected, excluded } = selectCases(await loadCases(), tier);
  const instances = await prepareFixtures(harness, selected);
  const report = buildReport(await runCases(harness, selected, instances, { repeats }), tier);

  console.log(`tier: ${tier}, ${repeats} attempt(s) per case\n`);
  console.log(formatReport(report));
  // §7 — what a release run excluded may be named; what a development run
  // excluded may NOT be broken down by hold-out, because that count is
  // feedback. So the excluded list is printed only at release.
  if (tier === 'release' && excluded.length > 0) {
    console.log(`\nnot run: ${excluded.map((e) => `${e.caseId} (${e.reason})`).join(', ')}`);
  } else if (excluded.length > 0) {
    console.log(`\n${excluded.length} case(s) not run in this tier`);
  }

  await mkdir(resultsDir, { recursive: true });
  const path = join(resultsDir, `${report.generatedAt.replace(/[:.]/g, '-')}.json`);
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nresult file: ${path}`);

  // A regression in any category blocks the ticket (§5). An error or an
  // ungraded case counts, because a case the harness could not evaluate is not
  // a pass (§6) — a gate that let `ungraded` through would be treating it as a
  // pass under another name.
  //
  // Flake is the asymmetric one (§8): a flaky case's own verdict never gates —
  // it is one of several the same case produced — but flakiness itself gates
  // unless the run is known to be model-chosen, where a non-repeatable sequence
  // is the design rather than a defect.
  const regressions = Object.values(report.byCategory).every(
    (t) => t.fail === 0 && t.error === 0 && t.ungraded === 0,
  );
  const flakes = report.results.filter(flakeGates);
  for (const flake of flakes) {
    console.error(`\n${flake.caseId} is flaky in a mode where that is a bug`);
  }
  process.exitCode = regressions && flakes.length === 0 ? 0 : 1;
} finally {
  await harness.close();
}
