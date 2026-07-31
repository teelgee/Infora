// T-257 — model-graded assertions, under the verifier's independence rule
// (docs/build/ask/07 §6).
//
// Some assertions cannot be a regex. "The answer says the exceedance is against
// a baseline" is a claim about meaning, and a case that tries to pin it with a
// substring either passes on a coincidence or fails on a synonym. So a claim
// may be handed to a model to grade.
//
// THE RULE THAT MAKES THAT SAFE, and it is the same one the `verifier` runs
// under (04 §3): **the grading model is never the family that produced the
// answer.** Same-family grading is largely self-agreement — the failure it
// cannot see is the failure it just made. So:
//
//   * no grader configured           → `ungraded`
//   * grader's family = the producer → `ungraded`, refused rather than run
//   * otherwise                      → graded, and the grader's family is
//                                      recorded in the result file
//
// `ungraded` is never a pass (§6). It is a fourth verdict rather than a quiet
// skip, because a skip is indistinguishable from a check that held.
//
// WHAT IS A STOPGAP HERE, named as one: `family` is the harness's own record.
// `packages/model` has no family concept yet — the routing table and the
// `different_family_from: draft` constraint at dispatch are T-284/T-286. When
// they land, the producing family comes off the run's own draft step instead of
// off the harness's declaration, and this check reads it from there.

/** A claim to grade, and which direction it is asserted in. */
export type GradeRequest = {
  claim: string;
  answer: string;
  assertion: 'must_contain' | 'must_not_contain';
};

/** A grader: a model of a stated family, asked whether the answer makes a claim. */
export type Grader = {
  family: string;
  model: string;
  /** true = the answer makes the claim */
  grade(request: GradeRequest): Promise<{ present: boolean; reason?: string }>;
};

export type GradingContext = {
  /** the family that produced the answer — what the grader may not be */
  producerFamily: string;
  grader?: Grader;
};

/** One graded claim, as it appears in the result file (§6). */
export type GradeRecord = {
  assertion: 'must_contain' | 'must_not_contain';
  claim: string;
  /** null when no grade was taken — the family is the point of the record */
  grader: { family: string; model: string } | null;
  outcome: 'present' | 'absent' | 'ungraded';
  reason?: string;
};

/**
 * A model-graded claim is written with a leading `~` — the same shape of
 * convention as `/pattern/flags` for a regex, in the same list:
 *
 *   must_contain:
 *     - "0.41 mg/l"                              # substring
 *     - /HB-\d\d/                                # regex
 *     - ~the exceedance is stated against a baseline   # model-graded
 */
export const GRADED_PREFIX = '~';

export function isGraded(pattern: string): boolean {
  return pattern.startsWith(GRADED_PREFIX);
}

export function claimOf(pattern: string): string {
  return pattern.slice(GRADED_PREFIX.length).trim();
}

/**
 * Grade the claims a case declared, and say which assertions failed.
 *
 * A refused or unavailable grade produces a `GradeRecord` with outcome
 * `ungraded` and NO failure — the case is not failing, it is unchecked, and the
 * runner turns that into the `ungraded` verdict. Reporting it as a failure
 * would be as wrong as reporting it as a pass: it would put a red mark against
 * an answer nobody assessed.
 */
export async function gradeClaims(
  claims: Array<{ assertion: 'must_contain' | 'must_not_contain'; pattern: string }>,
  answer: string,
  context: GradingContext | undefined,
): Promise<{ failures: string[]; grades: GradeRecord[] }> {
  const failures: string[] = [];
  const grades: GradeRecord[] = [];

  for (const { assertion, pattern } of claims) {
    const claim = claimOf(pattern);
    const refusal = whyNotGradable(context);
    if (refusal !== null) {
      grades.push({ assertion, claim, grader: null, outcome: 'ungraded', reason: refusal });
      continue;
    }

    const grader = context!.grader!;
    const { present, reason } = await grader.grade({ claim, answer, assertion });
    grades.push({
      assertion,
      claim,
      grader: { family: grader.family, model: grader.model },
      outcome: present ? 'present' : 'absent',
      ...(reason !== undefined && { reason }),
    });

    if (assertion === 'must_contain' && !present) {
      failures.push(`must_contain (graded): the answer does not claim ${JSON.stringify(claim)}`);
    }
    if (assertion === 'must_not_contain' && present) {
      failures.push(`must_not_contain (graded): the answer claims ${JSON.stringify(claim)}`);
    }
  }

  return { failures, grades };
}

/** Why this grade cannot be taken, or null if it can. */
function whyNotGradable(context: GradingContext | undefined): string | null {
  if (context?.grader === undefined) {
    return 'no grader is configured for this run, so the claim was not assessed';
  }
  if (context.grader.family === context.producerFamily) {
    return `grader family '${context.grader.family}' is the family that produced the answer; a same-family grade is self-agreement (07 §6, 04 §3)`;
  }
  return null;
}
