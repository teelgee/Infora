// The Router seam (ADR-0028 §9): one chat adapter and one embeddings adapter
// behind stable interfaces, so multi-model routing can fill in later without
// touching callers. Model identity is surfaced on every result because the
// orchestrator writes it to the Step audit fields (ADR-0028 §7).

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type ChatRequest = {
  system?: string;
  messages: ChatMessage[];
  maxTokens?: number;
};

export type ModelIdentity = { id: string; version: string };

export type ChatResult = {
  text: string;
  model: ModelIdentity;
  usage: { tokensPrompt: number; tokensCompletion: number };
};

export type EmbedInputType = 'document' | 'query';

export type EmbedResult = {
  embeddings: number[][];
  model: ModelIdentity;
};

export interface ChatAdapter {
  readonly modelId: string;
  chat(request: ChatRequest): Promise<ChatResult>;
}

export interface EmbeddingAdapter {
  readonly modelId: string;
  readonly dimensions: number;
  embed(texts: string[], inputType: EmbedInputType): Promise<EmbedResult>;
}

// The skeleton's one thinking leaf (ADR-0027 §6); the task vocabulary grows
// with the capability registry, the signature does not.
export type ChatTask = 'draft';
