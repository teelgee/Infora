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
// T-274 — `extractor`, and the named schemas it extracts against. The schemas
// are DOMAIN CONTENT: adding one is adding a file, and this code does not
// change.
export { EXTRACTOR, createExtractor, UnknownExtractionSchema } from './workers/extractor';
export type {
  ExtractedRecord,
  ExtractionFailure,
  ExtractionScope,
  ExtractorDeps,
  ExtractorInput,
  ExtractorOutput,
  RecordSource,
} from './workers/extractor';
export {
  ExtractionSchemaError,
  SCHEMAS_DIR,
  loadExtractionSchemas,
  validateExtractionSchema,
} from './workers/extraction-schemas';
export type {
  ExtractionField,
  ExtractionFieldType,
  ExtractionSchema,
  ExtractionSchemaRegistry,
} from './workers/extraction-schemas';
// T-266 — classification into four outcomes, and the model-chosen plan.
export { classify, modelChosenStages, singleWorkflowClassifier } from './classify';
export type {
  Classification,
  Classifier,
  ClassifierRequest,
  ClassifierVerdict,
  ClassifyInput,
} from './classify';
