// T-460 — saved views: a named filter over a register, never an access object.
//
// *In plain terms: a person saves the way they have set up a list — what they
// searched, which filters and sort, which columns they hid — under a name, and
// either keeps it to themselves or shares it with their own firm on the
// project. Applying a view changes what the list shows them, never what they
// may see.*
//
// 🔒 The organisation is the ceiling, in the read's own WHERE: a shared view is
// readable by its own organisation's participants on the project and by nobody
// else, so a view can never travel across the wall (ADR-0018's floor). The
// filter is stored as the screen sent it and never interpreted here — a stale
// key renders nothing on the screen rather than breaking a read.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, asc, eq, or } from 'drizzle-orm';
import { z } from 'zod';
import { createSavedViewBody, savedViewRegister } from '@infora/contracts';
import type { ApiError, ListSavedViewsResponse, SavedView } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { projectScope, resolveSlice } from './requester';
import type { AppEnv } from './requester';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const invalid = (c: Context) => c.json({ error: 'invalid' } satisfies ApiError, 400);
const conflict = (c: Context) => c.json({ error: 'conflict' } satisfies ApiError, 409);
const isUuid = (value: string) => z.uuid().safeParse(value).success;

export function savedViewRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);

  const read = async (viewId: string, requesterParticipantId: string): Promise<SavedView | null> => {
    const [row] = await deps.db
      .select({ view: s.savedViews, name: s.users.name })
      .from(s.savedViews)
      .innerJoin(s.participants, eq(s.savedViews.participantId, s.participants.id))
      .innerJoin(s.users, eq(s.participants.userId, s.users.id))
      .where(eq(s.savedViews.id, viewId))
      .limit(1);
    return row ? toSavedView(row.view, row.name, requesterParticipantId) : null;
  };

  app.get('/projects/:projectId/saved-views', project, async (c) => {
    const slice = c.get('slice');
    const register = savedViewRegister.safeParse(c.req.query('register'));
    const rows = await deps.db
      .select({ view: s.savedViews, name: s.users.name })
      .from(s.savedViews)
      .innerJoin(s.participants, eq(s.savedViews.participantId, s.participants.id))
      .innerJoin(s.users, eq(s.participants.userId, s.users.id))
      .where(
        and(
          eq(s.savedViews.projectId, slice.projectId),
          // the ceiling: one organisation's views, never another's
          eq(s.savedViews.organisationId, slice.organisationId),
          or(eq(s.savedViews.participantId, slice.participantId), eq(s.savedViews.shared, true)),
          register.success ? eq(s.savedViews.register, register.data) : undefined,
        ),
      )
      .orderBy(asc(s.savedViews.name));
    const items = rows.map((r) => toSavedView(r.view, r.name, slice.participantId));
    return c.json({ items } satisfies ListSavedViewsResponse);
  });

  app.post('/projects/:projectId/saved-views', project, async (c) => {
    const slice = c.get('slice');
    const body = createSavedViewBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);
    const [existing] = await deps.db
      .select({ id: s.savedViews.id })
      .from(s.savedViews)
      .where(
        and(
          eq(s.savedViews.projectId, slice.projectId),
          eq(s.savedViews.participantId, slice.participantId),
          eq(s.savedViews.register, body.data.register),
          eq(s.savedViews.name, body.data.name),
        ),
      )
      .limit(1);
    if (existing) return conflict(c);
    const [row] = await deps.db
      .insert(s.savedViews)
      .values({
        projectId: slice.projectId,
        organisationId: slice.organisationId,
        participantId: slice.participantId,
        register: body.data.register,
        name: body.data.name,
        filter: body.data.filter,
        shared: body.data.shared,
      })
      .returning({ id: s.savedViews.id });
    return c.json(await read(row!.id, slice.participantId), 201);
  });

  // the maker's act; an org admin's for a view shared within the organisation
  app.delete('/saved-views/:viewId', async (c) => {
    const viewId = c.req.param('viewId');
    if (!isUuid(viewId)) return notFound(c);
    const [row] = await deps.db.select().from(s.savedViews).where(eq(s.savedViews.id, viewId)).limit(1);
    if (!row) return notFound(c);
    const user = c.get('user');
    const slice = await resolveSlice(deps.db, user, row.projectId);
    // "not yours" and "not there" look the same from outside (principle 4)
    if (!slice || slice.organisationId !== row.organisationId) return notFound(c);
    const mine = row.participantId === slice.participantId;
    if (!mine && !(row.shared && user.orgRole === 'admin')) return notFound(c);
    await deps.db.delete(s.savedViews).where(eq(s.savedViews.id, viewId));
    return c.body(null, 204);
  });

  return app;
}

function toSavedView(
  row: typeof s.savedViews.$inferSelect,
  savedByName: string,
  requesterParticipantId: string,
): SavedView {
  return {
    id: row.id,
    projectId: row.projectId,
    register: row.register as SavedView['register'],
    name: row.name,
    filter: (row.filter ?? {}) as Record<string, unknown>,
    shared: row.shared,
    savedBy: { participantId: row.participantId, name: savedByName },
    mine: row.participantId === requesterParticipantId,
    createdAt: row.createdAt.toISOString(),
  };
}
