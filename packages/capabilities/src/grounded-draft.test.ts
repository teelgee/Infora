import { describe, expect, it } from 'vitest';
import type { AssembledInput } from '@infora/contracts';
import { Router, SELF_HOSTED_UK } from '@infora/model';
import type { ChatAdapter, ChatRequest, EmbeddingAdapter } from '@infora/model';
import { groundedDraft, parseClaims, STEER_PRECEDENCE, workingSetBlock } from './grounded-draft';

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
      // T-254 — rates keyed by MODEL ID, so the price follows whichever model
      // the router actually chose
      { rates: { 'fake-chat': { promptPerMTok: 5, completionPerMTok: 25 } } },
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

  // T-254 — finding F7, and the mistake one level up from it. A rate table
  // that returned 0 for a model it does not know would be the same lie with
  // more steps: the arithmetic succeeds and the number is plausible.
  it('records an UNPRICED call as null, never as free', async () => {
    const router = routerReplying('A grounded claim. [S1]');

    const noTable = await groundedDraft(router, { request: 'q', retrieved });
    expect(noTable.usage.cost).toBeNull();

    const wrongModel = await groundedDraft(
      router,
      { request: 'q', retrieved },
      { rates: { 'some-other-model': { promptPerMTok: 5, completionPerMTok: 25 } } },
    );
    expect(wrongModel.usage.cost).toBeNull();

    // and a declared rate of zero is a PRICE, distinct from unpriced — a
    // self-hosted model that genuinely costs nothing per token is a real thing
    // to declare, and it must not read as "we do not know"
    const free = await groundedDraft(
      router,
      { request: 'q', retrieved },
      { rates: { 'fake-chat': { promptPerMTok: 0, completionPerMTok: 0 } } },
    );
    expect(free.usage.cost).toBe(0);
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

// ── T-397 — the precedence, stated rather than left to ordering ────────────
describe('the steering precedence (T-397, ADR-0029 refined 2026-07-06)', () => {
  const retrieved = (channels: Array<'guiding' | 'informing'>) => ({
    items: channels.map((channel) => ({ channel, content: `${channel} rule` })),
    budget: { tokenLimit: 12000, tokensUsed: 10 },
  });

  it('states that the project guidance governs where the two conflict', async () => {
    let prompt = '';
    await groundedDraft(
      routerReplying('ok', (req) => {
        prompt = req.messages[0]!.content;
      }),
      { request: 'q', retrieved: retrieved(['guiding', 'informing']) as never },
    );
    expect(prompt).toContain(STEER_PRECEDENCE);
  });

  it('says NOTHING about precedence where only one channel is present', async () => {
    // a precedence announced over one source describes a conflict that cannot
    // arise, and steer that describes nothing is steer that gets ignored
    for (const only of [['guiding'], ['informing']] as const) {
      let prompt = '';
      await groundedDraft(
        routerReplying('ok', (req) => {
          prompt = req.messages[0]!.content;
        }),
        { request: 'q', retrieved: retrieved([...only]) as never },
      );
      expect(prompt).not.toContain(STEER_PRECEDENCE);
    }
  });
});

// T-468 — the numbered passage a claim cites is the chunk the run recorded
describe('groundedDraft records the passage behind each marker (T-468)', () => {
  it('a claim carries the chunk of the numbered source its marker named', async () => {
    const withChunks: AssembledInput = {
      items: [
        { channel: 'grounded', corpus: 'library', source: { versionId: 'v-gir' }, chunkId: 'k-1', content: 'PAH exceedances.' },
        { channel: 'grounded', corpus: 'library', source: { versionId: 'v-gir' }, chunkId: 'k-2', content: 'Gas monitoring.' },
        { channel: 'grounded', corpus: 'library', source: { versionId: 'v-fra' }, content: 'No chunk recorded.' },
      ],
      budget: { tokenLimit: 12000, tokensUsed: 30 },
    };
    const router = routerReplying('First. [S1] Second. [S2] Third. [S3]');
    const out = await groundedDraft(router, { request: 'Draft', retrieved: withChunks });
    expect(out.claims.map((c) => c.sourceRef)).toEqual([
      { versionId: 'v-gir', chunkId: 'k-1' },
      { versionId: 'v-gir', chunkId: 'k-2' },
      { versionId: 'v-fra' },
    ]);
  });
});

// ── T-471 — the working set in the prompt ───────────────────────────────────
describe('groundedDraft with a working set (T-471)', () => {
  const workingSet = [
    { label: 'Land quality method statement', excerpt: 'We propose trial pits at 20 m centres.' },
    { label: 'Ecology baseline note', excerpt: 'Badger setts recorded along the northern boundary.' },
  ];

  it('shows the documents in the prompt as user-supplied background, numbered A and never S', async () => {
    let prompt = '';
    const router = routerReplying('The survey found PAH exceedances. [S1]', (req) => {
      prompt = req.messages[0]!.content;
    });
    await groundedDraft(router, { request: 'What have we missed?', retrieved, workingSet });
    expect(prompt).toContain('Working set (supplied by the user as background they vouch for');
    expect(prompt).toContain('[A1] (attached by the user — not a project source) Land quality method statement: We propose trial pits');
    expect(prompt).toContain('[A2] (attached by the user — not a project source) Ecology baseline note');
    // sources stay numbered S, and the A block sits after them and before the task
    expect(prompt.indexOf('[S1]')).toBeLessThan(prompt.indexOf('Working set'));
    expect(prompt.indexOf('Working set')).toBeLessThan(prompt.indexOf('Task:'));
    expect(prompt).toContain('Never mark a sentence with an [A#] number');
  });

  it('a prompt with no working set is unchanged — no block, no mention', async () => {
    let prompt = '';
    const router = routerReplying('x [S1]', (req) => {
      prompt = req.messages[0]!.content;
    });
    await groundedDraft(router, { request: 'q', retrieved });
    expect(prompt).not.toContain('Working set');
    expect(workingSetBlock([])).toBe('');
    expect(workingSetBlock(undefined)).toBe('');
  });

  it('🔒 an [A#] the model writes can never become a citation: it is stripped and the claim has no source', async () => {
    const router = routerReplying(
      'Your method statement proposes trial pits at 20 m centres [A1]. The survey found PAH exceedances. [S1]',
      undefined,
    );
    const result = await groundedDraft(router, { request: 'q', retrieved, workingSet });
    // no claim resolves to a source other than the retrieved ones, and no marker text survives
    for (const claim of result.claims) expect(claim.text).not.toMatch(/\[A\d+\]/);
    const withSource = result.claims.filter((claim) => claim.sourceRef !== undefined);
    expect(withSource).toHaveLength(1);
    expect(withSource[0]!.sourceRef).toMatchObject({ versionId: 'v-gir' });
  });

  it('parseClaims strips [A#] anywhere, so the text on either side of one is not lost', () => {
    const claims = parseClaims('See your draft [A2] for the badgers. Flood Zone 2 is crossed. [S2]', new Map([['S2', { versionId: 'v-fra' }]]));
    expect(claims.map((claim) => claim.text).join(' ')).not.toMatch(/\[A/);
    expect(claims.at(-1)?.sourceRef).toEqual({ versionId: 'v-fra' });
  });
});
