// Test support: a deterministic Router with no provider behind it. The chat
// adapter answers with marked claims (the draft-leaf grammar); the embedding
// maps text to a basis vector by keyword, and its 'fake-embed' model id keeps
// test chunks disjoint from any real voyage-ingested rows via the pinned-
// model pre-filter (T-031).
import { Router, SELF_HOSTED_UK } from '@infora/model';
import type { ChatAdapter, EmbeddingAdapter } from '@infora/model';

export const FAKE_EMBED_DIMENSIONS = 1024;
export const FAKE_EMBED_MODEL = 'fake-embed';
export const FAKE_EMBED_VERSION = 'fake-1';

export function fakeVector(text: string): number[] {
  const basis = text.toLowerCase().includes('alpha') ? 0 : 1;
  const vector = new Array<number>(FAKE_EMBED_DIMENSIONS).fill(0);
  vector[basis] = 1;
  return vector;
}

/**
 * `embedModelId` pins which index this router writes and reads. It exists
 * because each pinned model is its own index over the same corpus (ADR-0024),
 * so a caller that needs its rows kept clear of every other suite's — the eval
 * harness, whose fixtures are frozen and must not be re-chunked underneath a
 * case by an ingest of the same version — asks for its own model id and gets a
 * disjoint index for free.
 */
export function fakeRouter(
  reply:
    | string
    // T-299 — a function form, so a suite can make the answer depend on the
    // SYSTEM prompt. The Lens's whole claim is that it changes how an answer
    // reads, and a router that ignores its prompt can prove neither half of
    // "two visibly different answers, one identical source set".
    // T-259 widened this to carry the USER prompt as well: the eval seed set
    // needs a substrate whose citations depend on what retrieval admitted,
    // and the numbered sources live in the user message, not the system one.
    | ((system: string, prompt: string) => string) = 'The investigation recorded contamination exceedances. [S1] An unsupported figure of 40%.',
  embedModelId: string = FAKE_EMBED_MODEL,
): Router {
  const chat: ChatAdapter = {
    modelId: 'fake-chat',
    attributes: SELF_HOSTED_UK,
    chat: (req) =>
      Promise.resolve({
        text:
          typeof reply === 'function'
            ? reply(req.system ?? '', req.messages.map((message) => message.content).join('\n'))
            : reply,
        model: { id: 'fake-chat', version: 'fake-chat-1' },
        usage: { tokensPrompt: 500, tokensCompletion: 60 },
      }),
  };
  const embeddings: EmbeddingAdapter = {
    modelId: embedModelId,
    dimensions: FAKE_EMBED_DIMENSIONS,
    attributes: SELF_HOSTED_UK,
    embed: (texts) =>
      Promise.resolve({
        embeddings: texts.map(fakeVector),
        model: { id: embedModelId, version: FAKE_EMBED_VERSION },
      }),
  };
  return new Router(chat, embeddings);
}
