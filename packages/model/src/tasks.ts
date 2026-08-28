// T-284 — task-class routing: the second axis, applied AFTER the first.
//
// ADR-0028 §9's 2026-07-22 refinement fixes the order and the reason for it.
// **Security-tier enforcement is a hard constraint** — it decides which routes
// are eligible at all, by region, jurisdiction, retention and provider
// eligibility, and it filters the candidate set first (tiers.ts). **Task-based
// selection is an optimisation *within* that set** — heavy synthesis to a
// frontier model, retrieval triage to a small fast one. The two are never
// conflated, because a performance choice that could reorder a security
// boundary is a performance choice that can override it.
//
// So this file can only ever narrow a set `conformingRoutes` has already
// produced, and it takes no policy, no classification and no attributes as
// input. If a future edit gives it any of those, the ordering has been
// inverted and the guarantee is gone.
//
// TWO LAYERS, NOT ONE. A caller names an ACTIVITY; the activity maps to the
// model tier that activity wants (the Wave 5 design reference's table, below);
// a route declares which tiers the deployment configured it to serve.
// Collapsing that to "the caller names a tier" would scatter the
// model-capability judgement across every call site, where changing it later
// means editing all of them — and the design's own framing is *route on task
// class, not on perceived difficulty*.
import type { WorkerModelTier } from '@infora/contracts';
import type { ChatAdapter } from './types.js';
import type { Route } from './tiers.js';

/**
 * The task classes, verbatim from the Wave 5 design reference's table
 * (docs/build/plan-history.md, folded into component-1-foundation.md at T-285).
 *
 * The WHOLE table is here rather than only the classes with a caller today,
 * and that is the one place this file differs from the worker registry's
 * "declare only what is built" rule — deliberately, because the two things are
 * not alike. A declared worker is a capability the MODEL is told it can call,
 * so declaring an unbuilt one makes the model call something that does not
 * exist. A task class is a key a DEPLOYMENT configures routes against; the
 * table is the design's own vocabulary, and publishing half of it would mean a
 * deployment cannot pre-configure the route a capability will want on the day
 * it lands.
 */
export type ChatTask =
  /** classification, intent, workflow selection */
  | 'orchestrate'
  /** question generation and recommendation (Wave 6) */
  | 'clarify'
  /** step selection in model-chosen mode */
  | 'plan'
  /** retrieval relevance filtering — the highest-volume class by far */
  | 'triage'
  /** schema extraction, structured output */
  | 'extract'
  /** user-visible prose under a Lens */
  | 'synthesise'
  /** the same, where the context is long */
  | 'synthesise_long'
  /** grounded document drafting — the existing chain's one thinking leaf */
  | 'draft'
  /** claim verification. The independence constraint is T-286 and is NOT here:
   *  this map names a tier, and "a different family from the producer" is a
   *  dispatch-time rule about a specific run, not a property of the class. */
  | 'verify';

/**
 * What class of model each activity wants — the table's Tier column, and the
 * one place that judgement lives, so re-tiering an activity is one line rather
 * than a sweep of call sites. `triage`'s "small, fine-tuned where available"
 * is the `triage` tier: the fine-tune is a route a deployment may or may not
 * have, which is exactly why the tier and the route are different things.
 */
export const TASK_TIERS: Record<ChatTask, WorkerModelTier> = {
  orchestrate: 'frontier',
  clarify: 'frontier',
  plan: 'frontier',
  triage: 'triage',
  extract: 'mid',
  synthesise: 'frontier',
  synthesise_long: 'frontier',
  draft: 'frontier',
  verify: 'frontier',
};

/**
 * A dispatchable chat route, plus the tiers the deployment configured it for.
 *
 * `serves` is deliberately optional and deliberately not a filter: **undefined
 * means the route serves any task**, which is what a single-endpoint
 * deployment has, and is why adding this axis changed no running behaviour.
 */
export type ChatRoute = Route<ChatAdapter> & { serves?: readonly WorkerModelTier[] };

/**
 * Rank the ALREADY-CONFORMING set by task, and never shrink it to nothing.
 *
 * Returns the routes for this task in preference order — the declared routes
 * that serve its tier first, then everything else conforming, which is the
 * ordinary availability answer and (T-285) the fallback chain. A task with no
 * route declared for its tier therefore still runs: task selection is an
 * optimisation, and an optimisation that can make a call impossible has
 * stopped being one. **Availability is only ever traded for conformance**
 * (ADR-0037 §3 fails closed before this function is reached, and nothing here
 * can re-open it), never for preference.
 */
export function routesForTask<R extends { serves?: readonly WorkerModelTier[] }>(
  conforming: readonly R[],
  task: ChatTask,
): R[] {
  const tier = TASK_TIERS[task];
  const declared = conforming.filter((route) => route.serves?.includes(tier));
  const rest = conforming.filter((route) => !declared.includes(route));
  return [...declared, ...rest];
}

/** The route this task dispatches to first. */
export function selectForTask<R extends { serves?: readonly WorkerModelTier[] }>(
  conforming: readonly R[],
  task: ChatTask,
): R {
  return routesForTask(conforming, task)[0]!;
}
