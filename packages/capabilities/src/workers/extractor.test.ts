// T-274 — `extractor`. Every test here is about a failure being REPORTED
// rather than smoothed over: `failures` is a first-class output because a
// silently coerced commitment is worse than no record.
import { describe, expect, it, vi } from 'vitest';
import type { Assemble, AssembledInput } from '@infora/contracts';
import { Router, SELF_HOSTED_UK } from '@infora/model';
import type { ChatAdapter, EmbeddingAdapter } from '@infora/model';
import { createExtractor, UnknownExtractionSchema } from './extractor';
import { loadExtractionSchemas } from './extraction-schemas';

const schemas = loadExtractionSchemas();
const requester = { organisationId: 'org', participantId: 'p' };
const environment = { projectId: 'proj' };

const passage = (versionId: string, text: string, chunkId = `${versionId}-c0`) => ({
  channel: 'grounded' as const,
  corpus: 'library' as const,
  source: { versionId },
  chunkId,
  locator: { span: { start: 0, end: text.length }, paragraph: 0, verbatim: text },
  content: text,
});

const gateway = (...items: ReturnType<typeof passage>[]): Assemble => {
  const input: AssembledInput = { items, budget: { tokenLimit: 12000, tokensUsed: 0 } };
  return vi.fn().mockResolvedValue(input);
};

const embeddings: EmbeddingAdapter = {
  modelId: 'fake-embed',
  dimensions: 4,
  attributes: SELF_HOSTED_UK,
  embed: async (texts) => ({
    embeddings: texts.map(() => [0, 0, 0, 0]),
    model: { id: 'fake-embed', version: '1' },
  }),
};

const answering = (text: string): Router => {
  const chat: ChatAdapter = {
    modelId: 'fake-chat',
    attributes: SELF_HOSTED_UK,
    endpoint: 'https://fake.example',
    chat: async () => ({
      text,
      model: { id: 'fake-chat', version: 'fake-1' },
      usage: { tokensPrompt: 40, tokensCompletion: 20 },
    }),
  };
  return new Router(chat, embeddings);
};

const run = (assemble: Assemble, router: Router, input: Parameters<ReturnType<typeof createExtractor>>[2]) =>
  createExtractor({ assemble, router, schemas })(requester, environment, input);

describe('extractor (T-274)', () => {
  it('returns rows conforming to the named schema, each with its source and locator', async () => {
    const result = await run(
      gateway(passage('v1', 'The applicant will maintain the hedgerow for five years.')),
      answering('[{"commitment":"maintain the hedgerow for five years","source":"S1"}]'),
      { schemaName: 'commitments', scope: { query: 'commitments' } },
    );

    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.values).toEqual({ commitment: 'maintain the hedgerow for five years' });
    // non-negotiable 1 for structured output: no schema declares these, and no
    // record is admitted without them
    expect(result.records[0]!.source.versionId).toBe('v1');
    expect(result.records[0]!.source.chunkId).toBe('v1-c0');
    expect(result.records[0]!.source.locator?.verbatim).toContain('hedgerow');
    expect(result.failures).toEqual([]);
    expect(result.schema).toEqual({ name: 'commitments', version: 1 });
  });

  // THE TICKET, in one test: a row missing a required value is a failure
  // carrying the partial row, never a row with a hole in it
  it('reports a non-conforming row as a failure with the partial record, never coerced', async () => {
    const result = await run(
      gateway(passage('v1', 'Deadline 3 falls in the spring.')),
      answering('[{"deadline":"Deadline 3","obligation":"submit the ES addendum","source":"S1"}]'),
      { schemaName: 'deadlines', scope: { query: 'deadlines' } },
    );

    expect(result.records).toEqual([]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.reason).toMatch(/"due" is required/);
    // the difference between "found nothing" and "found something incomplete"
    // is the difference between a gap in the corpus and a gap in the document
    expect(result.failures[0]!.partialRecord).toMatchObject({ deadline: 'Deadline 3' });
    expect(result.failures[0]!.source?.versionId).toBe('v1');
  });

  it('refuses a date it cannot read rather than normalising it by guessing', async () => {
    const result = await run(
      gateway(passage('v1', 'Deadline 3: 03/04/2026.')),
      answering(
        '[{"deadline":"Deadline 3","due":"03/04/2026","obligation":"submit","source":"S1"}]',
      ),
      { schemaName: 'deadlines', scope: { query: 'deadlines' } },
    );
    // "03/04/2026" is two different days depending on who wrote it
    expect(result.records).toEqual([]);
    expect(result.failures[0]!.reason).toMatch(/must be a date as YYYY-MM-DD/);
  });

  it('strict refuses a numeric string; non-strict coerces it, and only that', async () => {
    const answer = '[{"parameter":"pylon height","value":"48","unit":"m","source":"S1"}]';
    const strict = await run(
      gateway(passage('v1', 'Maximum pylon height 48 m.')),
      answering(answer),
      { schemaName: 'parameters', scope: { query: 'parameters' } },
    );
    expect(strict.records).toEqual([]);
    expect(strict.failures[0]!.reason).toMatch(/must be a number/);

    const loose = await run(
      gateway(passage('v1', 'Maximum pylon height 48 m.')),
      answering(answer),
      { schemaName: 'parameters', scope: { query: 'parameters' }, strict: false },
    );
    expect(loose.records[0]!.values).toEqual({ parameter: 'pylon height', value: 48, unit: 'm' });
  });

  // a row whose marker does not resolve to a passage this run saw has no
  // source, and a record without a source is not a record
  it('refuses a row citing a passage the extraction never saw', async () => {
    const result = await run(
      gateway(passage('v1', 'The applicant will do something.')),
      answering('[{"commitment":"invented","source":"S7"}]'),
      { schemaName: 'commitments', scope: { query: 'commitments' } },
    );
    expect(result.records).toEqual([]);
    expect(result.failures[0]!.reason).toMatch(/not a passage this extraction saw/);
  });

  // an empty register and an unreadable answer look identical downstream and
  // mean opposite things
  it('reports unreadable output as a failure rather than as an empty register', async () => {
    const result = await run(
      gateway(passage('v1', 'text')),
      answering('Here are the commitments I found: ...'),
      { schemaName: 'commitments', scope: { query: 'commitments' } },
    );
    expect(result.records).toEqual([]);
    expect(result.failures[0]!.reason).toMatch(/did not return readable structured output/);
  });

  // a named document the gateway did not return is a failure, not a silence:
  // it is either out of reach or nothing in it matched, and the caller asked
  it('reports a requested document that produced no passage', async () => {
    const result = await run(
      gateway(passage('v1', 'The applicant will maintain the hedgerow.')),
      answering('[{"commitment":"maintain the hedgerow","source":"S1"}]'),
      { schemaName: 'commitments', scope: { versionIds: ['v1', 'v2'] } },
    );
    expect(result.records).toHaveLength(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.source?.versionId).toBe('v2');
    expect(result.failures[0]!.reason).toMatch(/no passage of this document was reachable/);
  });

  it('narrows a document scope to the named versions and reads nothing else', async () => {
    const result = await run(
      gateway(passage('v1', 'wanted'), passage('v2', 'not wanted')),
      answering('[{"commitment":"wanted","source":"S1"}]'),
      { schemaName: 'commitments', scope: { versionIds: ['v1'] } },
    );
    expect(result.records.map((record) => record.source.versionId)).toEqual(['v1']);
  });

  // the note states the SHAPE of the search, because absence is what a register
  // is for — "6 commitments found" answers a question nobody needs to ask
  it('states what was searched and what did not conform', async () => {
    const result = await run(
      gateway(passage('v1', 'a'), passage('v2', 'b')),
      answering('[]'),
      { schemaName: 'commitments', scope: { query: 'commitments' } },
    );
    expect(result.extractionNote).toMatch(/2 passages of the reachable project library were admitted/);
    expect(result.extractionNote).toMatch(/nothing was rejected/);
  });

  it('makes no model call at all when nothing was reachable', async () => {
    const router = answering('[]');
    const spy = vi.spyOn(router, 'chat');
    const result = await createExtractor({ assemble: gateway(), router, schemas })(
      requester,
      environment,
      { schemaName: 'commitments', scope: { query: 'commitments' } },
    );
    expect(spy).not.toHaveBeenCalled();
    expect(result.records).toEqual([]);
    expect(result.audit).toBeUndefined();
  });

  it('names the available schemas when asked for one that does not exist', async () => {
    await expect(
      run(gateway(passage('v1', 'x')), answering('[]'), {
        schemaName: 'risks',
        scope: { query: 'x' },
      }),
    ).rejects.toThrow(UnknownExtractionSchema);
  });

  // T-284's `extract` task class gets its first real caller here
  it('dispatches on the extract task class, not draft', async () => {
    const router = answering('[]');
    const spy = vi.spyOn(router, 'chat');
    await run(gateway(passage('v1', 'x')), router, {
      schemaName: 'commitments',
      scope: { query: 'x' },
    });
    expect(spy.mock.calls[0]?.[0]).toBe('extract');
  });

  // a guiding item has no source at all (T-308) and a register row must never
  // rest on one
  it('never builds a row on a guiding item', async () => {
    const assemble: Assemble = vi.fn().mockResolvedValue({
      items: [{ channel: 'guiding', content: 'the firm always states a date' }],
      budget: { tokenLimit: 12000, tokensUsed: 0 },
    } satisfies AssembledInput);
    const router = answering('[]');
    const spy = vi.spyOn(router, 'chat');
    const result = await createExtractor({ assemble, router, schemas })(requester, environment, {
      schemaName: 'commitments',
      scope: { query: 'commitments' },
    });
    expect(spy).not.toHaveBeenCalled();
    expect(result.records).toEqual([]);
  });
});
