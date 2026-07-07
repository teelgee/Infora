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

  it('returns the resolved identity and project participants', async () => {
    const session = (await login({ email, password })).headers.get('set-cookie')!.split(';')[0]!;
    const res = await app.request('/me', { headers: { cookie: session } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      userId,
      organisationId,
      participants: [{ projectId, participantId }],
    });
  });
});
