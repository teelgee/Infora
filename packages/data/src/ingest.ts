// T-012 — the ingestion & embedding pipeline: chunk Versions, embed through
// the Router, store vectors beside the relational rows (ADR-0024). Every
// Version is ingested — superseded and withdrawn included — because exclusion
// is retrieval's job (ADR-0022's SQL pre-filters, T-031), and only an indexed
// excluded version can prove the filter works (T-033). Chunks are derived,
// rebuildable rows: each run replaces a version's chunks wholesale.
import { eq } from 'drizzle-orm';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { Router } from '@infora/model';
import { chunkText } from './chunker';

const INDEX_DIMENSIONS = 1024; // version_chunks.embedding — vector(1024)

export type IngestSummary = { versions: number; chunks: number; model: string };

export async function ingestVersions(
  db: Db,
  router: Router,
  options: { maxChars?: number } = {},
): Promise<IngestSummary> {
  const { id: modelId, dimensions } = router.embeddingModel;
  if (dimensions !== INDEX_DIMENSIONS) {
    // the index is pinned per model (ADR-0024): a different geometry means
    // a re-index migration on version_chunks, not a quiet mix
    throw new Error(
      `embedding model ${modelId} produces ${dimensions} dimensions; the version_chunks index is pinned to ${INDEX_DIMENSIONS} — re-index deliberately`,
    );
  }

  const versions = await db.select().from(s.versions);
  let totalChunks = 0;
  let modelVersion = modelId;

  for (const version of versions) {
    const chunks = chunkText(version.content, options.maxChars);
    if (chunks.length === 0) continue;

    const result = await router.embed(
      chunks.map((chunk) => chunk.content),
      'document',
    );
    modelVersion = result.model.version;

    await db.transaction(async (tx) => {
      await tx.delete(s.versionChunks).where(eq(s.versionChunks.versionId, version.id));
      await tx.insert(s.versionChunks).values(
        chunks.map((chunk, at) => ({
          versionId: version.id,
          chunkIndex: chunk.index,
          content: chunk.content,
          embedding: result.embeddings[at]!,
          embeddingModelId: result.model.id,
          embeddingModelVersion: result.model.version,
        })),
      );
    });
    totalChunks += chunks.length;
  }

  return { versions: versions.length, chunks: totalChunks, model: `${modelId} (${modelVersion})` };
}
