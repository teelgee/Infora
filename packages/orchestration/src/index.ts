// @infora/orchestration — planner, sub-agents, tool registry, run state
export {
  createConversation,
  finishRun,
  finishStep,
  openRun,
  openStep,
} from './run-writer';
export type { ConversationRow, RunRow, StepAudit, StepRow } from './run-writer';
export {
  CHAIN_AGENT_ID,
  CapabilityRefused,
  RunHalted,
  resolveStepInputs,
  runChain,
  sourcesOf,
  StepsFailed,
} from './chain';
// T-396 — the executor's closed registry: capability name → the built thing
// that runs it. A dispatcher, never a generic worker (ADR-0053 §7).
export { createCapabilityRegistry } from './capability-registry';
export type { CapabilityDeps } from './capability-registry';
export { createRetrieveLeaf, RETRIEVAL_AGENT_ID } from './retrieve-leaf';
export { createDraftLeaf } from './draft-leaf';
// T-280 — `document_builder`'s implementation: it writes, so it lives here
export {
  UnknownDocumentTemplate,
  builtDocumentContent,
  createDocumentBuilder,
} from './document-builder';
export type {
  DocumentBuilderDeps,
  DocumentBuilderInput,
  DocumentBuilderOutput,
  ManifestEntry,
} from './document-builder';
export { createGroundCheckLeaf } from './ground-check-leaf';
export { createCiteLeaf } from './cite-leaf';
// T-260 — the plan artefact: written for every run the chain drives. T-261
// added the read endpoint's permission half (`canRerunPlan`) beside it, so
// "who may read" and "who may re-run" cannot drift apart in two files.
export {
  canRerunPlan,
  CODED_CHAIN_PLAN,
  finishPlan,
  finishPlanStep,
  markPlanRunning,
  openPlan,
  readPlanForRun,
  startPlanStep,
} from './plan-writer';
export type { OpenedPlan, PlanRow, PlanStepRow } from './plan-writer';
// T-262 — the plan's execution order, derived from its edges rather than from
// four awaits. The ground-check is deliberately NOT among the stages this
// orders: it runs as code outside the plan (see chain.ts).
export { dependantsOf, orderPlanSteps, PlanNotExecutable } from './plan-order';
export type { PlannedStep } from './plan-order';
// T-253 — the assembled context a run saw, at passage grain
// T-310 — the checker's three capabilities, wired to the stores they read. The
// declarations, the prompts and the admission rules are in `@infora/capabilities`;
// only the half that touches a store is here (document_builder's split exactly).
export {
  clauseSlice,
  createQaContradictionCheck,
  createQaDocumentCheck,
  createQaSectionCheck,
  MAX_ASSERTIONS_PER_SECTION,
  readStyleClauses,
  UnknownDraftSection,
} from './qa-checker';
export type {
  CheckAudit,
  QaCheckerDeps,
  QaContradictionCheckInput,
  QaContradictionCheckOutput,
  QaDocumentCheckInput,
  QaDocumentCheckOutput,
  QaSectionCheckInput,
  QaSectionCheckOutput,
} from './qa-checker';
export { readRunContext } from './context-reader';
export { readDocumentSuggestions, readRun } from './run-reader';
export { resolveSuggestion } from './resolution';
export type { ResolutionResult } from './resolution';
export type {
  Capability,
  CapabilityRegistry,
  ChainInput,
  ChainLeaves,
  CiteOutput,
  DraftClaim,
  DraftOutput,
  GroundCheckOutput,
  Leaf,
  LeafContext,
  Revalidate,
  RevalidationFailure,
  SourceRef,
} from './chain';
