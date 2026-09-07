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
const router = fakeRouter((system, prompt) => {
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
  // T-442 — the builder's agent writing a screen. Same reason as the branch
  // above: the stepped builder has to be drivable in a browser with no provider
  // behind it. The fake reads the column keys out of the prompt it was given
  // and lays a screen over them, so what comes back is a REAL screen in the
  // grammar and meets the same parser a provider's answer would.
  if (system.includes('You lay out ONE screen')) {
    const keys = [...prompt.matchAll(/^ {2}([a-z0-9_]+) — /gm)].map((match) => match[1]!);
    if (keys.length === 0) {
      return JSON.stringify({ screen: null, followUp: 'Which columns should it show?' });
    }
    return JSON.stringify({
      screen: {
        version: 1,
        blocks: [
          { kind: 'heading', text: 'Returns' },
          { kind: 'rowForm', columnKeys: keys, submitLabel: 'Submit this return' },
          { kind: 'rowTable', columnKeys: keys, showOrganisation: true, showState: true },
          { kind: 'count', label: 'Returns you can see' },
        ],
      },
      followUp: null,
    });
  }
  // T-336 — the checker's two prompts, for the same reason the branch above
  // exists: the substrate has to be able to drive a check through a browser
  // without a provider.
  //
  // T-435 re-cut the section-check answer. It used to return one MECHANICAL fix
  // and one REWRITE, both invented here; the mechanical half is now raised for
  // real by the code pass over the seeded project's accepted TERM rule, before
  // any model call happens. So the accept-all-above-the-rewrites layout
  // (ADR-0053 §6) is still photographable, and the half of it that is supposed
  // to cost nothing now genuinely costs nothing.
  if (system.includes('checkable factual assertions')) {
    return 'the reduction in contaminant loading';
  }
  if (system.includes('summaries of what each section')) {
    return JSON.stringify({ findings: [] });
  }
  if (system.includes('You are checking one section of a draft')) {
    // T-435 — THE JUDGEMENT RULES, WHEN THE PROMPT CARRIES ANY.
    //
    // Once the seeded project's style guide is stored as accepted rules
    // (ADR-0054), that guide stops arriving here as prose: its term and pattern
    // rules are settled in code before this call is ever made, and what reaches
    // the model is the judgement half, marked [J1], [J2] … The prompt's own
    // blocks are the tell, exactly as the branches above read their prompts, so
    // the substrate answers the world it is actually shown rather than the world
    // as it stood before the rules work.
    //
    // 🔒 **EVERYTHING IS READ BACK OFF THE PROMPT — the markers AND the section
    // text.** A rule set that grows a judgement rule renumbers [J#]; a check
    // that runs section by section shows this branch a different section each
    // time. Both are answered by looking rather than assuming, so a finding is
    // returned only where its rule is really on offer and its quote is really
    // in the section under check. A quote that is not is discarded by the
    // admission rules and counted, which would put a permanent false number on
    // the coverage line every screenshot carries.
    const under = system.split('THE SECTION UNDER CHECK.')[1] ?? '';
    const marker = (block: 'J' | 'R', pattern: RegExp): string | null => {
      const found = [
        ...system.matchAll(new RegExp(`^\\[${block}(\\d+)\\] \\(([^)]*)\\) (.+)$`, 'gm')),
      ].find(([, , whose, text]) => pattern.test(`${whose} ${text}`));
      return found === undefined ? null : `${block}${found[1]}`;
    };
    const candidates = [
      // A REWRITE against a JUDGEMENT RULE — model-written prose, per-mark
      // always. Its evidence is the rule Infora proposed and this project
      // accepted, so this finding quotes no client document at all.
      {
        rule: marker('J', /active voice/i),
        quote: 'A conceptual site model has been prepared for each land parcel crossed by the route.',
        defect: 'This sentence is passive, so the party who prepared the model is not named.',
        severity: 'advisory',
        replacement:
          'Calder & Hale has prepared a conceptual site model for each land parcel the route crosses.',
      },
      // A second judgement answer, on the project guide's own §2.4 — a result
      // reported with no figure behind it. `required` rather than `advisory`, so
      // the panel is photographed carrying both severities.
      {
        rule: marker('J', /unit and its source/i),
        quote: 'PAH exceedances at three trial pits south of the Wrenfield substation',
        defect:
          'The exceedances are reported with no concentration and no unit, so the result cannot be checked.',
        severity: 'required',
        replacement: null,
      },
      // and the FIRM's own manual, which ADR-0054 leaves as prose and which
      // still arrives as [R#]. A finding quoting it stays private to Calder &
      // Hale (ADR-0053 §9) — the wall's cut, visible on one screen.
      {
        rule: marker('R', /firm rulebook.*hedge/i),
        quote: 'a potentially unacceptable risk',
        defect: 'The conclusion is hedged where the ground investigation supports stating it.',
        severity: 'advisory',
        replacement: null,
      },
    ];
    return JSON.stringify({
      summary: 'The section sets out the conceptual site model and its residual uncertainty.',
      findings: candidates
        .filter((finding) => finding.rule !== null && under.includes(finding.quote))
        .map((finding) => ({ family: 'style', ...finding })),
    });
  }
  // T-435 — EXTRACTION: an uploaded standard becomes proposed rules (T-424).
  //
  // The workbench's first step could not be driven through a browser at all
  // without this: the route asks a model to restructure a guide into clauses
  // and every admission rule then discards what comes back, so the review
  // screen was reachable only with an empty list. The clause markers are read
  // back off the prompt's own [C#] block — the pointer must resolve against the
  // clauses THIS run loaded, and a guessed marker is a rule discarded and
  // counted.
  if (system.includes('You are restructuring a written style guide')) {
    const clauses = [...system.matchAll(/^\[C(\d+)\]/gm)].map((match) => match[1]);
    const first = clauses[0];
    if (first === undefined) return JSON.stringify({ rules: [] });
    const second = clauses[1] ?? first;
    const third = clauses[2] ?? first;
    return JSON.stringify({
      rules: [
        // ONE CLAUSE SAYING TWO THINGS BECOMES TWO RULES — the split is the
        // work (decision 6), and the substrate has to demonstrate it or the
        // review screen photographs a list that never exercises it.
        {
          clause: `C${first}`,
          kind: 'term',
          statement: 'Refer to the works as “the scheme”.',
          scope: 'sentence',
          register: 'all',
          enforcement: 'raises_findings',
          excepted_contexts: ['quotations', 'references'],
          excepted_terms: [],
          topic: null,
          payload: {
            preferred: 'the scheme',
            replaces: ['the routewide works', 'the works'],
            definition: 'The project’s own name for the works it authorises.',
          },
        },
        {
          clause: `C${first}`,
          kind: 'pattern',
          statement: 'Do not capitalise “the scheme” as a proper noun.',
          scope: 'sentence',
          register: 'all',
          enforcement: 'raises_findings',
          excepted_contexts: ['quotations', 'references'],
          excepted_terms: [],
          topic: 'heading-case',
          payload: { expression: '\\bthe Scheme\\b', caseSensitive: true },
        },
        {
          clause: `C${second}`,
          kind: 'judgement',
          statement: 'State every quantitative result with its unit and its source.',
          scope: 'sentence',
          register: 'all',
          enforcement: 'raises_findings',
          excepted_contexts: ['quotations', 'references'],
          excepted_terms: [],
          topic: null,
          payload: {
            passExample: 'PAH concentrations reached 42 mg/kg at trial pit TP12 (WA-GEO-GIR-004).',
            failExample: 'PAH concentrations at the trial pits were high.',
          },
        },
        {
          clause: `C${third}`,
          kind: 'judgement',
          statement: 'Write a commitment as a single sentence naming who does what, and by when.',
          scope: 'sentence',
          register: 'all',
          enforcement: 'raises_findings',
          excepted_contexts: ['quotations'],
          excepted_terms: [],
          topic: null,
          payload: {
            passExample:
              'Calder & Hale will issue the remediation options appraisal before the Stage 3 gateway.',
            failExample:
              'An options appraisal will be scoped, and the programme will be revisited in due course.',
          },
        },
        // AND ONE THE ADMISSION RULES MUST REFUSE, deliberately: a marker this
        // run never showed the model. It is discarded and counted, so the
        // review screen's honest report of what could not be read has something
        // true to report rather than a permanent zero.
        {
          clause: 'C99',
          kind: 'judgement',
          statement: 'A rule pointing at a clause that was never shown.',
          scope: 'sentence',
          register: 'all',
          enforcement: 'raises_findings',
          excepted_contexts: [],
          excepted_terms: [],
          topic: null,
          payload: {},
        },
      ],
    });
  }
  // T-409 — the creator's agent pane, for the same reason the two branches
  // above exist: the substrate has to be able to drive the propose-confirm path
  // through a browser without a provider.
  if (system.includes('revise ONE section’s description')) {
    return JSON.stringify({
      brief:
        'Set out the three constraints in bullets — the made ground, the perched water and the ' +
        'PAH hotspots — one line each, with no commentary between them.',
      followUp: null,
    });
  }
  // T-407 — THE DRAFTING CALL, under the AUTHOR'S OWN HEADINGS. Until the
  // outline was composed there was nothing to answer under: the fallback below
  // returns prose, every sentence landed outside every section, and the creator
  // could only ever be photographed producing an EMPTY document. The headings
  // are read back off the prompt's own numbered outline, which is the same tell
  // the branches above use, and one grounded sentence is written under each so
  // the coverage statement has something true to report.
  const outline = [...system.matchAll(/^ {2}\d+\. (.+?) — /gm)].map((match) => match[1]);
  if (outline.length > 0) {
    return outline
      .map(
        (heading) =>
          `${heading}\n\nThe investigation recorded contamination exceedances at the compound. [S1]`,
      )
      .join('\n\n');
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
