// @infora/data — connectors, ingestion, retrieval (pgvector)
export { chunkText } from './chunker';
export type { Chunk } from './chunker';
export { resolveLocator } from './locator';
export type { StoredSpan } from './locator';
export { ingestVersion, ingestAllVersions, isVersionIndexed, deleteChunksForVersions } from './ingest';
export type { IngestSummary, IngestOptions, SweepOptions } from './ingest';
// T-308 — the rulebook loader and the org-context binding (ADR-0048 §4/§5).
// Deliberately NOT the chunker: a clause is stored as the manual reads it, so
// a finding can quote it verbatim (see rulebook.ts).
export { parseRulebook, loadRulebook, retireRulebook } from './rulebook';
// T-397 — the project style guide, loaded by the SAME clause parser: two
// parsers would be two answers to what a clause is, and the checker reads both
// style sources through one shape.
export { loadStyleGuide, retireStyleGuide } from './rulebook';
export type { RulebookClause, RulebookParse } from './rulebook';
// T-423 (ADR-0054 decisions 2–5) — the rule set: saved as a NEW version every
// time, read back with each extracted rule's client wording resolved from the
// clause store it points at.
export {
  saveRuleSet,
  readCurrentRuleSet,
  readRules,
  currentRuleSetVersionIds,
  readAcceptedRules,
  UnknownClausePointer,
} from './rule-set';
export type { RuleToSave, StoredRule, StoredRuleSet } from './rule-set';
