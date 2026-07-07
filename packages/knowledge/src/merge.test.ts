import { describe, expect, it } from 'vitest';
import type { AssembledItem } from '@infora/contracts';
import { estimateTokens, mergeChannels } from './merge';

const item = (channel: AssembledItem['channel'], content: string): AssembledItem => ({
  channel,
  ...(channel === 'grounded' ? { corpus: 'library' as const } : {}),
  source: { versionId: `v-${channel}-${content.length}` },
  content,
});

describe('v1 merge (T-032, ADR-0029 §5)', () => {
  it('concatenates grounded → guiding → informing and accounts for the budget', () => {
    const merged = mergeChannels(
      {
        grounded: [item('grounded', 'g1'), item('grounded', 'g2')],
        guiding: [item('guiding', 'steer')],
        informing: [item('informing', 'precedent')],
      },
      1000,
    );
    expect(merged.items.map((i) => i.channel)).toEqual([
      'grounded',
      'grounded',
      'guiding',
      'informing',
    ]);
    expect(merged.budget.tokensUsed).toBe(
      ['g1', 'g2', 'steer', 'precedent'].reduce((sum, c) => sum + estimateTokens(c), 0),
    );
  });

  it('drops the lowest-priority channel first when the budget binds', () => {
    const long = 'x'.repeat(40); // 10 tokens each
    const merged = mergeChannels(
      {
        grounded: [item('grounded', long), item('grounded', long)],
        guiding: [item('guiding', long)],
        informing: [item('informing', long)],
      },
      30,
    );
    expect(merged.items.map((i) => i.channel)).toEqual(['grounded', 'grounded', 'guiding']);
    expect(merged.budget).toEqual({ tokenLimit: 30, tokensUsed: 30 });
  });

  it('never displaces grounded content in favour of steering material', () => {
    const merged = mergeChannels(
      {
        grounded: [item('grounded', 'x'.repeat(120))], // 30 tokens — fills the budget
        guiding: [item('guiding', 'y'.repeat(120))],
        informing: [],
      },
      30,
    );
    expect(merged.items.map((i) => i.channel)).toEqual(['grounded']);
  });

  it('keeps channel and source identity on every returned item', () => {
    const merged = mergeChannels(
      { grounded: [item('grounded', 'g')], guiding: [], informing: [] },
      1000,
    );
    expect(merged.items[0]).toMatchObject({
      channel: 'grounded',
      corpus: 'library',
      source: { versionId: expect.stringContaining('v-grounded') },
    });
  });
});
