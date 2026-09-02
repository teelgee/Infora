// @infora/capabilities — grounded generation, compliance, tabular review, plain-english
export {
  composeSystemPrompt,
  groundedDraft,
  LENS_PRECEDENCE,
  parseClaims,
  SYSTEM_CHAT_CLAUSES,
  SYSTEM_DOCUMENT_CLAUSES,
  STEER_PRECEDENCE,
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
export {
  CORPUS_RETRIEVAL,
  DEFAULT_MAX_PASSAGES,
  coverageNote,
  createCorpusRetrieval,
} from './workers/corpus-retrieval';
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
// T-280 — `document_builder`'s declaration and its template prompt; the
// implementation writes, so it lives in `@infora/orchestration`.
export { DOCUMENT_BUILDER, composeDraftingPrompt } from './workers/document-builder';
export {
  DocumentTemplateError,
  TEMPLATES_DIR,
  loadDocumentTemplates,
  validateTemplate,
} from './workers/templates';
export type { DocumentTemplate, TemplateRegistry, TemplateSection } from './workers/templates';
// T-266 — classification into four outcomes, and the model-chosen plan.
export { classify, modelChosenStages, singleWorkflowClassifier } from './classify';
export type {
  Classification,
  Classifier,
  ClassifierRequest,
  ClassifierVerdict,
  ClassifyInput,
} from './classify';
// T-309 — the document creator's plan: computed in CODE, priced before the
// click, and stating its coverage before the run and after it in the same shape
// (ADR-0053 §4/§5 — run semantics, not checker-specific).
export {
  coverageAfter,
  coverageBefore,
  planDocumentCreation,
  SECTION_COMPLETION_TOKENS,
  SOURCE_PROMPT_TOKENS,
  OUTLINE_PROMPT_TOKENS,
} from './tool-plan';
export type { DocumentCreationPlanInput } from './tool-plan';
// T-310 — the checker's five families and their three grains (ADR-0053 §2).
// The declarations, the prompts and the ADMISSION RULES live here; the halves
// that touch a store — the draft, the style guides, the corpus — are in
// `@infora/orchestration`, on `document_builder`'s split exactly.
export {
  QA_CONTRADICTION_CHECK,
  QA_DOCUMENT_CHECK,
  QA_SECTION_CHECK,
  admitContradictionFindings,
  admitSectionFindings,
  composeContradictionPrompt,
  composeSectionCheckPrompt,
} from './workers/qa-checker';
export type {
  CheckExcerpt,
  CheckPassage,
  SectionCheckMaterial,
  SectionCheckResult,
  SectionSummary,
  StyleClause,
} from './workers/qa-checker';
export {
  anchorInto,
  completenessCheck,
  fleschKincaidGrade,
  readabilityCheck,
  splitIntoSections,
} from './workers/qa-sections';
export type {
  CompletenessCoverage,
  DraftFinding,
  DraftSection,
  ReadabilityScore,
} from './workers/qa-sections';
// T-336 — the checker's planner: CODE, shown before the run, and stating its
// coverage before and after in the same shape (ADR-0053 §4/§5).
export {
  CHARS_PER_TOKEN,
  CHECK_COMPLETION_TOKENS,
  CHECK_OVERHEAD_TOKENS,
  PASSAGES_FULL,
  PASSAGES_QUICK,
  PASSAGE_PROMPT_TOKENS,
  SUMMARY_TOKENS,
  coverageAfterQaCheck,
  coverageBefore as qaCoverageBefore,
  groupKey,
  parseGroupKey,
  parsePassKey,
  passKey,
  planQaCheck,
  tokensIn,
} from './qa-plan';
export type { PassKey, QaCheckPlan, QaCheckPlanInput, QaPlanShape } from './qa-plan';
// T-424 (ADR-0054 decisions 2, 4 and 5) — an uploaded standard becomes proposed
// rules: what the model is shown, which of its answers are admitted, and the
// shipped baseline Infora proposes where the guide is silent.
export {
  admitExtractedRules,
  composeRuleExtractionPrompt,
  fillGaps,
  usablePattern,
  INFORA_BASELINE,
  MAX_PATTERN_LENGTH,
  RULE_TOPICS,
} from './rule-extraction';
export type { ExtractableClause, ExtractionResult, RuleTopic } from './rule-extraction';
