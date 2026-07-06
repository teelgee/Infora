import type {
  ChatAdapter,
  ChatRequest,
  ChatResult,
  ChatTask,
  EmbedInputType,
  EmbedResult,
  EmbeddingAdapter,
} from './types.js';

// v1: no real model selection (ADR-0028 §9) — one adapter per capability kind.
// The task parameter exists so selection can arrive without a signature change.
export class Router {
  constructor(
    private readonly chatAdapter: ChatAdapter,
    private readonly embeddingAdapter: EmbeddingAdapter,
  ) {}

  chat(_task: ChatTask, request: ChatRequest): Promise<ChatResult> {
    return this.chatAdapter.chat(request);
  }

  embed(texts: string[], inputType: EmbedInputType): Promise<EmbedResult> {
    return this.embeddingAdapter.embed(texts, inputType);
  }

  // The embedding model id/version is pinned per index (ADR-0024); ingestion
  // records this so a model change forces a deliberate re-index, never a mix.
  get embeddingModel(): { id: string; dimensions: number } {
    return { id: this.embeddingAdapter.modelId, dimensions: this.embeddingAdapter.dimensions };
  }
}
