// T-255 acceptance — the eval harness vertical slice, against the live dev
// database (migrated; it does not need the seed, because a fixture brings its
// own world).
//
// What this proves:
//   1. a case declared as data runs end to end THROUGH HTTP, as the acting
//      user, and its permission assertion passes;
//   2. it does so identically ten times — the determinism the smoke tier rests
//      on (docs/build/ask/07 §5);
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
    // at passage grain since T-256 carried T-253's chunk id through the
    // observation: the source set records the passage, not just the document
    expect(result.run?.sourceSet).toEqual([
      {
        versionId: instance.versionIds.get('water_quality_v2'),
        chunkId: instance.chunkIds.get('water_quality_v2#0'),
      },
    ]);
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

  it('reports an assertion type the registry does not implement as an error, never a pass', async () => {
    // T-256 implemented the whole schema, so this can no longer be reached by
    // an honest case — the cast is the point. The guard has to keep working for
    // the type the schema gains next, and it is only observable this way.
    const unimplemented: EvalCase = {
      ...perm02,
      id: 'PERM-02-unimplemented',
      assertions: { must_not_cite: ['commercial_risk_v1'], must_sing: ['x'] } as EvalCase['assertions'],
    };
    const result = await runCase(harness, instance, unimplemented);

    expect(result.verdict).toBe('error');
    expect(result.failures[0]).toContain('unsupported assertion type(s): must_sing');
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

// ── T-256 — the full assertion set, through HTTP ──────────────────────────────
//
// The evaluators are unit-tested in assertions.test.ts; these run the same
// types against a real run, so a type that works on a hand-written observation
// and not on the one the runner actually builds cannot pass unnoticed. Every
// type gets a passing AND a failing case here too.
//
// The run under test is PERM-02's: it grounds on the shared, acknowledged water
// quality baseline, answers 'The investigation recorded contamination
// exceedances.\n\nAn unsupported figure of 40%.', and the ground-check labels
// that second sentence open-world (the chat channel keeps it, uncited).
describe('the full assertion set (T-256)', () => {
  const withAssertions = (id: string, assertions: EvalCase['assertions']): EvalCase => ({
    ...perm02,
    id,
    assertions,
  });
  const run = (id: string, assertions: EvalCase['assertions']) =>
    runCase(harness, instance, withAssertions(id, assertions));

  it('must_cite: passes on the cited version, fails on the one the wall excluded', async () => {
    const cited = await run('T256-must-cite-pass', { must_cite: ['water_quality_v2'] });
    expect(cited.verdict).toBe('pass');

    const uncited = await run('T256-must-cite-fail', { must_cite: ['commercial_risk_v1'] });
    expect(uncited.verdict).toBe('fail');
    expect(uncited.failures).toEqual([
      'must_cite: commercial_risk_v1 (HOL-COM-RSK-004) is not among the citations',
    ]);
  });

  it('must_contain / must_not_contain: over the answer text, literal and regex', async () => {
    const present = await run('T256-contain-pass', {
      must_contain: ['contamination exceedances', '/unsupported figure of \\d+%/i'],
      must_not_contain: ['dissolved metals'],
    });
    expect(present.verdict).toBe('pass');

    const absent = await run('T256-contain-fail', {
      must_contain: ['phosphate at HB-04'],
      must_not_contain: ['/40%/'],
    });
    expect(absent.verdict).toBe('fail');
    expect(absent.failures).toEqual([
      'must_contain: the answer does not match phosphate at HB-04',
      'must_not_contain: the answer matches /40%/',
    ]);
  });

  it('max_uncited_claims: counted off the open_world rail outcomes, not the prose', async () => {
    // the fake router's reply carries exactly one unsourced sentence, and the
    // verifier — not this harness — is what decided that
    const within = await run('T256-uncited-pass', { max_uncited_claims: 1 });
    expect(within.verdict).toBe('pass');

    const over = await run('T256-uncited-fail', { max_uncited_claims: 0 });
    expect(over.verdict).toBe('fail');
    expect(over.failures).toEqual([
      'max_uncited_claims: 1 uncited claim(s), limit 0 — "An unsupported figure of 40%."',
    ]);
  });

  it('gold passages: precision and recall at chunk grain, both directions', async () => {
    const hit = await run('T256-gold-pass', {
      gold_passages: ['water_quality_v2#0'],
      min_precision: 1,
      min_recall: 1,
    });
    expect(hit.verdict).toBe('pass');
    expect(hit.retrieval).toEqual({ gold: 1, retrieved: 1, matched: 1, precision: 1, recall: 1 });

    // the gold passage the acting user cannot reach: retrieval found the one it
    // was entitled to and neither metric is satisfied by that
    const miss = await run('T256-gold-fail', {
      gold_passages: ['commercial_risk_v1#0'],
      min_precision: 1,
      min_recall: 1,
    });
    expect(miss.verdict).toBe('fail');
    expect(miss.retrieval).toEqual({ gold: 1, retrieved: 1, matched: 0, precision: 0, recall: 0 });
    expect(miss.failures).toEqual([
      'min_precision: 0 < 1 (0/1 retrieved passages are gold)',
      'min_recall: 0 < 1 (0/1 gold passages retrieved)',
    ]);
  });

  it('names a gold passage the fixture does not declare rather than scoring it', async () => {
    const typo = await run('T256-gold-unresolved', {
      gold_passages: ['water_quality_v2#7'],
      min_recall: 1,
    });
    expect(typo.verdict).toBe('error');
    expect(typo.failures[0]).toContain("gold passage 'water_quality_v2#7'");
  });

  // The deferred half of this ticket, recorded as an error rather than faked. A
  // plan exists (T-260) but nothing can read it over HTTP until T-261, and every
  // plan step's worker is null until the registry at T-269 — so `expect_calls`
  // has no observation to work from and `expect_not_called` would pass for every
  // worker in the world.
  it('expect_calls / expect_not_called: an error until a plan is readable, never a vacuous pass', async () => {
    const calls = await run('T256-expect-calls', { expect_calls: ['corpus_retrieval'] });
    expect(calls.verdict).toBe('error');
    expect(calls.failures[0]).toContain('no plan is readable yet');
    expect(calls.failures[0]).toContain('T-261');

    const notCalled = await run('T256-expect-not-called', { expect_not_called: ['web_research'] });
    expect(notCalled.verdict).toBe('error');
    expect(notCalled.workersCalled).toBeNull();
  });
});
