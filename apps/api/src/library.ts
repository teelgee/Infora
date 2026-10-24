// T-086 — the library list (contracts §Library, the M2 read path): one row
// per container — the ruled list unit (2026-07-06) — with its current
// version. The same pre-filter retrieval grounds on (project scope,
// in_library, state = 'live', is_current) applied as SQL, so what the list
// shows and what grounding admits cannot drift apart; superseded/withdrawn
// are omitted here for the skeleton per the contract.
//
// T-388 — that "cannot drift apart" stopped being true of membership alone:
// since the ADR-0011 rider, a LIVE deliverable in the library can still be out
// of the AI's reach, when the acceptance code that admitted it is one the
// project does not ground on. That row belongs on this list — it is a real
// deliverable and it did pass review — so what changes is that it now carries
// its context state and the surface badges it, rather than the list quietly
// standing for two different things.
import { Hono } from 'hono';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type {
  ApiError,
  GetGroundingScopeResponse,
  GetLibraryResponse,
  GetLibrarySearchResponse,
  GetPassageResponse,
  GetReaderDocumentResponse,
  GetVersionResponse,
  LibraryItem,
  LibrarySearchItem,
  ScopePreviewResponse,
} from '@infora/contracts';
import { librarySearchQuery, scopePreviewBody } from '@infora/contracts';
import { deliverableVisibleSql as deliverableVisible, groundingSources, reachCounts, readChunkPassage, readCurrencies, searchLibraryRows, TOKEN_LIMIT } from '@infora/knowledge';
import type { Router } from '@infora/model';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { EntitledSlice } from '@infora/governance';
import { admittingCodes, contextStateOf } from './context-state';
import { projectScope, resourceHomes, resourceScope } from './requester';
import { resolveScope, scopeProblem } from './scope';
import type { AppEnv } from './requester';

// Deliverable visibility (producer | owner | acknowledged+narrowed share) is
// the one SQL pre-filter shared with retrieval (ADR-0016 + ADR-0035 §5), so the
// list and grounding never drift; see @infora/knowledge deliverableVisibleSql.

// `router` is REQUIRED, deliberately (review, 2026-08-29): an optional router
// made "no router bound" render as "No sources in scope" — the zero-source
// warning firing on configuration rather than on the corpus, which is the
// exact failure T-292's scoping near-miss caught one level down. The one
// caller (app.ts) always has a router; a composition that lacks one should
// fail to compile, not answer confidently about an empty index.
export function libraryRoutes(deps: { db: Db; router: Router }) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);

  app.get('/projects/:projectId/library', project, async (c) => {
    const slice = c.get('slice');
    const rows = await deps.db
      .select(libraryRowSelect)
      .from(s.containers)
      .innerJoin(s.versions, eq(s.versions.containerId, s.containers.id))
      .innerJoin(s.organisations, eq(s.organisations.id, s.containers.producingOrganisationId))
      .leftJoin(s.workItems, eq(s.workItems.containerId, s.containers.id))
      .where(
        and(
          eq(s.containers.projectId, slice.projectId),
          // freeze-series (sandbox-scope) containers are org-private working
          // machinery, never library rows (ADR-0032, T-114)
          eq(s.containers.scope, 'library'),
          eq(s.containers.inLibrary, true),
          eq(s.containers.state, 'live'),
          eq(s.versions.isCurrent, true),
          deliverableVisible(slice),
        ),
      )
      .orderBy(asc(s.containers.documentReference));
    const items = (await toLibraryItems(deps.db, rows)).map((item): LibraryItem => ({ ...item, state: 'live' }));
    return c.json({ items } satisfies GetLibraryResponse);
  });

  // T-483 — the document page for a reader. *Plainly: a person who may read a
  // document (a standard, another firm's shared report) can open its page; this
  // is the one read that tells the page what the document is. It tells them
  // what the library list already tells them and nothing from the plan.*
  // Any record state: a superseded or withdrawn document someone once cited
  // must still open. Everything else answers the usual silent absence.
  app.get('/containers/:containerId/reader', resourceScope(deps, 'containerId', resourceHomes.container), async (c) => {
    const slice = c.get('slice');
    const row = await readerRow(deps.db, slice, c.req.param('containerId'));
    if (row === null) return c.json({ error: 'not_found' } satisfies ApiError, 404);
    const [item] = await toLibraryItems(deps.db, [row]);
    return c.json({
      ...item!,
      state: row.state,
      withdrawnReason: row.withdrawnReason,
    } satisfies GetReaderDocumentResponse);
  });

  // T-459 — the register's search and paging. *Plainly: one box finds a
  // document by its code, its title or what it says, and the list comes back
  // a page at a time, sortable and filterable — so the screens stop loading
  // every row and a person searches the same index the AI reads.*
  //
  // The vector arm is a `min(distance)` over the current version's chunks
  // under the pinned embedding model, computed per row inside the same
  // statement as the access predicate (ADR-0022/0024's one-query rule), so a
  // row the wall excludes is never scored. The lexical arm is the reference,
  // the title and the description. A short query (under three characters)
  // skips the embedding call: it is a code prefix, not a meaning.
  app.get('/projects/:projectId/library/search', project, async (c) => {
    const slice = c.get('slice');
    const parsed = librarySearchQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'invalid' } satisfies ApiError, 400);
    const p = parsed.data;
    const q = p.q && p.q.length > 0 ? p.q : null;
    const modelId = deps.router.embeddingModel.id;
    let vector: number[] | null = null;
    if (q !== null && q.length >= 3) {
      const embedded = await deps.router.embed([q], 'query');
      vector = embedded.embeddings[0] ?? null;
    }
    const { rows, total } = await searchLibraryRows(deps.db, slice, {
      q,
      vector,
      modelId,
      state: p.state,
      kind: p.kind,
      discipline: p.discipline,
      statusCode: p.statusCode,
      producerId: p.producerId,
      needsConfirming: p.currency === 'needs_confirming',
      sort: p.sort,
      direction: p.direction,
      page: p.page,
      pageSize: p.pageSize,
    });
    const mapped = await toLibraryItems(deps.db, rows);
    const items = mapped.map((item, i): LibrarySearchItem => {
      const row = rows[i]!;
      const match: LibrarySearchItem['match'] =
        q === null
          ? 'none'
          : row.lexical <= 1 || row.documentReference!.toLowerCase().includes(q.toLowerCase())
            ? 'reference'
            : (row.title ?? '').toLowerCase().includes(q.toLowerCase())
              ? 'title'
              : 'content';
      return { ...item, state: row.state, match };
    });
    return c.json({ items, total, page: p.page, pageSize: p.pageSize, q } satisfies GetLibrarySearchResponse);
  });

  // T-094 (2026-07-09): the cited source, readable — a citation chip opens
  // the version it names. Superseded/withdrawn stay readable (the immutable
  // record's citations must resolve) with their state carried to badge;
  // grounding is untouched — retrieval's pre-filters admit none of this.
  app.get('/versions/:versionId', resourceScope(deps, 'versionId', resourceHomes.version), async (c) => {
    const slice = c.get('slice');
    const [row] = await deps.db
      .select({
        versionId: s.versions.id,
        containerId: s.versions.containerId,
        documentReference: s.containers.documentReference,
        versionReference: s.versions.versionReference,
        content: s.versions.content,
        containerState: s.containers.state,
        isCurrent: s.versions.isCurrent,
      })
      .from(s.versions)
      .innerJoin(s.containers, eq(s.versions.containerId, s.containers.id))
      // library-scope only: a freeze-series version is org-private (ADR-0032)
      // and gets its own org-scoped read with Slice A's internal cycle (T-125);
      // per-deliverable visibility applies here exactly as on the list (T-119)
      .where(
        and(
          eq(s.versions.id, c.req.param('versionId')),
          eq(s.containers.scope, 'library'),
          deliverableVisible(slice),
        ),
      )
      .limit(1);
    if (!row) return c.json({ error: 'not_found' } satisfies ApiError, 404);
    // T-473 — read now, so the source view says what the citation's chip says
    const currency = (await readCurrencies(deps.db, [row.containerId])).get(row.containerId) ?? null;
    return c.json({ ...row, documentReference: row.documentReference!, currency } satisfies GetVersionResponse);
  });

  // T-468 — the passage a citation recorded, read by id. Guarded exactly like
  // the version read above; the chunk must belong to the version in the path.
  // It never searches: see readChunkPassage.
  app.get(
    '/versions/:versionId/passages/:chunkId',
    resourceScope(deps, 'versionId', resourceHomes.version),
    async (c) => {
      const slice = c.get('slice');
      const versionId = c.req.param('versionId');
      const chunkId = c.req.param('chunkId');
      const [row] = await deps.db
        .select({
          versionId: s.versions.id,
          containerId: s.versions.containerId,
          documentReference: s.containers.documentReference,
          documentTitle: s.containers.title,
          versionReference: s.versions.versionReference,
          containerState: s.containers.state,
          isCurrent: s.versions.isCurrent,
        })
        .from(s.versions)
        .innerJoin(s.containers, eq(s.versions.containerId, s.containers.id))
        .where(
          and(eq(s.versions.id, versionId), eq(s.containers.scope, 'library'), deliverableVisible(slice)),
        )
        .limit(1);
      if (!row) return c.json({ error: 'not_found' } satisfies ApiError, 404);
      // a chunk id is a uuid; anything else cannot name a row (and would make
      // Postgres throw rather than answer)
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chunkId)) {
        return c.json({ error: 'not_found' } satisfies ApiError, 404);
      }
      const chunk = await readChunkPassage(deps.db, slice.projectId, versionId, chunkId);
      if (chunk === 'other_version') return c.json({ error: 'not_found' } satisfies ApiError, 404);
      const locator = chunk?.locator ?? null;
      const currency = (await readCurrencies(deps.db, [row.containerId])).get(row.containerId) ?? null;
      return c.json({
        ...row,
        documentReference: row.documentReference!,
        currency,
        chunkId,
        passage:
          chunk === null
            ? null
            : {
                chunkIndex: chunk.chunkIndex,
                // the unresolved case (no locator) degrades to the chunker's text,
                // flagged by the absence of page/paragraph/span — never a guess
                verbatim: locator?.verbatim ?? chunk.content,
                ...(locator?.page !== undefined && { page: locator.page }),
                ...(locator !== null && { paragraph: locator.paragraph, span: locator.span }),
              },
        held: chunk !== null,
      } satisfies GetPassageResponse);
    },
  );

  // T-292 — what the composer's Data sources and Context chips read.
  //
  // It is NOT the library list one filter along. Membership in the library is
  // necessary and no longer sufficient (the ADR-0011 rider), and a document
  // with no chunks under this deployment's pinned embedding model is indexed
  // for nobody — so the list and the grounding scope are genuinely two
  // questions, and answering the second with the first is how a chip ends up
  // naming a document the answer could not have used. `groundingSources` runs
  // the gateway's own `liveLibraryFilter`, so the two cannot drift.
  //
  // The token budget rides the same response because both chips are one read:
  // a second call for one constant would be a second round trip for the
  // composer to render.
  app.get('/projects/:projectId/grounding-scope', project, async (c) => {
    const slice = c.get('slice');
    const sources = await groundingSources(deps.db, slice, deps.router.embeddingModel.id);
    // T-470 — how many of THESE documents carry each term: counted over the
    // list just built, so the picker's numbers are visible documents only and
    // the wall is not applied a second, different way.
    const termCounts: Record<string, number> = {};
    if (sources.length > 0) {
      const placed = await deps.db
        .select({ containerId: s.containerClassifications.containerId, termId: s.containerClassifications.termId })
        .from(s.containerClassifications)
        .where(inArray(s.containerClassifications.containerId, sources.map((source) => source.containerId)));
      for (const row of placed) termCounts[row.termId] = (termCounts[row.termId] ?? 0) + 1;
    }
    return c.json({
      sources,
      assemblyTokenBudget: TOKEN_LIMIT,
      termCounts,
    } satisfies GetGroundingScopeResponse);
  });

  // T-470 — what a scope would reach, before anything is asked. It runs the
  // count `POST /runs` takes before it spends (`reachCounts`, T-469) and
  // nothing else: no retrieval, no model call. The wall is in the count, so a
  // term or document the requester cannot see adds nothing and is never named.
  app.post('/projects/:projectId/scope-preview', project, async (c) => {
    const parsed = scopePreviewBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(
        {
          error: 'invalid',
          detail: scopeProblem(parsed.error) ?? 'the body may carry a scope and nothing else',
        } satisfies ApiError,
        400,
      );
    }
    const slice = c.get('slice');
    const resolved = await resolveScope(deps.db, slice, parsed.data.scope);
    if (!resolved.ok) {
      return resolved.status === 404
        ? c.json({ error: 'not_found' } satisfies ApiError, 404)
        : c.json({ error: 'invalid', detail: resolved.detail ?? 'the scope could not be used' } satisfies ApiError, 400);
    }
    const reach = await reachCounts(deps, slice, resolved.scope);
    return c.json(reach satisfies ScopePreviewResponse);
  });

  return app;
}

/**
 * T-483 — the one question the document page asks of a person who is not on the
 * plan row: may this person read this document? A library-scope, in-library
 * container of the slice's project that passes the same visibility rule the
 * list, search, grounding and citations apply — in ANY record state. Returns
 * the library-shaped row (with its state), or null. The reader read and the
 * state-changes read both call this, so they cannot disagree.
 */
export async function readerRow(
  db: Db,
  slice: EntitledSlice,
  containerId: string,
): Promise<(LibraryRow & { state: 'live' | 'superseded' | 'withdrawn' | 'rejected' }) | null> {
  const [row] = await db
    .select({ ...libraryRowSelect, state: s.containers.state })
    .from(s.containers)
    .innerJoin(s.versions, eq(s.versions.containerId, s.containers.id))
    .innerJoin(s.organisations, eq(s.organisations.id, s.containers.producingOrganisationId))
    .leftJoin(s.workItems, eq(s.workItems.containerId, s.containers.id))
    .where(
      and(
        eq(s.containers.id, containerId),
        eq(s.containers.projectId, slice.projectId),
        eq(s.containers.scope, 'library'),
        eq(s.containers.inLibrary, true),
        eq(s.versions.isCurrent, true),
        deliverableVisible(slice),
      ),
    )
    .limit(1);
  return row ?? null;
}

// T-459 — the row shape the list and the search share, and the mapping to the
// wire. One definition, so the two reads cannot describe a row differently.
const libraryRowSelect = {
  containerId: s.containers.id,
  documentReference: s.containers.documentReference,
  currentVersionId: s.versions.id,
  revision: s.versions.versionReference,
  issuedAt: s.versions.createdAt,
  metadata: s.containers.metadata,
  producerName: s.organisations.name,
  producingOrganisationId: s.containers.producingOrganisationId,
  // T-389 — a proposed withdrawal leaves the container LIVE, so it is still on
  // the list; the reason and its proposer come with it because the answer the
  // owner has to give is asked for on this screen.
  withdrawnReason: s.containers.withdrawnReason,
  withdrawnByParticipantId: s.containers.withdrawnByParticipantId,
  // T-462 — a deliverable's title is its work item's; reference material's is its own (containers.title)
  title: sql<string | null>`coalesce(${s.workItems.title}, ${s.containers.title})`,
  // T-304 — the absence IS the marker: a reference-material container has no
  // work item (the 2026-07-31 ruling), so the left join answering null is the
  // whole distinguishing fact. Nothing is stored and nothing has to be kept in step.
  workItemId: s.workItems.id,
  // T-472 — a confirmed reference file whose text could not be read: held, never read by a run
  notCitable: s.versions.notCitable,
};

type LibraryRow = {
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
  notCitable: boolean;
  /** the record state on a searched row; the live list has none and reads as live */
  state?: 'live' | 'superseded' | 'withdrawn' | 'rejected';
};

async function toLibraryItems(db: Db, rows: LibraryRow[]): Promise<Array<Omit<LibraryItem, 'state'>>> {
  // T-388 — the third grounding condition, on the read where it is the ONLY
  // one a user could not otherwise see: a live row that does not ground is one
  // admitted under a code the project does not ground on — live, listed, and
  // out of reach with nothing on screen saying so unless the badge does.
  const codes = await admittingCodes(db, rows.map((r) => r.containerId));
  // T-389 — the proposers' names, batched. On the live list a withdrawal reason
  // can only be a PROPOSED one (T-384's shape: reason + proposer recorded while
  // the state is untouched); on a searched record of any state it may be the act.
  const proposerIds = [
    ...new Set(rows.map((r) => r.withdrawnByParticipantId).filter((x): x is string => x !== null)),
  ];
  const proposerRows = proposerIds.length
    ? await db
        .select({ participantId: s.participants.id, name: s.users.name })
        .from(s.participants)
        .innerJoin(s.users, eq(s.participants.userId, s.users.id))
        .where(inArray(s.participants.id, proposerIds))
    : [];
  const proposerName = new Map(proposerRows.map((r) => [r.participantId, r.name]));
  // T-472 — why a file is not citable is the extractor's reason, kept on the
  // intake row that admitted it (an operator-loaded file is never not citable)
  const unreadable = rows.filter((r) => r.notCitable).map((r) => r.containerId);
  const reasonRows = unreadable.length
    ? await db
        .select({ containerId: s.referenceIntake.containerId, reason: s.referenceIntake.textStatus })
        .from(s.referenceIntake)
        .where(inArray(s.referenceIntake.containerId, unreadable))
    : [];
  const notCitableReason = new Map(reasonRows.map((r) => [r.containerId, r.reason]));
  // T-473 — currency, read now (never stored as a state); null on a deliverable
  const currencies = await readCurrencies(db, rows.map((r) => r.containerId));
  return rows.map((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
    return {
      containerId: row.containerId,
      // a library-scope container always carries a coded reference — null is
      // sandbox-scope only (ADR-0032)
      documentReference: row.documentReference!,
      currentVersionId: row.currentVersionId,
      title: str(row.title),
      revision: row.revision,
      suitability: str(meta['suitability']),
      discipline: str(meta['discipline']),
      producerName: row.producerName,
      issuedAt: row.issuedAt.toISOString(),
      kind: row.workItemId === null ? 'reference' : 'deliverable',
      notCitable: row.notCitable,
      notCitableReason: row.notCitable ? (notCitableReason.get(row.containerId) ?? null) : null,
      currency: currencies.get(row.containerId) ?? null,
      contextState: contextStateOf({ inLibrary: true, state: row.state ?? 'live' }, codes.get(row.containerId)),
      producingOrganisationId: row.producingOrganisationId,
      withdrawalProposal:
        row.withdrawnReason !== null && row.withdrawnByParticipantId !== null
          ? {
              participantId: row.withdrawnByParticipantId,
              name: proposerName.get(row.withdrawnByParticipantId) ?? '',
              reason: row.withdrawnReason,
            }
          : null,
    };
  });
}
