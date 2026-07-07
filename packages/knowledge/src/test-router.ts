// Test support: a deterministic Router with no provider behind it. The
// embedding maps a text to a basis vector by keyword, so similarity ranking
// in tests is exact; the model id 'fake-embed' keeps test chunks disjoint
// from any real voyage-ingested rows via the pinned-model pre-filter.
import { Router } from '@infora/model';
import type { ChatAdapter, EmbeddingAdapter } from '@infora/model';

export const FAKE_EMBED_DIMENSIONS = 1024;
export const FAKE_EMBED_MODEL = 'fake-embed';

const KEYWORD_BASES: Array<[string, number]> = [
  ['alpha', 0],
  ['beta', 1],
  ['gamma', 2],
];

export function fakeVector(text: string): number[] {
  const lower = text.toLowerCase();
  const basis = KEYWORD_BASES.find(([keyword]) => lower.includes(keyword))?.[1] ?? 3;
  const vector = new Array<number>(FAKE_EMBED_DIMENSIONS).fill(0);
  vector[basis] = 1;
  return vector;
}

export function fakeRouter(): Router {
  const chat: ChatAdapter = {
    modelId: 'fake-chat',
    chat: () => Promise.reject(new Error('assembly never chats')),
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
