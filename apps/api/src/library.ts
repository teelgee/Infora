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
import { and, asc, eq, inArray } from 'drizzle-orm';
import type {
  ApiError,
  GetGroundingScopeResponse,
  GetLibraryResponse,
  GetVersionResponse,
  LibraryItem,
} from '@infora/contracts';
import { deliverableVisibleSql as deliverableVisible, groundingSources, TOKEN_LIMIT } from '@infora/knowledge';
import type { Router } from '@infora/model';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { admittingCodes, contextStateOf } from './context-state';
import { projectScope, resourceHomes, resourceScope } from './requester';
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
      .select({
        containerId: s.containers.id,
        documentReference: s.containers.documentReference,
        currentVersionId: s.versions.id,
        revision: s.versions.versionReference,
        issuedAt: s.versions.createdAt,
        metadata: s.containers.metadata,
        producerName: s.organisations.name,
        producingOrganisationId: s.containers.producingOrganisationId,
        // T-389 — a proposed withdrawal leaves the container LIVE, so it is
        // still on this list; the reason and its proposer come with it because
        // the answer the owner has to give is asked for on this screen.
        withdrawnReason: s.containers.withdrawnReason,
        withdrawnByParticipantId: s.containers.withdrawnByParticipantId,
        title: s.workItems.title,
        // T-304 — the absence IS the marker: a reference-material container has
        // no work item (the 2026-07-31 ruling), so the left join answering null
        // is the whole distinguishing fact. Nothing is stored and nothing has
        // to be kept in step.
        workItemId: s.workItems.id,
      })
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
    // T-388 — the third grounding condition, on the read where it is the ONLY
    // one a user could not otherwise see: this list is already filtered to
    // `in_library` and `live`, so a row that does not ground is one admitted
    // under a code the project does not ground on — live, listed, and out of
    // reach with nothing on screen saying so until now.
    const codes = await admittingCodes(deps.db, rows.map((r) => r.containerId));
    // T-389 — the proposers' names, batched. Every row on this list is `live`,
    // so a withdrawal reason present here can only be a PROPOSED one (T-384's
    // shape: reason + proposer recorded while the state is untouched).
    const proposerIds = [
      ...new Set(rows.map((r) => r.withdrawnByParticipantId).filter((x): x is string => x !== null)),
    ];
    const proposerRows = proposerIds.length
      ? await deps.db
          .select({ participantId: s.participants.id, name: s.users.name })
          .from(s.participants)
          .innerJoin(s.users, eq(s.participants.userId, s.users.id))
          .where(inArray(s.participants.id, proposerIds))
      : [];
    const proposerName = new Map(proposerRows.map((r) => [r.participantId, r.name]));
    const items = rows.map((row): LibraryItem => {
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
        state: 'live',
        kind: row.workItemId === null ? 'reference' : 'deliverable',
        contextState: contextStateOf(
          { inLibrary: true, state: 'live' },
          codes.get(row.containerId),
        ),
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
    return c.json({ items } satisfies GetLibraryResponse);
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
    return c.json({ ...row, documentReference: row.documentReference! } satisfies GetVersionResponse);
  });

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
    return c.json({
      sources,
      assemblyTokenBudget: TOKEN_LIMIT,
    } satisfies GetGroundingScopeResponse);
  });

  return app;
}
