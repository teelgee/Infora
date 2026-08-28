// @infora/capabilities — grounded generation, compliance, tabular review, plain-english
export {
  composeSystemPrompt,
  groundedDraft,
  LENS_PRECEDENCE,
  parseClaims,
  SYSTEM_CHAT_CLAUSES,
  SYSTEM_DOCUMENT_CLAUSES,
} from './grounded-draft';
export type {
  DraftedClaim,
  GroundedDraftOptions,
  GroundedDraftResult,
  SourceRef,
} from './grounded-draft';
// T-269 — the typed worker registry and entitlement assembly. The tool set is
// ASSEMBLED, not filtered: an unentitled worker is absent, and the model is
// never told it exists.
export {
  assembleWorkers,
  BUILT_WORKERS,
  createWorkerRegistry,
  tierAdmitsThirdParty,
} from './workers/registry';
export type { WorkerAssemblyFacts, WorkerRegistry } from './workers/registry';
export { CORPUS_RETRIEVAL, createCorpusRetrieval } from './workers/corpus-retrieval';
export type {
  CorpusPassage,
  CorpusRetrievalInput,
  CorpusRetrievalOutput,
} from './workers/corpus-retrieval';
