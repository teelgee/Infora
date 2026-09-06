// @infora/governance — audit log, grounding/NLI, rails, access policy
export * from './access';
// T-440 — the app's access predicates (ADR-0056). The row predicate lives here
// and nowhere else: a second copy in a route or a screen is the failure mode
// the ADR's research found behind every app-builder incident it read.
export {
  appRunnable,
  canBuildApp,
  canOpenApp,
  canReadAppRow,
  canReassignApp,
  canShareAppTable,
  withinAppScope,
} from './app';
export type { AppBuildFacts, AppRowVisibilityFacts, AppScopeGrant } from './app';
// T-248 — scope attenuation (finding F8): narrowing only, intersected, monotonic
export { attenuate, reachableContainerIds } from './attenuation';
export type { Attenuation } from './attenuation';
export * from './conflict';
export * from './sandbox';
// T-249 — label propagation on write-back (finding F2). Policy only: the
// queries that gather the facts live in packages/knowledge, beside the
// visibility SQL they share a definition with.
export {
  ACCESS_LABELS,
  checkPropagation,
  destinationAudience,
  labelRank,
  sourceAudience,
  UNCONSTRAINED,
} from './label';
export type {
  AccessLabel,
  Audience,
  DestinationAccessFacts,
  PropagationVerdict,
  SourceAccessFacts,
} from './label';
export { groundCheck } from './ground-check';
export type { CheckedClaim, GroundCheckResult, RailOutcome } from './ground-check';
