import { describe, expect, it, vi } from 'vitest';
import { AnthropicChatAdapter, type AnthropicLike } from './anthropic-chat.js';
import { VoyageEmbeddingAdapter } from './voyage-embeddings.js';
import { Router } from './router.js';
import type { EmbeddingAdapter } from './types.js';

const anthropicStub = (overrides?: {
  stop_reason?: string;
  content?: Array<{ type: string; text?: string }>;
}): AnthropicLike & { lastParams: () => unknown } => {
  const create = vi.fn().mockResolvedValue({
    model: 'claude-opus-4-8-20260315',
    stop_reason: overrides?.stop_reason ?? 'end_turn',
    content: overrides?.content ?? [{ type: 'text', text: 'drafted section' }],
    usage: { input_tokens: 120, output_tokens: 45 },
  });
  return { messages: { create }, lastParams: () => create.mock.calls[0]?.[0] };
};

describe('AnthropicChatAdapter', () => {
  it('maps the response to text, model identity and usage', async () => {
    const stub = anthropicStub();
    const adapter = new AnthropicChatAdapter(stub);

    const result = await adapter.chat({
      system: 'you draft governed sections',
      messages: [{ role: 'user', content: 'draft §3.3' }],
    });

    expect(stub.lastParams()).toMatchObject({
      model: 'claude-opus-4-8',
      system: 'you draft governed sections',
      messages: [{ role: 'user', content: 'draft §3.3' }],
    });
    expect(result.text).toBe('drafted section');
    expect(result.model).toEqual({ id: 'claude-opus-4-8', version: 'claude-opus-4-8-20260315' });
    expect(result.usage).toEqual({ tokensPrompt: 120, tokensCompletion: 45 });
  });

  it('joins multiple text blocks and ignores non-text blocks', async () => {
    const adapter = new AnthropicChatAdapter(
      anthropicStub({ content: [{ type: 'thinking' }, { type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }),
    );
    const result = await adapter.chat({ messages: [{ role: 'user', content: 'x' }] });
    expect(result.text).toBe('ab');
  });

  it('throws on refusal and on empty output', async () => {
    await expect(
      new AnthropicChatAdapter(anthropicStub({ stop_reason: 'refusal', content: [] })).chat({
        messages: [{ role: 'user', content: 'x' }],
      }),
    ).rejects.toThrow(/refused/);
    await expect(
      new AnthropicChatAdapter(anthropicStub({ content: [] })).chat({
        messages: [{ role: 'user', content: 'x' }],
      }),
    ).rejects.toThrow(/no text/);
  });
});

describe('VoyageEmbeddingAdapter', () => {
  it('sends the request shape Voyage expects and maps the result', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({ model: 'voyage-3.5', data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }] }),
    });
    const adapter = new VoyageEmbeddingAdapter({ apiKey: 'vk', fetchFn });

    const result = await adapter.embed(['a', 'b'], 'document');

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toContain('voyageai.com');
    expect(init.headers.authorization).toBe('Bearer vk');
    expect(JSON.parse(init.body)).toEqual({
      model: 'voyage-3.5',
      input: ['a', 'b'],
      input_type: 'document',
      output_dimension: 1024,
    });
    expect(result.embeddings).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    expect(result.model).toEqual({ id: 'voyage-3.5', version: 'voyage-3.5' });
  });

  it('throws with status and body on a failed request', async () => {
    const adapter = new VoyageEmbeddingAdapter({
      apiKey: 'vk',
      fetchFn: vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'bad key',
        json: async () => ({}),
      }),
    });
    await expect(adapter.embed(['a'], 'query')).rejects.toThrow(/401.*bad key/s);
  });
});

describe('Router', () => {
  it('routes chat and embed to the adapters and surfaces the pinned embedding model', async () => {
    const chatAdapter = new AnthropicChatAdapter(anthropicStub());
    const embeddingAdapter: EmbeddingAdapter = {
      modelId: 'voyage-3.5',
      dimensions: 1024,
      embed: vi.fn().mockResolvedValue({ embeddings: [[1]], model: { id: 'voyage-3.5', version: 'voyage-3.5' } }),
    };
    const router = new Router(chatAdapter, embeddingAdapter);

    const chat = await router.chat('draft', { messages: [{ role: 'user', content: 'x' }] });
    expect(chat.model.id).toBe('claude-opus-4-8');

    await router.embed(['x'], 'query');
    expect(embeddingAdapter.embed).toHaveBeenCalledWith(['x'], 'query');

    expect(router.embeddingModel).toEqual({ id: 'voyage-3.5', dimensions: 1024 });
  });
});
