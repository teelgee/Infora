// @infora/knowledge — project + org context stores, signal capture
export { createAssembler, TOKEN_LIMIT } from './gateway';
export type { GatewayDeps, Inclusion } from './gateway';
export { estimateTokens } from './merge';
export { deliverableVisibleSql } from './visibility';
// T-292 — the documents in grounding scope for one requester, off the SAME
// pre-filter retrieval uses, so the composer's Data-sources chip and the answer
// cannot disagree about what was reachable
export { groundingSources } from './retrieval';
// T-459 — the register's search, on the same index and the same wall as grounding
export { searchLibraryRows, searchPlanContainerIds } from './register-search';
export type { RegisterSearchParams, RegisterSearchRow } from './register-search';
// T-249 — the access facts behind label propagation (finding F2); the policy
// they feed is pure and lives in @infora/governance
export {
  readChunkPassages,
  runSourceAudience,
  sandboxAudience,
  sandboxDocumentAudience,
  versionsAudience,
} from './label-facts';
// T-308 / T-397 — the two steering channels, classified by OWNERSHIP
// (ADR-0021): the PROJECT's style guide is guiding, the firm's rulebook is
// informing. ADR-0048 §4 placed the rulebook on guiding and its own dated
// addendum corrects it; the label moved with the correction.
export { guidingStyleGuide } from './guiding';
export { informingRules } from './informing';
