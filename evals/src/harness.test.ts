// T-255 acceptance — the eval harness vertical slice, against the live dev
// database (migrated; it does not need the seed, because a fixture brings its
// own world).
//
// What this proves:
//   1. a case declared as data runs end to end THROUGH HTTP, as the acting
//      user, and its permission assertion passes;
//   2. it does so identically ten times — the determinism the smoke tier rests
//      on (docs/ask/07 §5);
//   3. the assertion has teeth: the same assertion pointed at a document the
//      acting user CAN reach fails, so a pass is evidence of exclusion rather
//      than evidence of an assertion that never fires;
//   4. an assertion type the registry cannot evaluate, or a case pinning a
//      Lens that does not exist yet, is an `error` — never a quiet pass.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { loadFixtureFile } from './fixture';
import type { FixtureInstance } from './fixture';
import { startHarness } from './harness';
import type { Harness } from './harness';
import { buildReport, formatReport } from './report';
import { prepareFixture, runCase } from './runner';
import type { CaseResult } from './runner';
import { FIXTURES_DIR, loadCaseById } from './suite';
import type { EvalCase } from './case';

let harness: Harness;
let instance: FixtureInstance;
let perm02: EvalCase;

beforeAll(async () => {
  harness = await startHarness();
  perm02 = await loadCaseById('PERM-02');
  instance = await prepareFixture(
    harness,
    await loadFixtureFile(join(FIXTURES_DIR, 'hollowfield-reservoir.yaml')),
  );
});

afterAll(async () => {
  await harness?.close();
});

// what stays the same between two executions of one case; the run id and the
// timestamps do not, and should not
const comparable = (result: CaseResult) => ({
  verdict: result.verdict,
  failures: result.failures,
  citations: result.run?.citations,
  sourceSet: result.run?.sourceSet,
  response: result.run?.response,
  steps: result.steps,
});

describe('the eval harness (T-255)', () => {
  it('runs PERM-02 through the real API and passes: the unshared deliverable is not cited', async () => {
    const result = await runCase(harness, instance, perm02);

    expect(result.failures).toEqual([]);
    expect(result.verdict).toBe('pass');
    expect(result.category).toBe('permission');

    // the positive control: the run DID ground on something — the shared,
    // acknowledged deliverable — so the assertion above is a statement about
    // the wall, not about an empty answer
    expect(result.run?.citations).toEqual([{ versionId: instance.versionIds.get('water_quality_v2') }]);
    expect(result.run?.sourceSet).toEqual([{ versionId: instance.versionIds.get('water_quality_v2') }]);
    // the coded chain as it stands (T-041), the retrieval sub-agent's delegate
    // step included — the plan artefact that will describe this lands at T-260
    expect(result.steps.map((step) => step.type)).toEqual([
      'retrieve',
      'delegate',
      'draft',
      'ground_check',
      'cite',
    ]);
  });

  // T-260 pinned this: the plan artefact records what the chain does and
  // changes nothing it does. The acceptance was checked by running the smoke
  // set before and after the change and comparing the result files (identical
  // once uuids and the generation timestamp are canonicalised — a fresh
  // fixture instance necessarily has new ids). This keeps it pinned.
  it('produces the smoke result the plan artefact must not change (T-260)', async () => {
    const result = await runCase(harness, instance, perm02);

    expect(result.run?.response).toBe(
      'The investigation recorded contamination exceedances.\n\nAn unsupported figure of 40%.',
    );
    expect(result.steps).toEqual([
      { type: 'retrieve', model: null, cost: null },
      { type: 'delegate', model: null, cost: null },
      { type: 'draft', model: 'fake-chat', cost: 0 },
      { type: 'ground_check', model: null, cost: null },
      { type: 'cite', model: null, cost: null },
    ]);
    // and the harness still reports no plan: the plan read API is T-261, and
    // a runner that guessed at one would be reporting something it never saw
    expect(result.plan).toBeNull();
  });

  it('is deterministic: ten executions, one verdict', async () => {
    const results: CaseResult[] = [];
    for (let attempt = 0; attempt < 10; attempt += 1) {
      results.push(await runCase(harness, instance, perm02));
    }

    expect(results.every((result) => result.verdict === 'pass')).toBe(true);
    const first = comparable(results[0]!);
    for (const result of results) expect(comparable(result)).toEqual(first);
    // and every execution is a distinct run — ten passes, not one cached
    expect(new Set(results.map((result) => result.run?.id)).size).toBe(10);
  });

  it('fails when the named document IS reachable — the assertion is not a no-op', async () => {
    const reachable: EvalCase = {
      ...perm02,
      id: 'PERM-02-control',
      assertions: { must_not_cite: ['water_quality_v2'] },
    };
    const result = await runCase(harness, instance, reachable);

    expect(result.verdict).toBe('fail');
    expect(result.failures).toEqual([
      'must_not_cite: water_quality_v2 (HOL-ENV-WQR-001) appears in the citations',
    ]);
  });

  it('reports an unevaluable assertion as an error, never a pass', async () => {
    const unimplemented: EvalCase = {
      ...perm02,
      id: 'PERM-02-unimplemented',
      assertions: { must_not_cite: ['commercial_risk_v1'], max_uncited_claims: 0 },
    };
    const result = await runCase(harness, instance, unimplemented);

    expect(result.verdict).toBe('error');
    expect(result.failures[0]).toContain('unsupported assertion type(s): max_uncited_claims');
  });

  it('refuses to run a case pinning a Lens or an orchestration mode that does not exist yet', async () => {
    const lensed = await runCase(harness, instance, { ...perm02, lens: 'planning-environmental' });
    expect(lensed.verdict).toBe('error');
    expect(lensed.failures[0]).toContain('no Lens framework is wired yet');

    const declared = await runCase(harness, instance, { ...perm02, mode: 'declared' });
    expect(declared.verdict).toBe('error');
    expect(declared.failures[0]).toContain('orchestration modes are not labelled yet');
  });

  it('names an assertion the fixture cannot resolve rather than passing it', async () => {
    const typo: EvalCase = {
      ...perm02,
      assertions: { must_not_cite: ['commercial_risk_v9'] },
    };
    const result = await runCase(harness, instance, typo);

    expect(result.verdict).toBe('error');
    expect(result.failures[0]).toContain("assertion names 'commercial_risk_v9'");
  });

  it('materialises each load into its own namespace — one fixture, two disjoint worlds', async () => {
    const second = await prepareFixture(
      harness,
      await loadFixtureFile(join(FIXTURES_DIR, 'hollowfield-reservoir.yaml')),
    );
    expect(second.namespace).not.toBe(instance.namespace);
    expect(second.subjectProjectId).not.toBe(instance.subjectProjectId);
    expect(second.versionIds.get('water_quality_v2')).not.toBe(
      instance.versionIds.get('water_quality_v2'),
    );

    // and a case run in the second world grounds on the second world's rows
    const result = await runCase(harness, second, perm02);
    expect(result.run?.citations).toEqual([{ versionId: second.versionIds.get('water_quality_v2') }]);
  });

  it('reports per category, and carries no aggregate', async () => {
    const report = buildReport([await runCase(harness, instance, perm02)]);

    expect(report.byCategory.permission).toEqual({ cases: 1, pass: 1, fail: 0, error: 0 });
    expect(report.byCategory.happy).toEqual({ cases: 0, pass: 0, fail: 0, error: 0 });
    expect(Object.keys(report)).toEqual(['generatedAt', 'tier', 'byCategory', 'results']);
    expect(formatReport(report)).toContain('permission');
    expect(formatReport(report)).not.toMatch(/total|overall/i);
  });

  it('hides hold-out cases outside a release run — not even as a count', async () => {
    const held = await runCase(harness, instance, { ...perm02, id: 'PERM-02-held', hold_out: true });

    const development = buildReport([held]);
    expect(development.byCategory.permission.cases).toBe(0);
    expect(development.results).toEqual([]);

    const release = buildReport([held], 'release');
    expect(release.byCategory.permission.cases).toBe(1);
  });
});
