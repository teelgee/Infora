// T-021 — skeleton session auth (plan.md's recorded build-time decision):
// email + password against the seeded user_credentials, an httpOnly signed
// cookie carrying the user id, and GET /me. Scaffolding until the
// infra/security session lands production identity (Entra-first); requester
// resolution on every other endpoint is T-023.
import { Hono } from 'hono';
import { setSignedCookie } from 'hono/cookie';
import { eq } from 'drizzle-orm';
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

    const participants = await deps.db
      .select()
      .from(s.participants)
      .where(eq(s.participants.userId, user.id));

    return c.json({
      userId: user.id,
      organisationId: user.organisationId,
      participants: participants.map((p) => ({ projectId: p.projectId, participantId: p.id })),
    } satisfies MeResponse);
  });

  return app;
}
