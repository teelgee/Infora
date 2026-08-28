// @infora/model — model-agnostic router + provider adapters
export * from './types.js';
export * from './tiers.js';
// T-254 — provider rates per model id, and the null that means 'unpriced'
export { costOf, parseModelRates } from './rates.js';
export type { ModelRate, ModelRates, TokenUsage } from './rates.js';
export {
  Router,
  securityForTier,
  type DeploymentSecurity,
  type ChatRouteSpec,
  type FallbackPolicy,
} from './router.js';
// T-285 — fallback chains: what counts as an outage, and the exhaustion error
export {
  RouteChainExhausted,
  RouteTimeout,
  attemptsOf,
  isRouteUnavailable,
  withTimeout,
} from './failover.js';
// T-284 — task-class routing: the second axis, ranked inside the tier-conforming set
export { TASK_TIERS, routesForTask, selectForTask, type ChatTask, type ChatRoute } from './tasks.js';
export { AnthropicChatAdapter, DEFAULT_CHAT_MODEL } from './anthropic-chat.js';
export {
  VoyageEmbeddingAdapter,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_EMBEDDING_DIMENSIONS,
} from './voyage-embeddings.js';
