import { describe, expect, it } from 'vitest';
import { createDb } from '@infora/db';
import { buildApp } from './app';

const uuid = '3f8a2c1e-9b4d-4f6a-8c2e-1d5b7a9f0e3c';

// The contracts.md §3 endpoints still awaiting their tickets (auth is live, T-021).
const pendingRoutes: Array<[string, string]> = [
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

describe('apps/api skeleton (T-009)', () => {
  // the pool is lazy — these tests never touch the database
  const app = buildApp({ db: createDb().db, sessionSecret: 'test-secret' });

  it.each(pendingRoutes)('%s %s is registered (501 until its ticket lands)', async (method, path) => {
    const res = await app.request(path, { method });
    expect(res.status).toBe(501);
  });

  it('an unknown resource returns the contracts §4 envelope', async () => {
    const res = await app.request('/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });

  it('a wrong method reads as not_found, never method-not-allowed (principle 4)', async () => {
    const res = await app.request(`/runs/${uuid}`, { method: 'DELETE' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });
});
