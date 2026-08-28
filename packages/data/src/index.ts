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
export type { RulebookClause, RulebookParse } from './rulebook';
