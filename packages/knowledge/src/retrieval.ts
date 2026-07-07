// T-031 — the grounded library pipeline (ADR-0022): hybrid retrieval over the
// requester's entitled slice only. Everything that must never ground is a SQL
// pre-filter in the one query — project scope, in_library, state = 'live',
// is_current, and the pinned embedding model (ADR-0024) — never a post-filter
// over fetched rows.
//
// Slice note: per-deliverable visibility facts (author / owner-shared,
// ADR-0016) have no Drawer 2 columns yet — they land with the review drawer.
// Until then the entitled slice for a resolved participant is the project's
// live library; the rule itself is fixed and tested in @infora/governance
// (canReadDeliverable) and joins this query when its columns exist.
import { and, asc, cosineDistance, eq, inArray, sql } from 'drizzle-orm';
import type { AssembledItem } from '@infora/contracts';
import type { EntitledSlice } from '@infora/governance';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { Router } from '@infora/model';

export const GROUNDED_CHUNK_LIMIT = 8;

type RetrievalRequest = { text: string; mode: 'baseline' | 'targeted' };

export async function groundedLibrary(
  deps: { db: Db; router: Router },
  slice: EntitledSlice,
  request: RetrievalRequest,
): Promise<AssembledItem[]> {
  const modelId = deps.router.embeddingModel.id;

  // lexical arm: deliverable codes named in the request beat similarity —
  // code is how this domain names documents (ADR-0022)
  const codes = extractReferenceCodes(request.text);
  const byCode = codes.length > 0 ? await liveChunksByCode(deps.db, slice, modelId, codes) : [];

  // vector arm: query embedded with the same pinned model the index holds
  const { embeddings } = await deps.router.embed([request.text], 'query');
  const bySimilarity = await nearestLiveChunks(deps.db, slice, modelId, embeddings[0]!);

  const seen = new Set<string>();
  const items: AssembledItem[] = [];
  for (const row of [...byCode, ...bySimilarity]) {
    if (seen.has(row.chunkId) || items.length >= GROUNDED_CHUNK_LIMIT) continue;
    seen.add(row.chunkId);
    items.push({
      channel: 'grounded',
      corpus: 'library',
      source: { versionId: row.versionId },
      content: row.content,
    });
  }
  return items;
}

// The one pre-filter both arms share: the entitled project's live grounded
// corpus — one live version per container falls out of is_current + state.
function liveLibraryFilter(slice: EntitledSlice, modelId: string) {
  return and(
    eq(s.containers.projectId, slice.projectId),
    eq(s.containers.inLibrary, true),
    eq(s.containers.state, 'live'),
    eq(s.versions.isCurrent, true),
    eq(s.versionChunks.embeddingModelId, modelId),
  );
}

const chunkColumns = {
  chunkId: s.versionChunks.id,
  versionId: s.versionChunks.versionId,
  content: s.versionChunks.content,
};

function liveChunksByCode(db: Db, slice: EntitledSlice, modelId: string, codes: string[]) {
  return db
    .select(chunkColumns)
    .from(s.versionChunks)
    .innerJoin(s.versions, eq(s.versionChunks.versionId, s.versions.id))
    .innerJoin(s.containers, eq(s.versions.containerId, s.containers.id))
    .where(
      and(
        liveLibraryFilter(slice, modelId),
        inArray(sql<string>`upper(${s.containers.documentReference})`, codes),
      ),
    )
    .orderBy(asc(s.containers.documentReference), asc(s.versionChunks.chunkIndex));
}

function nearestLiveChunks(db: Db, slice: EntitledSlice, modelId: string, query: number[]) {
  const distance = cosineDistance(s.versionChunks.embedding, query);
  return db
    .select(chunkColumns)
    .from(s.versionChunks)
    .innerJoin(s.versions, eq(s.versionChunks.versionId, s.versions.id))
    .innerJoin(s.containers, eq(s.versions.containerId, s.containers.id))
    .where(liveLibraryFilter(slice, modelId))
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
