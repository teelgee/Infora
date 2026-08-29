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
import type { AssemblyCoverage, AssembledItem, EmbeddingUsage } from '@infora/contracts';
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
  /** T-272 — what the pre-filter admitted, for the coverage note */
  coverage: AssemblyCoverage;
};

/**
 * T-273 — the deliberate opt-in, and where it is NOT expressible.
 *
 * It is an option on this function and a construction argument on the
 * assembler — **never a field on `AssemblyRequest`** — which is T-248's shape
 * applied in the widening direction. The wall's signature guarantee is that no
 * parameter on the CALL widens what retrieval returns; a caller can only ever
 * be handed a gateway that already admits more, exactly as it can only be
 * handed one that already admits less. A request field would have been the
 * first widening parameter on that signature, and the next one would not have
 * needed an argument.
 *
 * What it relaxes is RECORD STATE and nothing else: the project clause, the
 * deliverable-visibility clause, the attenuation and the grounding-code clause
 * are untouched, so this cannot reach one row the requester could not already
 * have reached in a live revision. Withdrawn and rejected stay out — they are
 * not superseded, and ADR-0013 does not treat them alike.
 */
export type RetrievalOptions = {
  /** default false — exclusion is unchanged unless somebody asks */
  includeSuperseded?: boolean;
};

export async function groundedLibrary(
  deps: { db: Db; router: Router },
  slice: EntitledSlice,
  request: RetrievalRequest,
  options: RetrievalOptions = {},
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
  const [byCode, bySimilarity, candidates] = await withProjectScope(
    deps.db,
    slice.projectId,
    async (tx) =>
      [
        // lexical arm: deliverable codes named in the request beat similarity —
        // code is how this domain names documents (ADR-0022)
        codes.length > 0
          ? await liveChunksByCode(tx, slice, modelId, codes, scope, options)
          : [],
        await nearestLiveChunks(tx, slice, modelId, embeddings[0]!, scope, options),
        // T-272 — how many chunks the pre-filter admitted BEFORE ranking cut to
        // the top few. In the same transaction and against the same filter, so
        // the number describes the corpus this run could actually see rather
        // than the table; a count taken outside the scope would be a different
        // claim wearing the same name.
        await countLiveChunks(tx, slice, modelId, scope, options),
      ] as const,
  );

  const seen = new Set<string>();
  const items: AssembledItem[] = [];
  // T-272 — a code the question NAMED and the corpus did not have is the
  // sharpest kind of absence, because the asker believed the document was
  // there. Computed from the lexical arm's own result, so it cannot disagree
  // with what was searched.
  const matchedCodes = new Set(byCode.map((row) => row.documentReference.toUpperCase()));
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
      // T-272 — how the source reads. Derived from the same row, so it cannot
      // drift from the passage it describes.
      descriptor: {
        documentReference: row.documentReference,
        documentTitle: row.documentTitle,
        versionReference: row.versionReference,
        // false for everything the default filter returns; T-273's opt-in is
        // the only thing that can make it true
        superseded: row.containerState !== 'live' || row.isCurrent !== true,
      },
      // absent means NOT RANKED — the lexical arm matched on the document's own
      // reference, which is a different kind of match, not a score of zero
      ...(row.distance !== null && { relevance: relevanceOf(row.distance) }),
      content: row.content,
    });
  }
  return {
    items,
    // absent where the provider reported no usage — UNKNOWN, never zero
    ...(embedded.usage !== undefined && {
      embedding: { model: embedded.model, tokens: embedded.usage.tokens },
    }),
    coverage: {
      candidates,
      requestedReferences: codes,
      unmatchedReferences: codes.filter((code) => !matchedCodes.has(code)),
    },
  };
}

/**
 * Cosine DISTANCE (0 = identical) read as relevance (1 = identical).
 *
 * Clamped rather than trusted: pgvector returns distances in [0, 2] for
 * arbitrary vectors, and a negative relevance rendered beside a passage would
 * be a number nobody could interpret.
 */
function relevanceOf(distance: number): number {
  return Math.max(0, Math.min(1, 1 - distance));
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
function liveLibraryFilter(
  slice: EntitledSlice,
  modelId: string,
  scope: string[] = [],
  options: RetrievalOptions = {},
) {
  // T-273 — the opt-in relaxes exactly two clauses and no others. A container
  // whose record state is `superseded`, and a version that is no longer the
  // current one, become admissible; `withdrawn` and `rejected` do NOT, because
  // they are not superseded and ADR-0013 does not treat them alike. Every
  // access clause below is untouched, which is what makes this a widening of
  // record state rather than of reach.
  const superseded = options.includeSuperseded === true;
  return and(
    eq(s.containers.projectId, slice.projectId),
    eq(s.containers.inLibrary, true),
    superseded
      ? inArray(s.containers.state, ['live', 'superseded'])
      : eq(s.containers.state, 'live'),
    groundingCodeSql(),
    superseded ? undefined : eq(s.versions.isCurrent, true),
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
  // T-272 — how the source reads, selected in the SAME query as the passage.
  // A second lookup to decorate results would be a second path to the store
  // and would let the description drift from what was actually retrieved.
  // wrapped in `sql<>` rather than taken as bare column refs: the arms LEFT
  // JOIN the work item for its title, and drizzle widens a joined select's
  // inferred types to nullable. These columns come from the INNER-joined
  // container and version and cannot be null, so the wrapper states the fact
  // rather than making every reader defend against a case that cannot arise.
  documentReference: sql<string>`${s.containers.documentReference}`,
  containerState: sql<string>`${s.containers.state}`,
  isCurrent: sql<boolean>`${s.versions.isCurrent}`,
  versionReference: sql<string>`${s.versions.versionReference}`,
  ...locatorColumns,
};

// T-272 — the deliverable's title, which lives on its work item. LEFT joined,
// because the absence IS the marker for reference material (T-304): a loaded
// legacy document has no work item, and `null` here is that fact rather than a
// missing row.
const titleColumn = { documentTitle: s.workItems.title };

// The lexical arm matched on the document's own reference, so it has no
// distance. `null`, not zero: absent relevance means NOT RANKED, and a zero
// would read as "ranked, and badly".
const NO_DISTANCE = sql<number | null>`null::double precision`;

function liveChunksByCode(
  db: Db,
  slice: EntitledSlice,
  modelId: string,
  codes: string[],
  scope: string[] = [],
  options: RetrievalOptions = {},
) {
  return db
    .select({ ...chunkColumns, ...titleColumn, distance: NO_DISTANCE })
    .from(s.versionChunks)
    .innerJoin(s.versions, eq(s.versionChunks.versionId, s.versions.id))
    .innerJoin(s.containers, eq(s.versions.containerId, s.containers.id))
    .leftJoin(s.workItems, eq(s.workItems.containerId, s.containers.id))
    .where(
      and(
        liveLibraryFilter(slice, modelId, scope, options),
        inArray(sql<string>`upper(${s.containers.documentReference})`, codes),
      ),
    )
    .orderBy(asc(s.containers.documentReference), asc(s.versionChunks.chunkIndex));
}

/**
 * T-272 — how many chunks this requester's pre-filter admits, before ranking.
 *
 * The same `liveLibraryFilter` the two arms use, so the number cannot describe
 * a different corpus from the one that was searched. It is what makes an empty
 * answer legible: "4,000 passages were searched and none matched" and "your
 * library has nothing in it" look identical without it and mean opposite
 * things.
 */
async function countLiveChunks(
  db: Db,
  slice: EntitledSlice,
  modelId: string,
  scope: string[] = [],
  options: RetrievalOptions = {},
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(s.versionChunks)
    .innerJoin(s.versions, eq(s.versionChunks.versionId, s.versions.id))
    .innerJoin(s.containers, eq(s.versions.containerId, s.containers.id))
    .where(liveLibraryFilter(slice, modelId, scope, options));
  return row?.count ?? 0;
}

function nearestLiveChunks(
  db: Db,
  slice: EntitledSlice,
  modelId: string,
  query: number[],
  scope: string[] = [],
  options: RetrievalOptions = {},
) {
  const distance = cosineDistance(s.versionChunks.embedding, query);
  return db
    .select({ ...chunkColumns, ...titleColumn, distance: sql<number | null>`${distance}` })
    .from(s.versionChunks)
    .innerJoin(s.versions, eq(s.versionChunks.versionId, s.versions.id))
    .innerJoin(s.containers, eq(s.versions.containerId, s.containers.id))
    .leftJoin(s.workItems, eq(s.workItems.containerId, s.containers.id))
    .where(liveLibraryFilter(slice, modelId, scope, options))
    .orderBy(asc(distance), asc(s.versionChunks.id))
    .limit(GROUNDED_CHUNK_LIMIT);
}

/**
 * T-292 — the documents a grounded answer could draw on, for this requester,
 * right now.
 *
 * It exists because the composer's **Data sources** chip has to be able to say
 * *"none"* — a grounded answer over an empty scope is the single most
 * misleading state Ask can be in, and it looks identical to a confident one.
 * Saying it truthfully means the chip cannot be built from the library list:
 * membership in the library is necessary and no longer sufficient (the ADR-0011
 * rider — a live deliverable whose acceptance code does not ground is on that
 * list and out of the AI's reach), and a document with no chunks under the
 * deployment's pinned embedding model is indexed for nobody.
 *
 * So it runs `liveLibraryFilter` itself — **the same predicate both arms of the
 * gateway call use**, not a second definition of it. The chip therefore cannot
 * show a document the answer could not have used, and it cannot omit one the
 * answer could: the two statements are the same SQL.
 *
 * DISTINCT ON the container because the unit is the document, not the passage:
 * the chip counts things a person recognises.
 */
export async function groundingSources(
  db: Db,
  slice: EntitledSlice,
  modelId: string,
  options: RetrievalOptions = {},
): Promise<Array<{ containerId: string; documentReference: string; title: string | null }>> {
  // the chunk index is under row-level security and the policy fails CLOSED
  // (T-247), so this declares its project scope exactly as retrieval's own two
  // arms do. Without it every requester's chip would read "no sources in
  // scope" — the warning state firing on the policy rather than on the corpus,
  // which is the one wrong answer this chip must never give.
  const rows = await withProjectScope(db, slice.projectId, (tx) =>
    tx
      .selectDistinctOn([s.containers.id], {
        containerId: s.containers.id,
        documentReference: s.containers.documentReference,
        title: s.workItems.title,
      })
      .from(s.versionChunks)
      .innerJoin(s.versions, eq(s.versionChunks.versionId, s.versions.id))
      .innerJoin(s.containers, eq(s.versions.containerId, s.containers.id))
      .leftJoin(s.workItems, eq(s.workItems.containerId, s.containers.id))
      .where(liveLibraryFilter(slice, modelId, [], options))
      .orderBy(asc(s.containers.id)),
  );
  // a library-scope container always carries its coded reference; the column is
  // nullable for sandbox freeze series, which this filter never admits
  return rows.map((row) => ({ ...row, documentReference: row.documentReference ?? '' }));
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
