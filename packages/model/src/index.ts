// @infora/model — model-agnostic router + provider adapters
export * from './types.js';
export { Router } from './router.js';
export { AnthropicChatAdapter, DEFAULT_CHAT_MODEL } from './anthropic-chat.js';
export {
  VoyageEmbeddingAdapter,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_EMBEDDING_DIMENSIONS,
} from './voyage-embeddings.js';
