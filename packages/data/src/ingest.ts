// T-012 — the ingestion & embedding pipeline: chunk Versions, embed through
// the Router, store vectors beside the relational rows (ADR-0024). Every
// Version is ingested — superseded and withdrawn included — because exclusion
// is retrieval's job (ADR-0022's SQL pre-filters, T-031), and only an indexed
// excluded version can prove the filter works (T-033). Chunks are derived,
// rebuildable rows: each run replaces a version's chunks wholesale.
//
// T-302 — ingest takes a VERSION ID. It walked every version in the database on
// each call and ran on library admission: at the skeleton's few dozen rows that
// was invisible, but a 500-document corpus makes the per-admission path roughly
// 125,000 re-ingests, and one sweep at the end still leaves every subsequent
// admission re-ingesting all 500. `ingestVersion` is the path the product uses —
// one version, ingested once, at the moment it comes into existence. The sweep
// survives as `ingestAllVersions` and is named so a caller cannot reach for it
// by accident: it belongs to the dev CLI and the e2e substrate, which index a
// seeded database from nothing, and to nothing on a request path.
import { and, eq } from 'drizzle-orm';
import { schema as s, withProjectScope } from '@infora/db';
import type { Db } from '@infora/db';
import type { Router } from '@infora/model';
import { chunkText } from './chunker';

const INDEX_DIMENSIONS = 1024; // version_chunks.embedding — vector(1024)

export type IngestSummary = { versions: number; chunks: number; model: string };
export type IngestOptions = { maxChars?: number };

// T-298 — versions carry their project, because the chunk index is under
// row-level security (T-247) and the replace-wholesale step below has to be
// able to SEE the rows it replaces. A DELETE finds its rows through the
// SELECT policy, so an unscoped delete matches nothing and the re-insert
// collides — ingest became insert-only, and silently non-idempotent, the
// moment RLS landed.
type VersionRow = { id: string; content: string; projectId: string };

const versionColumns = {
  id: s.versions.id,
  content: s.versions.content,
  projectId: s.containers.projectId,
};

/**
 * Ingest one version, named by id — the path every write in the product takes.
 * Throws if the version does not exist: a caller naming a version that is not
 * there is a bug, and a silent no-op would leave the corpus quietly unindexed.
 */
export async function ingestVersion(
  db: Db,
  router: Router,
  versionId: string,
  options: IngestOptions = {},
): Promise<IngestSummary> {
  assertIndexGeometry(router);
  const [version] = await db
    .select(versionColumns)
    .from(s.versions)
    .innerJoin(s.containers, eq(s.versions.containerId, s.containers.id))
    .where(eq(s.versions.id, versionId))
    .limit(1);
  if (!version) throw new Error(`ingest: version ${versionId} does not exist`);
  return ingestRows(db, router, [version], options);
}

/**
 * The full sweep — every version in the database. Idempotent and correct, and
 * **linear in the size of the corpus**, so it belongs to the dev ingest CLI and
 * the e2e substrate only. On a request path use `ingestVersion` (T-302).
 */
export async function ingestAllVersions(
  db: Db,
  router: Router,
  options: IngestOptions = {},
): Promise<IngestSummary> {
  assertIndexGeometry(router);
  const versions = await db
    .select(versionColumns)
    .from(s.versions)
    .innerJoin(s.containers, eq(s.versions.containerId, s.containers.id));
  return ingestRows(db, router, versions, options);
}

function assertIndexGeometry(router: Router): void {
  const { id: modelId, dimensions } = router.embeddingModel;
  if (dimensions !== INDEX_DIMENSIONS) {
    // the index is pinned per model (ADR-0024): a different geometry means
    // a re-index migration on version_chunks, not a quiet mix
    throw new Error(
      `embedding model ${modelId} produces ${dimensions} dimensions; the version_chunks index is pinned to ${INDEX_DIMENSIONS} — re-index deliberately`,
    );
  }
}

async function ingestRows(
  db: Db,
  router: Router,
  versions: VersionRow[],
  options: IngestOptions,
): Promise<IngestSummary> {
  const modelId = router.embeddingModel.id;
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
          // T-271 — where in versions.content this chunk was packed from. The
          // chunker is the only place that knows, and it knows only now: the
          // offsets cannot be recovered afterwards (T-270 finding 1).
          startOffset: chunk.start,
          endOffset: chunk.end,
        })),
      );
    });
    totalChunks += chunks.length;
  }

  return { versions: versions.length, chunks: totalChunks, model: `${modelId} (${modelVersion})` };
}
