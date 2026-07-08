// T-086 — the library list (contracts §Library, the M2 read path): one row
// per container — the ruled list unit (2026-07-06) — with its current
// version. The same pre-filter retrieval grounds on (project scope,
// in_library, state = 'live', is_current) applied as SQL, so what the list
// shows and what grounding admits cannot drift apart; superseded/withdrawn
// are omitted here for the skeleton per the contract.
import { Hono } from 'hono';
import { and, asc, eq } from 'drizzle-orm';
import type { GetLibraryResponse, LibraryItem } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { projectScope } from './requester';
import type { AppEnv } from './requester';

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
          eq(s.containers.inLibrary, true),
          eq(s.containers.state, 'live'),
          eq(s.versions.isCurrent, true),
        ),
      )
      .orderBy(asc(s.containers.documentReference));
    const items = rows.map((row): LibraryItem => ({ ...row, state: 'live' }));
    return c.json({ items } satisfies GetLibraryResponse);
  });

  return app;
}
