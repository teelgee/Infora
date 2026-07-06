import Anthropic from '@anthropic-ai/sdk';
import type { ChatAdapter, ChatRequest, ChatResult } from './types.js';

export const DEFAULT_CHAT_MODEL = 'claude-opus-4-8';
const DEFAULT_MAX_TOKENS = 16000;

// The structural slice of the Anthropic client the adapter uses — lets tests
// substitute a stub without mocking the whole SDK.
export interface AnthropicLike {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      system?: string;
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    }): Promise<{
      model: string;
      stop_reason: string | null;
      content: Array<{ type: string; text?: string }>;
      usage: { input_tokens: number; output_tokens: number };
    }>;
  };
}

export class AnthropicChatAdapter implements ChatAdapter {
  constructor(
    private readonly client: AnthropicLike,
    readonly modelId: string = DEFAULT_CHAT_MODEL,
  ) {}

  static fromEnv(modelId?: string): AnthropicChatAdapter {
    return new AnthropicChatAdapter(new Anthropic(), modelId);
  }

  async chat(request: ChatRequest): Promise<ChatResult> {
    const response = await this.client.messages.create({
      model: this.modelId,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(request.system !== undefined && { system: request.system }),
      messages: request.messages,
    });

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
