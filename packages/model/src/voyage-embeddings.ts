import type { EmbedInputType, EmbedResult, EmbeddingAdapter } from './types.js';
import type { RouteAttributes } from './tiers.js';

// Anthropic exposes no embeddings API; Voyage AI is the embeddings provider
// (plan.md T-010). Raw HTTP — the API is one endpoint.
export const DEFAULT_EMBEDDING_MODEL = 'voyage-3.5';
export const DEFAULT_EMBEDDING_DIMENSIONS = 1024;
const VOYAGE_EMBEDDINGS_URL = 'https://api.voyageai.com/v1/embeddings';

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; text(): Promise<string>; json(): Promise<unknown> }>;

type VoyageResponse = {
  model: string;
  data: Array<{ embedding: number[] }>;
  // T-313 — Voyage reports the tokens it counted. Optional in this type on
  // purpose: a response without it yields NO usage rather than a zero, because
  // a zero would price the retrieval half of every run as free.
  usage?: { total_tokens?: number };
};

export class VoyageEmbeddingAdapter implements EmbeddingAdapter {
  readonly modelId: string;
  readonly dimensions: number;
  readonly attributes?: RouteAttributes;
  readonly endpoint: string;
  private readonly apiKey: string;
  private readonly url: string;
  private readonly fetchFn: FetchLike;

  constructor(options: {
    apiKey: string;
    modelId?: string;
    dimensions?: number;
    fetchFn?: FetchLike;
    // the deployment's declared egress attributes (ADR-0037 §3); undeclared
    // means the router refuses this route under any real tier
    attributes?: RouteAttributes;
    // the endpoint URL; defaults to the public API (US-region, no ZDR
    // contract in itself) so an undeclared route fails closed
    endpoint?: string;
  }) {
    this.apiKey = options.apiKey;
    this.modelId = options.modelId ?? DEFAULT_EMBEDDING_MODEL;
    this.dimensions = options.dimensions ?? DEFAULT_EMBEDDING_DIMENSIONS;
    this.fetchFn = options.fetchFn ?? (fetch as unknown as FetchLike);
    this.attributes = options.attributes;
    this.endpoint = options.endpoint ?? VOYAGE_EMBEDDINGS_URL;
    this.url = this.endpoint;
  }

  async embed(texts: string[], inputType: EmbedInputType): Promise<EmbedResult> {
    const response = await this.fetchFn(this.url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.modelId,
        input: texts,
        input_type: inputType,
        output_dimension: this.dimensions,
      }),
    });

    if (!response.ok) {
      throw new Error(`Voyage embeddings request failed (${response.status}): ${await response.text()}`);
    }

    const payload = (await response.json()) as VoyageResponse;
    const tokens = payload.usage?.total_tokens;
    return {
      embeddings: payload.data.map((item) => item.embedding),
      model: { id: this.modelId, version: payload.model },
      ...(typeof tokens === 'number' && { usage: { tokens } }),
    };
  }
}
