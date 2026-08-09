// Screenshot capture for the document-management user story (T-354 era).
// Drives the seeded Wrenfield world through the two journeys of
// docs/architecture/user-stories.md against the running e2e substrate,
// screenshotting each beat into ./shots/ (gitignored, full-res @2x).
//
// Prerequisites (see docs/architecture/user-stories-walkthrough.html footer):
//   pnpm --filter @infora/db run seed                 # fresh world — the run mutates it
//   PORT=3210 pnpm --filter @infora/api run start:e2e
//   API_PROXY_TARGET=http://localhost:3210 pnpm --filter @infora/web exec vite --port 5273 --strictPort
// Then:  node scripts/user-story-walkthrough/capture.mjs
// Downscale into the committed views:
//   for f in scripts/user-story-walkthrough/shots/*.png; do
//     sips --resampleWidth 1440 "$f" --out "docs/architecture/user-story-screens/$(basename $f)"; done
// And rebuild the page:  node scripts/user-story-walkthrough/build.mjs
/* global document, window, MouseEvent */ // page.evaluate bodies run in the browser
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const requireFromE2e = createRequire(path.join(repoRoot, 'e2e', 'package.json'));
const { chromium, request } = requireFromE2e('@playwright/test');

const API = 'http://localhost:3210';
const WEB = 'http://localhost:5273';
const OUT = path.join(fileURLToPath(new URL('.', import.meta.url)), 'shots');
fs.mkdirSync(OUT, { recursive: true });

const PASSWORD = 'wrenfield-dev';
const ELEANOR = 'eleanor.price@calderhale.example';
const RACHEL = 'rachel.bowen@trentmoor.example';

const DRAFT_V1 = `EIA Scoping Method Statement - Land Quality
Routewide, Wrenfield-Ashcombe 400kV Connection

1. Purpose and scope
This method statement sets out the approach to scoping the Land Quality chapter of the
Environmental Impact Assessment for the routewide works. It draws on the accepted ground
investigation and contamination records held in the project library and identifies the
assessment framework for land contamination, soils and geology along the route corridor.

2. Baseline sources
The desk study draws on the Phase 2 Ground Investigation Report (WA-GEO-GIR-004), the
Environmental Baseline Report (WA-ENV-BAS-003) and the Flood Risk Assessment (WA-WAT-FRA-001).
The GIR records PAH exceedances at three trial pits south of the Wrenfield substation and a
perched water table within the made ground west of Ashcombe Lane.

3. Conceptual site model
A conceptual site model has been prepared for each land parcel crossed by the route. Sources
considered include historic landfill, agricultural fuel storage and made ground associated
with the former works. Pathways assessed are direct contact, leaching to controlled waters
and ground gas migration. Receptors are construction workers, future maintenance staff,
adjacent residents and the underlying secondary aquifer.

4. Assessment methodology
Significance will be assessed following the Land Contamination Risk Management (LCRM)
framework. Where the preliminary risk assessment identifies a potentially unacceptable risk,
a remediation options appraisal will be scoped for the affected parcel. Asbestos in soils
will be screened at every parcel with made ground, in line with CAR-SOIL guidance.

5. Reporting
The chapter will report by route section, with parcel-level findings tabulated in an
appendix. Mitigation will be secured through the CoCP and parcel-specific remediation
statements where the options appraisal requires them.`;

const DRAFT_V2 = DRAFT_V1.replace(
  `Significance will be assessed following the Land Contamination Risk Management (LCRM)
framework. Where the preliminary risk assessment identifies a potentially unacceptable risk,
a remediation options appraisal will be scoped for the affected parcel. Asbestos in soils
will be screened at every parcel with made ground, in line with CAR-SOIL guidance.`,
  `Significance will be assessed following the Land Contamination Risk Management (LCRM)
framework, applying the tiered approach in LCRM Stage 1 before any intrusive scoping. Where
the preliminary risk assessment identifies a potentially unacceptable risk, a remediation
options appraisal will be scoped for the affected parcel and reported against BS 10175.
Asbestos in soils will be screened at every parcel with made ground, in line with CAR-SOIL
guidance, and the screening threshold is stated per parcel in Appendix LQ-2.`,
);

// ── tiny API client (mirrors e2e ApiSession) ────────────────────────────────
async function login(email) {
  const ctx = await request.newContext({ baseURL: API });
  const res = await ctx.post('/auth/session', { data: { email, password: PASSWORD } });
  if (res.status() !== 204) throw new Error(`login failed for ${email}: ${res.status()}`);
  return {
    ctx,
    async get(p) { return json(await ctx.get(p)); },
    async post(p, data = {}) { return json(await ctx.post(p, { data })); },
    async patch(p, data) { return json(await ctx.patch(p, { data })); },
  };
}
async function json(res) {
  if (!res.ok()) throw new Error(`${res.status()} on ${res.url()}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── browser helpers ─────────────────────────────────────────────────────────
async function signIn(page, email) {
  await page.goto(WEB + '/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Wrenfield–Ashcombe 400kV Connection').first().waitFor();
}

let shotCount = 0;
async function shot(page, name) {
  await page.waitForTimeout(450); // let fonts/hover states settle
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  shotCount++;
  console.log(`  shot ${name}`);
}

// a recorded response closes its form on the refetch — wait for that, not
// for text (the open textarea's value also matches getByText)
async function responseFormClosed(page) {
  const form = page.getByPlaceholder('The response — how the comment is addressed…');
  for (let i = 0; i < 40; i++) {
    if ((await form.count()) === 0) return;
    await page.waitForTimeout(250);
  }
  throw new Error('response form never closed');
}

// after a comment posts, its .then() clears the composer — wait for that
// before filling the next comment, or the clear wipes the fill (race)
async function composerCleared(page) {
  const box = page.getByPlaceholder('Add a review comment…');
  for (let i = 0; i < 40; i++) {
    if ((await box.inputValue()) === '') return;
    await page.waitForTimeout(250);
  }
  throw new Error('comment composer never cleared');
}

async function selectText(page, needle, fallbackIndex = 0) {
  await page.locator('.review-pdf .textLayer span').first().waitFor();
  await page.evaluate(
    ({ needle, fallbackIndex }) => {
      const spans = [...document.querySelectorAll('.review-pdf .textLayer span')].filter(
        (s) => (s.textContent ?? '').trim().length > 3,
      );
      let span = spans.find((s) => (s.textContent ?? '').toLowerCase().includes(needle.toLowerCase()));
      if (!span) span = spans[fallbackIndex] ?? spans[0];
      if (!span) throw new Error('no selectable text on the PDF');
      const node = span.firstChild;
      const text = node.textContent ?? '';
      const i = text.toLowerCase().indexOf(needle.toLowerCase());
      const range = document.createRange();
      if (i >= 0) {
        range.setStart(node, i);
        range.setEnd(node, i + needle.length);
      } else {
        range.setStart(node, 0);
        range.setEnd(node, text.length);
      }
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      span.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    },
    { needle, fallbackIndex },
  );
  await page.getByRole('button', { name: 'Clear anchor' }).waitFor();
}

// ── the run ─────────────────────────────────────────────────────────────────
const eleanorApi = await login(ELEANOR);
const rachelApi = await login(RACHEL);
const me = await eleanorApi.get('/me');
const projectId = me.participants[0].projectId;

const plan = await eleanorApi.get(`/projects/${projectId}/plan`);
const row = plan.items.find((r) => r.documentReference === 'WA-EIA-MST-001');
if (!row) throw new Error('seeded WA-EIA-MST-001 not found — reseed the DB');
const containerId = row.containerId;
console.log(`project ${projectId}, container ${containerId}`);

const browser = await chromium.launch();
const eCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const rCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const e = await eCtx.newPage();
const r = await rCtx.newPage();

console.log('consultant lane —');
await signIn(e, ELEANOR);
await shot(e, '00-workspace');

await e.goto(`${WEB}/projects/${projectId}/plan`);
await e.getByText('WA-EIA-MST-001').first().waitFor();
await shot(e, '01-plan');

await e.getByText('WA-EIA-MST-001').first().click();
await e.getByText('Authoring team').first().waitFor();
await shot(e, '02-plan-drawer');
await e.keyboard.press('Escape');

// the draft, bound to the waiting container
const doc = await eleanorApi.post(`/projects/${projectId}/sandbox-documents`, {
  title: 'Land Quality scoping method statement — working draft',
  containerId,
});
await eleanorApi.patch(`/sandbox-documents/${doc.id}`, { content: DRAFT_V1 });

await e.goto(`${WEB}/projects/${projectId}/sandbox`);
await e.getByText('Land Quality scoping method statement').first().waitFor();
await shot(e, '03-sandbox');

await e.goto(`${WEB}/projects/${projectId}/editor/${doc.id}`);
await e.getByText('Conceptual site model', { exact: false }).first().waitFor();
await shot(e, '04-editor');

// promotion: P01, round 1 submitted
const p1 = await eleanorApi.post(`/sandbox-documents/${doc.id}/promotion`);
console.log(`promoted ${p1.versionReference}, round ${p1.roundNumber}`);

await e.goto(`${WEB}/projects/${projectId}/review/${containerId}`);
await e.getByText('Submitted', { exact: false }).first().waitFor();
await shot(e, '05-submitted');

console.log('reviewer lane —');
await signIn(r, RACHEL);
await r.goto(`${WEB}/projects/${projectId}/review/${containerId}`);
await r.getByRole('button', { name: 'Acknowledge submission' }).waitFor();
await shot(r, '06-acknowledge');
await r.getByRole('button', { name: 'Acknowledge submission' }).click();
await r.getByText('Open for review', { exact: false }).first().waitFor().catch(() => {});

await r.goto(`${WEB}/projects/${projectId}/review/${containerId}/cycle`);
await r.locator('.review-pdf canvas').first().waitFor();

// comment 1 — anchored to the conceptual site model passage, coded
const codes = (await rachelApi.get(`/projects/${projectId}/acceptance-codes`)).items;
const commentCode = codes.find((c) => c.level !== 'deliverable' && !c.isAccepting) ?? codes[0];
await selectText(r, 'conceptual site model', 12);
await r.getByPlaceholder('Add a review comment…').fill(
  'The CSM must state the assumed thickness of made ground per parcel — the perched water table west of Ashcombe Lane makes this contractually material.',
);
// the comment-code select is the first select in the DRR column; the lead's
// verdict select sits below it and must not be touched here
await r.locator('.review-drr select').first().selectOption(commentCode.id);
await shot(r, '07-commenting');
await r.getByRole('button', { name: 'Comment', exact: true }).click();
await r.getByText('The CSM must state', { exact: false }).first().waitFor();
await composerCleared(r);

// comment 2 — the asbestos screening threshold
await selectText(r, 'Asbestos in soils', 20);
await r.getByPlaceholder('Add a review comment…').fill(
  'State the CAR-SOIL screening threshold you will apply; "in line with guidance" is not auditable.',
);
await r.locator('.review-drr select').first().selectOption(commentCode.id);
await r.getByRole('button', { name: 'Comment', exact: true }).click();
await r.getByText('screening threshold', { exact: false }).first().waitFor();
await composerCleared(r);

// comment 3 — a deliberation point that will take a no-change response
await selectText(r, 'route section', 30);
await r.getByPlaceholder('Add a review comment…').fill(
  'Consider reporting by parcel rather than by route section for the appendix tables.',
);
await r.getByRole('button', { name: 'Comment', exact: true }).click();
await r.getByText('reporting by parcel', { exact: false }).first().waitFor();

await r.reload();
await r.locator('.review-pdf canvas').first().waitFor();
await r.locator('.review-pdf-overlay [aria-label="anchored comment highlight"]').first().waitFor();
await shot(r, '08-round-open');

// the wall: the authoring side sees nothing of the open round
await e.goto(`${WEB}/projects/${projectId}/review/${containerId}/cycle`);
await e.locator('.review-pdf canvas').first().waitFor();
await shot(e, '09-wall');

// per-reviewer completion on the status page
await r.goto(`${WEB}/projects/${projectId}/review/${containerId}`);
await r.getByRole('button', { name: 'Mark my review complete' }).click();
await r.getByText('Review complete').first().waitFor();
await shot(r, '10-completion');

// the verdict and the issue modal (revise-and-resubmit)
const reviseCode = codes.find((c) => c.level !== 'comment' && !c.isAccepting);
await r.goto(`${WEB}/projects/${projectId}/review/${containerId}/cycle`);
await r.locator('.review-pdf canvas').first().waitFor();
await r.getByText('Deliverable verdict').waitFor();
await r.locator('.review-drr select').last().selectOption(reviseCode.id);
await r.getByRole('button', { name: 'Close & issue the round' }).click();
await r.getByText('The snapshot freezes', { exact: false }).waitFor();
await shot(r, '11-issue-modal');
await r.getByRole('button', { name: 'Issue for revision' }).click();
await r.getByText('Issued', { exact: false }).first().waitFor().catch(() => {});

// the consultant answers — the ADR-0004 two-way choice
await e.reload();
await e.locator('.review-pdf canvas').first().waitFor();
await e.getByRole('button', { name: 'Respond' }).first().waitFor();
await e.getByRole('button', { name: 'Respond' }).first().click();
await e.getByPlaceholder('The response — how the comment is addressed…').fill(
  'Made-ground thickness now stated per parcel in the CSM table; the Ashcombe Lane perched water table is called out explicitly.',
);
await e.getByPlaceholder('The revised passage that answers it — the link into the next version…').fill(
  'the tiered approach in LCRM Stage 1 before any intrusive scoping',
);
await shot(e, '12-respond');
await e.getByRole('button', { name: 'Record the response' }).click();
await responseFormClosed(e);
await e.getByText('Change prepared for the next revision', { exact: false }).first().waitFor();

// second comment: change declared; third: explicit no-change
await e.getByRole('button', { name: 'Respond' }).first().click();
await e.getByPlaceholder('The response — how the comment is addressed…').fill(
  'The screening threshold is now stated per parcel in Appendix LQ-2.',
);
await e.getByPlaceholder('The revised passage that answers it — the link into the next version…').fill(
  'the screening threshold is stated per parcel in Appendix LQ-2',
);
await e.getByRole('button', { name: 'Record the response' }).click();
await responseFormClosed(e);

await e.getByRole('button', { name: 'Respond' }).first().click();
await e.getByPlaceholder('The response — how the comment is addressed…').fill(
  'Route-section reporting is retained: the CoCP and the DCO both reference route sections, and parcel tables sit in the appendix already.',
);
await e.getByText('No change was made').click();
await e.getByPlaceholder('Why no change was made…').fill('reporting structure follows the DCO — parcel detail already in the appendix');
await e.getByRole('button', { name: 'Record the response' }).click();
await responseFormClosed(e);
await e.getByText('no change:', { exact: false }).first().waitFor();
await shot(e, '13-responses');

// v2 back: promotion stamps the change links, round 2 opens at the gate
await eleanorApi.patch(`/sandbox-documents/${doc.id}`, { content: DRAFT_V2 });
const p2 = await eleanorApi.post(`/sandbox-documents/${doc.id}/promotion`);
console.log(`promoted ${p2.versionReference}, round ${p2.roundNumber}`);
await rachelApi.post(`/rounds/${p2.roundId}/acknowledge`);

await r.goto(`${WEB}/projects/${projectId}/review/${containerId}/cycle`);
await r.locator('.review-pdf canvas').first().waitFor();
// expand the collapsed round 1 and bring its stamped response into view
await r.getByText('Round 1', { exact: false }).first().click();
await r.getByText('Changed in P02', { exact: false }).first().waitFor();
await r.getByText('Changed in P02', { exact: false }).first().scrollIntoViewIfNeeded();
await shot(r, '14-round2');

// acceptance — after the click, wait on the RECORD (the API), not on page
// text: "Accepted" also matches the verdict select's own label, and
// navigating early aborts the in-flight issue call
const acceptingCode = codes.find((c) => c.isAccepting);
await r.reload();
await r.locator('.review-pdf canvas').first().waitFor();
await r.getByText('Deliverable verdict').waitFor();
await r.locator('.review-drr select').last().selectOption(acceptingCode.id);
await r.getByRole('button', { name: 'Close & issue the round' }).click();
await r.getByText('accepts the deliverable', { exact: false }).waitFor();
await shot(r, '15-accept-modal');
await r.getByRole('button', { name: 'Accept & publish' }).click();
for (let i = 0; i < 60; i++) {
  const cyc = await rachelApi.get(`/containers/${containerId}/cycle`);
  if (cyc?.state === 'accepted') break;
  await r.waitForTimeout(500);
}

// the controlled record in the project library
await r.goto(`${WEB}/projects/${projectId}/documents`);
await r.getByText('WA-EIA-MST-001').first().waitFor();
await shot(r, '16-library');

// the closing beat: the status page at Complete. (The library modal's
// embedded PDF is a MimeHandlerView — Chromium never composites it into a
// screenshot, headed or headless, so that beat is not capturable.)
await r.goto(`${WEB}/projects/${projectId}/review/${containerId}`);
await r.getByText('Complete').first().waitFor();
await shot(r, '17-accepted-status');

await browser.close();
await eleanorApi.ctx.dispose();
await rachelApi.ctx.dispose();
console.log(`done — ${shotCount} shots in ${OUT}`);
