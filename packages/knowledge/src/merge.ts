// T-032 — the v1 merge (ADR-0029 §5): channels concatenate grounded →
// guiding → informing within a fixed token budget, so when the budget binds,
// content drops from the lowest-priority channel first and grounded material
// is never displaced by steer. Deliberately naive and predictable — Session 6
// replaces this behind the same signature. The guiding-over-informing
// precedence on *conflict* is semantic, stated to the generating agent at
// the draft leaf (T-043), not a property of this ordering.
import type { AssembledInput, AssembledItem } from '@infora/contracts';

// Crude, stable token estimate (≈4 chars/token); a real tokenizer is a
// Session-6 concern and must simply replace this function.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function mergeChannels(
  channels: {
    grounded: AssembledItem[];
    guiding: AssembledItem[];
    informing: AssembledItem[];
  },
  tokenLimit: number,
): AssembledInput {
  const items: AssembledItem[] = [];
  let tokensUsed = 0;

  for (const channel of [channels.grounded, channels.guiding, channels.informing]) {
    for (const item of channel) {
      const cost = estimateTokens(item.content);
      if (tokensUsed + cost > tokenLimit) continue; // whole-item granularity
      items.push(item);
      tokensUsed += cost;
    }
  }

  return { items, budget: { tokenLimit, tokensUsed } };
}
