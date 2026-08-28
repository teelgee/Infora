// T-269 — the first typed worker. Two properties: it returns an OBJECT rather
// than prose (non-negotiable 6), and it reaches the corpus only through the
// assembly gateway (ADR-0028 §4, ADR-0029 §2).
import { describe, expect, it, vi } from 'vitest';
import type { Assemble, AssemblyRequest } from '@infora/contracts';
import { createCorpusRetrieval, CORPUS_RETRIEVAL } from './corpus-retrieval';
import type { CorpusRetrievalInput } from './corpus-retrieval';

const assembled = (): Awaited<ReturnType<Assemble>> => ({
  items: [
    {
      channel: 'grounded',
      corpus: 'library',
      source: { versionId: 'ver-1' },
      chunkId: 'chunk-1',
      locator: { span: { start: 0, end: 12 }, paragraph: 2, verbatim: 'a real span' },
      descriptor: {
        documentReference: 'WA-GEO-GIR-004',
        documentTitle: 'Ground investigation report',
        versionReference: 'P02',
        superseded: false,
      },
      relevance: 0.82,
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
  coverage: { candidates: 412, requestedReferences: [], unmatchedReferences: [] },
});

const requester = { organisationId: 'org-b', participantId: 'part-1' };
const environment = { projectId: 'proj-1' };

describe('corpus_retrieval (T-269)', () => {
  it('returns structured passages — an object, never prose', async () => {
    const worker = createCorpusRetrieval({ assemble: async () => assembled() });
    const output = await worker(requester, environment, { query: 'contamination' });
    expect(output.passages).toEqual([
      {
        versionId: 'ver-1',
        chunkId: 'chunk-1',
        // T-272 — a uuid is not something a reader can act on; the structured
        // output names the document
        documentReference: 'WA-GEO-GIR-004',
        documentTitle: 'Ground investigation report',
        versionReference: 'P02',
        superseded: false,
        locator: { span: { start: 0, end: 12 }, paragraph: 2, verbatim: 'a real span' },
        text: 'the passage the model was shown',
        relevance: 0.82,
      },
    ]);
    // structured, and still an object rather than prose: the note is a field,
    // not a preamble the model has to parse out of an answer
    expect(typeof output.coverageNote).toBe('string');
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
      assemble: async () => ({
        items: [],
        budget: { tokenLimit: 12000, tokensUsed: 0 },
        coverage: { candidates: 0, requestedReferences: [], unmatchedReferences: [] },
      }),
    });
    const output = await worker(requester, environment, { query: 'anything' });
    expect(output.passages).toEqual([]);
    // zero candidates: denial and an empty corpus read identically, which is
    // the point — the note reports the search, never the reason
    expect(output.coverageNote).toContain('0 passages were admitted');
  });

  it('declares itself a cacheable, non-writing, inherited-reach leaf', () => {
    expect(CORPUS_RETRIEVAL.leaf).toBe(true);
    expect(CORPUS_RETRIEVAL.writes).toBe(false);
    expect(CORPUS_RETRIEVAL.reach).toBe('inherited');
    expect(CORPUS_RETRIEVAL.cacheable).toBe(true);
    expect(CORPUS_RETRIEVAL.externalEgress).toBe(false);
  });
});

// T-272 — the coverage note. Absence detection lives or dies on the difference
// between "we searched and found nothing" and "there was nothing to search".
describe('the coverage note (T-272)', () => {
  const input = (
    coverage: { candidates: number; requestedReferences: string[]; unmatchedReferences: string[] },
    items: number,
  ) => ({
    items: Array.from({ length: items }, (_unused, at) => ({
      channel: 'grounded' as const,
      corpus: 'library' as const,
      source: { versionId: `ver-${at}` },
      chunkId: `chunk-${at}`,
      content: `passage ${at}`,
    })),
    budget: { tokenLimit: 12000, tokensUsed: 0 },
    coverage,
  });

  it('distinguishes an empty corpus from a corpus that had no match', async () => {
    const searched = createCorpusRetrieval({
      assemble: async () => input({ candidates: 4000, requestedReferences: [], unmatchedReferences: [] }, 0),
    });
    const empty = createCorpusRetrieval({
      assemble: async () => input({ candidates: 0, requestedReferences: [], unmatchedReferences: [] }, 0),
    });

    const a = await searched(requester, environment, { query: 'q' });
    const b = await empty(requester, environment, { query: 'q' });
    expect(a.passages).toEqual(b.passages); // identical results…
    expect(a.coverageNote).not.toBe(b.coverageNote); // …and different facts
    expect(a.coverageNote).toContain('4000 passages were admitted');
    expect(a.coverageNote).toContain('No passage matched');
  });

  // the sharpest absence: the asker believed the document was there
  it('names a requested document the corpus does not have', async () => {
    const worker = createCorpusRetrieval({
      assemble: async () =>
        input(
          {
            candidates: 40,
            requestedReferences: ['WA-GEO-GIR-004', 'WA-ECO-PEA-001'],
            unmatchedReferences: ['WA-ECO-PEA-001'],
          },
          1,
        ),
    });
    const { coverageNote } = await worker(requester, environment, { query: 'WA-ECO-PEA-001' });
    expect(coverageNote).toContain('WA-ECO-PEA-001');
    expect(coverageNote).not.toContain('WA-GEO-GIR-004'); // that one WAS found
  });

  it('says so when the assembly recorded no coverage at all, rather than asserting zero', async () => {
    const worker = createCorpusRetrieval({
      assemble: async () => ({ items: [], budget: { tokenLimit: 12000, tokensUsed: 0 } }),
    });
    const { coverageNote } = await worker(requester, environment, { query: 'q' });
    expect(coverageNote).toContain('was not recorded');
    expect(coverageNote).not.toContain('0 passage');
  });

  it('caps at 20 by default and reports that it did', async () => {
    const worker = createCorpusRetrieval({
      assemble: async () =>
        input({ candidates: 900, requestedReferences: [], unmatchedReferences: [] }, 25),
    });
    const { passages, coverageNote } = await worker(requester, environment, { query: 'q' });
    expect(passages).toHaveLength(20);
    expect(coverageNote).toContain('25 passages matched; the 20 best are returned');
  });
});

// T-272 — Q-028 is open, and its own text rules that leaving the lever unwired
// is the SAFE STATE. This is that ruling as a test: the worker must not offer a
// scope, because a wrongly-scoped question grounds a confident, fully-cited
// answer on a partial library where every citation resolves.
describe('the ontology scope filter stays unwired (Q-028)', () => {
  it('declares no classification or document-type input', () => {
    // `include_superseded` (T-273) is a RECORD-STATE opt-in, not a scope: it
    // relaxes which revisions are admissible and reaches no row the requester
    // could not already have reached in a live one.
    expect(Object.keys(CORPUS_RETRIEVAL.inputSchema).sort()).toEqual([
      'include_superseded',
      'max_passages',
      'query',
    ]);
  });

  it('is not expressible on the input type either', () => {
    type Unscoped = 'classificationTermIds' extends keyof CorpusRetrievalInput
      ? false
      : 'docTypes' extends keyof CorpusRetrievalInput
        ? false
        : 'scope' extends keyof CorpusRetrievalInput
          ? false
          : true;
    const pinned: Unscoped = true;
    expect(pinned).toBe(true);
  });
});

// T-273 — the opt-in, and the shape it deliberately does NOT take.
describe('include_superseded (T-273)', () => {
  const supersededItem = {
    channel: 'grounded' as const,
    corpus: 'library' as const,
    source: { versionId: 'ver-old' },
    chunkId: 'chunk-old',
    descriptor: {
      documentReference: 'WA-GEO-GIR-004',
      documentTitle: null,
      versionReference: 'P01',
      superseded: true,
    },
    content: 'the earlier revision said something else',
  };
  const widened = async () => ({
    items: [supersededItem],
    budget: { tokenLimit: 12000, tokensUsed: 0 },
    coverage: { candidates: 500, requestedReferences: [], unmatchedReferences: [] },
  });

  it('excludes by default and says so', async () => {
    const worker = createCorpusRetrieval({ assemble: async () => assembled() });
    const { passages, coverageNote } = await worker(requester, environment, { query: 'q' });
    expect(passages.every((passage) => !passage.superseded)).toBe(true);
    expect(coverageNote).toContain('Superseded documents were excluded, as they are by default');
  });

  // the widening is a CAPABILITY the composition granted, not a parameter the
  // worker passes into the gateway: `AssemblyRequest` still has no field that
  // widens anything, which is the wall's signature guarantee
  it('uses the second gateway when asked, and flags what came back', async () => {
    const ordinary = vi.fn<Assemble>(async () => assembled());
    const worker = createCorpusRetrieval({
      assemble: ordinary,
      assembleIncludingSuperseded: widened,
    });
    const { passages, coverageNote } = await worker(requester, environment, {
      query: 'q',
      includeSuperseded: true,
    });
    expect(ordinary).not.toHaveBeenCalled();
    expect(passages[0]!.superseded).toBe(true);
    expect(coverageNote).toContain('deliberately included, and 1 of the passages');
  });

  // a deployment that built no widened gateway cannot honour the request, and
  // returning the default silently would read as "there are no superseded ones"
  it('says it could not honour the request rather than returning the default silently', async () => {
    const worker = createCorpusRetrieval({ assemble: async () => assembled() });
    const { coverageNote } = await worker(requester, environment, {
      query: 'q',
      includeSuperseded: true,
    });
    expect(coverageNote).toContain('does not admit them');
  });

  it('reports that none matched, rather than saying nothing', async () => {
    const worker = createCorpusRetrieval({
      assemble: async () => assembled(),
      assembleIncludingSuperseded: async () => assembled(),
    });
    const { coverageNote } = await worker(requester, environment, {
      query: 'q',
      includeSuperseded: true,
    });
    expect(coverageNote).toContain('deliberately included; none matched');
  });
});
