// @infora/data — connectors, ingestion, retrieval (pgvector)
export { chunkText } from './chunker';
export type { Chunk } from './chunker';
export { resolveLocator } from './locator';
export type { StoredSpan } from './locator';
export { ingestVersion, ingestAllVersions, isVersionIndexed, deleteChunksForVersions } from './ingest';
export type { IngestSummary, IngestOptions } from './ingest';
