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
//
// T-393 — and because the sweep is linear in what it walks, it can only be
// TESTED against versions of its own: the suite shares one long-lived dev
// database, so an unbounded sweep in a test is a sweep of every fixture every
// run since the machine was set up ever left behind. `SweepOptions.projectId`
// is what bounds it, and the sweep's own test is the only caller that passes one.
import { and, eq, inArray } from 'drizzle-orm';
import { schema as s, withProjectScope } from '@infora/db';
import type { Db } from '@infora/db';
import type { Router } from '@infora/model';
import { blankGapLines } from '@infora/contracts';
import { chunkText } from './chunker';

const INDEX_DIMENSIONS = 1024; // version_chunks.embedding — vector(1024)

export type IngestSummary = { versions: number; chunks: number; model: string };
export type IngestOptions = { maxChars?: number };
// T-393 — the sweep's only extra knob: which project's versions it walks.
// **Narrowing only, and never on a request path** — ingest excludes nothing by
// policy (ADR-0022, T-033), so a scope here can only ever leave *less* indexed,
// never reach further. Both real callers (the dev CLI, the e2e substrate) index
// a seeded database from nothing and pass none, which is why the default stays
// the full walk. It exists because a full-table sweep cannot be *tested*
// against a shared dev database: the suite inherits every version every earlier
// run ever left behind, so the test got slower with the machine's age and
// timed out at ~740 versions on a clean tree.
export type SweepOptions = IngestOptions & { projectId?: string };

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
 * The full sweep — every version in the database, or every version of one
 * project when `projectId` is given. Idempotent and correct, and **linear in
 * the size of what it walks**, so it belongs to the dev ingest CLI and the e2e
 * substrate only. On a request path use `ingestVersion` (T-302).
 */
export async function ingestAllVersions(
  db: Db,
  router: Router,
  options: SweepOptions = {},
): Promise<IngestSummary> {
  assertIndexGeometry(router);
  const versions = await db
    .select(versionColumns)
    .from(s.versions)
    .innerJoin(s.containers, eq(s.versions.containerId, s.containers.id))
    .where(options.projectId ? eq(s.containers.projectId, options.projectId) : undefined);
  return ingestRows(db, router, versions, options);
}

/**
 * T-303 — has this version been indexed under the router's pinned model?
 *
 * The bulk load needs it to resume honestly: a document whose container
 * committed and whose embedding call then died is **in the library and answers
 * nothing**, which is worse than absent because the list says it is there.
 * "Does a row exist" would call that done; this is the question that does not.
 *
 * It lives here rather than in the caller because `version_chunks` has one
 * reader by construction (`scripts/source-rules.mjs` RULE 1) — and because the
 * pinned model is ingest's business: each model is its own complete index
 * (ADR-0024), so "indexed" is only ever a question about one of them.
 */
export async function isVersionIndexed(
  db: Db,
  router: Router,
  versionId: string,
  projectId: string,
): Promise<boolean> {
  // T-472 — a not-citable version (a confirmed reference file whose text could
  // not be read) has no chunks by design and is never indexed. It is "finished",
  // not a half-landed ingest, so a resume must neither re-embed it nor count it
  // as a fault.
  const [version] = await db
    .select({ notCitable: s.versions.notCitable })
    .from(s.versions)
    .where(eq(s.versions.id, versionId))
    .limit(1);
  if (version?.notCitable === true) return true;
  // the index is under row-level security and the policy fails CLOSED (T-247),
  // so an unscoped read would answer "never indexed" for every version and
  // re-embed the whole corpus on every resume
  const rows = await withProjectScope(db, projectId, (tx) =>
    tx
      .select({ id: s.versionChunks.id })
      .from(s.versionChunks)
      .where(
        and(
          eq(s.versionChunks.versionId, versionId),
          eq(s.versionChunks.embeddingModelId, router.embeddingModel.id),
        ),
      )
      .limit(1),
  );
  return rows.length > 0;
}

/**
 * T-340 — erase the index rows for a set of versions, as part of a Purge.
 *
 * It lives here because `version_chunks` has one reader and one writer by
 * construction (`scripts/source-rules.mjs` RULE 1), and because "erase the
 * derived copy" is the same knowledge as "write the derived copy" — the
 * package that knows a chunk is not the document is the package that should
 * know how to unmake one.
 *
 * **Takes a transaction, and does not open its own scope.** The caller has
 * already declared `infora.project_id`, and it must: the index is under RLS and
 * the policy fails CLOSED, so a DELETE outside the scope matches nothing and
 * reports success while leaving the text exactly where it was — which is the
 * precise failure Purge exists to prevent, arriving through the back door.
 * Unlike ingest, this is deliberately NOT model-scoped: a purge erases every
 * index built over the text, not the one the current router happens to name.
 */
export async function deleteChunksForVersions(tx: Db, versionIds: string[]): Promise<number> {
  if (versionIds.length === 0) return 0;
  const deleted = await tx
    .delete(s.versionChunks)
    .where(inArray(s.versionChunks.versionId, versionIds))
    .returning({ id: s.versionChunks.id });
  return deleted.length;
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
    const chunks = chunkText(blankGapLines(version.content), options.maxChars);
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
