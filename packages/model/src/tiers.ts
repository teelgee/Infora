// ADR-0037 — deployment security tiers, enforced at the router. Security
// posture is a per-deployment policy, not a build property (§1). A route the
// router can dispatch to declares its egress attributes (§3); a tier policy
// says which attribute values it permits; the router selects only a
// conforming route and fails closed (router.ts). None of these values are a
// task heuristic — the tier is a hard constraint applied before any
// task-based optimisation (§3, the two-axis order).

// Where the model call is processed. 'unknown' is the honest default for an
// endpoint whose attributes were never declared — it conforms to no tier, so
// an unattributed endpoint is refused rather than trusted (§3).
export type ProcessingRegion = 'uk' | 'eu' | 'us' | 'unknown';

// The provider's data-retention contract. 'zero' = zero data retention;
// 'transient' = held only for the request; 'unknown' = undeclared.
export type RetentionPosture = 'zero' | 'transient' | 'unknown';

// Whether the infrastructure sits beyond foreign legal reach. 'uk-sovereign'
// admits no foreign jurisdiction (self-hosted inside the UK boundary);
// 'foreign-reachable' is a UK region of a foreign-headquartered provider that
// foreign legal process (e.g. the US CLOUD Act) can still reach (§2 note).
export type Jurisdiction = 'uk-sovereign' | 'foreign-reachable' | 'unknown';

// Where inference physically runs. 'self-hosted' is an open-weight model
// inside our boundary; 'enterprise-zdr' is a third-party API under an
// enterprise zero-retention contract.
export type ProviderEligibility = 'enterprise-zdr' | 'self-hosted' | 'unknown';

// The four egress attributes every dispatchable route must declare (§3).
export type RouteAttributes = {
  region: ProcessingRegion;
  retention: RetentionPosture;
  jurisdiction: Jurisdiction;
  eligibility: ProviderEligibility;
};

// The honest attribute value for an endpoint that declared nothing — chosen
// so it conforms to no tier and is refused, never dispatched to on trust (§3,
// closing the fromEnv()-picks-up-any-URL gap).
export const UNATTRIBUTED: RouteAttributes = {
  region: 'unknown',
  retention: 'unknown',
  jurisdiction: 'unknown',
  eligibility: 'unknown',
};

// A self-hosted route inside the UK-sovereign boundary — conforms to every
// tier. The sovereign tier's own routes carry these attributes (§2, §8), and
// an in-process deterministic adapter (no real egress at all) legitimately
// does too.
export const SELF_HOSTED_UK: RouteAttributes = {
  region: 'uk',
  retention: 'zero',
  jurisdiction: 'uk-sovereign',
  eligibility: 'self-hosted',
};

// Data classification travels with the request (§4). Resolved upstream from
// the deployment default (v1) and carried, never inferred at dispatch. The
// per-request field is the elevation seam; the elevation flow itself is not
// built yet (owner-ruled 2026-07-22, ADR-0037 open item 4).
export type Classification = 'official' | 'secret';

// A named security tier (§2), selected per deployment. The set is extensible:
// adding a tier (e.g. an EU-region tier) is a policy entry below, not a
// structural change.
export type DeploymentTier = 'standard' | 'sovereign';

// A tier's policy: the permitted value set on each egress axis, plus the
// classifications the tier may carry. A route conforms only if every one of
// its attributes is permitted; 'unknown' appears in no set, so an
// unattributed route conforms to nothing.
export type TierPolicy = {
  tier: DeploymentTier;
  region: ProcessingRegion[];
  retention: RetentionPosture[];
  jurisdiction: Jurisdiction[];
  eligibility: ProviderEligibility[];
  classifications: Classification[];
};

export const TIER_POLICIES: Record<DeploymentTier, TierPolicy> = {
  // Standard (UK-region): a UK region of an enterprise provider under a
  // zero-retention contract. Appropriate for OFFICIAL. A UK region of a
  // foreign-headquartered hyperscaler is permitted here (foreign-reachable),
  // but not at the sovereign tier.
  standard: {
    tier: 'standard',
    region: ['uk'],
    retention: ['zero'],
    jurisdiction: ['uk-sovereign', 'foreign-reachable'],
    eligibility: ['enterprise-zdr', 'self-hosted'],
    classifications: ['official'],
  },
  // Sovereign: self-hosted open-weight models inside a UK-sovereign boundary
  // that excludes foreign legal jurisdiction; no third-party inference API.
  // Appropriate for SECRET-capable work. Designed now, stood up when a
  // contract funds the boundary (§8) — a valid, selectable config regardless.
  sovereign: {
    tier: 'sovereign',
    region: ['uk'],
    retention: ['zero'],
    jurisdiction: ['uk-sovereign'],
    eligibility: ['self-hosted'],
    classifications: ['official', 'secret'],
  },
};

// The egress facts a call actually used, recorded to the Step audit (§6) so
// the guarantee is provable per call rather than asserted.
export type EgressFacts = {
  endpoint: string;
  region: ProcessingRegion;
  retention: RetentionPosture;
  classification: Classification;
};

// A route the router may dispatch to: the adapter plus its declared egress
// attributes and endpoint. Attributes ride alongside the adapter rather than
// inside it so the same adapter class can be configured at different postures.
export type Route<A> = {
  adapter: A;
  attributes: RouteAttributes;
  endpoint: string;
};

export function routeConforms(policy: TierPolicy, attrs: RouteAttributes): boolean {
  return (
    policy.region.includes(attrs.region) &&
    policy.retention.includes(attrs.retention) &&
    policy.jurisdiction.includes(attrs.jurisdiction) &&
    policy.eligibility.includes(attrs.eligibility)
  );
}

export function classificationPermitted(policy: TierPolicy, classification: Classification): boolean {
  return policy.classifications.includes(classification);
}

export class SecurityPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityPolicyError';
  }
}

/**
 * THE HARD CONSTRAINT, and the whole of it (§3): the classification the tier
 * may carry, then per-route attribute conformance. Everything eligible, in the
 * order the deployment declared it. Fails closed — no conforming route errors,
 * and never falls back to a non-conforming region or provider to preserve
 * availability.
 *
 * T-284 split this out of `selectRoute` so the second axis has something to
 * rank. It returns the SET rather than a choice, because the ordering the ADR
 * fixes is only checkable if the two steps are separable: task selection
 * (tasks.ts) receives this result and can narrow it, and has no policy,
 * classification or attributes with which to re-open it.
 */
export function conformingRoutes<R extends Route<unknown>>(
  policy: TierPolicy,
  classification: Classification,
  routes: readonly R[],
): R[] {
  if (!classificationPermitted(policy, classification)) {
    throw new SecurityPolicyError(
      `deployment tier '${policy.tier}' may not carry '${classification}' data — no conforming route`,
    );
  }
  const conforming = routes.filter((route) => routeConforms(policy, route.attributes));
  if (conforming.length === 0) {
    throw new SecurityPolicyError(
      `no route conforms to tier '${policy.tier}' — refusing to dispatch (fail closed)`,
    );
  }
  return conforming;
}

/**
 * Two-axis selection in the ADR's order (§3): the tier policy filters first,
 * and only within the conforming set does task-based optimisation choose. This
 * is the no-task form — the first conforming route — which is what the
 * embedding path uses, because an embedding call has no task axis.
 */
export function selectRoute<A>(
  policy: TierPolicy,
  classification: Classification,
  routes: Array<Route<A>>,
): Route<A> {
  return conformingRoutes<Route<A>>(policy, classification, routes)[0]!;
}
