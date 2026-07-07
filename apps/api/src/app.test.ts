import { describe, expect, it } from 'vitest';
import { createDb } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const uuid = '3f8a2c1e-9b4d-4f6a-8c2e-1d5b7a9f0e3c';

// Every contracts.md §3 endpoint that requires a resolved requester (T-023);
// the entitled pass-through is covered in requester.test.ts against the
// live database.
export const scopedRoutes: Array<[string, string]> = [
  ['GET', '/me'],
  ['POST', `/projects/${uuid}/conversations`],
  ['POST', `/conversations/${uuid}/runs`],
  ['GET', `/conversations/${uuid}`],
  ['GET', `/runs/${uuid}`],
  ['GET', `/projects/${uuid}/work-items`],
  ['GET', `/work-items/${uuid}`],
  ['POST', `/projects/${uuid}/sandbox-documents`],
  ['GET', `/sandbox-documents/${uuid}`],
  ['PATCH', `/sandbox-documents/${uuid}`],
  ['POST', `/suggestions/${uuid}/resolution`],
  ['GET', `/projects/${uuid}/library`],
];

describe('apps/api skeleton (T-009/T-023)', () => {
  // no cookie means the middleware answers before any query — no database needed
  const app = buildApp({ db: createDb().db, sessionSecret: 'test-secret', router: fakeRouter() });

  it.each(scopedRoutes)('%s %s requires a session', async (method, path) => {
    const res = await app.request(path, { method });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthenticated' });
  });

  it('login itself is the one sessionless endpoint', async () => {
    const res = await app.request('/auth/session', { method: 'POST' });
    expect(res.status).not.toBe(401);
  });
});
