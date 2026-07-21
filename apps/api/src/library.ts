// T-086 — the library list (contracts §Library, the M2 read path): one row
// per container — the ruled list unit (2026-07-06) — with its current
// version. The same pre-filter retrieval grounds on (project scope,
// in_library, state = 'live', is_current) applied as SQL, so what the list
// shows and what grounding admits cannot drift apart; superseded/withdrawn
// are omitted here for the skeleton per the contract.
import { Hono } from 'hono';
import { and, asc, eq } from 'drizzle-orm';
import type { ApiError, GetLibraryResponse, GetVersionResponse, LibraryItem } from '@infora/contracts';
import { deliverableVisibleSql as deliverableVisible } from '@infora/knowledge';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { projectScope, resourceHomes, resourceScope } from './requester';
import type { AppEnv } from './requester';

// Deliverable visibility (producer | owner | acknowledged+narrowed share) is
// the one SQL pre-filter shared with retrieval (ADR-0016 + ADR-0035 §5), so the
// list and grounding never drift; see @infora/knowledge deliverableVisibleSql.

export function libraryRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);

  app.get('/projects/:projectId/library', project, async (c) => {
    const slice = c.get('slice');
    const rows = await deps.db
      .select({
        containerId: s.containers.id,
        documentReference: s.containers.documentReference,
        currentVersionId: s.versions.id,
      })
      .from(s.containers)
      .innerJoin(s.versions, eq(s.versions.containerId, s.containers.id))
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
    const items = rows.map(
      // a library-scope container always carries a coded reference — null is
      // sandbox-scope only (ADR-0032)
      (row): LibraryItem => ({ ...row, documentReference: row.documentReference!, state: 'live' }),
    );
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

  return app;
}
