// T-218 — the CSRF gate (ADR-0044): form content types bounce off JSON
// endpoints, bodyless writes pass, and the multipart upload takes an Origin
// check against the T-216 allowlist instead.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

afterAll(async () => {
  await pool.end();
});

describe('content-type gate (T-218)', () => {
  it('a form-content-type POST to a state-changing endpoint is rejected 400', async () => {
    const res = await app.request('/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'email=rachel.bowen%40trentmoor.example&password=x',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'invalid',
      detail: 'content-type must be application/json',
    });
  });

  it('a JSON POST passes the gate and reaches the handler', async () => {
    const res = await app.request('/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@test.local', password: 'wrong' }),
    });
    expect(res.status).toBe(401); // the handler's answer, not the gate's
  });

  it('a bodyless POST without a content type reaches the handler', async () => {
    const res = await app.request('/auth/session', { method: 'POST' });
    expect(res.status).toBe(400);
    // the *handler's* validation message — proof the gate let it through
    expect(await res.json()).toEqual({ error: 'invalid', detail: 'email and password required' });
  });

  it('DELETE /auth/session works with no content type', async () => {
    const res = await app.request('/auth/session', { method: 'DELETE' });
    expect(res.status).toBe(204);
  });
});

describe('multipart upload Origin check (T-218)', () => {
  const stamp = Date.now();
  const password = 'pw-t218';
  let cookie: string;
  let projectId: string;

  beforeAll(async () => {
    const [org] = await db.insert(s.organisations).values({ name: 't218 org' }).returning();
    const [project] = await db
      .insert(s.projects)
      .values({ name: 't218 project', ownerOrganisationId: org!.id })
      .returning();
    projectId = project!.id;
    await db
      .insert(s.memberships)
      .values({ organisationId: org!.id, projectId, role: 'owner' });
    const [user] = await db
      .insert(s.users)
      .values({ name: 't218-user', email: `t218-${stamp}@test.local`, organisationId: org!.id })
      .returning();
    await db
      .insert(s.userCredentials)
      .values({ userId: user!.id, passwordHash: hashPassword(password) });
    await db.insert(s.participants).values({ userId: user!.id, projectId });

    const login = await app.request('/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `t218-${stamp}@test.local`, password }),
    });
    expect(login.status).toBe(204);
    cookie = login.headers.get('set-cookie')!.split(';')[0]!;
  });

  const upload = (headers: Record<string, string>) => {
    const form = new FormData();
    form.append('file', new File(['not a real docx'], 'brief.docx'));
    return app.request(`/projects/${projectId}/sandbox-uploads`, {
      method: 'POST',
      headers: { cookie, ...headers },
      body: form,
    });
  };

  it('an allowlisted Origin uploads fine', async () => {
    expect((await upload({ origin: 'http://localhost:5173' })).status).toBe(201);
  });

  it('no provenance headers (a non-browser client) uploads fine', async () => {
    expect((await upload({})).status).toBe(201);
  });

  it('a foreign Origin is rejected 403', async () => {
    const res = await upload({ origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden', detail: 'cross-origin upload' });
  });

  it('Sec-Fetch-Site: cross-site is rejected 403 even without an Origin', async () => {
    const res = await upload({ 'sec-fetch-site': 'cross-site' });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden', detail: 'cross-site upload' });
  });
});
