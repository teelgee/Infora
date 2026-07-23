import { describe, expect, it, vi } from 'vitest';
import { AnthropicChatAdapter, type AnthropicLike } from './anthropic-chat.js';
import { VoyageEmbeddingAdapter } from './voyage-embeddings.js';
import { Router, securityForTier } from './router.js';
import type { ChatAdapter, EmbeddingAdapter } from './types.js';
import {
  SELF_HOSTED_UK,
  SecurityPolicyError,
  TIER_POLICIES,
  routeConforms,
  selectRoute,
  type RouteAttributes,
} from './tiers.js';

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

// a conforming chat adapter for the router tests — declares self-hosted UK
// attributes, so it passes under any tier
const conformingChat = (): ChatAdapter =>
  new AnthropicChatAdapter(anthropicStub(), 'claude-opus-4-8', { attributes: SELF_HOSTED_UK });

const conformingEmbeddings = (): EmbeddingAdapter => ({
  modelId: 'voyage-3.5',
  dimensions: 1024,
  attributes: SELF_HOSTED_UK,
  endpoint: 'https://uk.example/embeddings',
  embed: vi.fn().mockResolvedValue({ embeddings: [[1]], model: { id: 'voyage-3.5', version: 'voyage-3.5' } }),
});

describe('Router', () => {
  it('routes chat and embed to the adapters and surfaces the pinned embedding model', async () => {
    const embeddingAdapter = conformingEmbeddings();
    const router = new Router(conformingChat(), embeddingAdapter);

    const chat = await router.chat('draft', { messages: [{ role: 'user', content: 'x' }] });
    expect(chat.model.id).toBe('claude-opus-4-8');

    await router.embed(['x'], 'query');
    expect(embeddingAdapter.embed).toHaveBeenCalledWith(['x'], 'query');

    expect(router.embeddingModel).toEqual({ id: 'voyage-3.5', dimensions: 1024 });
  });

  // ADR-0037 §6 — every model call records its egress facts
  it('stamps egress facts (endpoint, region, retention, classification) on results', async () => {
    const router = new Router(conformingChat(), conformingEmbeddings());

    const chat = await router.chat('draft', { messages: [{ role: 'user', content: 'x' }] });
    expect(chat.egress).toEqual({
      endpoint: 'https://api.anthropic.com',
      region: 'uk',
      retention: 'zero',
      classification: 'official',
    });

    const embed = await router.embed(['x'], 'query');
    expect(embed.egress).toEqual({
      endpoint: 'https://uk.example/embeddings',
      region: 'uk',
      retention: 'zero',
      classification: 'official',
    });
  });

  // ADR-0037 §3 — an unattributed endpoint is refused, not trusted
  it('fails closed when the route declares no attributes', async () => {
    const unattributed = new AnthropicChatAdapter(anthropicStub()); // no attributes
    const router = new Router(unattributed, conformingEmbeddings());
    await expect(router.chat('draft', { messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow(
      SecurityPolicyError,
    );
  });

  // ADR-0037 §4 — a classification the tier may not carry has no egress path
  it('fails closed when the request classification exceeds the tier', async () => {
    const router = new Router(conformingChat(), conformingEmbeddings()); // standard tier
    await expect(
      router.chat('draft', { messages: [{ role: 'user', content: 'x' }], classification: 'secret' }),
    ).rejects.toThrow(/may not carry 'secret'/);
  });

  // the default classification rides from the deployment when the request omits it
  it('records the deployment default classification when the request omits one', async () => {
    const router = new Router(conformingChat(), conformingEmbeddings(), securityForTier('sovereign', 'secret'));
    const chat = await router.chat('draft', { messages: [{ role: 'user', content: 'x' }] });
    expect(chat.egress?.classification).toBe('secret');
  });
});

describe('tier policy selection (ADR-0037 §3)', () => {
  const ukZdrApi: RouteAttributes = {
    region: 'uk',
    retention: 'zero',
    jurisdiction: 'foreign-reachable',
    eligibility: 'enterprise-zdr',
  };
  const usApi: RouteAttributes = {
    region: 'us',
    retention: 'zero',
    jurisdiction: 'foreign-reachable',
    eligibility: 'enterprise-zdr',
  };

  it('conformance: UK-region ZDR passes standard; a US region does not', () => {
    expect(routeConforms(TIER_POLICIES.standard, ukZdrApi)).toBe(true);
    expect(routeConforms(TIER_POLICIES.standard, usApi)).toBe(false);
  });

  it('sovereign admits only the self-hosted UK-sovereign route, not a foreign-reachable ZDR API', () => {
    expect(routeConforms(TIER_POLICIES.sovereign, SELF_HOSTED_UK)).toBe(true);
    expect(routeConforms(TIER_POLICIES.sovereign, ukZdrApi)).toBe(false);
  });

  it('the tier filters the candidate set, then picks within it', () => {
    const routes = [
      { adapter: 'us', attributes: usApi, endpoint: 'us' },
      { adapter: 'uk', attributes: ukZdrApi, endpoint: 'uk' },
    ];
    // standard filters out the US route and keeps the UK one
    expect(selectRoute(TIER_POLICIES.standard, 'official', routes).adapter).toBe('uk');
  });

  it('fails closed — no conforming route errors, never falls back to a non-conforming one', () => {
    const routes = [{ adapter: 'us', attributes: usApi, endpoint: 'us' }];
    expect(() => selectRoute(TIER_POLICIES.standard, 'official', routes)).toThrow(SecurityPolicyError);
    // and it does NOT return the non-conforming route to preserve availability
    expect(() => selectRoute(TIER_POLICIES.standard, 'official', routes)).toThrow(/fail closed/);
  });
});
