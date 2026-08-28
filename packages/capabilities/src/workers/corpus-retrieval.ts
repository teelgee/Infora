// T-269 — `corpus_retrieval`, the first typed worker.
//
// **This is not a new path to the store.** It is `groundedLibrary` reached
// through the assembly gateway, which already applies project scope, library
// membership, live record state, the grounding acceptance code, current
// version, the pinned embedding model and per-deliverable visibility as SQL
// pre-filters in one query. The worker adds STRUCTURE around that call and
// nothing else — no second query, no second predicate, no widening parameter.
// A worker that reached the store directly would bypass the wall (ADR-0028 §4,
// ADR-0029 §2), which is exactly what "workers retrieve only through Context"
// exists to prevent.
//
// WHAT T-272 ADDS, so this is not mistaken for the finished worker: the
// `coverage_note` (what slice was searched, how many candidates the pre-filter
// admitted, which requested terms found nothing — the mechanism behind absence
// detection), the classification-term and doc-type inputs, `include_superseded`
// (T-273), and the cache keyed on `query + corpus_version + scope_hash`. Those
// are deliberately absent rather than stubbed: a `coverage_note` that said
// something plausible and untrue would be worse than the field not existing.
import type { Assemble, AssembledItem, WorkerDeclaration } from '@infora/contracts';

export const CORPUS_RETRIEVAL: WorkerDeclaration = {
  name: 'corpus_retrieval',
  purpose:
    'Search the project library for passages relevant to a question, and return them with their sources and locators.',
  tier: 'triage',
  inputSchema: {
    query: 'the text to search for',
    max_passages: 'how many passages to return at most (default 20)',
  },
  outputSchema: {
    passages:
      'ranked passages, each with version_id, chunk_id, locator and the text the model was shown',
  },
  tools: ['project indexes', 'document store read'],
  reach: 'inherited',
  scopeNote: 'user ∩ project ∩ deliverable visibility — resolved inside the gateway call',
  leaf: true,
  writes: false,
  cacheable: true,
  // no third party beyond the deployment's own embedding route, which the
  // router already holds to the tier's policy
  externalEgress: false,
  requiresAuthorityShelf: false,
};

export type CorpusPassage = {
  versionId: string;
  chunkId: string | null;
  locator: AssembledItem['locator'];
  text: string;
};

export type CorpusRetrievalInput = { query: string; maxPassages?: number };
export type CorpusRetrievalOutput = { passages: CorpusPassage[] };

/**
 * Non-negotiable 6, as code: the return value is an OBJECT of passages, never
 * prose and never a reasoning trace. The orchestrator sees exactly this.
 */
export function createCorpusRetrieval(deps: { assemble: Assemble }) {
  return async (
    requester: { organisationId: string; participantId: string },
    environment: { projectId: string },
    input: CorpusRetrievalInput,
  ): Promise<CorpusRetrievalOutput> => {
    const assembled = await deps.assemble({
      // `targeted`, not `baseline`: this IS a sub-agent's narrower query
      // (ADR-0029 §4), and the two modes are the same call with the same
      // access guarantees precisely so agentic retrieval stays inside the wall
      request: { text: input.query, mode: 'targeted' },
      environment: { kind: 'project', projectId: environment.projectId },
      requester,
    });

    const passages = assembled.items
      // grounded only. A guiding item has no `source` at all (T-308) and must
      // never reach a caller that will cite what it is handed.
      .filter((item) => item.channel === 'grounded' && item.source !== undefined)
      .map((item) => ({
        versionId: 'versionId' in item.source! ? item.source.versionId : '',
        chunkId: item.chunkId ?? null,
        locator: item.locator,
        text: item.content,
      }))
      .filter((passage) => passage.versionId !== '');

    return {
      passages:
        input.maxPassages === undefined ? passages : passages.slice(0, input.maxPassages),
    };
  };
}
