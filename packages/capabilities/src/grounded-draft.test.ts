import { describe, expect, it } from 'vitest';
import type { AssembledInput } from '@infora/contracts';
import { Router, SELF_HOSTED_UK } from '@infora/model';
import type { ChatAdapter, ChatRequest, EmbeddingAdapter } from '@infora/model';
import { groundedDraft, parseClaims } from './grounded-draft';

const embeddings: EmbeddingAdapter = {
  modelId: 'unused',
  dimensions: 1,
  attributes: SELF_HOSTED_UK,
  embed: () => Promise.reject(new Error('drafting never embeds')),
};

function routerReplying(text: string, capture?: (req: ChatRequest) => void): Router {
  const chat: ChatAdapter = {
    modelId: 'fake-chat',
    attributes: SELF_HOSTED_UK,
    chat: (req) => {
      capture?.(req);
      return Promise.resolve({
        text,
        model: { id: 'fake-chat', version: 'fake-chat-1' },
        usage: { tokensPrompt: 1000, tokensCompletion: 200 },
      });
    },
  };
  return new Router(chat, embeddings);
}

const retrieved: AssembledInput = {
  items: [
    { channel: 'grounded', corpus: 'library', source: { versionId: 'v-gir' }, content: 'PAH exceedances at three pits.' },
    { channel: 'grounded', corpus: 'library', source: { versionId: 'v-fra' }, content: 'Flood Zone 2 crossing of 380 m.' },
    { channel: 'guiding', source: { authorityRef: 'style-guide' }, content: 'Use formal register.' },
  ],
  budget: { tokenLimit: 12000, tokensUsed: 30 },
};

describe('groundedDraft (T-043)', () => {
  it('assembles the prompt from the working input: numbered sources, steer never citable', async () => {
    let prompt = '';
    let system = '';
    const router = routerReplying('Contamination was recorded. [S1]', (req) => {
      prompt = req.messages[0]!.content;
      system = req.system ?? '';
    });

    await groundedDraft(router, { request: 'Draft the land quality summary', retrieved });

    expect(prompt).toContain('[S1] PAH exceedances at three pits.');
    expect(prompt).toContain('[S2] Flood Zone 2 crossing of 380 m.');
    expect(prompt).toContain('Steering material (never cite):\n(guiding) Use formal register.');
    expect(prompt).toContain('Task: Draft the land quality summary');
    expect(system).toContain('project guidance governs'); // ADR-0029 §5 precedence, stated
  });

  it('maps markers back to source identity and surfaces model + usage + cost', async () => {
    const router = routerReplying(
      'Elevated PAHs were recorded at three trial pits. [S1] The corridor crosses Flood Zone 2. [S2]',
    );
    const result = await groundedDraft(
      router,
      { request: 'q', retrieved },
      { costPerPromptMTok: 5, costPerCompletionMTok: 25 },
    );

    expect(result.claims).toEqual([
      { text: 'Elevated PAHs were recorded at three trial pits.', sourceRef: { versionId: 'v-gir' } },
      { text: 'The corridor crosses Flood Zone 2.', sourceRef: { versionId: 'v-fra' } },
    ]);
    expect(result.model).toEqual({ id: 'fake-chat', version: 'fake-chat-1' });
    expect(result.usage).toEqual({
      tokensPrompt: 1000,
      tokensCompletion: 200,
      cost: (1000 * 5 + 200 * 25) / 1_000_000,
    });
  });

  it('keeps sentence boundaries when a sentence closes after its marker (T-087)', () => {
    const sources = new Map([
      ['S1', { versionId: 'v-gir' } as const],
      ['S2', { versionId: 'v-fra' } as const],
    ]);
    // the stray full stop after [S1] is layout, not the next claim's head —
    // but each claim keeps a terminal of its own, so rejoined prose reads
    expect(parseClaims('First claim [S1]. Second claim [S2].', sources)).toEqual([
      { text: 'First claim.', sourceRef: { versionId: 'v-gir' } },
      { text: 'Second claim.', sourceRef: { versionId: 'v-fra' } },
    ]);
  });

  it('leaves unmarked or unknown-marker text as unsourced claims for the verifier', () => {
    const sources = new Map([['S1', { versionId: 'v-gir' } as const]]);
    expect(
      parseClaims('Grounded claim. [S1] Hallucinated figure. [S9] And a bare assertion.', sources),
    ).toEqual([
      { text: 'Grounded claim.', sourceRef: { versionId: 'v-gir' } },
      { text: 'Hallucinated figure.', sourceRef: undefined },
      { text: 'And a bare assertion.' },
    ]);
  });
});
