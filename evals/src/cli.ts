// T-255 — `pnpm --filter @infora/evals run eval`: run every case in cases/
// against a live database, print the per-category table, write the result file.
//
// The tiers proper (smoke on every change, full nightly, hold-out at release)
// are T-258; this is the one entry point they will both dress.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startHarness } from './harness';
import { buildReport, formatReport } from './report';
import { loadCases, prepareFixtures, runCases } from './suite';

const resultsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'results');

const harness = await startHarness();
try {
  const cases = await loadCases();
  const instances = await prepareFixtures(harness, cases);
  const report = buildReport(await runCases(harness, cases, instances));

  console.log(formatReport(report));
  await mkdir(resultsDir, { recursive: true });
  const path = join(resultsDir, `${report.generatedAt.replace(/[:.]/g, '-')}.json`);
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nresult file: ${path}`);

  // A regression in any category blocks the ticket (docs/build/ask/07 §5) — and
  // an error or an ungraded case counts, because a case the harness could not
  // evaluate is not a pass (§6). A gate that let `ungraded` through would be
  // treating it as a pass while calling it something else.
  //
  // What follows from that, and belongs to T-258: a case with a model-graded
  // assertion has no place in the smoke tier, which runs on the fake router
  // with no provider calls and therefore no independent grader.
  const clean = Object.values(report.byCategory).every(
    (t) => t.fail === 0 && t.error === 0 && t.ungraded === 0,
  );
  process.exitCode = clean ? 0 : 1;
} finally {
  await harness.close();
}
