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
