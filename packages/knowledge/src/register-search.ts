// T-459 — the register's search: one row per container, paged, sorted,
// filtered, and — when a query is given — ranked by the same index the agent
// grounds on.
//
// *In plain terms: a person types a code, a title or a phrase into the
// library's search box and gets documents back, in the order a document
// controller would expect: the exact code first, then codes that start that
// way, then titles and descriptions that mention it, then documents whose
// text says it. The last of those is the agent's own index, read under the
// same access rule the agent reads it under.*
//
// It lives in this package and not in the API because the grounding index
// (`version_chunks`) is read only here (the source rule): the vector arm is a
// `min(cosine distance)` over the current version's chunks under the pinned
// embedding model, computed per row inside the same statement as the wall's
// visibility predicate — ADR-0022/0024's one-query rule — so a row the wall
// excludes is never scored. The lexical arm is the reference, the title and the
// description. Nothing here widens reach: every clause intersects the wall's.
import { and, asc, cosineDistance, desc, eq, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { schema as s, withProjectScope } from '@infora/db';
import type { Db } from '@infora/db';
import type { EntitledSlice } from '@infora/governance';
import { deliverableVisibleSql } from './visibility';

export type RegisterSearchParams = {
  /** the person's words; null lists without ranking */
  q: string | null;
  /** the query's embedding under `modelId`, or null when the query is too short to mean anything */
  vector: number[] | null;
  modelId: string;
  state: 'live' | 'superseded' | 'withdrawn' | 'rejected' | 'any';
  kind: 'deliverable' | 'reference' | 'any';
  discipline?: string | undefined;
  statusCode?: string | undefined;
  producerId?: string | undefined;
  sort: 'relevance' | 'reference' | 'title' | 'issued' | 'producer';
  direction: 'asc' | 'desc';
  page: number;
  pageSize: number;
};

export type RegisterSearchRow = {
  containerId: string;
  documentReference: string | null;
  currentVersionId: string;
  revision: string;
  issuedAt: Date;
  metadata: unknown;
  producerName: string;
  producingOrganisationId: string;
  withdrawnReason: string | null;
  withdrawnByParticipantId: string | null;
  title: string | null;
  workItemId: string | null;
  /** T-472 — the current version is a confirmed reference file whose text could not be read */
  notCitable: boolean;
  state: 'live' | 'superseded' | 'withdrawn' | 'rejected';
  /** 0 exact code · 1 code prefix · 2 reference, title or description mention · 3 none */
  lexical: number;
  /** the nearest passage's cosine distance, or null (no vector, or no chunks under this model) */
  nearest: number | null;
};

/** a semantic match admits a row when its nearest passage is within this distance */
const CONTENT_MATCH_DISTANCE = 0.5;

export async function searchLibraryRows(
  db: Db,
  slice: EntitledSlice,
  p: RegisterSearchParams,
): Promise<{ rows: RegisterSearchRow[]; total: number }> {
  const q = p.q;
  const pattern = patternOf(q);
  const nearest = nearestDistance(p.vector, p.modelId);
  const lexical = lexicalRank(q, pattern);
  const where = and(
    eq(s.containers.projectId, slice.projectId),
    // freeze-series (sandbox-scope) containers are org-private working
    // machinery, never register rows (ADR-0032)
    eq(s.containers.scope, 'library'),
    eq(s.containers.inLibrary, true),
    p.state === 'any' ? undefined : eq(s.containers.state, p.state),
    eq(s.versions.isCurrent, true),
    deliverableVisibleSql(slice),
    p.kind === 'deliverable' ? isNotNull(s.workItems.id) : p.kind === 'reference' ? isNull(s.workItems.id) : undefined,
    p.discipline ? sql`${s.containers.metadata}->>'discipline' = ${p.discipline}` : undefined,
    p.statusCode ? sql`${s.containers.metadata}->>'suitability' = ${p.statusCode}` : undefined,
    p.producerId ? eq(s.containers.producingOrganisationId, p.producerId) : undefined,
    pattern === null
      ? undefined
      : or(
          ilike(s.containers.documentReference, pattern),
          ilike(s.workItems.title, pattern),
          ilike(s.containers.title, pattern),
          ilike(s.containers.description, pattern),
          p.vector === null ? sql`false` : sql`${nearest} < ${CONTENT_MATCH_DISTANCE}`,
        ),
  );
  const dir = p.direction === 'desc' ? desc : asc;
  const order =
    p.sort === 'reference'
      ? [dir(s.containers.documentReference)]
      : p.sort === 'title'
        ? [dir(sql`coalesce(${s.workItems.title}, ${s.containers.title})`), asc(s.containers.documentReference)]
        : p.sort === 'issued'
          ? [dir(s.versions.createdAt), asc(s.containers.documentReference)]
          : p.sort === 'producer'
            ? [dir(s.organisations.name), asc(s.containers.documentReference)]
            : q === null
              ? [asc(s.containers.documentReference)]
              : p.vector === null
                // a one- or two-letter query has no embedding: ordering by the
                // null the distance arm then yields is a Postgres error
                // ("non-integer constant in ORDER BY") — found in review of
                // T-471 in the e2e server's log, hit by the palette and the
                // scope control on the first keystrokes
                ? [asc(lexical), asc(s.containers.documentReference)]
                : [asc(lexical), sql`${nearest} asc nulls last`, asc(s.containers.documentReference)];
  // the chunk index is under row-level security and the policy fails closed
  // (T-247): the statement declares its project scope as retrieval's own arms
  // do, or the vector arm would see no chunks and every content match would
  // silently be "nothing"
  const [[counted], rows] = await withProjectScope(db, slice.projectId, (tx) =>
    Promise.all([
      tx
        .select({ total: sql<number>`count(*)::int` })
        .from(s.containers)
        .innerJoin(s.versions, eq(s.versions.containerId, s.containers.id))
        .innerJoin(s.organisations, eq(s.organisations.id, s.containers.producingOrganisationId))
        .leftJoin(s.workItems, eq(s.workItems.containerId, s.containers.id))
        .where(where),
      tx
        .select({
          containerId: s.containers.id,
          documentReference: s.containers.documentReference,
          currentVersionId: s.versions.id,
          revision: s.versions.versionReference,
          issuedAt: s.versions.createdAt,
          metadata: s.containers.metadata,
          producerName: s.organisations.name,
          producingOrganisationId: s.containers.producingOrganisationId,
          withdrawnReason: s.containers.withdrawnReason,
          withdrawnByParticipantId: s.containers.withdrawnByParticipantId,
          // T-462 — reference material carries its own title on the container
          title: sql<string | null>`coalesce(${s.workItems.title}, ${s.containers.title})`,
          workItemId: s.workItems.id,
          notCitable: s.versions.notCitable,
          state: s.containers.state,
          lexical,
          nearest,
        })
        .from(s.containers)
        .innerJoin(s.versions, eq(s.versions.containerId, s.containers.id))
        .innerJoin(s.organisations, eq(s.organisations.id, s.containers.producingOrganisationId))
        .leftJoin(s.workItems, eq(s.workItems.containerId, s.containers.id))
        .where(where)
        .orderBy(...order)
        .limit(p.pageSize)
        .offset((p.page - 1) * p.pageSize),
    ]),
  );
  return {
    rows: rows.map((r) => ({ ...r, lexical: Number(r.lexical), nearest: r.nearest === null ? null : Number(r.nearest) })),
    total: counted?.total ?? 0,
  };
}

/** the ILIKE pattern for a person's words, with the wildcards they typed escaped */
function patternOf(q: string | null): string | null {
  return q === null ? null : `%${q.replace(/[%_]/g, (ch) => `\\${ch}`)}%`;
}
/** the vector arm: the current version's nearest passage under the pinned model, or null without a query vector */
function nearestDistance(vector: number[] | null, modelId: string): SQL<number | null> {
  return vector === null
    ? sql<number | null>`null`
    : sql<number | null>`(select min(${cosineDistance(s.versionChunks.embedding, vector)}) from ${s.versionChunks} where ${s.versionChunks.versionId} = ${s.versions.id} and ${s.versionChunks.embeddingModelId} = ${modelId})`;
}
/** the lexical arm: 0 exact code · 1 code prefix · 2 reference, title or description mention · 3 none */
function lexicalRank(q: string | null, pattern: string | null): SQL<number> {
  return pattern === null
    ? sql<number>`3`
    : sql<number>`case
          when upper(${s.containers.documentReference}) = upper(${q}) then 0
          when upper(${s.containers.documentReference}) like upper(${q} || '%') then 1
          when ${s.containers.documentReference} ilike ${pattern} or ${s.workItems.title} ilike ${pattern} or ${s.containers.title} ilike ${pattern} or ${s.containers.description} ilike ${pattern} then 2
          else 3 end`;
}

/** T-462 — the plan's search: the same two arms over the plan's reach. The plan
 * is every library-scope container of the project for the owner and the
 * organisation's own for anyone else (plan.ts's rule), published or not — so
 * the version join is outer (a planned row has no version yet and must still
 * be found by its code or title) and no visibility pre-filter narrows it beyond
 * the producer rule. Returns the ids in rank order and the total, and the
 * caller assembles its rows: the plan row's shape is plan.ts's to make. */
export async function searchPlanContainerIds(
  db: Db,
  p: {
    projectId: string;
    /** the organisation whose rows alone are in reach — null for the owner, who reaches every row */
    producerOrganisationId: string | null;
    q: string;
    vector: number[] | null;
    modelId: string;
    sort: 'relevance' | 'reference' | 'title' | 'state';
    direction: 'asc' | 'desc';
    state: 'live' | 'superseded' | 'withdrawn' | 'rejected' | 'any';
    kind: 'deliverable' | 'reference' | 'any';
    producerId?: string | undefined;
    page: number;
    pageSize: number;
  },
): Promise<{ ids: string[]; total: number }> {
  const pattern = patternOf(p.q);
  const nearest = nearestDistance(p.vector, p.modelId);
  const lexical = lexicalRank(p.q, pattern);
  const where = and(
    eq(s.containers.projectId, p.projectId),
    eq(s.containers.scope, 'library'),
    p.producerOrganisationId === null ? undefined : eq(s.containers.producingOrganisationId, p.producerOrganisationId),
    p.state === 'any' ? undefined : eq(s.containers.state, p.state),
    p.kind === 'deliverable' ? isNotNull(s.workItems.id) : p.kind === 'reference' ? isNull(s.workItems.id) : undefined,
    p.producerId ? eq(s.containers.producingOrganisationId, p.producerId) : undefined,
    or(
      ilike(s.containers.documentReference, pattern!),
      ilike(s.workItems.title, pattern!),
      ilike(s.containers.title, pattern!),
      ilike(s.containers.description, pattern!),
      p.vector === null ? sql`false` : sql`${nearest} < ${CONTENT_MATCH_DISTANCE}`,
    ),
  );
  const dir = p.direction === 'desc' ? desc : asc;
  const order =
    p.sort === 'reference'
      ? [dir(s.containers.documentReference)]
      : p.sort === 'title'
        ? [dir(sql`coalesce(${s.workItems.title}, ${s.containers.title})`), asc(s.containers.documentReference)]
        : p.sort === 'state'
          ? [dir(s.containers.state), asc(s.containers.documentReference)]
          : p.vector === null
            ? [asc(lexical), asc(s.containers.documentReference)] // see searchLibraryRows
            : [asc(lexical), sql`${nearest} asc nulls last`, asc(s.containers.documentReference)];
  const [[counted], rows] = await withProjectScope(db, p.projectId, (tx) =>
    Promise.all([
      tx
        .select({ total: sql<number>`count(*)::int` })
        .from(s.containers)
        .leftJoin(s.versions, and(eq(s.versions.containerId, s.containers.id), eq(s.versions.isCurrent, true)))
        .leftJoin(s.workItems, eq(s.workItems.containerId, s.containers.id))
        .where(where),
      tx
        .select({ id: s.containers.id })
        .from(s.containers)
        .leftJoin(s.versions, and(eq(s.versions.containerId, s.containers.id), eq(s.versions.isCurrent, true)))
        .leftJoin(s.workItems, eq(s.workItems.containerId, s.containers.id))
        .where(where)
        .orderBy(...order)
        .limit(p.pageSize)
        .offset((p.page - 1) * p.pageSize),
    ]),
  );
  return { ids: rows.map((r) => r.id), total: counted?.total ?? 0 };
}
