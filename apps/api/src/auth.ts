// T-021 — skeleton session auth (plan.md's recorded build-time decision):
// email + password against the seeded user_credentials, an httpOnly signed
// cookie carrying the user id, and GET /me. Scaffolding until the
// infra/security session lands production identity (Entra-first); requester
// resolution on every other endpoint is T-023.
import { Hono } from 'hono';
import { setSignedCookie } from 'hono/cookie';
import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { changePasswordBody, createSessionBody, patchMeBody } from '@infora/contracts';
import type { ApiError, MeResponse, UserPreferences } from '@infora/contracts';
import { hashPassword, schema as s, verifyPassword } from '@infora/db';
import type { Db } from '@infora/db';
import type { AppEnv, UserRow } from './requester';

export const sessionCookie = 'infora_session';

const unauthenticated = { error: 'unauthenticated' } satisfies ApiError;

export function authRoutes(deps: { db: Db; sessionSecret: string }) {
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
      .where(eq(s.users.email, body.data.email))
      .limit(1);

    // one answer for unknown email and wrong password — no account probing
    if (!row?.credential || !verifyPassword(body.data.password, row.credential.passwordHash)) {
      return c.json(unauthenticated, 401);
    }

    await setSignedCookie(c, sessionCookie, row.user.id, deps.sessionSecret, {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
    });
    return c.body(null, 204); // the cookie is the product; identity reads via GET /me
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
    .where(eq(s.participants.userId, user.id));

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    organisationId: user.organisationId,
    organisationName: organisation?.name ?? '',
    preferences: user.preferences as UserPreferences,
    participants,
  };
}
