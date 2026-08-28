// @infora/governance — audit log, grounding/NLI, rails, access policy
export * from './access';
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
