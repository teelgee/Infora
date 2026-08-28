// T-255 acceptance — the eval harness vertical slice, against the live dev
// database (migrated; it does not need the seed, because a fixture brings its
// own world).
//
// What this proves:
//   1. a case declared as data runs end to end THROUGH HTTP, as the acting
//      user, and its permission assertion passes;
//   2. it does so identically ten times — the determinism the smoke tier rests
//      on (evals/README.md);
//   3. the assertion has teeth: the same assertion pointed at a document the
//      acting user CAN reach fails, so a pass is evidence of exclusion rather
//      than evidence of an assertion that never fires;
//   4. an assertion type the registry cannot evaluate, or a case pinning a
//      Lens the deployment does not offer, is an `error` — never a quiet pass.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { loadFixtureFile } from './fixture';
import type { FixtureInstance } from './fixture';
import { startHarness } from './harness';
import type { Harness } from './harness';
import { buildReport, formatReport } from './report';
import { prepareFixture, runCase } from './runner';
import type { CaseResult } from './runner';
import { FIXTURES_DIR, loadCaseById, runCases } from './suite';
import { selectCases } from './tiers';
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

    // T-259 REPINNED, deliberately. The harness's deterministic chat now marks
    // every numbered source it was given rather than a fixed `[S1]`, because a
    // fake that could cite at most one document made TRAP-02 (two documents,
    // both cited) unsatisfiable by construction and made every other
    // `must_cite` turn on an arbitrary ranking. The T-260 PROPERTY is
    // unchanged and still guarded — this is a snapshot of the substrate's
    // output, and a snapshot updated for a stated reason still catches the
    // next unexplained change.
    expect(result.run?.response).toBe(
      'Water quality baseline survey, Hollow Brook. Sampling at eight points over two seasons recorded elevated phosphate concentrations at three points, the highest at HB-04 at 0.41 mg/l against a baseline mean of 0.09 mg/l. No exceedance of the dissolved metals thresholds was recorded at any point.\n\nAn unsupported figure of 40%.',
    );
    expect(result.steps).toEqual([
      { type: 'retrieve', model: null, cost: null },
      { type: 'delegate', model: null, cost: null },
      // T-254 — was `0`. The harness declares no rate table, so the draft step
      // is UNPRICED, and unpriced is null. Zero was finding F7 in miniature:
      // it read as "this run was free" when it meant "nobody priced it".
      { type: 'draft', model: 'fake-chat', cost: null },
      { type: 'ground_check', model: null, cost: null },
      { type: 'cite', model: null, cost: null },
    ]);
    // T-261 — the plan is now read back over HTTP rather than reported as
    // absent. The T-260 property this test pins is unchanged: the plan's steps
    // correspond 1:1 to the run's TOP-LEVEL Step rows, which is the
    // no-behaviour-change claim stated as data instead of as a comment. The
    // `delegate` step above is the sub-agent's and is deliberately not among
    // them — a delegation is not a request.
    expect(result.plan?.mode).toBe('declared');
    expect(result.plan?.steps.map((step) => step.stage)).toEqual([
      'search_corpus',
      'analyse',
      'verify',
      'present',
    ]);
    expect(result.plan?.steps.every((step) => step.stepRowId !== null)).toBe(true);

    // T-265 — the plan now names the DECLARED WORKFLOW it came from, and its
    // retrieve step names the worker that realises it. **Everything above this
    // line is unchanged**, which is this ticket's whole acceptance: the answer,
    // the step rows and the stage order are byte-identical, and what is new is
    // that the plan says where it came from.
    expect(result.plan?.workflowId).toBe('project-question');
    expect(result.plan?.workflowVersion).toBe(1);
    expect(result.plan?.steps.map((step) => step.worker)).toEqual([
      'corpus_retrieval',
      // `analyse` and `present` are the orchestrator's own leaves and `verify`
      // is the ground-check, which is code outside the plan — none of the three
      // is a worker, and naming one for them would be a fiction
      null,
      null,
      null,
    ]);
    expect(result.workersCalled).toEqual(['corpus_retrieval']);
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

  // T-282 — a Lens is now something a case may pin. The mode half of this rule
  // still holds: nothing labels an orchestration mode until T-266.
  it('runs a case under a Lens the deployment offers, and records which', async () => {
    const lensed = await runCase(harness, instance, {
      ...perm02,
      id: 'PERM-02-lensed',
      lens: 'planning-environmental',
    });
    expect(lensed.verdict).toBe('pass');
    expect(lensed.lens).toBe('planning-environmental');
    // the Lens reached the prompt, and the source set is unchanged by it — the
    // PERM-05 guarantee, observed here as a side effect of a permission case
    expect(lensed.run?.response).toContain('planning and environmental practitioner');
    const plain = await runCase(harness, instance, perm02);
    expect(lensed.run?.sourceSet).toEqual(plain.run?.sourceSet);
  });

  it('refuses a Lens the deployment does not offer, naming the ones it does', async () => {
    // `commercial` is authored and loads outside production; the harness runs
    // production semantics, so it is absent here exactly as it would be for a
    // real user. The message names the available ids rather than surfacing the
    // API's 400 as an opaque "asking the question returned 400".
    const unavailable = await runCase(harness, instance, { ...perm02, lens: 'commercial' });
    expect(unavailable.verdict).toBe('error');
    expect(unavailable.failures[0]).toContain("case declares lens 'commercial'");
    expect(unavailable.failures[0]).toContain('planning-environmental');
  });

  it('refuses to run a case pinning an orchestration mode that does not exist yet', async () => {
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
    // the report's shape is pinned in report.test.ts; this is the same shape
    // built from a real run rather than from a constructed result
    const report = buildReport([await runCase(harness, instance, perm02)]);

    expect(report.byCategory.permission).toEqual({
      cases: 1,
      pass: 1,
      fail: 0,
      error: 0,
      ungraded: 0,
      flaky: 0,
    });
    expect(report.byCategory.happy).toEqual({ cases: 0, pass: 0, fail: 0, error: 0, ungraded: 0, flaky: 0 });
    expect(Object.keys(report)).toEqual([
      'generatedAt',
      'tier',
      'byCategory',
      'byMode',
      'byLens',
      'results',
    ]);
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
      must_contain: ['phosphate concentrations', '/unsupported figure of \\d+%/i'],
      must_not_contain: ['archaeological'],
    });
    expect(present.verdict).toBe('pass');

    const absent = await run('T256-contain-fail', {
      must_contain: ['contamination exceedances'],
      must_not_contain: ['/40%/'],
    });
    expect(absent.verdict).toBe('fail');
    expect(absent.failures).toEqual([
      'must_contain: the answer does not match contamination exceedances',
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

  // T-265 CLOSED THE DEFERRAL. The plan is readable (T-261), the registry
  // exists (T-269) and the declared workflow's retrieve step names its worker
  // — so `expect_calls` finally has an observation to work from, and the
  // assertion that spent three tickets erroring rather than passing vacuously
  // now does the thing it was written for.
  it('expect_calls / expect_not_called: observed off the plan, both ways', async () => {
    const calls = await run('T256-expect-calls', { expect_calls: ['corpus_retrieval'] });
    expect(calls.verdict).toBe('pass');
    expect(calls.workersCalled).toEqual(['corpus_retrieval']);

    // and it still has teeth: a worker the plan did not call fails, rather than
    // passing because the observation is empty
    const missing = await run('T256-expect-missing', { expect_calls: ['web_research'] });
    expect(missing.verdict).toBe('fail');
    expect(missing.failures[0]).toContain("the plan called no worker 'web_research'");

    const notCalled = await run('T256-expect-not-called', { expect_not_called: ['web_research'] });
    expect(notCalled.verdict).toBe('pass');
    expect(notCalled.workersCalled).toEqual(['corpus_retrieval']);

    // the negative's own teeth: `expect_not_called` on a worker the plan DID
    // call must fail, or it is the vacuous pass this assertion spent three
    // tickets refusing to be
    const wrongly = await run('T256-expect-not-called-wrongly', {
      expect_not_called: ['corpus_retrieval'],
    });
    expect(wrongly.verdict).toBe('fail');
  });

  // ── T-257 — model-graded assertions, over a real run ─────────────────────────
  //
  // The independence rule and the grade→failure mapping are unit-tested in
  // grading.test.ts. What is proved HERE is the harness's own default and the
  // verdict it produces: the smoke substrate has no independent grader (it runs
  // on the fake router, no provider calls, §5), so a graded claim is `ungraded`
  // — reported, recorded with its reason, and not a pass.
  it('a graded claim with no independent grader is ungraded, not a pass (T-257)', async () => {
    const graded = await run('T257-graded-no-grader', {
      must_contain: ['~the answer states an exceedance was recorded'],
    });

    expect(graded.verdict).toBe('ungraded');
    expect(graded.failures).toEqual([]);
    expect(graded.grades).toEqual([
      {
        assertion: 'must_contain',
        claim: 'the answer states an exceedance was recorded',
        grader: null,
        outcome: 'ungraded',
        reason: 'no grader is configured for this run, so the claim was not assessed',
      },
    ]);
    // and it lands in its own column, never in `pass`
    const report = buildReport([graded]);
    expect(report.byCategory.permission).toMatchObject({ cases: 1, pass: 0, ungraded: 1 });
  });

  it('a real failure outranks an ungraded claim in the same case (T-257)', async () => {
    // precedence: a known failure is more informative than an unchecked claim,
    // so `fail` wins the label — but the ungraded claim is still recorded
    const both = await run('T257-fail-beats-ungraded', {
      must_contain: ['~something nobody graded', 'a phrase the answer does not contain'],
    });

    expect(both.verdict).toBe('fail');
    expect(both.failures).toEqual([
      'must_contain: the answer does not match a phrase the answer does not contain',
    ]);
    expect(both.grades[0]!.outcome).toBe('ungraded');
  });

  // ── T-258 — the tiers, over a real run ───────────────────────────────────────
  //
  // Selection and folding are unit-tested in tiers.test.ts and flake.test.ts.
  // What is proved here is that repeated execution through the real API agrees
  // with itself: the determinism the smoke tier rests on, now expressed as the
  // flake detector rather than as a loop in a test.
  it('runs a case three times through HTTP and does not call it flaky (T-258)', async () => {
    const instances = new Map([[instance.fixture.id, instance]]);
    const [result] = await runCases(harness, [perm02], instances, { repeats: 3 });

    expect(result!.attempts).toEqual(['pass', 'pass', 'pass']);
    expect(result!.flaky).toBe(false);
    expect(buildReport([result!]).byCategory.permission).toMatchObject({ pass: 1, flaky: 0 });
  });

  it('never runs a hold-out case outside a release run (T-258)', async () => {
    const held: EvalCase = { ...perm02, id: 'PERM-02-held', hold_out: true };
    const instances = new Map([[instance.fixture.id, instance]]);

    // the control: it is not selected, so no result exists to be filtered
    for (const tier of ['smoke', 'full'] as const) {
      expect(selectCases([held], tier).selected).toEqual([]);
    }
    const { selected } = selectCases([held], 'release');
    expect(selected).toHaveLength(1);

    // and the backstop still holds independently — a result that reached the
    // report by another route is emitted at release and nowhere else
    const results = await runCases(harness, selected, instances);
    expect(buildReport(results, 'full').results).toEqual([]);
    expect(buildReport(results, 'release').results).toHaveLength(1);
  });

  it('reads the mode off the plan record rather than assuming it', async () => {
    // T-261 — `declared` because the run's own plan says so, not because the
    // coded chain happens to be declared. The distinction is the whole point of
    // storing `mode` as a column: the moment T-266 writes `model_chosen` on
    // some runs, this report splits without a line of reporting code changing.
    const result = await runCase(harness, instance, perm02);
    expect(result.mode).toBe('declared');
    expect(buildReport([result]).byMode.declared.cases).toBe(1);
    expect(buildReport([result]).byMode.unlabelled.cases).toBe(0);
  });
});
