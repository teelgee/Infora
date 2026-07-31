// T-255/T-256 — the assertion registry.
//
// T-255 implemented one type, `must_not_cite`, and made every other declared
// type an `error`. T-256 implements the rest of the schema (docs/build/ask/07
// §1): the citation pair, the text pair, `max_uncited_claims` off the
// `open_world` rail outcomes, the routing pair off the plan's steps, and gold-
// passage precision/recall over the retrieve step's admitted set.
//
// Two rules hold the whole registry up, and they are the same rule twice:
//
//   * a declared assertion the registry cannot evaluate is UNSUPPORTED, and an
//     unsupported assertion makes the case an `error` — never a pass. A harness
//     that silently ignores what it cannot check reports green while testing
//     nothing, and that failure would be invisible exactly when it mattered.
//   * an assertion the registry implements but cannot evaluate *on this
//     observation* — no plan to read workers from, no ground-check to count
//     open-world claims off, a retrieve step recorded at document grain — is
//     `Unevaluable`, which is also an `error`. The alternative is an assertion
//     that passes because the evidence for failing it was missing, which is the
//     same lie told a different way.
//
// Every type below has a passing AND a failing test (assertions.test.ts for the
// evaluators, harness.test.ts through HTTP), so a wrong implementation cannot
// pass both.
import type { AssertionType, Assertions } from './case';
import { gradeClaims, isGraded } from './grading';
import type { GradeRecord, GradingContext } from './grading';

export type ObservedSource = { versionId?: string; authorityRef?: string; chunkId?: string };

/** What a case's execution produced, in the terms assertions are written in. */
export type Observation = {
  answer: string;
  citations: ObservedSource[];
  /** every source the run's steps recorded seeing (ADR-0028 §7) */
  sourceSet: ObservedSource[];
  /**
   * The retrieve step's admitted set — what the set metrics are measured over
   * (§1.1: precision/recall are over `corpus_retrieval`'s output, not over
   * whatever the answer ended up citing). Null when the run recorded no
   * retrieve step at all.
   */
  retrieved: ObservedSource[] | null;
  railOutcomes: Array<{ rail: string; outcome: string; detail?: string }>;
  /**
   * The workers the run's plan recorded calling. Null while no plan is readable
   * — the plan read API is T-261 and the worker registry is T-269, and until
   * both exist every plan step's worker is null, which would make
   * `expect_not_called` pass against no evidence at all.
   */
  workersCalled: string[] | null;
};

export type AssertionContext = {
  observation: Observation;
  /** resolve a fixture version key to the row it materialised as */
  resolveRef(ref: string): { versionId: string; documentReference: string };
  /** resolve a fixture chunk ref (`version_key#index`) to the chunk row it materialised as */
  resolveChunk(ref: string): { chunkId: string };
  /** T-257 — who may grade a `~claim`, and who may not (grading.ts) */
  grading?: GradingContext;
};

/**
 * The harness cannot evaluate this assertion — the observation lacks the
 * evidence, or the case declares an incoherent one. Always an `error` on the
 * result, never a pass and never a quiet fail.
 */
export class Unevaluable extends Error {}

/** Gold-passage set metrics over the retrieve step's admitted set (§1.1). */
export type RetrievalMetrics = {
  gold: number;
  retrieved: number;
  matched: number;
  precision: number;
  recall: number;
};

type Evaluator = (declared: never, context: AssertionContext) => string[];

const EVALUATORS: Partial<Record<AssertionType, Evaluator>> = {
  // ── the citation pair ──────────────────────────────────────────────────────
  must_cite: ((refs: string[], { observation, resolveRef }: AssertionContext) => {
    const failures: string[] = [];
    for (const ref of refs) {
      const { versionId, documentReference } = resolveRef(ref);
      if (!observation.citations.some((source) => source.versionId === versionId)) {
        failures.push(`must_cite: ${ref} (${documentReference}) is not among the citations`);
      }
    }
    return failures;
  }) as Evaluator,

  must_not_cite: ((refs: string[], { observation, resolveRef }: AssertionContext) => {
    const failures: string[] = [];
    for (const ref of refs) {
      const { versionId, documentReference } = resolveRef(ref);
      // §1.1: the case passes only if the document appears in NEITHER the
      // citations NOR the answer text.
      if (observation.citations.some((source) => source.versionId === versionId)) {
        failures.push(`must_not_cite: ${ref} (${documentReference}) appears in the citations`);
      }
      if (observation.answer.toUpperCase().includes(documentReference.toUpperCase())) {
        failures.push(`must_not_cite: ${ref} (${documentReference}) is named in the answer text`);
      }
    }
    return failures;
  }) as Evaluator,

  // ── the text pair ──────────────────────────────────────────────────────────
  // Deterministic matching. §6's model-graded variant — for register and the
  // phrasings a regex cannot fix — is the `~claim` form, lifted out before this
  // runs and decided in grading.ts under the verifier's independence rule.
  must_contain: ((patterns: string[], { observation }: AssertionContext) =>
    patterns
      .filter((pattern) => !matches(pattern, observation.answer))
      .map((pattern) => `must_contain: the answer does not match ${pattern}`)) as Evaluator,

  must_not_contain: ((patterns: string[], { observation }: AssertionContext) =>
    patterns
      .filter((pattern) => matches(pattern, observation.answer))
      .map((pattern) => `must_not_contain: the answer matches ${pattern}`)) as Evaluator,

  // ── the grounding count ────────────────────────────────────────────────────
  // Counted off the rail outcomes the ground-check wrote (ground-check.ts:43),
  // never by parsing prose: the verifier already decided which claims survived
  // uncited, and re-deciding it here would measure the harness's parser.
  max_uncited_claims: ((limit: number, { observation }: AssertionContext) => {
    const grounding = observation.railOutcomes.filter((outcome) => outcome.rail === 'grounding');
    if (grounding.length === 0) {
      // the ground-check emits at least one outcome on every run, so none means
      // it did not run — and a count of zero would read as a clean answer
      throw new Unevaluable(
        'max_uncited_claims: the run recorded no grounding rail outcome, so no uncited claim can be counted',
      );
    }
    const uncited = grounding.filter((outcome) => outcome.outcome === 'open_world');
    return uncited.length <= limit
      ? []
      : [
          `max_uncited_claims: ${uncited.length} uncited claim(s), limit ${limit} — ${uncited
            .map((outcome) => JSON.stringify(outcome.detail ?? ''))
            .join(', ')}`,
        ];
  }) as Evaluator,

  // ── the routing pair ───────────────────────────────────────────────────────
  // Read from the plan's steps (§1.1). These are what make "the chat agent
  // should route into workflows rather than improvise" measurable.
  expect_calls: ((workers: string[], { observation }: AssertionContext) => {
    const called = workersOf(observation, 'expect_calls');
    return workers
      .filter((worker) => !called.includes(worker))
      .map((worker) => `expect_calls: the plan called no worker '${worker}' (called: ${list(called)})`);
  }) as Evaluator,

  expect_not_called: ((workers: string[], { observation }: AssertionContext) => {
    const called = workersOf(observation, 'expect_not_called');
    return workers
      .filter((worker) => called.includes(worker))
      .map((worker) => `expect_not_called: the plan called '${worker}'`);
  }) as Evaluator,
};

// gold_passages + min_precision + min_recall are one assertion written as three
// keys, so they are evaluated together rather than per key.
const RETRIEVAL_KEYS: AssertionType[] = ['gold_passages', 'min_precision', 'min_recall'];

export type AssertionReport = {
  failures: string[];
  /** declared but not implemented — the case is an error, never a pass */
  unsupported: AssertionType[];
  /** the set metrics, when the case declared gold passages */
  retrieval: RetrievalMetrics | null;
  /** T-257 — every model-graded claim, with the grader's family (§6) */
  grades: GradeRecord[];
};

export async function evaluateAssertions(
  assertions: Assertions,
  context: AssertionContext,
): Promise<AssertionReport> {
  const report: AssertionReport = { failures: [], unsupported: [], retrieval: null, grades: [] };

  // T-257 — the `~claims` come out first: they are the same assertion types,
  // decided by a model rather than by string matching, and the two halves must
  // not shadow each other. What is left is matched deterministically.
  const graded = gradedClaims(assertions);
  const deterministic: Assertions = {
    ...assertions,
    ...(assertions.must_contain !== undefined && {
      must_contain: assertions.must_contain.filter((pattern) => !isGraded(pattern)),
    }),
    ...(assertions.must_not_contain !== undefined && {
      must_not_contain: assertions.must_not_contain.filter((pattern) => !isGraded(pattern)),
    }),
  };

  for (const [name, declared] of Object.entries(deterministic)) {
    if (declared === undefined) continue;
    if (RETRIEVAL_KEYS.includes(name as AssertionType)) continue; // below, as one
    const evaluator = EVALUATORS[name as AssertionType];
    if (evaluator === undefined) {
      report.unsupported.push(name as AssertionType);
      continue;
    }
    report.failures.push(...evaluator(declared as never, context));
  }

  const setMetrics = evaluateSetMetrics(assertions, context);
  report.retrieval = setMetrics.metrics;
  report.failures.push(...setMetrics.failures);

  const judged = await gradeClaims(graded, context.observation.answer, context.grading);
  report.failures.push(...judged.failures);
  report.grades = judged.grades;
  return report;
}

function gradedClaims(
  assertions: Assertions,
): Array<{ assertion: 'must_contain' | 'must_not_contain'; pattern: string }> {
  return (['must_contain', 'must_not_contain'] as const).flatMap((assertion) =>
    (assertions[assertion] ?? [])
      .filter(isGraded)
      .map((pattern) => ({ assertion, pattern })),
  );
}

/**
 * Gold-passage precision and recall, at PASSAGE grain (§1.1). Retrieval quality
 * is tracked separately from answer quality here so a good answer over bad
 * retrieval does not read as success — the case that would otherwise hide a
 * corpus the system cannot search behind a model that guessed well.
 */
function evaluateSetMetrics(
  assertions: Assertions,
  { observation, resolveChunk }: AssertionContext,
): { failures: string[]; metrics: RetrievalMetrics | null } {
  const { gold_passages: gold, min_precision: minPrecision, min_recall: minRecall } = assertions;
  const threshold = minPrecision !== undefined || minRecall !== undefined;
  // The schema refuses either half alone at load (case.ts). The runner also
  // takes cases built in code, so the check lives here too — this is the half
  // with teeth.
  if (gold === undefined) {
    if (threshold) {
      throw new Unevaluable(
        'min_precision/min_recall have nothing to measure against: the case declares no gold_passages',
      );
    }
    return { failures: [], metrics: null };
  }
  if (!threshold) {
    throw new Unevaluable(
      'gold_passages declares a measurement with no threshold: the case declares neither min_precision nor min_recall',
    );
  }
  if (observation.retrieved === null) {
    throw new Unevaluable('gold_passages: the run recorded no retrieve step to measure');
  }

  const documentGrain = observation.retrieved.filter((source) => source.chunkId === undefined);
  if (documentGrain.length > 0) {
    // T-253 records the chunk where the source was a library passage. A source
    // without one cannot be matched against a gold passage, and quietly
    // dropping it would inflate precision; quietly counting it would deflate it.
    throw new Unevaluable(
      `gold_passages: ${documentGrain.length} retrieved source(s) recorded at document grain, which passage metrics cannot measure`,
    );
  }

  const goldIds = new Set(gold.map((ref) => resolveChunk(ref).chunkId));
  const retrievedIds = new Set(observation.retrieved.map((source) => source.chunkId!));
  const matched = [...retrievedIds].filter((chunkId) => goldIds.has(chunkId)).length;
  const metrics: RetrievalMetrics = {
    gold: goldIds.size,
    retrieved: retrievedIds.size,
    matched,
    // Retrieving nothing is precision ZERO, not the vacuous 1.0 the arithmetic
    // would give: an empty answer must never score as perfectly precise.
    precision: retrievedIds.size === 0 ? 0 : matched / retrievedIds.size,
    recall: matched / goldIds.size,
  };

  const failures: string[] = [];
  if (minPrecision !== undefined && metrics.precision < minPrecision) {
    failures.push(
      `min_precision: ${round(metrics.precision)} < ${minPrecision} (${metrics.matched}/${metrics.retrieved} retrieved passages are gold)`,
    );
  }
  if (minRecall !== undefined && metrics.recall < minRecall) {
    failures.push(
      `min_recall: ${round(metrics.recall)} < ${minRecall} (${metrics.matched}/${metrics.gold} gold passages retrieved)`,
    );
  }
  return { failures, metrics };
}

/**
 * `/pattern/flags` is a regex; anything else is a case-insensitive substring.
 * The insensitivity is deliberate — a case asserting the answer mentions a
 * threshold should not fail on capitalisation — and a case that needs exactness
 * writes the regex.
 */
function matches(pattern: string, text: string): boolean {
  const delimited = /^\/(.+)\/([gimsuy]*)$/.exec(pattern);
  if (delimited === null) return text.toLowerCase().includes(pattern.toLowerCase());
  try {
    return new RegExp(delimited[1]!, delimited[2]).test(text);
  } catch (error) {
    throw new Unevaluable(`${pattern} is not a valid regular expression: ${(error as Error).message}`);
  }
}

function workersOf(observation: Observation, assertion: string): string[] {
  if (observation.workersCalled === null) {
    throw new Unevaluable(
      `${assertion}: no plan is readable yet, so the workers a run called cannot be observed (plan read API T-261, worker registry T-269)`,
    );
  }
  return observation.workersCalled;
}

const list = (workers: string[]) => (workers.length === 0 ? 'none' : workers.join(', '));
const round = (value: number) => Math.round(value * 1000) / 1000;
