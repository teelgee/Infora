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
// T-272 — THE COVERAGE NOTE IS THE MECHANISM BEHIND ABSENCE DETECTION, and it
// is why this worker returns more than a list. An empty result and a result
// from an empty corpus are indistinguishable to a reader and mean opposite
// things: "we searched 4,000 passages and none matched" is a finding, "your
// library has nothing in it" is a configuration problem, and a bare `[]` is
// both. So the note states what slice was searched, how many candidates the
// pre-filter admitted before ranking, and which named documents the corpus did
// not have.
//
// ⚠ **THE ONTOLOGY SCOPE FILTER IS DELIBERATELY NOT AN INPUT HERE.** The board
// entry lists `classification_terms?` and `doc_types?`, and they are absent on
// purpose: `Q-028` — *who selects the retrieval scope* — is open, and its own
// text rules that leaving the lever unwired is the SAFE STATE, not a bug. The
// stakes are asymmetric and that is the whole reason: a wrongly-scoped question
// grounds a confident, fully-cited answer on a partial library, where every
// citation resolves and neither the ground-check nor the user can see what was
// excluded. Declaring the parameter and ignoring it would be worse than not
// declaring it, because the model would be told a lever exists and would use
// it. The narrowing is still reachable the safe way — an orchestrator may hand
// this worker an already-attenuated assembler (T-248) — which is a scope it was
// GIVEN rather than one it chose.
//
// T-273 — `include_superseded` is HERE, and the shape it takes is the point.
// The worker does not pass a widening parameter into the gateway: it is
// constructed with TWO gateways, an ordinary one and one the composition built
// to admit superseded material, and it chooses between capabilities it was
// granted. `AssemblyRequest` therefore still has no field that widens anything
// — the wall's signature guarantee — and a worker in a deployment that
// constructed no widened gateway simply cannot honour the request, and says so
// in the coverage note rather than quietly returning the default.
//
// Still absent, and named so it is not mistaken for done: the cache keyed on
// `query + corpus_version + scope_hash` is not built.
import type {
  Assemble,
  AssembledItem,
  AssemblyCoverage,
  Scope,
  WorkerDeclaration,
} from '@infora/contracts';

export const CORPUS_RETRIEVAL: WorkerDeclaration = {
  name: 'corpus_retrieval',
  purpose:
    'Search the project library for passages relevant to a question, and return them with their sources and locators.',
  tier: 'triage',
  inputSchema: {
    query: 'the text to search for',
    max_passages: 'how many passages to return at most (default 20)',
    include_superseded:
      'deliberately include superseded documents, which are excluded by default; every passage from one is flagged (default false)',
  },
  outputSchema: {
    passages:
      'ranked passages, each with the document it came from, its revision, a locator, the text the model was shown and how well it matched',
    coverage_note:
      'what corpus slice was searched, how much of it was admitted, and which named documents were not found',
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
  /** how the document is NAMED — a uuid is not something a reader can act on */
  documentReference: string | null;
  /** null for reference material, which has no work item and so no title */
  documentTitle: string | null;
  versionReference: string | null;
  /** T-273's opt-in is the only thing that can make this true */
  superseded: boolean;
  locator: AssembledItem['locator'];
  text: string;
  /** null means NOT RANKED — matched on the document's reference, not by similarity */
  relevance: number | null;
};

/** 20, per the Wave 3 entry. A cap, not a target. */
export const DEFAULT_MAX_PASSAGES = 20;

export type CorpusRetrievalInput = {
  query: string;
  maxPassages?: number;
  /**
   * T-273 — default FALSE. Exclusion is unchanged unless somebody deliberately
   * asks, and asking is not enough on its own: the deployment must have
   * constructed the gateway that admits them.
   */
  includeSuperseded?: boolean;
  /**
   * T-469 — the run's declared scope, carried to the gateway as the semantic
   * pre-filter. A worker can pass the scope its run was given and no other: it
   * narrows, and the gateway intersects it with what the requester may see.
   */
  scope?: Scope;
};
export type CorpusRetrievalOutput = { passages: CorpusPassage[]; coverageNote: string };

/**
 * Non-negotiable 6, as code: the return value is an OBJECT of passages, never
 * prose and never a reasoning trace. The orchestrator sees exactly this.
 */
export function createCorpusRetrieval(deps: {
  assemble: Assemble;
  /**
   * T-273 — the same gateway, constructed to admit superseded material. A
   * SECOND gateway rather than a parameter on the first: the widening is a
   * capability the composition granted, and this worker chooses between the
   * two rather than asking either for more than it offers.
   */
  assembleIncludingSuperseded?: Assemble;
}) {
  return async (
    requester: { organisationId: string; participantId: string },
    environment: { projectId: string },
    input: CorpusRetrievalInput,
  ): Promise<CorpusRetrievalOutput> => {
    // asked for, and available. Both halves matter: a deployment that built no
    // widened gateway cannot honour the request, and the honest response is to
    // search the live corpus and SAY SO — not to return the default silently,
    // which would read as "there are no superseded sources".
    const wantsSuperseded = input.includeSuperseded === true;
    const widened = wantsSuperseded ? deps.assembleIncludingSuperseded : undefined;
    const assembled = await (widened ?? deps.assemble)({
      // `targeted`, not `baseline`: this IS a sub-agent's narrower query
      // (ADR-0029 §4), and the two modes are the same call with the same
      // access guarantees precisely so agentic retrieval stays inside the wall
      request: {
        text: input.query,
        mode: 'targeted',
        ...(input.scope !== undefined && { scope: input.scope }),
      },
      environment: { kind: 'project', projectId: environment.projectId },
      requester,
    });

    const grounded = assembled.items
      // grounded only. A guiding item has no `source` at all (T-308) and must
      // never reach a caller that will cite what it is handed.
      .filter((item) => item.channel === 'grounded' && item.source !== undefined)
      .map((item) => ({
        versionId: 'versionId' in item.source! ? item.source.versionId : '',
        chunkId: item.chunkId ?? null,
        documentReference: item.descriptor?.documentReference ?? null,
        documentTitle: item.descriptor?.documentTitle ?? null,
        versionReference: item.descriptor?.versionReference ?? null,
        superseded: item.descriptor?.superseded ?? false,
        locator: item.locator,
        text: item.content,
        relevance: item.relevance ?? null,
      }))
      .filter((passage) => passage.versionId !== '');

    const limit = input.maxPassages ?? DEFAULT_MAX_PASSAGES;
    const passages = grounded.slice(0, limit);

    return {
      passages,
      coverageNote: coverageNote(assembled.coverage, grounded.length, passages.length, {
        requested: wantsSuperseded,
        admitted: widened !== undefined,
        returned: passages.filter((passage) => passage.superseded).length,
      }),
    };
  };
}

/**
 * What was searched, in one sentence a person can act on.
 *
 * It reports the SHAPE of the search, not a verdict on the result. Three facts,
 * each of which changes what an empty list means: the slice searched, how much
 * of it the access and state pre-filter admitted, and which documents the
 * question named that the corpus does not have. The third is the sharpest —
 * the asker believed the document was there.
 *
 * When the assembly reported no coverage at all the note says so rather than
 * asserting zero. An absent fact and a zero are different claims, and this is
 * the field whose whole job is not confusing them.
 */
export function coverageNote(
  coverage: AssemblyCoverage | undefined,
  matched: number,
  returned: number,
  superseded: { requested: boolean; admitted: boolean; returned: number } = {
    requested: false,
    admitted: false,
    returned: 0,
  },
): string {
  const parts: string[] = [];
  if (coverage === undefined) {
    return 'Searched the reachable project library. How much of it was admitted was not recorded for this run.';
  }
  parts.push(
    `Searched the reachable project library — the deliverables this requester can see, in their current live revisions, indexed under the pinned embedding model: ${coverage.candidates} passage${coverage.candidates === 1 ? '' : 's'} were admitted by the access and state pre-filter.`,
  );
  parts.push(
    matched === 0
      ? 'No passage matched the question.'
      : returned < matched
        ? `${matched} passages matched; the ${returned} best are returned.`
        : `${matched} passage${matched === 1 ? '' : 's'} matched and ${matched === 1 ? 'is' : 'are'} returned.`,
  );
  // T-273 — the coverage half of mandatory flagging. The prose flag at the
  // point of use is the one that matters and lives in the cite leaf; this says
  // what the SEARCH did, which is the only place the *default* exclusion is
  // visible at all.
  if (superseded.requested && !superseded.admitted) {
    parts.push(
      'Superseded documents were requested and this deployment does not admit them, so only current revisions were searched.',
    );
  } else if (superseded.requested) {
    parts.push(
      superseded.returned === 0
        ? 'Superseded documents were deliberately included; none matched.'
        : `Superseded documents were deliberately included, and ${superseded.returned} of the passages returned ${superseded.returned === 1 ? 'is' : 'are'} from one.`,
    );
  } else {
    parts.push('Superseded documents were excluded, as they are by default.');
  }
  if (coverage.unmatchedReferences.length > 0) {
    parts.push(
      `The question named ${coverage.unmatchedReferences.join(', ')}, which ${coverage.unmatchedReferences.length === 1 ? 'is' : 'are'} not in the reachable corpus.`,
    );
  }
  return parts.join(' ');
}
