// The Router seam (ADR-0028 §9): one chat adapter and one embeddings adapter
// behind stable interfaces, so multi-model routing can fill in later without
// touching callers. Model identity is surfaced on every result because the
// orchestrator writes it to the Step audit fields (ADR-0028 §7). ADR-0037
// adds the security seam: each adapter declares its egress attributes so the
// router can enforce the deployment tier and record the egress facts.

import type { Classification, EgressFacts, RouteAttributes } from './tiers.js';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type ChatRequest = {
  system?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  // Data classification travels with the request (ADR-0037 §4). Optional: the
  // elevation seam. When absent the router uses the deployment default — v1
  // resolves it there, never inferring it at dispatch.
  classification?: Classification;
};

export type ModelIdentity = { id: string; version: string };

export type ChatResult = {
  text: string;
  model: ModelIdentity;
  usage: { tokensPrompt: number; tokensCompletion: number };
  // The egress facts the call used, set by the router for the Step audit
  // (ADR-0037 §6). The adapter does not populate it; the router does, because
  // classification is request-level.
  egress?: EgressFacts;
};

export type EmbedInputType = 'document' | 'query';

export type EmbedResult = {
  embeddings: number[][];
  model: ModelIdentity;
  egress?: EgressFacts; // as ChatResult (ADR-0037 §6)
};

// Adapters optionally declare their egress attributes and endpoint (ADR-0037
// §3). Undeclared attributes mean the router treats the route as unattributed
// and refuses it under any real tier — the honest, fail-closed default.
export interface ChatAdapter {
  readonly modelId: string;
  readonly attributes?: RouteAttributes;
  readonly endpoint?: string;
  chat(request: ChatRequest): Promise<ChatResult>;
}

export interface EmbeddingAdapter {
  readonly modelId: string;
  readonly dimensions: number;
  readonly attributes?: RouteAttributes;
  readonly endpoint?: string;
  embed(texts: string[], inputType: EmbedInputType): Promise<EmbedResult>;
}

// T-284 — the task vocabulary lives in tasks.ts, beside the selection rule that
// reads it, and is re-exported from the package index. It is not re-exported
// here: tasks.ts imports `ChatAdapter` from this file, and a re-export would
// make the pair mutually importing for the sake of one alias.
