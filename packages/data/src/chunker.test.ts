import { describe, expect, it } from 'vitest';
import { chunkText } from './chunker';

describe('chunkText (T-012)', () => {
  it('keeps short content as one chunk', () => {
    expect(chunkText('One sentence. And another.')).toEqual([
      { index: 0, content: 'One sentence. And another.' },
    ]);
  });

  it('packs sentences to the cap without splitting them', () => {
    const chunks = chunkText('Alpha alpha alpha. Beta beta beta. Gamma gamma gamma.', 40);
    expect(chunks.map((c) => c.content)).toEqual([
      'Alpha alpha alpha. Beta beta beta.',
      'Gamma gamma gamma.',
    ]);
    expect(chunks.map((c) => c.index)).toEqual([0, 1]);
  });

  it('hard-splits a single oversize sentence rather than dropping it', () => {
    const chunks = chunkText('x'.repeat(2500), 1000);
    expect(chunks).toHaveLength(3);
    expect(chunks.map((c) => c.content.length)).toEqual([1000, 1000, 500]);
  });

  it('is deterministic and ignores blank runs', () => {
    const text = 'First.   \n\n  Second.\n\nThird.';
    expect(chunkText(text, 15)).toEqual(chunkText(text, 15));
    expect(chunkText('   \n \n ')).toEqual([]);
  });
});
