// T-084 — the e2e substrate: the real app (real DB, real wall, real chain)
// wired to the deterministic fake providers, so the harness runs in CI
// without provider keys and with reproducible model output. Never deployed;
// the production entry is index.ts.
import { serve } from '@hono/node-server';
import { createDb } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db } = createDb();
const app = buildApp({ db, sessionSecret: 'e2e-secret', router: fakeRouter() });

serve({ fetch: app.fetch, port: Number(process.env['PORT'] ?? 3000) }, (info) => {
  console.log(`@infora/api (e2e substrate, fake providers) listening on :${info.port}`);
});
