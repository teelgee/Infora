// T-084 — the e2e substrate: the real app (real DB, real wall, real chain)
// wired to the deterministic fake providers, so the harness runs in CI
// without provider keys and with reproducible model output. Never deployed;
// the production entry is index.ts.
import { serve } from '@hono/node-server';
import { ingestAllVersions } from '@infora/data';
import { createDb } from '@infora/db';
import { loadLenses } from '@infora/lenses';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db } = createDb();
// T-283 — the substrate's chat names the reader it was given, so the Lens
// picker can be seen working through the browser. Only when a Lens is present:
// every earlier spec sends no `lensId` and must keep the reply it was written
// against.
const router = fakeRouter((system) => {
  const reader = /Write for this reader: ([^.]+)\./.exec(system)?.[1];
  const answer = 'The investigation recorded contamination exceedances. [S1] An unsupported figure of 40%.';
  return reader === undefined ? answer : `${reader}. ${answer}`;
});

// index the library under the fake embedding model so retrieval has a
// grounded corpus here; the real voyage index coexists untouched (each
// pinned model is its own index, ADR-0024)
const { chunks } = await ingestAllVersions(db, router);
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
  // T-283 — the default is config, and the substrate declares one so the
  // picker's preselected state is exercised rather than assumed
  defaultLensId: 'planning-environmental',
});

serve({ fetch: app.fetch, port: Number(process.env['PORT'] ?? 3000) }, (info) => {
  console.log(`@infora/api (e2e substrate, fake providers) listening on :${info.port}`);
});
