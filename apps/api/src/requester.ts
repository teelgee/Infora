// T-023 — API-boundary enforcement. Identity is established here and only
// here: the session cookie resolves to a user, and each scoped route resolves
// (user, resource) → EntitledSlice through the governance predicate before
// any handler runs. No endpoint accepts caller-supplied identity (contracts
// principle 3), and denial is the same 404 as nonexistence (principle 4) —
// including for a syntactically invalid id, which "does not exist" rather
// than erroring.
import type { Context, MiddlewareHandler } from 'hono';
import { getSignedCookie } from 'hono/cookie';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { ApiError } from '@infora/contracts';
import { resolveAccess } from '@infora/governance';
import type { EntitledSlice } from '@infora/governance';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { Router } from '@infora/model';
import { sessionCookie } from './auth';

export type UserRow = typeof s.users.$inferSelect;
export type AppEnv = { Variables: { user: UserRow; slice: EntitledSlice } };
export type AppDeps = { db: Db; sessionSecret: string; router: Router };

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const isUuid = (value: string) => z.uuid().safeParse(value).success;

/** Every request except login carries a session; 401 otherwise. */
export function sessionMiddleware(deps: {
  db: Db;
  sessionSecret: string;
}): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (c.req.path === '/auth/session') return next();
    const userId = await getSignedCookie(c, deps.sessionSecret, sessionCookie);
    if (!userId) return c.json({ error: 'unauthenticated' } satisfies ApiError, 401);
    const [user] = await deps.db.select().from(s.users).where(eq(s.users.id, userId)).limit(1);
    if (!user) return c.json({ error: 'unauthenticated' } satisfies ApiError, 401); // stale cookie
    c.set('user', user);
    await next();
  };
}

/** (user, project) → EntitledSlice via the wall predicate; null is deny. */
export async function resolveSlice(db: Db, user: UserRow, projectId: string): Promise<EntitledSlice | null> {
  if (!isUuid(projectId)) return null;
  const [project] = await db.select().from(s.projects).where(eq(s.projects.id, projectId)).limit(1);
  const [membership] = await db
    .select()
    .from(s.memberships)
    .where(and(eq(s.memberships.organisationId, user.organisationId), eq(s.memberships.projectId, projectId)))
    .limit(1);
  const [participant] = await db
    .select()
    .from(s.participants)
    // the LIVE interval only — closed intervals are history (ADR-0033, T-117);
    // the predicate re-checks removedAt as defense in depth
    .where(
      and(
        eq(s.participants.userId, user.id),
        eq(s.participants.projectId, projectId),
        isNull(s.participants.removedAt),
      ),
    )
    .limit(1);
  return resolveAccess({
    user: { id: user.id, organisationId: user.organisationId },
    project: project ? { id: project.id } : null,
    membership: membership ?? null,
    participant: participant ?? null,
  });
}

/**
 * Where a resource lives: its project, plus the owning organisation for
 * organisation-private resources (the skeleton's per-org project sandbox,
 * ADR-0018). Null when the resource does not exist — indistinguishable from
 * denial by design.
 */
type ResourceHome = { projectId: string; organisationId?: string } | null;
type ResourceResolver = (db: Db, id: string) => Promise<ResourceHome>;

export const resourceHomes = {
  conversation: async (db, id): Promise<ResourceHome> => {
    const [row] = await db
      .select({ projectId: s.conversations.projectId })
      .from(s.conversations)
      .where(eq(s.conversations.id, id))
      .limit(1);
    return row ?? null;
  },
  run: async (db, id): Promise<ResourceHome> => {
    const [row] = await db
      .select({ projectId: s.conversations.projectId })
      .from(s.runs)
      .innerJoin(s.conversations, eq(s.runs.conversationId, s.conversations.id))
      .where(eq(s.runs.id, id))
      .limit(1);
    return row ?? null;
  },
  workItem: async (db, id): Promise<ResourceHome> => {
    const [row] = await db
      .select({ projectId: s.workItems.projectId })
      .from(s.workItems)
      .where(eq(s.workItems.id, id))
      .limit(1);
    return row ?? null;
  },
  sandboxDocument: async (db, id): Promise<ResourceHome> => {
    const [row] = await db
      .select({ projectId: s.sandboxDocuments.projectId, organisationId: s.sandboxDocuments.organisationId })
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, id))
      .limit(1);
    return row ?? null;
  },
  sandboxComment: async (db, id): Promise<ResourceHome> => {
    // a comment lives where its document lives — the org-private sandbox
    const [row] = await db
      .select({ projectId: s.sandboxDocuments.projectId, organisationId: s.sandboxDocuments.organisationId })
      .from(s.sandboxComments)
      .innerJoin(s.sandboxDocuments, eq(s.sandboxComments.sandboxDocumentId, s.sandboxDocuments.id))
      .where(eq(s.sandboxComments.id, id))
      .limit(1);
    return row ?? null;
  },
  version: async (db, id): Promise<ResourceHome> => {
    const [row] = await db
      .select({ projectId: s.containers.projectId })
      .from(s.versions)
      .innerJoin(s.containers, eq(s.versions.containerId, s.containers.id))
      .where(eq(s.versions.id, id))
      .limit(1);
    return row ?? null;
  },
  suggestion: async (db, id): Promise<ResourceHome> => {
    const [row] = await db
      .select({ projectId: s.sandboxDocuments.projectId, organisationId: s.sandboxDocuments.organisationId })
      .from(s.suggestions)
      .innerJoin(s.sandboxDocuments, eq(s.suggestions.sandboxDocumentId, s.sandboxDocuments.id))
      .where(eq(s.suggestions.id, id))
      .limit(1);
    return row ?? null;
  },
} satisfies Record<string, ResourceResolver>;

/** Scope a route on its :projectId param. */
export function projectScope(deps: { db: Db }): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const slice = await resolveSlice(deps.db, c.get('user'), c.req.param('projectId') ?? '');
    if (!slice) return notFound(c);
    c.set('slice', slice);
    await next();
  };
}

/** Scope a route on a resource id param: resource → home project → slice. */
export function resourceScope(
  deps: { db: Db },
  param: string,
  resolver: ResourceResolver,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const id = c.req.param(param) ?? '';
    const home = isUuid(id) ? await resolver(deps.db, id) : null;
    if (!home) return notFound(c);
    const slice = await resolveSlice(deps.db, c.get('user'), home.projectId);
    if (!slice) return notFound(c);
    // organisation-private resources stay behind the wall inside the project
    if (home.organisationId !== undefined && home.organisationId !== slice.organisationId) {
      return notFound(c);
    }
    c.set('slice', slice);
    await next();
  };
}
