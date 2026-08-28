import type {
  ChatAdapter,
  ChatRequest,
  ChatResult,
  EmbedInputType,
  EmbedResult,
  EmbeddingAdapter,
} from './types.js';
import { selectForTask, type ChatRoute, type ChatTask } from './tasks.js';
import type { WorkerModelTier } from '@infora/contracts';
import {
  TIER_POLICIES,
  UNATTRIBUTED,
  conformingRoutes,
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
/**
 * How a deployment declares one chat route: the adapter, plus the model tiers
 * it is configured to serve (T-284). `serves` omitted means the route serves
 * every task — which is what a single-endpoint deployment has, and is why
 * adding the task axis changed no running behaviour.
 */
export type ChatRouteSpec = { adapter: ChatAdapter; serves?: readonly WorkerModelTier[] };

export class Router {
  private readonly security: DeploymentSecurity;
  private readonly chatRoutes: ChatRoute[];
  private readonly embeddingRoute: Route<EmbeddingAdapter>;

  constructor(
    // A bare adapter is the one-route deployment, kept as the primary form
    // because that is what every deployment and every test still passes.
    chat: ChatAdapter | ReadonlyArray<ChatRouteSpec>,
    embeddingAdapter: EmbeddingAdapter,
    security: DeploymentSecurity = DEFAULT_SECURITY,
  ) {
    this.security = security;
    // a route carries the adapter's declared attributes, or UNATTRIBUTED when
    // it declared none (so it conforms to nothing and is refused rather than
    // dispatched to on trust)
    const specs: ReadonlyArray<ChatRouteSpec> = Array.isArray(chat)
      ? chat
      : [{ adapter: chat as ChatAdapter }];
    if (specs.length === 0) {
      // an empty chain is a misconfiguration, and it must not present as the
      // fail-closed refusal a non-conforming route produces: those are
      // different problems and an operator needs to be told which one this is
      throw new Error('Router was given no chat route — a deployment declares at least one');
    }
    this.chatRoutes = specs.map((spec) => ({
      adapter: spec.adapter,
      attributes: spec.adapter.attributes ?? UNATTRIBUTED,
      endpoint: spec.adapter.endpoint ?? 'unknown',
      ...(spec.serves !== undefined && { serves: spec.serves }),
    }));
    this.embeddingRoute = {
      adapter: embeddingAdapter,
      attributes: embeddingAdapter.attributes ?? UNATTRIBUTED,
      endpoint: embeddingAdapter.endpoint ?? 'unknown',
    };
  }

  async chat(task: ChatTask, request: ChatRequest): Promise<ChatResult> {
    const classification = request.classification ?? this.security.defaultClassification;
    // THE ORDER IS THE GUARANTEE (ADR-0028 §9, ADR-0037 §3). The tier filters
    // first and fails closed; only then does the task rank what survived. The
    // two steps are separate functions in separate files precisely so an edit
    // cannot quietly invert them — `selectForTask` is handed a set that is
    // already conforming and has nothing with which to widen it.
    const conforming = conformingRoutes(this.security.policy, classification, this.chatRoutes);
    const route = selectForTask(conforming, task);
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
