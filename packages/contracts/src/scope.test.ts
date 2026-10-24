// T-469 — the scope's one convention, and the reach sentence every surface
// renders. Pure functions, so these are the numbers-to-words contract.
import { describe, expect, it } from 'vitest';
import { createRunBody, documentCreationBody, qaCheckBody } from './endpoints';
import { nothingToReadRefusal, reachStatement, scopeSchema } from './scope';
import type { ReachCounts } from './scope';

const ID = '00000000-0000-4000-8000-000000000001';
const reach = (over: Partial<ReachCounts> = {}): ReachCounts => ({
  visibleLive: 14,
  inScope: 14,
  excludedByState: { superseded: 0, withdrawn: 0 },
  leftOutByScope: 0,
  ...over,
});

describe('a scope names something, or it is not there (T-469)', () => {
  it('accepts a scope naming terms, containers or a saved scope', () => {
    expect(scopeSchema.safeParse({ termIds: [ID] }).success).toBe(true);
    expect(scopeSchema.safeParse({ containerIds: [ID] }).success).toBe(true);
    expect(scopeSchema.safeParse({ savedScopeId: ID }).success).toBe(true);
    expect(scopeSchema.safeParse({ termIds: [ID], containerIds: [ID] }).success).toBe(true);
  });

  it('refuses an empty scope in words — absent is the whole library, never an empty list', () => {
    for (const empty of [{}, { termIds: [] }, { containerIds: [] }, { termIds: [], containerIds: [] }]) {
      const parsed = scopeSchema.safeParse(empty);
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues[0]?.message).toContain('a scope must name at least one');
    }
  });

  it('refuses ids that are not ids, and keys it does not know', () => {
    expect(scopeSchema.safeParse({ containerIds: ['nope'] }).success).toBe(false);
    expect(scopeSchema.safeParse({ containerIds: [ID], everything: true }).success).toBe(false);
  });

  it('is ONE shape on every body that narrows, and absent on all of them is fine', () => {
    const outline = [{ heading: 'a', purpose: 'b' }];
    const creator = {
      sections: outline, brief: 'b', purpose: 'technical-note', language: 'technical',
      documentType: 'whole-document', styleGuideIds: [], destinationSandboxId: ID, title: 't',
    };
    const checker = { sandboxDocumentId: ID, families: ['style'], depth: 'quick' };
    for (const [schema, base] of [
      [createRunBody, { request: 'q' }],
      [documentCreationBody, creator],
      [qaCheckBody, checker],
    ] as const) {
      expect(schema.safeParse(base).success).toBe(true);
      expect(schema.safeParse({ ...base, scope: { containerIds: [ID] } }).success).toBe(true);
      expect(schema.safeParse({ ...base, scope: {} }).success).toBe(false);
      expect(schema.safeParse({ ...base, scope: { containerIds: [] } }).success).toBe(false);
    }
  });
});

describe('the reach statement (T-469)', () => {
  it('is the board’s example sentence, from the numbers', () => {
    expect(
      reachStatement({
        ...reach({ inScope: 14, visibleLive: 45, leftOutByScope: 31, excludedByState: { superseded: 2, withdrawn: 1 } }),
        read: 14,
      }),
    ).toBe('Read 14 documents in your scope. Excluded: 2 superseded, 1 withdrawn. Your scope left out 31 you could have included.');
  });

  it('omits every part that is zero — never prints "0 withdrawn"', () => {
    expect(reachStatement({ ...reach(), read: 14 })).toBe('Read 14 documents.');
    expect(reachStatement({ ...reach({ excludedByState: { superseded: 3, withdrawn: 0 } }), read: 1 })).toBe(
      'Read 1 document. Excluded: 3 superseded.',
    );
    expect(reachStatement({ ...reach({ visibleLive: 20, inScope: 14, leftOutByScope: 6 }), read: 2 })).toBe(
      'Read 2 documents in your scope. Your scope left out 6 you could have included.',
    );
  });

  it('says so when nothing was read, in words', () => {
    expect(reachStatement({ ...reach(), read: 0 })).toBe('Read no documents.');
  });

  it('before a run, says what CAN be read, in the same words', () => {
    expect(reachStatement(reach({ inScope: 1, visibleLive: 1 }))).toBe('1 document can be read.');
    expect(reachStatement(reach({ inScope: 3, visibleLive: 5, leftOutByScope: 2 }))).toBe(
      '3 documents in your scope can be read. Your scope left out 2 you could have included.',
    );
    expect(reachStatement(reach({ inScope: 0, visibleLive: 0 }))).toBe('No documents can be read.');
  });

  it('names only states that exist today — nothing about re-checks or scans yet', () => {
    const sentence = reachStatement({ ...reach({ excludedByState: { superseded: 1, withdrawn: 1 } }), read: 3 });
    expect(sentence).not.toMatch(/re-check|not citable|scan/);
  });
});

describe('the refusal, said before any spend (T-469)', () => {
  it('differs between a scope that left everything out and a library with nothing in it', () => {
    expect(nothingToReadRefusal(reach({ visibleLive: 9, inScope: 0, leftOutByScope: 9 }), true)).toBe(
      'Your scope leaves nothing to read: it leaves out all 9 readable documents. Widen the scope, or leave it out to read the whole library.',
    );
    expect(nothingToReadRefusal(reach({ visibleLive: 0, inScope: 0 }), true)).toContain(
      'there are no documents in the library you can read yet',
    );
    expect(nothingToReadRefusal(reach({ visibleLive: 0, inScope: 0 }), false)).toContain('There is nothing to read');
  });
});
