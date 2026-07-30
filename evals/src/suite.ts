// T-255 — loading a whole suite off disk: every case in cases/, every fixture
// it pins, materialised once per run and shared by the cases pinned to it.
//
// One materialisation per fixture per run is deliberate. §3 calls a fixture
// FROZEN: two cases pinned to the same fixture must see the same corpus, and
// re-materialising between them would give each its own — which is fine until
// a case starts depending on a row another case wrote, at which point the two
// pass or fail depending on their order.
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCaseFile } from './case';
import type { EvalCase } from './case';
import { loadFixtureFile } from './fixture';
import type { FixtureInstance } from './fixture';
import type { Harness } from './harness';
import { prepareFixture, runCase } from './runner';
import type { CaseResult } from './runner';

const here = dirname(fileURLToPath(import.meta.url));
export const CASES_DIR = join(here, '..', 'cases');
export const FIXTURES_DIR = join(here, '..', 'fixtures');

export async function loadCases(dir = CASES_DIR): Promise<EvalCase[]> {
  const files = (await readdir(dir)).filter((name) => name.endsWith('.yaml')).sort();
  const cases = await Promise.all(files.map((name) => loadCaseFile(join(dir, name))));
  const ids = new Set<string>();
  for (const evalCase of cases) {
    if (ids.has(evalCase.id)) throw new Error(`duplicate case id ${evalCase.id}`);
    ids.add(evalCase.id);
  }
  return cases;
}

export async function loadCaseById(id: string, dir = CASES_DIR): Promise<EvalCase> {
  const found = (await loadCases(dir)).find((evalCase) => evalCase.id === id);
  if (found === undefined) throw new Error(`no case ${id} in ${dir}`);
  return found;
}

/** Materialise every fixture the given cases pin to, once each. */
export async function prepareFixtures(
  harness: Harness,
  cases: EvalCase[],
  dir = FIXTURES_DIR,
): Promise<Map<string, FixtureInstance>> {
  const instances = new Map<string, FixtureInstance>();
  for (const id of new Set(cases.map((evalCase) => evalCase.fixture))) {
    const fixture = await loadFixtureFile(join(dir, `${id}.yaml`));
    instances.set(id, await prepareFixture(harness, fixture));
  }
  return instances;
}

export async function runCases(
  harness: Harness,
  cases: EvalCase[],
  instances: Map<string, FixtureInstance>,
): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  for (const evalCase of cases) {
    const instance = instances.get(evalCase.fixture);
    if (instance === undefined) throw new Error(`case ${evalCase.id} pins unmaterialised fixture ${evalCase.fixture}`);
    results.push(await runCase(harness, instance, evalCase));
  }
  return results;
}
