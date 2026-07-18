// T-021 acceptance: the seeded-user login and /me, against the live dev
// database (docker compose up -d && pnpm migrate). Fixtures are inserted
// here, not read from the seed, so the suite is self-contained.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const email = `t021-${Date.now()}@test.local`;
const password = 'pw-t021';
let userId: string;
let organisationId: string;
let projectId: string;
let participantId: string;

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: 't021 org' }).returning();
  organisationId = org!.id;
  const [user] = await db
    .insert(s.users)
    .values({ name: 't021 user', email, organisationId })
    .returning();
  userId = user!.id;
  await db.insert(s.userCredentials).values({ userId, passwordHash: hashPassword(password) });
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't021 project', ownerOrganisationId: organisationId })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId, projectId, role: 'owner' });
  const [participant] = await db.insert(s.participants).values({ userId, projectId }).returning();
  participantId = participant!.id;
});

afterAll(async () => {
  await pool.end();
});

async function login(body: unknown) {
  return app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /auth/session (T-021)', () => {
  it('rejects a malformed body with the invalid envelope', async () => {
    const res = await login({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('invalid');
  });

  it('answers unknown email and wrong password identically', async () => {
    const unknown = await login({ email: `nobody-${Date.now()}@test.local`, password });
    const wrong = await login({ email, password: 'not-the-password' });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(await unknown.json()).toEqual(await wrong.json());
  });

  it('sets an httpOnly session cookie on success, no body', async () => {
    const res = await login({ email, password });
    expect(res.status).toBe(204);
    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toContain('infora_session=');
    expect(cookie).toContain('HttpOnly');
  });
});

describe('GET /me (T-021)', () => {
  it('requires a session', async () => {
    const res = await app.request('/me');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthenticated' });
  });

  it('rejects a tampered cookie', async () => {
    const res = await app.request('/me', {
      headers: { cookie: `infora_session=${userId}.forged-signature` },
    });
    expect(res.status).toBe(401);
  });

  it('returns the resolved identity, display facts and project participants', async () => {
    const session = (await login({ email, password })).headers.get('set-cookie')!.split(';')[0]!;
    const res = await app.request('/me', { headers: { cookie: session } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      userId,
      name: 't021 user',
      email,
      organisationId,
      organisationName: 't021 org',
      orgRole: 'member',
      preferences: {},
      participants: [
        {
          projectId,
          participantId,
          projectName: 't021 project',
          ownerOrganisationName: 't021 org',
          membershipRole: 'owner',
        },
      ],
    });
  });
});

// T-111 — sign out: deleting the cookie ends the session; idempotent
describe('DELETE /auth/session (T-111)', () => {
  it('clears the cookie so /me is unauthenticated again', async () => {
    const session = (await login({ email, password })).headers.get('set-cookie')!.split(';')[0]!;
    expect((await app.request('/me', { headers: { cookie: session } })).status).toBe(200);

    const res = await app.request('/auth/session', {
      method: 'DELETE',
      headers: { cookie: session },
    });
    expect(res.status).toBe(204);
    // the clearing Set-Cookie empties the value and expires it
    const cleared = res.headers.get('set-cookie')!;
    expect(cleared).toContain('infora_session=;');
    expect(cleared.toLowerCase()).toContain('max-age=0');
  });

  it('is idempotent — signing out without a session still succeeds', async () => {
    expect((await app.request('/auth/session', { method: 'DELETE' })).status).toBe(204);
  });
});

// T-092 — personal settings: self-scoped writes on the session's own row
describe('PATCH /me and POST /me/password (T-092)', () => {
  const authed = async () =>
    (await login({ email, password: currentPassword })).headers.get('set-cookie')!.split(';')[0]!;
  let currentPassword = password;

  it('saves display name and preferences, returning the updated read', async () => {
    const session = await authed();
    const res = await app.request('/me', {
      method: 'PATCH',
      headers: { cookie: session, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 't021 renamed', preferences: { theme: 'dark' } }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string; preferences: { theme?: string } };
    expect(body.name).toBe('t021 renamed');
    expect(body.preferences).toEqual({ theme: 'dark' });

    const empty = await app.request('/me', {
      method: 'PATCH',
      headers: { cookie: session, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(empty.status).toBe(400);
  });

  it('changes the password only against the correct current one', async () => {
    const session = await authed();
    const wrong = await app.request('/me/password', {
      method: 'POST',
      headers: { cookie: session, 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'not-the-password', newPassword: 'long-enough-pw' }),
    });
    expect(wrong.status).toBe(401);

    const res = await app.request('/me/password', {
      method: 'POST',
      headers: { cookie: session, 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword: 'long-enough-pw' }),
    });
    expect(res.status).toBe(204);
    currentPassword = 'long-enough-pw';

    // the old password is gone, the new one signs in
    expect((await login({ email, password })).status).toBe(401);
    expect((await login({ email, password: currentPassword })).status).toBe(204);
  });
});
