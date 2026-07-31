// T-031 — the grounded library pipeline (ADR-0022): hybrid retrieval over the
// requester's entitled slice only. Everything that must never ground is a SQL
// pre-filter in the one query — project scope, in_library, state = 'live',
// is_current, and the pinned embedding model (ADR-0024) — never a post-filter
// over fetched rows.
//
// Per-deliverable visibility joined 2026-07-18 (T-119, ADR-0016 as data) and
// gated 2026-07-20 (T-136, ADR-0035): a container grounds for the requester
// only when their organisation is the producer or the project owner, or holds
// a live share the organisation has acknowledged for this version and within
// any per-participant narrowing — the same rule canReadDeliverable fixes,
// applied as a SQL pre-filter (deliverableVisibleSql), never a post-filter.
import { and, asc, cosineDistance, eq, inArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { AssembledItem } from '@infora/contracts';
import type { EntitledSlice } from '@infora/governance';
import { schema as s, withProjectScope } from '@infora/db';
import type { Db } from '@infora/db';
import type { Router } from '@infora/model';
import { deliverableVisibleSql } from './visibility';

export const GROUNDED_CHUNK_LIMIT = 8;

// The ontology's semantic pre-filter (T-242, ADR-0045): an optional set of
// classification term ids narrows retrieval to the containers carrying one of
// them, *before* the vector comparison — the lever that scopes a 100k-document
// library structurally rather than searching it all. Applied in the same query
// as the access+state pre-filter (never a post-filter), so it composes with the
// wall for free. Multi-facet AND precedence and edge-traversal scoping are
// deferred to Slice D (retrieval maturity); this is the substrate.
type RetrievalRequest = {
  text: string;
  mode: 'baseline' | 'targeted';
  classificationTermIds?: string[];
};

export async function groundedLibrary(
  deps: { db: Db; router: Router },
  slice: EntitledSlice,
  request: RetrievalRequest,
): Promise<AssembledItem[]> {
  const modelId = deps.router.embeddingModel.id;

  const scope = request.classificationTermIds ?? [];
  const codes = extractReferenceCodes(request.text);
  // vector arm: query embedded with the same pinned model the index holds.
  // Embedded before the transaction opens — an outbound provider call has no
  // business holding a DB transaction open.
  const { embeddings } = await deps.router.embed([request.text], 'query');

  // T-247 — both arms run inside a transaction that declares the entitled
  // project, so row-level security enforces the boundary BENEATH the SQL
  // pre-filters below (finding F6). The pre-filters are unchanged and still do
  // the work; RLS is the backstop for a query nobody reviewed. Scoping here
  // rather than at the callers keeps the guarantee with the only code that
  // reads this index.
  const [byCode, bySimilarity] = await withProjectScope(deps.db, slice.projectId, async (tx) => [
    // lexical arm: deliverable codes named in the request beat similarity —
    // code is how this domain names documents (ADR-0022)
    codes.length > 0 ? await liveChunksByCode(tx, slice, modelId, codes, scope) : [],
    await nearestLiveChunks(tx, slice, modelId, embeddings[0]!, scope),
  ]);

  const seen = new Set<string>();
  const items: AssembledItem[] = [];
  for (const row of [...byCode, ...bySimilarity]) {
    if (seen.has(row.chunkId) || items.length >= GROUNDED_CHUNK_LIMIT) continue;
    seen.add(row.chunkId);
    items.push({
      channel: 'grounded',
      corpus: 'library',
      source: { versionId: row.versionId },
      // T-253 — passage grain: the chunk row is immutable, so its id is enough
      // to reconstruct exactly what the model was shown
      chunkId: row.chunkId,
      content: row.content,
    });
  }
  return items;
}

// The one pre-filter both arms share: the entitled project's live grounded
// corpus — one live version per container falls out of is_current + state.
// An optional classification scope narrows to containers carrying one of the
// given terms (the ontology's semantic pre-filter, T-242), in the same query.
function liveLibraryFilter(slice: EntitledSlice, modelId: string, scope: string[] = []) {
  return and(
    eq(s.containers.projectId, slice.projectId),
    eq(s.containers.inLibrary, true),
    eq(s.containers.state, 'live'),
    eq(s.versions.isCurrent, true),
    eq(s.versionChunks.embeddingModelId, modelId),
    deliverableVisibleSql(slice),
    scope.length > 0 ? classificationScopeSql(scope) : undefined,
  );
}

// A container is in scope if it is classified under any of the given terms —
// a correlated EXISTS on container_classifications, so it is a pre-filter, not
// a post-filter, and composes with the wall in one statement.
function classificationScopeSql(termIds: string[]): SQL {
  return sql`exists (select 1 from container_classifications cc
    where cc.container_id = ${s.containers.id}
      and cc.term_id in (${sql.join(
        termIds.map((id) => sql`${id}`),
        sql`, `,
      )}))`;
}

const chunkColumns = {
  chunkId: s.versionChunks.id,
  versionId: s.versionChunks.versionId,
  content: s.versionChunks.content,
};

function liveChunksByCode(
  db: Db,
  slice: EntitledSlice,
  modelId: string,
  codes: string[],
  scope: string[] = [],
) {
  return db
    .select(chunkColumns)
    .from(s.versionChunks)
    .innerJoin(s.versions, eq(s.versionChunks.versionId, s.versions.id))
    .innerJoin(s.containers, eq(s.versions.containerId, s.containers.id))
    .where(
      and(
        liveLibraryFilter(slice, modelId, scope),
        inArray(sql<string>`upper(${s.containers.documentReference})`, codes),
      ),
    )
    .orderBy(asc(s.containers.documentReference), asc(s.versionChunks.chunkIndex));
}

function nearestLiveChunks(
  db: Db,
  slice: EntitledSlice,
  modelId: string,
  query: number[],
  scope: string[] = [],
) {
  const distance = cosineDistance(s.versionChunks.embedding, query);
  return db
    .select(chunkColumns)
    .from(s.versionChunks)
    .innerJoin(s.versions, eq(s.versionChunks.versionId, s.versions.id))
    .innerJoin(s.containers, eq(s.versions.containerId, s.containers.id))
    .where(liveLibraryFilter(slice, modelId, scope))
    .orderBy(asc(distance), asc(s.versionChunks.id))
    .limit(GROUNDED_CHUNK_LIMIT);
}

// A deliverable code is a hyphenated token of three or more segments
// (WA-GEO-GIR-004); matched exactly, case-insensitively.
export function extractReferenceCodes(text: string): string[] {
  const tokens = text.split(/[^A-Za-z0-9-]+/);
  const codes = tokens
    .filter((token) => /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+){2,}$/.test(token))
    .map((token) => token.toUpperCase());
  return [...new Set(codes)];
}
