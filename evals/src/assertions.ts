// T-255 — the assertion registry.
//
// One assertion type is implemented here: `must_not_cite`, the permission
// assertion (docs/ask/07 §1.1). The rest of the schema's types land with
// T-256, each with a passing AND a failing case, so that a wrong
// implementation cannot pass both.
//
// The load-bearing rule until then: a declared assertion the registry cannot
// evaluate is reported as UNSUPPORTED, and an unsupported assertion makes the
// case an `error` — never a pass. A harness that silently ignores what it
// cannot check reports green while testing nothing, and that failure would be
// invisible exactly when it mattered.
import type { AssertionType, Assertions } from './case';

export type ObservedSource = { versionId?: string; authorityRef?: string };

/** What a case's execution produced, in the terms assertions are written in. */
export type Observation = {
  answer: string;
  citations: ObservedSource[];
  /** every source the run's steps recorded seeing (ADR-0028 §7) */
  sourceSet: ObservedSource[];
  railOutcomes: Array<{ rail: string; outcome: string; detail?: string }>;
};

export type AssertionContext = {
  observation: Observation;
  /** resolve a fixture version key to the row it materialised as */
  resolveRef(ref: string): { versionId: string; documentReference: string };
};

type Evaluator = (declared: never, context: AssertionContext) => string[];

const EVALUATORS: Partial<Record<AssertionType, Evaluator>> = {
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
};

export type AssertionReport = {
  failures: string[];
  /** declared but not implemented — the case is an error, never a pass */
  unsupported: AssertionType[];
};

export function evaluateAssertions(
  assertions: Assertions,
  context: AssertionContext,
): AssertionReport {
  const report: AssertionReport = { failures: [], unsupported: [] };
  for (const [name, declared] of Object.entries(assertions)) {
    if (declared === undefined) continue;
    const evaluator = EVALUATORS[name as AssertionType];
    if (evaluator === undefined) {
      report.unsupported.push(name as AssertionType);
      continue;
    }
    report.failures.push(...evaluator(declared as never, context));
  }
  return report;
}
