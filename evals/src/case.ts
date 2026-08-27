// T-255 — the case schema (evals/README.md), as declared there and no wider.
// A case is data: an id, the fixture it pins to, a question, the acting user
// whose EntitledSlice it runs under, and its assertions.
//
// Two deliberate properties of this schema:
//
//   * it is STRICT. An unknown key is a failed parse, not a silently ignored
//     line — a misspelt assertion that reads as "no assertion" is a case that
//     passes without testing anything, which is the worst failure mode a
//     harness has.
//   * `flaky` is absent. §8 says it is set by the runner and never by hand, so
//     a case file carrying it fails to load rather than being able to excuse
//     itself.
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
import { isGraded } from './grading';

/** mirrors GROUNDED_CHUNK_LIMIT (packages/knowledge/src/retrieval.ts) */
export const RETRIEVAL_BUDGET = 8;


export const CATEGORIES = ['happy', 'negative', 'trap', 'behaviour', 'permission'] as const;
export type Category = (typeof CATEGORIES)[number];

// A source reference in an assertion is a fixture VERSION key today. The
// schema's `authority_ref` half waits for the authority corpus (T-276/T-277);
// there is no store to resolve one against yet, so admitting the syntax now
// would admit an assertion nothing can evaluate.
const sourceRef = z.string();

// T-256 — a gold passage is a CHUNK reference, `version_key#chunk_index`, e.g.
// `water_quality_v2#0`. Passage grain is the point (T-253 put `chunkId` in the
// Step row's source set for exactly this): precision measured at document
// grain reads a version as one hit however much of it was irrelevant.
const chunkRef = z
  .string()
  .regex(/^[a-z0-9_]+#\d+$/, 'a gold passage is written version_key#chunk_index, e.g. water_quality_v2#0');

const assertionsObject = z
  .object({
    must_cite: z.array(sourceRef).optional(),
    must_not_cite: z.array(sourceRef).optional(),
    // a plain string is a case-insensitive substring; /pattern/flags is a regex
    // (assertions.ts, `matches`)
    must_contain: z.array(z.string()).optional(),
    must_not_contain: z.array(z.string()).optional(),
    max_uncited_claims: z.number().int().nonnegative().optional(),
    expect_calls: z.array(z.string()).optional(),
    expect_not_called: z.array(z.string()).optional(),
    gold_passages: z.array(chunkRef).min(1).optional(),
    min_precision: z.number().min(0).max(1).optional(),
    min_recall: z.number().min(0).max(1).optional(),
  })
  .strict();

/**
 * The set metrics are one assertion written as three keys, so the halves are
 * checked against each other at load. Either half alone is a case that looks
 * like it measures retrieval and does not: gold passages with no threshold
 * asserts nothing, and a threshold with no gold passages has nothing to
 * measure against.
 */
export const assertionsSchema = assertionsObject.superRefine((assertions, ctx) => {
  // T-312 — a precision floor above `gold ÷ budget` cannot be met however well
  // retrieval performs, and a case that can only fail is worse than no case: it
  // reports a defect in the system under test that is really a defect in the
  // assertion. Found by authoring one (HAPPY-03's first draft, one gold passage
  // and a floor of 0.25 against a budget of eight).
  //
  // RETRIEVAL_BUDGET mirrors `GROUNDED_CHUNK_LIMIT` (packages/knowledge). It is
  // copied rather than imported because the dependency matrix does not admit
  // evals → knowledge, and it is a floor-check rather than a behaviour, so the
  // failure mode of drift is a check that is too permissive — never one that
  // refuses a satisfiable case.
  if (assertions.min_precision !== undefined && assertions.gold_passages !== undefined) {
    const ceiling = assertions.gold_passages.length / RETRIEVAL_BUDGET;
    if (assertions.min_precision > ceiling) {
      ctx.addIssue({
        code: 'custom',
        message: `min_precision ${assertions.min_precision} is unsatisfiable: ${assertions.gold_passages.length} gold passage(s) in a retrieval budget of ${RETRIEVAL_BUDGET} caps precision at ${ceiling.toFixed(3)} — declare more gold passages or lower the floor`,
      });
    }
  }

  const gold = assertions.gold_passages !== undefined;
  const threshold = assertions.min_precision !== undefined || assertions.min_recall !== undefined;
  if (gold && !threshold) {
    ctx.addIssue({
      code: 'custom',
      message: 'gold_passages declares a measurement with no threshold: add min_precision or min_recall',
    });
  }
  if (threshold && !gold) {
    ctx.addIssue({
      code: 'custom',
      message: 'min_precision/min_recall have nothing to measure against: add gold_passages',
    });
  }
});

export type Assertions = z.infer<typeof assertionsSchema>;
export type AssertionType = keyof Assertions;

/** Every assertion type the schema admits — what the registry must cover. */
export const ASSERTION_TYPES = Object.keys(assertionsObject.shape) as AssertionType[];

const caseObject = z
  .object({
    id: z.string(),
    category: z.enum(CATEGORIES),
    description: z.string(),
    fixture: z.string(),
    question: z.string(),
    // T-282 — the Lens this case runs under, live since T-281/T-299. Resolved
    // against the harness's registry at run time rather than validated here:
    // which Lenses exist is a property of the deployment (production carries
    // no drafts), not of the case file, so a schema-level enum would go stale
    // the moment a Lens is authored or retired.
    lens: z.string().optional(),
    mode: z.enum(['declared', 'model_chosen', 'any']).default('any'),
    acting_user: z.string(), // a fixture user key — this fixes the EntitledSlice
    assertions: assertionsSchema,
    hold_out: z.boolean().default(false),

    // ── T-259: two shapes the seed set needed, and neither is an assertion ───
    // Both change how the case is EXECUTED, not how its output is judged, so
    // they sit on the case rather than in `assertions` — an assertion is a
    // predicate over an Observation, and neither of these has one to read.

    /**
     * PERM-01. The case passes when the request is REFUSED. A user with no
     * Participant cannot open a conversation at all — the API answers 404,
     * because denial and nonexistence read identically (principle 4) — so
     * there is no run, no answer and nothing for an assertion to inspect.
     * Before this existed the runner reported such a case as an `error`
     * saying "a refused case has no assertion shape until T-259". This is
     * that shape.
     *
     * A refused case may declare no assertions: there is no observation, and
     * an assertion over a refusal would be an assertion over nothing.
     */
    expect_refused: z.boolean().default(false),

    /**
     * PERM-05, the case the board calls the single one that proves a Lens is a
     * register control and not a permission control.
     *
     * It cannot be one run: the claim is about the RELATIONSHIP between runs —
     * the same question under every named Lens admits an identical source set.
     * So the runner executes the question once per Lens and compares, and the
     * case's own `lens` (if any) is irrelevant to that comparison.
     *
     * Deliberately compares the source set and NOT the answers: two Lenses
     * that produced identical answers would be a different failure (a Lens
     * that did nothing), and conflating the two would let either hide.
     */
    lens_invariance: z.array(z.string()).min(2).optional(),
  })
  .strict();

/**
 * T-258 — a permission case may not declare a model-graded claim.
 *
 * Two rules meet here and one has to give. Permission cases are mandatory on
 * every build (§2) — a regression in one is an incident, not a quality problem.
 * The smoke tier has no independent grader by construction (§5: fake router, no
 * provider calls), so every `~claim` in it comes back `ungraded` (§6). A
 * permission case carrying one would quietly drop out of the mandatory set.
 *
 * Refusing it at authoring time is the resolution: a permission case must be
 * decidable without a model, which is a reasonable thing to require of a case
 * whose subject is whether a document leaked.
 */
export const caseSchema = caseObject.superRefine((evalCase, ctx) => {
  // A refused case never produces an observation, so an assertion on one would
  // be an assertion over nothing — and would read as having held.
  if (evalCase.expect_refused && Object.keys(evalCase.assertions).length > 0) {
    ctx.addIssue({
      code: 'custom',
      message:
        'a case declaring expect_refused may not declare assertions: the request is denied, so there is no answer, no citation and no source set to assert over',
    });
  }
  if (evalCase.expect_refused && evalCase.lens_invariance !== undefined) {
    ctx.addIssue({
      code: 'custom',
      message: 'expect_refused and lens_invariance are mutually exclusive: a refused request runs under no Lens',
    });
  }
  const claims = [
    ...(evalCase.assertions.must_contain ?? []),
    ...(evalCase.assertions.must_not_contain ?? []),
  ];
  if (evalCase.category === 'permission' && claims.some(isGraded)) {
    ctx.addIssue({
      code: 'custom',
      message:
        'a permission case may not declare a model-graded (~) claim: permission cases run in every smoke build, and the smoke tier has no independent grader',
    });
  }
});

export type EvalCase = z.infer<typeof caseSchema>;

export async function loadCaseFile(path: string): Promise<EvalCase> {
  const parsed = caseSchema.safeParse(parse(await readFile(path, 'utf8')));
  if (!parsed.success) {
    throw new Error(`invalid case ${path}: ${parsed.error.message}`);
  }
  return parsed.data;
}

/** The assertion types this case declares — what the runner must be able to evaluate. */
export function declaredAssertions(evalCase: EvalCase): AssertionType[] {
  return Object.keys(evalCase.assertions).filter(
    (name) => evalCase.assertions[name as AssertionType] !== undefined,
  ) as AssertionType[];
}
