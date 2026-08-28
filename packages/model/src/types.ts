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
  // T-285 — set by the ROUTER, never by a caller: the attempt's timeout. An
  // adapter passes it to its provider client so a timed-out call is actually
  // cancelled rather than merely stopped being waited for.
  signal?: AbortSignal;
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
  // T-285 — every route this call was attempted on, in order, the successful
  // one last. Present even when the first route answered (one entry), because
  // "no fallback fired" and "the field was not populated" must not read the
  // same to whoever writes the audit rows.
  attempts?: RouteAttempt[];
};

/**
 * One dispatch attempt, whatever became of it. Carries the egress facts
 * because the ticket's audit requirement is per ATTEMPT, not per call: a
 * fallback that fired sent data to a second endpoint, and a record that only
 * names the endpoint that eventually answered has omitted an egress event.
 */
export type RouteAttempt = {
  endpoint: string;
  egress: EgressFacts;
  outcome: 'succeeded' | 'unavailable';
  /** why the route was unavailable — absent on the attempt that answered */
  reason?: string;
};

export type EmbedInputType = 'document' | 'query';

export type EmbedResult = {
  embeddings: number[][];
  model: ModelIdentity;
  egress?: EgressFacts; // as ChatResult (ADR-0037 §6)
  // T-313 — the provider's own token count. **Optional, and absent means the
  // provider reported none**, which is not the same as zero: T-254's rule
  // applied to the retrieval half. An adapter that invented a count would make
  // the whole rate table a confident guess.
  usage?: { tokens: number };
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
