import Anthropic from '@anthropic-ai/sdk';
import type { ChatAdapter, ChatRequest, ChatResult } from './types.js';
import type { RouteAttributes } from './tiers.js';

export const DEFAULT_CHAT_MODEL = 'claude-opus-4-8';
const DEFAULT_MAX_TOKENS = 16000;
// The public API is US-region and not, in itself, a UK-region ZDR contract —
// so this default endpoint's honest attributes conform to no tier and the
// router refuses it (ADR-0037 §3). A real deployment supplies a conforming
// endpoint and its declared attributes; the vendor is procurement's call
// (ADR-0037 open item 3), the enforcement is not.
const DEFAULT_ENDPOINT = 'https://api.anthropic.com';

// The structural slice of the Anthropic client the adapter uses — lets tests
// substitute a stub without mocking the whole SDK.
export interface AnthropicLike {
  messages: {
    create(
      params: {
        model: string;
        max_tokens: number;
        system?: string;
        messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      },
      // T-285 — request options, where the router's per-attempt timeout signal
      // travels. Optional so a stub may ignore it.
      options?: { signal?: AbortSignal },
    ): Promise<{
      model: string;
      stop_reason: string | null;
      content: Array<{ type: string; text?: string }>;
      usage: { input_tokens: number; output_tokens: number };
    }>;
  };
}

export class AnthropicChatAdapter implements ChatAdapter {
  readonly attributes?: RouteAttributes;
  readonly endpoint: string;

  constructor(
    private readonly client: AnthropicLike,
    readonly modelId: string = DEFAULT_CHAT_MODEL,
    options: { attributes?: RouteAttributes; endpoint?: string } = {},
  ) {
    this.attributes = options.attributes;
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  }

  // fromEnv attaches the deployment's declared egress attributes (ADR-0037
  // §3); an endpoint with no attributes is treated as non-conforming, closing
  // the fromEnv()-picks-up-any-URL gap. The vendor/URL is deployment config.
  static fromEnv(options: {
    modelId?: string;
    attributes?: RouteAttributes;
    endpoint?: string;
    // T-285 — a fallback chain is several routes, and a second route is a
    // second procurement: its own base URL and its own credential. Both
    // default to the SDK's own env pickup, which is what a one-route
    // deployment has.
    apiKey?: string;
    baseUrl?: string;
  } = {}): AnthropicChatAdapter {
    const client = new Anthropic({
      ...(options.apiKey !== undefined && { apiKey: options.apiKey }),
      ...(options.baseUrl !== undefined && { baseURL: options.baseUrl }),
    });
    return new AnthropicChatAdapter(client, options.modelId, {
      ...(options.attributes !== undefined && { attributes: options.attributes }),
      ...(options.endpoint !== undefined && { endpoint: options.endpoint }),
    });
  }

  async chat(request: ChatRequest): Promise<ChatResult> {
    const response = await this.client.messages.create(
      {
        model: this.modelId,
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(request.system !== undefined && { system: request.system }),
        messages: request.messages,
      },
      { ...(request.signal !== undefined && { signal: request.signal }) },
    );

    if (response.stop_reason === 'refusal') {
      throw new Error(`model refused the request (model ${response.model})`);
    }

    const text = response.content
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('');
    if (text === '') {
      throw new Error(
        `model returned no text (stop_reason ${response.stop_reason}, model ${response.model})`,
      );
    }

    return {
      text,
      // id is the alias we requested; version is the resolved model string the
      // API answered with — both land in the Step audit fields (ADR-0028 §7).
      model: { id: this.modelId, version: response.model },
      usage: {
        tokensPrompt: response.usage.input_tokens,
        tokensCompletion: response.usage.output_tokens,
      },
    };
  }
}
