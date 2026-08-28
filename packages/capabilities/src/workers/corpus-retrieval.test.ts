// T-269 — the first typed worker. Two properties: it returns an OBJECT rather
// than prose (non-negotiable 6), and it reaches the corpus only through the
// assembly gateway (ADR-0028 §4, ADR-0029 §2).
import { describe, expect, it, vi } from 'vitest';
import type { Assemble, AssemblyRequest } from '@infora/contracts';
import { createCorpusRetrieval, CORPUS_RETRIEVAL } from './corpus-retrieval';

const assembled = (): Awaited<ReturnType<Assemble>> => ({
  items: [
    {
      channel: 'grounded',
      corpus: 'library',
      source: { versionId: 'ver-1' },
      chunkId: 'chunk-1',
      locator: { span: { start: 0, end: 12 }, paragraph: 2, verbatim: 'a real span' },
      content: 'the passage the model was shown',
    },
    {
      // T-308 — a guiding item carries no source and must never reach a caller
      // that will cite what it is handed
      channel: 'guiding',
      corpus: 'library',
      rule: { rulebookRef: 'rb-1', clause: '3.1', heading: 'Voice' },
      content: 'the house style says use active voice',
    },
  ],
  budget: { tokenLimit: 12000, tokensUsed: 40 },
});

const requester = { organisationId: 'org-b', participantId: 'part-1' };
const environment = { projectId: 'proj-1' };

describe('corpus_retrieval (T-269)', () => {
  it('returns structured passages — an object, never prose', async () => {
    const worker = createCorpusRetrieval({ assemble: async () => assembled() });
    const output = await worker(requester, environment, { query: 'contamination' });
    expect(output).toEqual({
      passages: [
        {
          versionId: 'ver-1',
          chunkId: 'chunk-1',
          locator: { span: { start: 0, end: 12 }, paragraph: 2, verbatim: 'a real span' },
          text: 'the passage the model was shown',
        },
      ],
    });
  });

  it('drops the guiding channel — steering material is never returned as a source', async () => {
    const worker = createCorpusRetrieval({ assemble: async () => assembled() });
    const { passages } = await worker(requester, environment, { query: 'style' });
    expect(passages.map((passage) => passage.text)).not.toContain(
      'the house style says use active voice',
    );
  });

  it('reaches the store ONLY through the gateway, as a targeted sub-agent retrieval', async () => {
    const assemble = vi.fn<Assemble>(async () => assembled());
    const worker = createCorpusRetrieval({ assemble });
    await worker(requester, environment, { query: 'contamination' });

    const [request] = assemble.mock.calls[0]! as [AssemblyRequest];
    // `targeted`, not `baseline`: the same call with the same access
    // guarantees, which is what keeps agentic retrieval inside the wall
    expect(request.request.mode).toBe('targeted');
    expect(request.environment).toEqual({ kind: 'project', projectId: 'proj-1' });
    expect(request.requester).toEqual(requester);
    // and there is nothing else on the request — no corpus, no scope, no
    // visibility. The gateway's signature is the guarantee (wall.test.ts).
    expect(Object.keys(request).sort()).toEqual(['environment', 'request', 'requester']);
  });

  it('an unentitled requester gets no passages, exactly as they get no corpus', async () => {
    // the gateway returns an empty input for a requester it cannot resolve;
    // the worker adds no branch of its own, which is why it cannot get this
    // wrong
    const worker = createCorpusRetrieval({
      assemble: async () => ({ items: [], budget: { tokenLimit: 12000, tokensUsed: 0 } }),
    });
    expect(await worker(requester, environment, { query: 'anything' })).toEqual({ passages: [] });
  });

  it('declares itself a cacheable, non-writing, inherited-reach leaf', () => {
    expect(CORPUS_RETRIEVAL.leaf).toBe(true);
    expect(CORPUS_RETRIEVAL.writes).toBe(false);
    expect(CORPUS_RETRIEVAL.reach).toBe('inherited');
    expect(CORPUS_RETRIEVAL.cacheable).toBe(true);
    expect(CORPUS_RETRIEVAL.externalEgress).toBe(false);
  });
});
