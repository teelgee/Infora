// Test support: a deterministic Router with no provider behind it. The chat
// adapter answers with marked claims (the draft-leaf grammar); the embedding
// maps text to a basis vector by keyword, and its 'fake-embed' model id keeps
// test chunks disjoint from any real voyage-ingested rows via the pinned-
// model pre-filter (T-031).
import { Router } from '@infora/model';
import type { ChatAdapter, EmbeddingAdapter } from '@infora/model';

export const FAKE_EMBED_DIMENSIONS = 1024;
export const FAKE_EMBED_MODEL = 'fake-embed';

export function fakeVector(text: string): number[] {
  const basis = text.toLowerCase().includes('alpha') ? 0 : 1;
  const vector = new Array<number>(FAKE_EMBED_DIMENSIONS).fill(0);
  vector[basis] = 1;
  return vector;
}

export function fakeRouter(
  reply = 'The investigation recorded contamination exceedances. [S1] An unsupported figure of 40%.',
): Router {
  const chat: ChatAdapter = {
    modelId: 'fake-chat',
    chat: () =>
      Promise.resolve({
        text: reply,
        model: { id: 'fake-chat', version: 'fake-chat-1' },
        usage: { tokensPrompt: 500, tokensCompletion: 60 },
      }),
  };
  const embeddings: EmbeddingAdapter = {
    modelId: FAKE_EMBED_MODEL,
    dimensions: FAKE_EMBED_DIMENSIONS,
    embed: (texts) =>
      Promise.resolve({
        embeddings: texts.map(fakeVector),
        model: { id: FAKE_EMBED_MODEL, version: 'fake-1' },
      }),
  };
  return new Router(chat, embeddings);
}
