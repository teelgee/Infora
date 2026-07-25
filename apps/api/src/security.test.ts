// T-216 — CORS allowlist + baseline security headers at the API boundary.
import { describe, expect, it } from 'vitest';
import { createDb } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

// no cookie: the session middleware answers before any query — no DB needed
const app = buildApp({ db: createDb().db, sessionSecret: 'test-secret', router: fakeRouter() });

describe('CORS allowlist (T-216)', () => {
  it('an unlisted Origin gets no CORS allow headers', async () => {
    const res = await app.request('/me', { headers: { Origin: 'https://evil.example' } });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('an unlisted Origin gets no allow headers on preflight either', async () => {
    const res = await app.request('/me', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('a default dev origin is allowed, with credentials', async () => {
    const res = await app.request('/me', { headers: { Origin: 'http://localhost:5173' } });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('ALLOWED_ORIGINS-style override replaces the default list', async () => {
    const custom = buildApp({
      db: createDb().db,
      sessionSecret: 'test-secret',
      router: fakeRouter(),
      allowedOrigins: ['https://app.infora.example'],
    });
    const allowed = await custom.request('/me', {
      headers: { Origin: 'https://app.infora.example' },
    });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://app.infora.example');
    const dev = await custom.request('/me', { headers: { Origin: 'http://localhost:5173' } });
    expect(dev.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('security headers (T-216)', () => {
  it('every response carries the baseline headers', async () => {
    for (const path of ['/me', '/no-such-path']) {
      const res = await app.request(path);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    }
  });
});
