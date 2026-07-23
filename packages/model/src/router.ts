import type {
  ChatAdapter,
  ChatRequest,
  ChatResult,
  ChatTask,
  EmbedInputType,
  EmbedResult,
  EmbeddingAdapter,
} from './types.js';
import {
  TIER_POLICIES,
  UNATTRIBUTED,
  selectRoute,
  type Classification,
  type DeploymentTier,
  type EgressFacts,
  type Route,
  type TierPolicy,
} from './tiers.js';

// The deployment's security configuration (ADR-0037 §1): its tier and the
// classification it carries by default. Both are deployment-level settings
// (owner-ruled 2026-07-22, open item 2) — a client spanning classifications
// runs separate deployments.
export type DeploymentSecurity = {
  policy: TierPolicy;
  defaultClassification: Classification;
};

// The standard tier carrying OFFICIAL is the safe out-of-the-box posture; a
// deployment that means anything else states it. Note this is not permissive:
// a route must still declare UK-region, zero-retention attributes to conform,
// so the current undeclared dev endpoints fail closed until configured.
const DEFAULT_SECURITY: DeploymentSecurity = {
  policy: TIER_POLICIES.standard,
  defaultClassification: 'official',
};

export function securityForTier(
  tier: DeploymentTier,
  defaultClassification: Classification = 'official',
): DeploymentSecurity {
  return { policy: TIER_POLICIES[tier], defaultClassification };
}

// The router is the single enforcement point (ADR-0028 §9, ADR-0037 §3): every
// chat and embedding call passes through it, it selects only a route
// conforming to the deployment tier, fails closed when none does, and records
// the egress facts. Callers are unaffected by the added policy layer — the
// whole point of the seam.
export class Router {
  private readonly security: DeploymentSecurity;
  private readonly chatRoute: Route<ChatAdapter>;
  private readonly embeddingRoute: Route<EmbeddingAdapter>;

  constructor(
    chatAdapter: ChatAdapter,
    embeddingAdapter: EmbeddingAdapter,
    security: DeploymentSecurity = DEFAULT_SECURITY,
  ) {
    this.security = security;
    // v1 holds one route per capability; a route carries the adapter's declared
    // attributes, or UNATTRIBUTED when it declared none (so it conforms to
    // nothing and is refused rather than dispatched to on trust).
    this.chatRoute = {
      adapter: chatAdapter,
      attributes: chatAdapter.attributes ?? UNATTRIBUTED,
      endpoint: chatAdapter.endpoint ?? 'unknown',
    };
    this.embeddingRoute = {
      adapter: embeddingAdapter,
      attributes: embeddingAdapter.attributes ?? UNATTRIBUTED,
      endpoint: embeddingAdapter.endpoint ?? 'unknown',
    };
  }

  async chat(_task: ChatTask, request: ChatRequest): Promise<ChatResult> {
    const classification = request.classification ?? this.security.defaultClassification;
    // tier constraint first, then (v1: trivial) task optimisation — never the
    // reverse. selectRoute throws (fails closed) if nothing conforms.
    const route = selectRoute(this.security.policy, classification, [this.chatRoute]);
    const result = await route.adapter.chat(request);
    return { ...result, egress: egressOf(route, classification) };
  }

  async embed(
    texts: string[],
    inputType: EmbedInputType,
    classification: Classification = this.security.defaultClassification,
  ): Promise<EmbedResult> {
    const route = selectRoute(this.security.policy, classification, [this.embeddingRoute]);
    const result = await route.adapter.embed(texts, inputType);
    return { ...result, egress: egressOf(route, classification) };
  }

  // The embedding model id/version is pinned per index (ADR-0024); ingestion
  // records this so a model change forces a deliberate re-index, never a mix.
  get embeddingModel(): { id: string; dimensions: number } {
    return {
      id: this.embeddingRoute.adapter.modelId,
      dimensions: this.embeddingRoute.adapter.dimensions,
    };
  }
}

function egressOf<A>(route: Route<A>, classification: Classification): EgressFacts {
  return {
    endpoint: route.endpoint,
    region: route.attributes.region,
    retention: route.attributes.retention,
    classification,
  };
}
