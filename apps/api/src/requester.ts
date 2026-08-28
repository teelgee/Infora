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
import type { LensRegistry } from '@infora/lenses';
import type { WorkflowRegistry } from '@infora/workflows';
import type { Classifier, WorkerRegistry } from '@infora/capabilities';
import type { ModelRates, Router } from '@infora/model';
import { sessionCookie } from './auth';
import { DEFAULT_SESSION_POLICY, resolveSession } from './sessions';
import type { SessionPolicy } from './sessions';

export type UserRow = typeof s.users.$inferSelect;
// T-251 — `sessionId` rides the context so a later step can re-check the
// session it started under (T-252's re-resolution) without re-reading a cookie
// that is no longer in scope by then.
export type AppEnv = { Variables: { user: UserRow; slice: EntitledSlice; sessionId: string } };
export type AppDeps = {
  db: Db;
  sessionSecret: string;
  router: Router;
  /** CORS allowlist (T-216); defaults to the local dev/e2e web origins. */
  allowedOrigins?: string[];
  /** Throttle overrides (T-217); defaults: login 10/min/IP, runs 30/min/user. */
  rateLimits?: { loginPerMinute?: number; runsPerMinute?: number };
  /**
   * T-299 — the Lens registry for this deployment, loaded and validated once
   * at composition. Optional so an existing caller keeps working: absent means
   * no Lens is offered, and every `lensId` on a request is a 400. It is not
   * defaulted to the shipped set here, because which environment this is
   * decides whether drafts are in it, and the composition root is the only
   * place that knows.
   */
  lenses?: LensRegistry;
  /**
   * T-283 — the Lens the picker preselects. CONFIG, not code
   * (`DEFAULT_LENS_ID`): which register a firm's people should start in is a
   * deployment decision, and hard-coding `planning-environmental` would make
   * Infora's own view of the modal user into everyone's default. Unset means
   * the shared core, which is what the product did before Lenses existed.
   */
  defaultLensId?: string | null;
  /**
   * T-265 — the declared workflows this deployment carries, loaded and
   * validated once at composition. Optional on the same terms as `lenses`: an
   * absent registry means the coded chain runs, which is the same four stages
   * in the same order, so a deployment mid-rollout behaves identically.
   */
  workflows?: WorkflowRegistry;
  /**
   * T-265 — which declared workflow an Ask turn runs. CONFIG, not code
   * (`ASK_WORKFLOW_ID`): the deployment decides, and hard-coding
   * `project-question` here would make it unchangeable without a release.
   */
  askWorkflowId?: string;
  /**
   * T-266/T-269 — the workers this deployment has built. The route assembles
   * the per-requester set from it before the classifier sees anything, so an
   * unentitled worker is absent rather than offered and refused.
   */
  workers?: WorkerRegistry;
  /**
   * T-266 — the model classifier. Absent means the deterministic default,
   * which is not a stub: with one declared workflow whose parameter is the
   * question itself, asking a frontier model to choose among one option is
   * spending money to be less reliable (ADR-0027's own argument).
   */
  classifier?: Classifier;
  /**
   * T-251 — the absolute lifetime and idle window. Optional so an existing
   * caller keeps working; unset means the modest out-of-the-box posture, which
   * is still a bound where the skeleton had none at all.
   */
  sessionPolicy?: SessionPolicy;
  /**
   * T-254 — provider rates per model id. Absent means every step records
   * `cost: null` (unpriced), which is the honest state and is reported as
   * such — never 0, which reads as free.
   */
  modelRates?: ModelRates;
};

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const isUuid = (value: string) => z.uuid().safeParse(value).success;

/** Every request except login carries a session; 401 otherwise. */
export function sessionMiddleware(deps: {
  db: Db;
  sessionSecret: string;
  sessionPolicy?: SessionPolicy;
}): MiddlewareHandler<AppEnv> {
  const policy = deps.sessionPolicy ?? DEFAULT_SESSION_POLICY;
  return async (c, next) => {
    if (c.req.path === '/auth/session') return next();
    if (c.req.path === '/health') return next(); // liveness probe (T-219)
    const token = await getSignedCookie(c, deps.sessionSecret, sessionCookie);
    if (!token) return c.json({ error: 'unauthenticated' } satisfies ApiError, 401);
    // T-251 — the signature proves the token was minted here; the ROW proves it
    // is still live. Signature first, so a forged token never reaches the
    // database. Every ending — unknown, revoked, expired, idle — answers the
    // same 401: which one it was is the server's business, and telling a caller
    // "this session was revoked" distinguishes a real session from a forged
    // one, which is the same leak principle 4 closes everywhere else.
    const check = await resolveSession(deps.db, token, policy);
    if (!check.live) return c.json({ error: 'unauthenticated' } satisfies ApiError, 401);
    c.set('sessionId', check.session.id);
    const [user] = await deps.db
      .select()
      .from(s.users)
      .where(eq(s.users.id, check.session.userId))
      .limit(1);
    if (!user) return c.json({ error: 'unauthenticated' } satisfies ApiError, 401); // stale row
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
