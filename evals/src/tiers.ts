// T-258 — the execution tiers (docs/build/ask/07 §5) and what each one is allowed to
// run.
//
// | smoke   | every change | all permission cases + one per category and per
// |         |              | Lens. Deterministic, fake router, no provider calls
// | full    | nightly      | every case, real models. Hold-out excluded
// | release | pre-release  | every case, hold-out included
//
// TWO RULES ABOUT WHAT MAY LEAVE A TIER, and they are the reason selection is a
// function rather than a comment in a CI file:
//
//   * a hold-out case is not RUN outside a release run, not merely filtered out
//     of the report afterwards (§7). Filtering at the end is the backstop;
//     never executing it is the control.
//   * a model-graded case is not run in smoke, because smoke has no independent
//     grader by construction (§5: fake router, no provider calls) and every one
//     of its claims would come back `ungraded` (§6, T-257).
//
// The second rule collides with "permission cases are mandatory on every build"
// (§2) for a permission case that declares a `~claim` — one would silently drop
// out of the mandatory set. That collision is resolved where it belongs, at the
// case schema: a permission case may not declare a model-graded claim (case.ts).
import type { EvalCase } from './case';
import { isGraded } from './grading';

export const TIERS = ['smoke', 'full', 'release'] as const;
export type Tier = (typeof TIERS)[number];

export function isTier(value: string): value is Tier {
  return (TIERS as readonly string[]).includes(value);
}

/**
 * How many times each case runs (§8). The nightly tier repeats to detect flake;
 * smoke does not, because a smoke run must be fast enough for every commit and
 * its substrate is deterministic by construction anyway.
 */
export function defaultRepeats(tier: Tier): number {
  return tier === 'smoke' ? 1 : 3;
}

export type Selection = {
  selected: EvalCase[];
  /** cases this tier does not run, each with the reason — never silent */
  excluded: Array<{ caseId: string; reason: string }>;
};

export function selectCases(cases: EvalCase[], tier: Tier): Selection {
  const ordered = [...cases].sort((a, b) => a.id.localeCompare(b.id));
  const selected: EvalCase[] = [];
  const excluded: Selection['excluded'] = [];

  const categoriesSeen = new Set<string>();
  const lensesSeen = new Set<string>();

  for (const evalCase of ordered) {
    // §7 — hold-out runs at release and nowhere else. Not "is hidden from the
    // report": is not executed, so there is no result to leak.
    if (evalCase.hold_out && tier !== 'release') {
      excluded.push({ caseId: evalCase.id, reason: 'hold-out: runs only in a release run' });
      continue;
    }

    if (tier !== 'smoke') {
      selected.push(evalCase);
      continue;
    }

    if (graded(evalCase)) {
      excluded.push({
        caseId: evalCase.id,
        reason: 'model-graded: the smoke tier has no independent grader (§5, §6)',
      });
      continue;
    }

    // Permission cases are mandatory on every build (§2) — a regression in one
    // is not a quality problem but an incident, so the subset never thins them.
    const mandatory = evalCase.category === 'permission';
    const newCategory = !categoriesSeen.has(evalCase.category);
    const newLens = evalCase.lens !== undefined && !lensesSeen.has(evalCase.lens);
    if (mandatory || newCategory || newLens) {
      selected.push(evalCase);
      categoriesSeen.add(evalCase.category);
      if (evalCase.lens !== undefined) lensesSeen.add(evalCase.lens);
    } else {
      excluded.push({ caseId: evalCase.id, reason: 'not in the smoke subset' });
    }
  }

  return { selected, excluded };
}

export function graded(evalCase: EvalCase): boolean {
  return [...(evalCase.assertions.must_contain ?? []), ...(evalCase.assertions.must_not_contain ?? [])].some(
    isGraded,
  );
}
