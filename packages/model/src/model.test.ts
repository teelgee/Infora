import { describe, expect, it, vi } from 'vitest';
import { AnthropicChatAdapter, type AnthropicLike } from './anthropic-chat.js';
import { VoyageEmbeddingAdapter } from './voyage-embeddings.js';
import { Router, securityForTier } from './router.js';
import { TASK_TIERS, routesForTask } from './tasks.js';
import { RouteChainExhausted, attemptsOf, isRouteUnavailable } from './failover.js';
import type { WorkerModelTier } from '@infora/contracts';
import type { ChatAdapter, EmbeddingAdapter } from './types.js';
import {
  SELF_HOSTED_UK,
  SecurityPolicyError,
  TIER_POLICIES,
  UNATTRIBUTED,
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
    // T-313 — this response carried no usage, so none is reported. ABSENT, not
    // zero: a zero would price the retrieval half of every run as free, which
    // is finding F7 repeated one layer down.
    expect(result.usage).toBeUndefined();
  });

  // T-313 — the adapter reporting usage is the thing nothing else can be built
  // on: no rate table can price a call whose token count never left the wire.
  it('reports the provider’s own token count when it is given one', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({
        model: 'voyage-3.5',
        data: [{ embedding: [0.1] }],
        usage: { total_tokens: 412 },
      }),
    });
    const result = await new VoyageEmbeddingAdapter({ apiKey: 'vk', fetchFn }).embed(['a'], 'query');
    expect(result.usage).toEqual({ tokens: 412 });
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

// T-284 — the second axis. Every test here is about the ORDER as much as the
// choice: a task may rank the conforming set and may never reach outside it.
describe('task-class routing (T-284, ADR-0028 §9 refinement)', () => {
  const routeAt = (modelId: string, serves?: WorkerModelTier[], attributes = SELF_HOSTED_UK) => ({
    adapter: new AnthropicChatAdapter(anthropicStub(), modelId, { attributes }),
    ...(serves !== undefined && { serves }),
  });

  it('dispatches a task to the route configured for its tier', async () => {
    const router = new Router(
      [routeAt('small-triage', ['triage']), routeAt('big-frontier', ['frontier'])],
      conformingEmbeddings(),
    );

    const drafted = await router.chat('draft', { messages: [{ role: 'user', content: 'x' }] });
    expect(drafted.model.id).toBe('big-frontier'); // drafting is frontier work

    const triaged = await router.chat('triage', { messages: [{ role: 'user', content: 'x' }] });
    expect(triaged.model.id).toBe('small-triage'); // relevance filtering is not
  });

  // THE ORDERING, asserted rather than assumed: the route that would win on
  // task is not tier-conforming, so it is never reached. Inverting the two
  // steps would let a performance preference pick a non-conforming provider.
  it('applies tier conformance BEFORE task selection', async () => {
    const usPublic: RouteAttributes = {
      region: 'us',
      retention: 'transient',
      jurisdiction: 'foreign-reachable',
      eligibility: 'enterprise-zdr',
    };
    const router = new Router(
      [routeAt('non-conforming-frontier', ['frontier'], usPublic), routeAt('uk-general')],
      conformingEmbeddings(),
    );

    const drafted = await router.chat('draft', { messages: [{ role: 'user', content: 'x' }] });
    expect(drafted.model.id).toBe('uk-general');
    expect(drafted.egress?.region).toBe('uk');
  });

  // availability is traded for conformance and for nothing else: a task with no
  // route declared for its tier still runs, on a conforming route
  it('falls through to a conforming route when none declares the task tier', async () => {
    const router = new Router([routeAt('only-triage', ['triage'])], conformingEmbeddings());
    const drafted = await router.chat('draft', { messages: [{ role: 'user', content: 'x' }] });
    expect(drafted.model.id).toBe('only-triage');
  });

  // the one-endpoint deployment: no `serves` anywhere, so every task lands on it
  it('serves every task from an undeclared route, which is why nothing changed', async () => {
    const router = new Router(conformingChat(), conformingEmbeddings());
    for (const task of ['draft', 'triage', 'extract'] as const) {
      const result = await router.chat(task, { messages: [{ role: 'user', content: 'x' }] });
      expect(result.model.id).toBe('claude-opus-4-8');
    }
  });

  it('fails closed when NO route conforms, whatever the task says', async () => {
    const router = new Router([routeAt('undeclared', ['frontier'], UNATTRIBUTED)], conformingEmbeddings());
    await expect(router.chat('draft', { messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow(
      SecurityPolicyError,
    );
  });

  it('refuses a deployment that declared no chat route at all', () => {
    expect(() => new Router([], conformingEmbeddings())).toThrow(/no chat route/);
  });

  // the Wave 5 table, as code: every class it names has a tier, and the tier
  // vocabulary is contracts' WorkerModelTier rather than a second name for it
  it('tiers every task class the design reference names', () => {
    expect(Object.keys(TASK_TIERS).sort()).toEqual([
      'clarify',
      'draft',
      'extract',
      'orchestrate',
      'plan',
      'synthesise',
      'synthesise_long',
      'triage',
      'verify',
    ]);
    expect(TASK_TIERS.triage).toBe('triage');
    expect(TASK_TIERS.extract).toBe('mid');
  });

  // ranking, not filtering: the chain T-285 walks is every conforming route
  it('ranks the whole conforming set rather than filtering it', () => {
    const routes = [{ serves: ['frontier'] as const }, {}, { serves: ['triage'] as const }];
    expect(routesForTask(routes, 'triage')).toEqual([routes[2], routes[0], routes[1]]);
  });
});

// T-285 — fallback chains. The two properties that carry the ticket are that a
// fallback is only ever a route that ALSO conforms, and that a route which
// ANSWERED is never retried on the next model.
describe('fallback chains (T-285)', () => {
  const failing = (
    modelId: string,
    error: unknown,
    attributes: RouteAttributes = SELF_HOSTED_UK,
  ): ChatAdapter => ({
    modelId,
    attributes,
    endpoint: `https://${modelId}.example`,
    chat: vi.fn().mockRejectedValue(error),
  });
  const answering = (
    modelId: string,
    attributes: RouteAttributes = SELF_HOSTED_UK,
  ): ChatAdapter => ({
    modelId,
    attributes,
    endpoint: `https://${modelId}.example`,
    chat: vi.fn().mockResolvedValue({
      text: 'answer',
      model: { id: modelId, version: `${modelId}-1` },
      usage: { tokensPrompt: 1, tokensCompletion: 1 },
    }),
  });
  const rateLimited = Object.assign(new Error('rate limited'), { status: 429 });

  it('falls through a rate-limited route to the next conforming one', async () => {
    const second = answering('second');
    const router = new Router(
      [{ adapter: failing('first', rateLimited) }, { adapter: second }],
      conformingEmbeddings(),
    );

    const result = await router.chat('draft', { messages: [{ role: 'user', content: 'x' }] });
    expect(result.model.id).toBe('second');
    expect(second.chat).toHaveBeenCalled();
  });

  // AVAILABILITY IS NEVER TRADED FOR CONFORMANCE. The only other route is not
  // tier-conforming, so the chain has one link and exhausts rather than
  // reaching for the route that would have worked.
  it('never falls back to a non-conforming route', async () => {
    const usPublic: RouteAttributes = {
      region: 'us',
      retention: 'transient',
      jurisdiction: 'foreign-reachable',
      eligibility: 'enterprise-zdr',
    };
    const nonConforming = answering('us-route', usPublic);
    const router = new Router(
      [{ adapter: failing('uk-route', rateLimited) }, { adapter: nonConforming }],
      conformingEmbeddings(),
    );

    await expect(
      router.chat('draft', { messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow(RouteChainExhausted);
    expect(nonConforming.chat).not.toHaveBeenCalled();
  });

  // A REFUSAL IS AN ANSWER. Retrying it on the next model is shopping for one
  // that complies, and it would succeed silently.
  it('does not retry a route that answered — a refusal ends the call', async () => {
    const second = answering('second');
    const router = new Router(
      [{ adapter: failing('first', new Error('model refused the request')) }, { adapter: second }],
      conformingEmbeddings(),
    );

    await expect(
      router.chat('draft', { messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow(/refused/);
    expect(second.chat).not.toHaveBeenCalled();
  });

  it('states every endpoint and its reason when the chain exhausts', async () => {
    const router = new Router(
      [
        { adapter: failing('first', rateLimited) },
        { adapter: failing('second', Object.assign(new Error('gateway'), { status: 502 })) },
      ],
      conformingEmbeddings(),
    );

    await expect(
      router.chat('draft', { messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow(/first\.example \(rate limited\).*second\.example \(gateway\)/s);
  });

  // the audit half: a fallback that fired is visible, with the egress facts of
  // the route it was tried on — not only of the route that answered
  it('reports every attempt with its own egress facts', async () => {
    const router = new Router(
      [{ adapter: failing('first', rateLimited) }, { adapter: answering('second') }],
      conformingEmbeddings(),
    );

    const result = await router.chat('draft', { messages: [{ role: 'user', content: 'x' }] });
    expect(result.attempts).toEqual([
      {
        endpoint: 'https://first.example',
        egress: { endpoint: 'https://first.example', region: 'uk', retention: 'zero', classification: 'official' },
        outcome: 'unavailable',
        reason: 'rate limited',
      },
      {
        endpoint: 'https://second.example',
        egress: { endpoint: 'https://second.example', region: 'uk', retention: 'zero', classification: 'official' },
        outcome: 'succeeded',
      },
    ]);
  });

  it('carries the attempts on the thrown error too', async () => {
    const router = new Router([{ adapter: failing('first', rateLimited) }], conformingEmbeddings());
    const error = await router
      .chat('draft', { messages: [{ role: 'user', content: 'x' }] })
      .catch((thrown: unknown) => thrown);
    expect(attemptsOf(error)).toHaveLength(1);
    expect(attemptsOf(error)[0]?.outcome).toBe('unavailable');
  });

  // one entry even when nothing fell back, so "no fallback fired" and "the
  // field was not populated" cannot read the same
  it('reports the single attempt when the first route answers', async () => {
    const router = new Router(conformingChat(), conformingEmbeddings());
    const result = await router.chat('draft', { messages: [{ role: 'user', content: 'x' }] });
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts?.[0]?.outcome).toBe('succeeded');
  });

  it('stops at the configured attempt budget', async () => {
    const third = answering('third');
    const router = new Router(
      [
        { adapter: failing('first', rateLimited) },
        { adapter: failing('second', rateLimited) },
        { adapter: third },
      ],
      conformingEmbeddings(),
      securityForTier('standard'),
      { attempts: 2 },
    );

    await expect(
      router.chat('draft', { messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow(RouteChainExhausted);
    expect(third.chat).not.toHaveBeenCalled();
  });

  it('treats a route that does not answer within the timeout as unavailable', async () => {
    const hanging: ChatAdapter = {
      modelId: 'hanging',
      attributes: SELF_HOSTED_UK,
      endpoint: 'https://hanging.example',
      chat: () => new Promise(() => {}),
    };
    const router = new Router(
      [{ adapter: hanging }, { adapter: answering('second') }],
      conformingEmbeddings(),
      securityForTier('standard'),
      { timeoutMs: 5 },
    );

    const result = await router.chat('draft', { messages: [{ role: 'user', content: 'x' }] });
    expect(result.model.id).toBe('second');
    expect(result.attempts?.[0]?.reason).toMatch(/did not answer within 5ms/);
  });

  // the classification allow-list: an unrecognised failure is an ANSWER, and
  // the direction of that default is the one that cannot launder a refusal
  it('classifies outages, not answers', () => {
    expect(isRouteUnavailable(Object.assign(new Error('x'), { status: 503 }))).toBe(true);
    expect(isRouteUnavailable(Object.assign(new Error('x'), { code: 'ECONNRESET' }))).toBe(true);
    expect(isRouteUnavailable(Object.assign(new Error('x'), { status: 400 }))).toBe(false);
    expect(isRouteUnavailable(new Error('model returned no text'))).toBe(false);
  });
});
