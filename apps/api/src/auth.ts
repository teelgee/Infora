// T-021 — skeleton session auth (plan.md's recorded build-time decision):
// email + password against the seeded user_credentials, an httpOnly signed
// cookie carrying the user id, and GET /me. Scaffolding until the
// infra/security session lands production identity (Entra-first); requester
// resolution on every other endpoint is T-023.
import { Hono } from 'hono';
import { setSignedCookie } from 'hono/cookie';
import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { createSessionBody } from '@infora/contracts';
import type { ApiError, MeResponse } from '@infora/contracts';
import { schema as s, verifyPassword } from '@infora/db';
import type { Db } from '@infora/db';
import type { AppEnv } from './requester';

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
    const user = c.get('user');

    const [organisation] = await deps.db
      .select({ name: s.organisations.name })
      .from(s.organisations)
      .where(eq(s.organisations.id, user.organisationId))
      .limit(1);

    // the requester's own entitlements with their display facts (2026-07-08)
    const owner = alias(s.organisations, 'owner');
    const participants = await deps.db
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

    return c.json({
      userId: user.id,
      name: user.name,
      organisationId: user.organisationId,
      organisationName: organisation?.name ?? '',
      participants,
    } satisfies MeResponse);
  });

  return app;
}
