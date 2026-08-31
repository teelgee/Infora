// T-084 — the e2e substrate: the real app (real DB, real wall, real chain)
// wired to the deterministic fake providers, so the harness runs in CI
// without provider keys and with reproducible model output. Never deployed;
// the production entry is index.ts.
import { serve } from '@hono/node-server';
import { ingestAllVersions } from '@infora/data';
import { createDb } from '@infora/db';
import { loadLenses } from '@infora/lenses';
import { createWorkerRegistry } from '@infora/capabilities';
import { loadWorkflows } from '@infora/workflows';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db } = createDb();
// T-283 — the substrate's chat names the reader it was given, so the Lens
// picker can be seen working through the browser. Only when a Lens is present:
// every earlier spec sends no `lensId` and must keep the reply it was written
// against.
const router = fakeRouter((system) => {
  // T-364 — the structure agent asks for JSON, not prose. Its system prompt is
  // the tell, so the substrate can drive the propose-confirm path in a browser
  // without a provider (the same reason the Lens branch below exists).
  if (system.includes('folder structures')) {
    return JSON.stringify({
      nodes: [
        { name: 'Environmental', children: [{ name: 'Ecology' }, { name: 'Noise' }] },
        { name: 'Geotechnical', children: [{ name: 'Ground investigation' }] },
      ],
      followUp: null,
    });
  }
  // T-336 — the checker's two prompts, for the same reason the branch above
  // exists: the substrate has to be able to drive a check through a browser
  // without a provider. The section check returns ONE MECHANICAL fix and ONE
  // REWRITE, which is what makes the accept-all-above-the-rewrites layout
  // (ADR-0053 §6) photographable rather than merely asserted.
  if (system.includes('checkable factual assertions')) {
    return 'the reduction in contaminant loading';
  }
  if (system.includes('summaries of what each section')) {
    return JSON.stringify({ findings: [] });
  }
  if (system.includes('You are checking one section of a draft')) {
    return JSON.stringify({
      summary: 'The section sets out the conceptual site model and its residual uncertainty.',
      findings: [
        // MECHANICAL — one substitution, applied consistently, statable in one
        // line. R1 is the PROJECT style guide, so the quote crosses the wall.
        {
          family: 'style',
          quote: 'the former works',
          defect:
            'The works are named informally here; the project style guide fixes “the scheme”.',
          severity: 'advisory',
          rule: 'R1',
          replacement: 'the scheme',
        },
        // A REWRITE — model-written prose, per-mark always. R4 is the FIRM's
        // own manual, so this quote is private to Calder & Hale.
        {
          family: 'style',
          quote: 'A conceptual site model has been prepared for each land parcel crossed by the route.',
          defect: 'This sentence is passive, so the party who prepared the model is not named.',
          severity: 'advisory',
          rule: 'R4',
          replacement:
            'Calder & Hale has prepared a conceptual site model for each land parcel the route crosses.',
        },
      ],
    });
  }
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
  // T-336 — the substrate carries the DECLARED WORKFLOWS and the worker
  // registry, which it never had. Without them the Tools section is empty here
  // and the checker's routes 404 — so a tool shipped in T-334/T-335 could not
  // be driven through a browser at all, and the walkthrough could not
  // photograph one. The registries are the production ones, because a harness
  // that composed the app differently from a deployment is evidence about a
  // configuration nobody ships (the eval harness's own rule).
  workflows: loadWorkflows({ workers: createWorkerRegistry(), production: true }),
  workers: createWorkerRegistry(),
  // T-283 — the default is config, and the substrate declares one so the
  // picker's preselected state is exercised rather than assumed
  defaultLensId: 'planning-environmental',
});

serve({ fetch: app.fetch, port: Number(process.env['PORT'] ?? 3000) }, (info) => {
  console.log(`@infora/api (e2e substrate, fake providers) listening on :${info.port}`);
});
