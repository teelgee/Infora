import type {
  ChatAdapter,
  ChatRequest,
  ChatResult,
  EmbedInputType,
  EmbedResult,
  EmbeddingAdapter,
  RouteAttempt,
} from './types.js';
import { routesForTask, type ChatRoute, type ChatTask } from './tasks.js';
import { RouteChainExhausted, isRouteUnavailable, withTimeout } from './failover.js';
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

/**
 * T-285 — the fallback chain's two dials, the Wave 5 design reference's
 * `defaults {fallback_attempts, timeout_ms}`.
 *
 * Both are deployment configuration and both are bounds rather than targets:
 * `attempts` caps how many conforming routes one call may burn, so an outage
 * across a long chain costs a bounded wait instead of a walk; `timeoutMs`
 * bounds one attempt, because the commonest shape of a provider outage is a
 * request that never answers rather than one that fails.
 */
export type FallbackPolicy = {
  /** max routes tried per call. Undefined = the whole conforming chain. */
  attempts?: number;
  /** per-attempt bound. Undefined = wait as long as the provider takes. */
  timeoutMs?: number;
};

export class Router {
  private readonly security: DeploymentSecurity;
  private readonly chatRoutes: ChatRoute[];
  private readonly embeddingRoute: Route<EmbeddingAdapter>;
  private readonly fallback: FallbackPolicy;

  constructor(
    // A bare adapter is the one-route deployment, kept as the primary form
    // because that is what every deployment and every test still passes.
    chat: ChatAdapter | ReadonlyArray<ChatRouteSpec>,
    embeddingAdapter: EmbeddingAdapter,
    security: DeploymentSecurity = DEFAULT_SECURITY,
    fallback: FallbackPolicy = {},
  ) {
    this.security = security;
    this.fallback = fallback;
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

  /**
   * T-285 — the chain walk. **Availability is never traded for conformance:**
   * the chain is `routesForTask` over the set `conformingRoutes` already
   * returned, so a fallback is by construction a route that conforms to the
   * deployment tier. There is no branch here that reaches a wider set when
   * things are going badly, which is exactly when such a branch would be
   * tempting and exactly when it would be worst.
   *
   * A route is moved past only when it was UNAVAILABLE (failover.ts). A route
   * that answered — including a model that refused — ends the call, because
   * retrying a refusal on the next model is shopping for one that complies.
   */
  async chat(task: ChatTask, request: ChatRequest): Promise<ChatResult> {
    const classification = request.classification ?? this.security.defaultClassification;
    // THE ORDER IS THE GUARANTEE (ADR-0028 §9, ADR-0037 §3). The tier filters
    // first and fails closed; only then does the task rank what survived. The
    // two steps are separate functions in separate files precisely so an edit
    // cannot quietly invert them — `routesForTask` is handed a set that is
    // already conforming and has nothing with which to widen it.
    const conforming = conformingRoutes(this.security.policy, classification, this.chatRoutes);
    const chain = routesForTask(conforming, task).slice(
      0,
      this.fallback.attempts ?? conforming.length,
    );

    const attempts: RouteAttempt[] = [];
    const failures: Array<{ endpoint: string; reason: string }> = [];
    for (const route of chain) {
      const egress = egressOf(route, classification);
      try {
        const result = await withTimeout(route.endpoint, this.fallback.timeoutMs, (signal) =>
          route.adapter.chat({ ...request, ...(signal !== undefined && { signal }) }),
        );
        attempts.push({ endpoint: route.endpoint, egress, outcome: 'succeeded' });
        return { ...result, egress, attempts };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        // an answer, not an outage: stop here rather than asking the next
        // model the same question
        if (!isRouteUnavailable(error)) {
          // the attempt still happened and still egressed, so it is still
          // recorded — the record is of what was SENT, not of what came back
          attempts.push({ endpoint: route.endpoint, egress, outcome: 'unavailable', reason });
          throw Object.assign(error as Error, { attempts });
        }
        attempts.push({ endpoint: route.endpoint, egress, outcome: 'unavailable', reason });
        failures.push({ endpoint: route.endpoint, reason });
      }
    }
    // Exhausted. The step fails with a stated reason naming every endpoint and
    // why, and the run carries on per T-268 — the chain refuses to widen, it
    // does not refuse to report.
    throw Object.assign(new RouteChainExhausted(failures), { attempts });
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

  // T-463 — the deployment's posture, readable: the transparency table says
  // where every call runs, and it must say what the router actually enforces
  // rather than restate it in copy that could drift.
  get posture(): TierPolicy {
    return this.security.policy;
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
