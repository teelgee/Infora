// T-012 — the ingestion & embedding pipeline: chunk Versions, embed through
// the Router, store vectors beside the relational rows (ADR-0024). Every
// Version is ingested — superseded and withdrawn included — because exclusion
// is retrieval's job (ADR-0022's SQL pre-filters, T-031), and only an indexed
// excluded version can prove the filter works (T-033). Chunks are derived,
// rebuildable rows: each run replaces a version's chunks wholesale.
import { and, eq } from 'drizzle-orm';
import { schema as s, withProjectScope } from '@infora/db';
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

  // T-298 — versions carry their project, because the chunk index is under
  // row-level security (T-247) and the replace-wholesale step below has to be
  // able to SEE the rows it replaces. A DELETE finds its rows through the
  // SELECT policy, so an unscoped delete matches nothing and the re-insert
  // collides — ingest became insert-only, and silently non-idempotent, the
  // moment RLS landed.
  const versions = await db
    .select({
      id: s.versions.id,
      content: s.versions.content,
      projectId: s.containers.projectId,
    })
    .from(s.versions)
    .innerJoin(s.containers, eq(s.versions.containerId, s.containers.id));
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

    // the transaction declares the version's project, so the DELETE below can
    // see — and therefore replace — the rows it is meant to replace (T-247)
    await withProjectScope(db, version.projectId, async (tx) => {
      // replace this model's rows only — each pinned model is its own index
      // (ADR-0024), so e.g. the e2e substrate's fake index coexists with the
      // real one and retrieval's pre-filter keeps them disjoint
      await tx
        .delete(s.versionChunks)
        .where(
          and(
            eq(s.versionChunks.versionId, version.id),
            eq(s.versionChunks.embeddingModelId, result.model.id),
          ),
        );
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
