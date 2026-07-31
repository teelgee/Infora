// T-256 acceptance, part 1 — the assertion registry as pure functions. No
// database and no harness: this is about what each assertion type decides given
// an observation. Part 2 (harness.test.ts) runs the same types through HTTP,
// and the model-graded half is in grading.test.ts (T-257).
//
// EVERY TYPE GETS A PASSING AND A FAILING CASE. That is the ticket's own
// acceptance, and the reason is mechanical: an evaluator that always returns []
// passes every positive test, and an evaluator that always fails passes every
// negative one. Only the pair pins the behaviour.
import { describe, expect, it } from 'vitest';
import { evaluateAssertions, Unevaluable } from './assertions';
import type { AssertionContext, Observation } from './assertions';
import { ASSERTION_TYPES, assertionsSchema } from './case';
import type { Assertions } from './case';

const VERSIONS: Record<string, { versionId: string; documentReference: string }> = {
  water_quality_v2: { versionId: 'version-wq', documentReference: 'HOL-ENV-WQR-001' },
  commercial_risk_v1: { versionId: 'version-cr', documentReference: 'HOL-COM-RSK-004' },
};
const CHUNKS: Record<string, string> = {
  'water_quality_v2#0': 'chunk-wq-0',
  'water_quality_v2#1': 'chunk-wq-1',
  'commercial_risk_v1#0': 'chunk-cr-0',
};

const observation = (over: Partial<Observation> = {}): Observation => ({
  answer: 'The survey recorded 0.41 mg/l of phosphate at HB-04.',
  citations: [{ versionId: 'version-wq' }],
  sourceSet: [{ versionId: 'version-wq', chunkId: 'chunk-wq-0' }],
  retrieved: [{ versionId: 'version-wq', chunkId: 'chunk-wq-0' }],
  railOutcomes: [{ rail: 'grounding', outcome: 'passed' }],
  workersCalled: null,
  ...over,
});

function evaluate(assertions: Assertions, over: Partial<Observation> = {}) {
  const context: AssertionContext = {
    observation: observation(over),
    resolveRef: (ref) => VERSIONS[ref] ?? fail(`unknown version ref ${ref}`),
    resolveChunk: (ref) => ({ chunkId: CHUNKS[ref] ?? fail(`unknown chunk ref ${ref}`) }),
  };
  return evaluateAssertions(assertions, context);
}
const fail = (message: string): never => {
  throw new Error(message);
};
const failuresOf = async (assertions: Assertions, over: Partial<Observation> = {}) =>
  (await evaluate(assertions, over)).failures;

// One case declaring every type at once, with values that assert nothing —
// the point is coverage of the registry, not of any answer.
const EVERY_TYPE: Assertions = {
  must_cite: [],
  must_not_cite: [],
  must_contain: [],
  must_not_contain: [],
  max_uncited_claims: 0,
  expect_calls: [],
  expect_not_called: [],
  gold_passages: ['water_quality_v2#0'],
  min_precision: 0,
  min_recall: 0,
};

describe('the assertion registry covers the schema (T-256)', () => {
  it('implements every assertion type the case schema admits', async () => {
    // The drift this catches: a type added to the schema and never implemented
    // reads as a legal case that asserts nothing. It cannot happen silently —
    // the registry reports it unsupported and the runner errors — but it should
    // not be possible to ship, either. T-255 shipped with nine of the ten
    // unsupported, deliberately; this is the assertion that the ten are now ten.
    expect(Object.keys(EVERY_TYPE).sort()).toEqual([...ASSERTION_TYPES].sort());

    const report = await evaluate(EVERY_TYPE, { workersCalled: [] });
    expect(report.unsupported).toEqual([]);
    expect(report.failures).toEqual([]);
  });
});

describe('must_cite / must_not_cite', () => {
  it('passes when the named version is cited, fails when it is not', async () => {
    expect(await failuresOf({ must_cite: ['water_quality_v2'] })).toEqual([]);
    expect(await failuresOf({ must_cite: ['commercial_risk_v1'] })).toEqual([
      'must_cite: commercial_risk_v1 (HOL-COM-RSK-004) is not among the citations',
    ]);
  });

  it('fails must_not_cite on a citation OR on the answer text naming the document', async () => {
    expect(await failuresOf({ must_not_cite: ['commercial_risk_v1'] })).toEqual([]);
    expect(await failuresOf({ must_not_cite: ['water_quality_v2'] })).toEqual([
      'must_not_cite: water_quality_v2 (HOL-ENV-WQR-001) appears in the citations',
    ]);
    // the leak that carries no citation with it — §1.1's second half
    expect(
      await failuresOf(
        { must_not_cite: ['commercial_risk_v1'] },
        { answer: 'I cannot say, though hol-com-rsk-004 would cover it.' },
      ),
    ).toEqual(['must_not_cite: commercial_risk_v1 (HOL-COM-RSK-004) is named in the answer text']);
  });
});

describe('must_contain / must_not_contain', () => {
  it('matches a plain string case-insensitively, either way round', async () => {
    expect(await failuresOf({ must_contain: ['0.41 MG/L'] })).toEqual([]);
    expect(await failuresOf({ must_contain: ['dissolved metals'] })).toEqual([
      'must_contain: the answer does not match dissolved metals',
    ]);
    expect(await failuresOf({ must_not_contain: ['dissolved metals'] })).toEqual([]);
    expect(await failuresOf({ must_not_contain: ['phosphate'] })).toEqual([
      'must_not_contain: the answer matches phosphate',
    ]);
  });

  it('reads /pattern/flags as a regular expression', async () => {
    expect(await failuresOf({ must_contain: ['/\\d+\\.\\d+ mg\\/l/'] })).toEqual([]);
    expect(await failuresOf({ must_contain: ['/HB-\\d\\d/'] })).toEqual([]);
    // the exactness a substring cannot express: case-sensitive by default
    expect(await failuresOf({ must_contain: ['/hb-04/'] })).toEqual([
      'must_contain: the answer does not match /hb-04/',
    ]);
    expect(await failuresOf({ must_contain: ['/hb-04/i'] })).toEqual([]);
  });

  it('reports a malformed regex as unevaluable rather than as a failed match', async () => {
    // a broken pattern that read as "the answer does not contain this" would be
    // a case failing for a reason that is not about the answer at all
    await expect(failuresOf({ must_contain: ['/([a-z/'] })).rejects.toThrow(Unevaluable);
  });
});

describe('max_uncited_claims', () => {
  const withOpenWorld = (count: number) => ({
    railOutcomes: [
      { rail: 'grounding', outcome: 'passed' },
      ...Array.from({ length: count }, (_, index) => ({
        rail: 'grounding',
        outcome: 'open_world',
        detail: `claim ${index}`,
      })),
    ],
  });

  it('counts the open_world rail outcomes, not the prose', async () => {
    expect(await failuresOf({ max_uncited_claims: 0 })).toEqual([]);
    expect(await failuresOf({ max_uncited_claims: 1 }, withOpenWorld(1))).toEqual([]);
    expect(await failuresOf({ max_uncited_claims: 0 }, withOpenWorld(2))).toEqual([
      'max_uncited_claims: 2 uncited claim(s), limit 0 — "claim 0", "claim 1"',
    ]);
  });

  it('is unevaluable when the run recorded no grounding outcome at all', async () => {
    // zero open-world outcomes because the verifier never ran is not the same
    // fact as zero because every claim was grounded
    await expect(failuresOf({ max_uncited_claims: 0 }, { railOutcomes: [] })).rejects.toThrow(
      Unevaluable,
    );
  });
});

describe('expect_calls / expect_not_called', () => {
  it('reads the workers the plan recorded — pass and fail', async () => {
    const called = { workersCalled: ['corpus_retrieval', 'drafting'] };
    expect(await failuresOf({ expect_calls: ['corpus_retrieval'] }, called)).toEqual([]);
    expect(await failuresOf({ expect_calls: ['web_research'] }, called)).toEqual([
      "expect_calls: the plan called no worker 'web_research' (called: corpus_retrieval, drafting)",
    ]);
    expect(await failuresOf({ expect_not_called: ['web_research'] }, called)).toEqual([]);
    expect(await failuresOf({ expect_not_called: ['drafting'] }, called)).toEqual([
      "expect_not_called: the plan called 'drafting'",
    ]);
  });

  it('is unevaluable while no plan is readable — never a vacuous pass', async () => {
    // THE FAILURE THIS EXISTS TO PREVENT: with no plan to read, `workersCalled`
    // would be [] and `expect_not_called` would pass against no evidence at all,
    // for every worker, for ever.
    await expect(failuresOf({ expect_not_called: ['drafting'] })).rejects.toThrow(Unevaluable);
    await expect(failuresOf({ expect_calls: ['drafting'] })).rejects.toThrow(Unevaluable);
  });
});

describe('gold-passage precision and recall', () => {
  const retrieved = (...chunkIds: string[]) => ({
    retrieved: chunkIds.map((chunkId) => ({ versionId: 'version-wq', chunkId })),
  });

  it('measures at passage grain, and both thresholds have teeth', async () => {
    // one of two retrieved passages is gold: precision 0.5, recall 1
    const report = await evaluate(
      { gold_passages: ['water_quality_v2#0'], min_precision: 0.5, min_recall: 1 },
      retrieved('chunk-wq-0', 'chunk-cr-0'),
    );
    expect(report.retrieval).toEqual({
      gold: 1,
      retrieved: 2,
      matched: 1,
      precision: 0.5,
      recall: 1,
    });
    expect(report.failures).toEqual([]);

    expect(
      await failuresOf(
        { gold_passages: ['water_quality_v2#0'], min_precision: 0.9 },
        retrieved('chunk-wq-0', 'chunk-cr-0'),
      ),
    ).toEqual(['min_precision: 0.5 < 0.9 (1/2 retrieved passages are gold)']);

    expect(
      await failuresOf(
        { gold_passages: ['water_quality_v2#0', 'water_quality_v2#1'], min_recall: 1 },
        retrieved('chunk-wq-0'),
      ),
    ).toEqual(['min_recall: 0.5 < 1 (1/2 gold passages retrieved)']);
  });

  it('is document grain that the metric refuses, not a passage it dislikes', async () => {
    // T-253 is what makes this measurable; a source recorded without its chunk
    // cannot be matched, and either counting or dropping it fakes a number
    await expect(
      failuresOf(
        { gold_passages: ['water_quality_v2#0'], min_recall: 1 },
        { retrieved: [{ versionId: 'version-wq' }] },
      ),
    ).rejects.toThrow(Unevaluable);
  });

  it('scores an empty retrieval as precision zero, not as vacuously perfect', async () => {
    const report = await evaluate(
      { gold_passages: ['water_quality_v2#0'], min_precision: 0.1 },
      { retrieved: [] },
    );
    expect(report.retrieval).toMatchObject({ precision: 0, recall: 0 });
    expect(report.failures).toHaveLength(1);
  });

  it('refuses either half of the measurement alone', async () => {
    await expect(failuresOf({ gold_passages: ['water_quality_v2#0'] })).rejects.toThrow(Unevaluable);
    await expect(failuresOf({ min_recall: 1 })).rejects.toThrow(Unevaluable);
    // and the case file never gets that far: the schema rejects both at load
    expect(assertionsSchema.safeParse({ gold_passages: ['water_quality_v2#0'] }).success).toBe(false);
    expect(assertionsSchema.safeParse({ min_recall: 1 }).success).toBe(false);
    expect(
      assertionsSchema.safeParse({ gold_passages: ['water_quality_v2#0'], min_recall: 1 }).success,
    ).toBe(true);
  });

  it('rejects a gold passage written at document grain', () => {
    // `water_quality_v2` is a version, not a passage — and a version reference
    // silently read as "chunk 0" would make the metric mean something else
    expect(assertionsSchema.safeParse({ gold_passages: ['water_quality_v2'], min_recall: 1 }).success).toBe(false);
  });
});
