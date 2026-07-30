// T-255 — the case schema (docs/ask/07 §1), as declared there and no wider.
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

export const CATEGORIES = ['happy', 'negative', 'trap', 'behaviour', 'permission'] as const;
export type Category = (typeof CATEGORIES)[number];

// A source reference in an assertion is a fixture VERSION key today. The
// schema's `authority_ref` half waits for the authority corpus (T-276/T-277);
// there is no store to resolve one against yet, so admitting the syntax now
// would admit an assertion nothing can evaluate.
const sourceRef = z.string();

export const assertionsSchema = z
  .object({
    must_cite: z.array(sourceRef).optional(),
    must_not_cite: z.array(sourceRef).optional(),
    must_contain: z.array(z.string()).optional(),
    must_not_contain: z.array(z.string()).optional(),
    max_uncited_claims: z.number().int().nonnegative().optional(),
    expect_calls: z.array(z.string()).optional(),
    expect_not_called: z.array(z.string()).optional(),
    gold_passages: z.array(z.string()).optional(),
    min_precision: z.number().min(0).max(1).optional(),
    min_recall: z.number().min(0).max(1).optional(),
  })
  .strict();

export type Assertions = z.infer<typeof assertionsSchema>;
export type AssertionType = keyof Assertions;

export const caseSchema = z
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
