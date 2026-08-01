// T-084 — the e2e substrate: the real app (real DB, real wall, real chain)
// wired to the deterministic fake providers, so the harness runs in CI
// without provider keys and with reproducible model output. Never deployed;
// the production entry is index.ts.
import { serve } from '@hono/node-server';
import { ingestVersions } from '@infora/data';
import { createDb } from '@infora/db';
import { loadLenses } from '@infora/lenses';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db } = createDb();
const router = fakeRouter();

// index the library under the fake embedding model so retrieval has a
// grounded corpus here; the real voyage index coexists untouched (each
// pinned model is its own index, ADR-0024)
const { chunks } = await ingestVersions(db, router);
console.log(`e2e substrate: ${chunks} chunks indexed under the fake embedding model`);

// the harness logs in per test from one IP, far past the production login
// default — the substrate raises the throttles rather than shaping the suites
const app = buildApp({
  db,
  sessionSecret: 'e2e-secret',
  router,
  rateLimits: { loginPerMinute: 1000, runsPerMinute: 1000 },
  // T-299 — production semantics deliberately: the harness exercises the four
  // Lenses a real user is offered, and a suite that could reach the draft
  // Commercial Lens would be testing a configuration nobody ships.
  lenses: loadLenses({ production: true }),
});

serve({ fetch: app.fetch, port: Number(process.env['PORT'] ?? 3000) }, (info) => {
  console.log(`@infora/api (e2e substrate, fake providers) listening on :${info.port}`);
});
