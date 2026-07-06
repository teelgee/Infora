import type { EmbedInputType, EmbedResult, EmbeddingAdapter } from './types.js';

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
};

export class VoyageEmbeddingAdapter implements EmbeddingAdapter {
  readonly modelId: string;
  readonly dimensions: number;
  private readonly apiKey: string;
  private readonly fetchFn: FetchLike;

  constructor(options: {
    apiKey: string;
    modelId?: string;
    dimensions?: number;
    fetchFn?: FetchLike;
  }) {
    this.apiKey = options.apiKey;
    this.modelId = options.modelId ?? DEFAULT_EMBEDDING_MODEL;
    this.dimensions = options.dimensions ?? DEFAULT_EMBEDDING_DIMENSIONS;
    this.fetchFn = options.fetchFn ?? (fetch as unknown as FetchLike);
  }

  async embed(texts: string[], inputType: EmbedInputType): Promise<EmbedResult> {
    const response = await this.fetchFn(VOYAGE_EMBEDDINGS_URL, {
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
    return {
      embeddings: payload.data.map((item) => item.embedding),
      model: { id: this.modelId, version: payload.model },
    };
  }
}
