// T-219 — request id, boundary log line, and the /health probe.
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createDb } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

afterAll(async () => {
  await pool.end();
});

describe('X-Request-Id (T-219)', () => {
  it('every response carries a fresh uuid', async () => {
    const first = await app.request('/me');
    const second = await app.request('/me');
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    expect(first.headers.get('x-request-id')).toMatch(uuid);
    expect(second.headers.get('x-request-id')).toMatch(uuid);
    expect(first.headers.get('x-request-id')).not.toBe(second.headers.get('x-request-id'));
  });
});

describe('boundary log line (T-219)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('one structured JSON line per request outside NODE_ENV=test', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await app.request('/no-such-path');
    expect(log).toHaveBeenCalledTimes(1);
    const line = JSON.parse(log.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(line).toMatchObject({ method: 'GET', path: '/no-such-path', status: 401 });
    expect(line['requestId']).toBe(res.headers.get('x-request-id'));
    expect(typeof line['durationMs']).toBe('number');
  });

  it('suppressed under NODE_ENV=test', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await app.request('/no-such-path');
    expect(log).not.toHaveBeenCalled();
  });
});

describe('GET /health (T-219)', () => {
  it('is sessionless and pings the database', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('answers 503 when the database is unreachable', async () => {
    const { db: deadDb, pool: deadPool } = createDb('postgres://nobody:nope@localhost:9/nothing');
    const dead = buildApp({ db: deadDb, sessionSecret: 'test-secret', router: fakeRouter() });
    const res = await dead.request('/health');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
    await deadPool.end();
  });
});
