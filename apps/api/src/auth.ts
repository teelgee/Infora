// T-021 — skeleton session auth (plan.md's recorded build-time decision):
// email + password against the seeded user_credentials, an httpOnly signed
// cookie carrying the user id, and GET /me. Scaffolding until the
// infra/security session lands production identity (Entra-first); requester
// resolution on every other endpoint is T-023.
import { Hono } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { changePasswordBody, createSessionBody, patchMeBody } from '@infora/contracts';
import type { ApiError, MeResponse, UserPreferences } from '@infora/contracts';
import { hashPassword, schema as s, verifyPassword } from '@infora/db';
import type { Db } from '@infora/db';
import { endSession, openSession } from './sessions';
import type { SessionPolicy } from './sessions';
import type { AppEnv, UserRow } from './requester';

export const sessionCookie = 'infora_session';

const unauthenticated = { error: 'unauthenticated' } satisfies ApiError;

export function authRoutes(deps: { db: Db; sessionSecret: string; sessionPolicy: SessionPolicy }) {
  const app = new Hono<AppEnv>();

  app.post('/auth/session', async (c) => {
    const body = createSessionBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: 'invalid', detail: 'email and password required' } satisfies ApiError, 400);
    }

    const [row] = await deps.db
      .select({ user: s.users, credential: s.userCredentials })
      .from(s.users)
      .leftJoin(s.userCredentials, eq(s.userCredentials.userId, s.users.id))
      // T-315 — a removed account cannot log back in. Filtered in the LOOKUP
      // rather than checked afterwards, so a removed account is indistinguish-
      // able from an unknown one: a separate "your account was removed" answer
      // would be an account-probing oracle, and the 401 below already covers
      // it. Revoking the sessions ends the ones that exist; this is what stops
      // a new one being minted.
      .where(and(eq(s.users.email, body.data.email), isNull(s.users.removedAt)))
      .limit(1);

    // one answer for unknown email and wrong password — no account probing
    if (!row?.credential || !verifyPassword(body.data.password, row.credential.passwordHash)) {
      return c.json(unauthenticated, 401);
    }

    // T-251 — the cookie carries an opaque TOKEN, not the user id. That is the
    // whole change: a cookie holding a user id is a bearer assertion of
    // identity that stays true until the signature expires; a cookie holding a
    // token is a pointer to a row the server can revoke. It is still signed, so
    // a forged token is rejected before the database is touched.
    const session = await openSession(deps.db, row.user.id, deps.sessionPolicy);
    await setSignedCookie(c, sessionCookie, session.id, deps.sessionSecret, {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      // the cookie now expires WITH the session's absolute lifetime, so a
      // browser stops sending a cookie the server would refuse anyway
      expires: session.expiresAt,
    });
    return c.body(null, 204); // the cookie is the product; identity reads via GET /me
  });

  // T-111 — sign out. T-251 changed what this MEANS: deleting the cookie used
  // to be the whole of it, so a copy of the cookie taken beforehand kept
  // working. Now the server ends the session too, and the copy is dead.
  // Idempotent and unauthenticated by design (the middleware exempts this
  // path): a stale or absent cookie signs out the same way.
  app.delete('/auth/session', async (c) => {
    const token = await getSignedCookie(c, deps.sessionSecret, sessionCookie);
    if (typeof token === 'string') await endSession(deps.db, token, 'signed_out');
    deleteCookie(c, sessionCookie, { path: '/' });
    return c.body(null, 204);
  });

  app.get('/me', async (c) => {
    // the requester was resolved by the T-023 session middleware
    return c.json(await readMe(deps.db, c.get('user')));
  });

  // Personal settings (T-092, 2026-07-09) — self-scoped writes: the session's
  // own user row, no id parameter
  app.patch('/me', async (c) => {
    const body = patchMeBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: 'invalid', detail: 'nothing to change' } satisfies ApiError, 400);
    }
    const user = c.get('user');
    const preferences = { ...(user.preferences as UserPreferences), ...body.data.preferences };
    const [updated] = await deps.db
      .update(s.users)
      .set({ ...(body.data.name !== undefined && { name: body.data.name }), preferences })
      .where(eq(s.users.id, user.id))
      .returning();
    return c.json(await readMe(deps.db, updated!));
  });

  app.post('/me/password', async (c) => {
    const body = changePasswordBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json(
        { error: 'invalid', detail: 'current and new password (min 8) required' } satisfies ApiError,
        400,
      );
    }
    const user = c.get('user');
    const [credential] = await deps.db
      .select()
      .from(s.userCredentials)
      .where(eq(s.userCredentials.userId, user.id))
      .limit(1);
    if (!credential || !verifyPassword(body.data.currentPassword, credential.passwordHash)) {
      return c.json(unauthenticated, 401);
    }
    await deps.db
      .update(s.userCredentials)
      .set({ passwordHash: hashPassword(body.data.newPassword) })
      .where(eq(s.userCredentials.userId, user.id));
    return c.body(null, 204);
  });

  return app;
}

async function readMe(db: Db, user: UserRow): Promise<MeResponse> {
  const [organisation] = await db
    .select({ name: s.organisations.name })
    .from(s.organisations)
    .where(eq(s.organisations.id, user.organisationId))
    .limit(1);

  // the requester's own entitlements with their display facts (2026-07-08)
  const owner = alias(s.organisations, 'owner');
  const participants = await db
    .select({
      participantId: s.participants.id,
      projectId: s.projects.id,
      projectName: s.projects.name,
      ownerOrganisationName: owner.name,
      membershipRole: s.memberships.role,
      elevated: s.participants.elevated,
    })
    .from(s.participants)
    .innerJoin(s.projects, eq(s.participants.projectId, s.projects.id))
    .innerJoin(owner, eq(s.projects.ownerOrganisationId, owner.id))
    .innerJoin(
      s.memberships,
      and(
        eq(s.memberships.projectId, s.projects.id),
        eq(s.memberships.organisationId, user.organisationId),
      ),
    )
    .where(and(eq(s.participants.userId, user.id), isNull(s.participants.removedAt)))
    // T-298 — deterministic order. Callers index this list (`participants[0]`
    // is the default project in the web shell and in a dozen e2e specs), and
    // an unordered SQL result made that a latent bug the moment anyone held a
    // second Participant. Oldest first: a user's first project stays first.
    .orderBy(asc(s.participants.createdAt));

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    organisationId: user.organisationId,
    organisationName: organisation?.name ?? '',
    orgRole: user.orgRole,
    preferences: user.preferences as UserPreferences,
    participants,
  };
}
