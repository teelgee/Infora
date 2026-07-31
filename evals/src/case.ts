// T-255 — the case schema (docs/build/ask/07 §1), as declared there and no wider.
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
    // The Lens is declarative domain content that does not exist until T-281.
    // A case may not pin one yet — see runner.ts, which reports a case that
    // declares one as `error` rather than running it Lens-less and calling
    // that a pass.
    lens: z.string().optional(),
    mode: z.enum(['declared', 'model_chosen', 'any']).default('any'),
    acting_user: z.string(), // a fixture user key — this fixes the EntitledSlice
    assertions: assertionsSchema,
    hold_out: z.boolean().default(false),
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
