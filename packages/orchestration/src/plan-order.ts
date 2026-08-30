// T-262 — the plan's execution order, derived from its edges.
//
// The chain's sequence used to live in code as four `await`s. It now lives in
// the plan as `depends_on`, which is what makes an EDITED plan (T-267) and a
// DECLARED workflow's DAG (T-264/T-265) executable by the same executor rather
// than by a second one written to look like the first.
//
// Parallelism is EXPRESSED here and not yet EXERCISED: this returns a linear
// order, and the run loop executes it one step at a time. That is deliberate
// rather than an omission — ADR-0028 §4 fixes the model as parallel-capable and
// the record's shape already admits it, so the change when siblings do run
// concurrently is to the loop, not to the ordering or to the stored plan.
import type { Id, PlanStage } from '@infora/contracts';

export type PlannedStep = {
  id: Id;
  ordinal: number;
  stage: PlanStage;
  dependsOn: Id[];
  /**
   * T-396 — the capability this step names, or null for a step the
   * orchestrator runs itself. THE EXECUTOR READS THIS; before T-396 the column
   * was written and never read, which is the whole of what that ticket fixed.
   */
  worker: string | null;
  /** T-396 — the step's bound inputs, handed to the capability that runs it */
  inputs: Record<string, unknown>;
  /**
   * T-396 — the declaring workflow's own step id, carried in memory (never
   * stored) so `{{steps.x.output}}` resolves between steps of one run. Null for
   * a plan that came from no workflow.
   */
  key: string | null;
};

/** A plan that cannot be ordered is not executed at all — never half-executed. */
export class PlanNotExecutable extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'PlanNotExecutable';
  }
}

/**
 * Topological order, ties broken by `ordinal`.
 *
 * The tiebreak is not cosmetic. Two steps with no edge between them are
 * genuinely unordered, and an executor that resolved that by iteration order
 * would produce a step sequence that depended on how the rows came back from
 * the database — which would make a *declared* workflow non-repeatable, the one
 * property declared mode exists to promise. `ordinal` is stored, so the answer
 * is the same every run.
 *
 * Refuses rather than repairs. A cycle or an edge naming a step that is not in
 * this plan is a broken plan, and running the part of it that happens to be
 * orderable would produce an answer built from an analysis nobody wrote.
 */
export function orderPlanSteps(steps: readonly PlannedStep[]): PlannedStep[] {
  const byId = new Map(steps.map((step) => [step.id, step]));

  for (const step of steps) {
    for (const dependency of step.dependsOn) {
      if (!byId.has(dependency)) {
        throw new PlanNotExecutable(
          `plan step ${step.ordinal} depends on ${dependency}, which is not a step of this plan`,
        );
      }
    }
  }

  const remaining = new Set(steps.map((step) => step.id));
  const ordered: PlannedStep[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining]
      .map((id) => byId.get(id)!)
      .filter((step) => step.dependsOn.every((dependency) => !remaining.has(dependency)))
      .sort((a, b) => a.ordinal - b.ordinal);

    if (ready.length === 0) {
      const stuck = [...remaining].map((id) => byId.get(id)!.ordinal).sort((a, b) => a - b);
      throw new PlanNotExecutable(`plan steps ${stuck.join(', ')} form a dependency cycle`);
    }

    // one per pass, re-deriving readiness each time: the whole ready set sorted
    // once would emit a step before a sibling that unblocks nothing but sorts
    // earlier, which is a different order from the one the ordinals state
    const next = ready[0]!;
    remaining.delete(next.id);
    ordered.push(next);
  }
  return ordered;
}

/**
 * T-268 — everything that transitively depends on a failed step.
 *
 * A failed step's DEPENDANTS are skipped and independent branches continue,
 * which is the whole of partial-failure semantics: one failed web search must
 * not discard a completed corpus search. The transitive closure matters — a
 * step two edges downstream of a failure is just as unable to run as one, and
 * skipping only the immediate dependants would leave it to fail on an input
 * that never arrived, which reports the same outage twice under two different
 * names.
 */
export function dependantsOf(steps: readonly PlannedStep[], failed: ReadonlySet<Id>): Set<Id> {
  const skipped = new Set<Id>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const step of steps) {
      if (failed.has(step.id) || skipped.has(step.id)) continue;
      if (step.dependsOn.some((id) => failed.has(id) || skipped.has(id))) {
        skipped.add(step.id);
        grew = true;
      }
    }
  }
  return skipped;
}
