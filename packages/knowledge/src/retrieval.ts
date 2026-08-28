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
import type { AssembledItem, EmbeddingUsage } from '@infora/contracts';
import { reachableContainerIds } from '@infora/governance';
import type { EntitledSlice } from '@infora/governance';
import { schema as s, withProjectScope } from '@infora/db';
import type { Db } from '@infora/db';
import type { Router } from '@infora/model';
import { resolveLocator } from '@infora/data';
import { deliverableVisibleSql } from './visibility';
import { locatorColumns } from './locator-columns';

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

/**
 * T-313 — the items, plus what embedding them cost.
 *
 * Returned as a pair rather than stashed on the items, because the embedding
 * call is a property of the RETRIEVAL, not of any passage it found: a query
 * that matched nothing still cost a model call, and a shape that hung the cost
 * off a result would price that run at zero.
 */
export type GroundedLibraryResult = {
  items: AssembledItem[];
  embedding?: EmbeddingUsage;
};

export async function groundedLibrary(
  deps: { db: Db; router: Router },
  slice: EntitledSlice,
  request: RetrievalRequest,
): Promise<GroundedLibraryResult> {
  const modelId = deps.router.embeddingModel.id;

  const scope = request.classificationTermIds ?? [];
  const codes = extractReferenceCodes(request.text);
  // vector arm: query embedded with the same pinned model the index holds.
  // Embedded before the transaction opens — an outbound provider call has no
  // business holding a DB transaction open.
  const embedded = await deps.router.embed([request.text], 'query');
  const { embeddings } = embedded;

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
    // T-271 — a locator when the stored span still demonstrably points at this
    // passage, and otherwise nothing. Version grain is the honest degrade; a
    // locator that does not resolve is worse than none, because it looks
    // checkable.
    const locator = resolveLocator(row);
    items.push({
      channel: 'grounded',
      corpus: 'library',
      source: { versionId: row.versionId },
      // T-253 — passage grain: the chunk row is immutable, so its id is enough
      // to reconstruct exactly what the model was shown
      chunkId: row.chunkId,
      ...(locator !== null && { locator }),
      content: row.content,
    });
  }
  return {
    items,
    // absent where the provider reported no usage — UNKNOWN, never zero
    ...(embedded.usage !== undefined && {
      embedding: { model: embedded.model, tokens: embedded.usage.tokens },
    }),
  };
}

// The one pre-filter both arms share: the entitled project's live grounded
// corpus — one live version per container falls out of is_current + state.
// An optional classification scope narrows to containers carrying one of the
// given terms (the ontology's semantic pre-filter, T-242), in the same query.
//
// T-387 — the third condition. Library membership was sufficient for grounding
// and is now only necessary (the ADR-0011 rider): a container grounds when it is
// in the library AND its record state is `live` AND the acceptance code that
// admitted it carries the project's grounding rule. It lives HERE, in the filter
// both arms of the one gateway call share, rather than in any caller — ADR-0029
// §4 puts baseline assembly and targeted sub-agent retrieval on one call exactly
// so a guarantee holds in both modes, and a clause added one path up would let
// an agentic sub-agent reach what the baseline excludes.
function liveLibraryFilter(slice: EntitledSlice, modelId: string, scope: string[] = []) {
  return and(
    eq(s.containers.projectId, slice.projectId),
    eq(s.containers.inLibrary, true),
    eq(s.containers.state, 'live'),
    groundingCodeSql(),
    eq(s.versions.isCurrent, true),
    eq(s.versionChunks.embeddingModelId, modelId),
    deliverableVisibleSql(slice),
    scope.length > 0 ? classificationScopeSql(scope) : undefined,
    // T-248 — the caller's optional narrowing, INTERSECTED into the same
    // `and()` as the wall's own clauses rather than applied around them. That
    // placement is the guarantee: a narrowing cannot be evaluated on rows the
    // pre-filter excluded, so it can only ever remove.
    attenuationSql(slice),
  );
}

// The attenuation as SQL, with the absent/empty distinction the type carries
// preserved: no narrowing adds no clause, and a narrowing to nothing admits
// nothing. Returning `undefined` for the empty case would silently turn the
// tightest possible narrowing into the loosest, which is finding F8 arriving
// as a bug instead of a design gap.
function attenuationSql(slice: EntitledSlice): SQL | undefined {
  const ids = reachableContainerIds(slice);
  if (ids === null) return undefined;
  if (ids.length === 0) return sql`false`;
  return inArray(s.containers.id, [...ids]);
}

// The admitting code's grounding rule, read LIVE (ADR-0013 §6). The scalar
// subquery is the code of the container's most recent ACCEPTING round — the act
// that admitted it to the library — and `is not false` is doing the load-bearing
// work at the null:
//
//   grounds = true   → grounds.
//   grounds = false  → excluded. The code admitted the deliverable and the
//                      project has said deliverables admitted that way are not
//                      to be relied on (a preliminary An, a partial sign-off).
//   NO accepting round at all → NULL → grounds. This is owner-added reference
//                      material (T-304: no work item, no cycle, no code). Its
//                      admission decision is the owner's own curation, which
//                      ADR-0011 has always treated as the trust decision; a
//                      clause requiring a grounding code would have silently
//                      emptied the reference half of every project library.
//
// NOT denormalised onto the container, and that is a measured decision rather
// than an omission — see the ticket record in plan-history.md for the number.
// ADR-0013 §6 permits caching WHICH code admitted a container (immutable) and
// forbids caching the answer: a super user turning a code off is making a claim
// about the very next query, and T-390's blast-radius count is the surface
// making that promise on this path's behalf.
function groundingCodeSql(): SQL {
  return sql`(
    select ac.grounds
      from rounds r
      join review_cycles rc on rc.id = r.cycle_id
      join acceptance_codes ac on ac.id = r.deliverable_code_id
     where rc.container_id = ${s.containers.id}
       and ac.is_accepting
     order by rc.launched_at desc, r.number desc
     limit 1
  ) is not false`;
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

// T-271/T-305 — the locator's raw materials, resolved in the same query as the
// passage; see locator-columns.ts for why they are computed in SQL and how
// page falls out of the same derivation as paragraph.
const chunkColumns = {
  chunkId: s.versionChunks.id,
  versionId: s.versionChunks.versionId,
  content: s.versionChunks.content,
  ...locatorColumns,
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
