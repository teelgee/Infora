// T-217 — sliding-window rate limits: login per IP, run creation per user.
// The app-level suites run against the live dev database with the fake Router.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { createSlidingWindow } from './rate-limit';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();

describe('createSlidingWindow', () => {
  it('allows up to the limit inside a window, then blocks', () => {
    const window = createSlidingWindow(3, 60_000);
    const t = 1_000_000;
    expect(window.allow('k', t)).toBe(true);
    expect(window.allow('k', t + 1)).toBe(true);
    expect(window.allow('k', t + 2)).toBe(true);
    expect(window.allow('k', t + 3)).toBe(false);
  });

  it('slides: hits older than the window stop counting', () => {
    const window = createSlidingWindow(2, 60_000);
    const t = 1_000_000;
    expect(window.allow('k', t)).toBe(true);
    expect(window.allow('k', t + 1)).toBe(true);
    expect(window.allow('k', t + 2)).toBe(false);
    expect(window.allow('k', t + 60_001)).toBe(true); // first hit aged out
  });

  it('keys are independent buckets', () => {
    const window = createSlidingWindow(1, 60_000);
    const t = 1_000_000;
    expect(window.allow('a', t)).toBe(true);
    expect(window.allow('b', t)).toBe(true);
    expect(window.allow('a', t + 1)).toBe(false);
  });
});

describe('POST /auth/session per-IP limit', () => {
  const app = buildApp({
    db,
    sessionSecret: 'test-secret',
    router: fakeRouter(),
    rateLimits: { loginPerMinute: 2 },
  });
  const attempt = (ip: string, method = 'POST') =>
    app.request('/auth/session', {
      method,
      headers: { 'x-forwarded-for': ip, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@test.local', password: 'wrong' }),
    });

  it('over-limit attempts get the 429 envelope; other IPs are unaffected', async () => {
    expect((await attempt('203.0.113.9')).status).toBe(401);
    expect((await attempt('203.0.113.9')).status).toBe(401);
    const blocked = await attempt('203.0.113.9');
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: 'rate_limited', detail: 'too many requests' });
    expect((await attempt('203.0.113.10')).status).toBe(401);
  });

  it('DELETE /auth/session (sign-out) is never throttled', async () => {
    for (let i = 0; i < 4; i += 1) {
      expect((await attempt('203.0.113.9', 'DELETE')).status).toBe(204);
    }
  });
});

describe('POST /conversations/:id/runs per-user limit', () => {
  const app = buildApp({
    db,
    sessionSecret: 'test-secret',
    router: fakeRouter(),
    rateLimits: { runsPerMinute: 1 },
  });
  const stamp = Date.now();
  const password = 'pw-t217';
  let cookie: string;
  let conversationId: string;

  beforeAll(async () => {
    const [org] = await db.insert(s.organisations).values({ name: 't217 org' }).returning();
    const [project] = await db
      .insert(s.projects)
      .values({ name: 't217 project', ownerOrganisationId: org!.id })
      .returning();
    await db
      .insert(s.memberships)
      .values({ organisationId: org!.id, projectId: project!.id, role: 'owner' });
    const [user] = await db
      .insert(s.users)
      .values({ name: 't217-user', email: `t217-${stamp}@test.local`, organisationId: org!.id })
      .returning();
    await db
      .insert(s.userCredentials)
      .values({ userId: user!.id, passwordHash: hashPassword(password) });
    await db.insert(s.participants).values({ userId: user!.id, projectId: project!.id });

    const login = await app.request('/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `t217-${stamp}@test.local`, password }),
    });
    cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    const created = await app.request(`/projects/${project!.id}/conversations`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ surface: 'web' }),
    });
    expect(created.status).toBe(201);
    ({ conversationId } = (await created.json()) as { conversationId: string });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('the run over the per-user limit gets the 429 envelope', async () => {
    const run = (request: string) =>
      app.request(`/conversations/${conversationId}/runs`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ request }),
      });
    expect((await run('first')).status).toBe(201);
    const blocked = await run('second');
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: 'rate_limited', detail: 'too many requests' });
  });
});
