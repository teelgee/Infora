// Screenshot capture for the document-management user story (T-368 recapture).
// Drives the seeded Wrenfield world through the journeys of
// docs/architecture/user-stories.md against the running e2e substrate,
// screenshotting each beat into ./shots/ (gitignored, full-res @2x).
//
// Prerequisites (see docs/architecture/user-stories-walkthrough.html footer).
// SEED FIRST, THEN START THE API — in that order, every time: the e2e server
// builds an index at boot, so an API left running across a reseed serves a
// stale one and this script fails in ways that look like selector rot.
//   pnpm --filter @infora/db run seed                 # fresh world — the run mutates it
//   PORT=3210 pnpm --filter @infora/api run start:e2e
//   API_PROXY_TARGET=http://localhost:3210 pnpm --filter @infora/web exec vite --port 5273 --strictPort
// Then:  node scripts/user-story-walkthrough/capture.mjs
// Downscale into the committed views:
//   for f in scripts/user-story-walkthrough/shots/*.png; do
//     sips --resampleWidth 1440 "$f" --out "docs/architecture/user-story-screens/$(basename $f)"; done
// And rebuild the page:  node scripts/user-story-walkthrough/build.mjs
//
// AFTERWARDS: this run mutates the seeded world (it plans rows, plan-locks the
// org sandbox, promotes and accepts a deliverable), so the e2e suite must be
// re-run on a fresh seed with the API restarted before it means anything — the
// same seed-then-start order as above. Every iteration of the capture needs the
// same reset; re-running it against a world it has already been through fails
// on the second bind.
//
// Slice Walkthrough (T-355, T-358–T-366) moved the product under the previous
// capture, so this run also drives: the owner's schema screen (S1), the
// structure builder and its agent (S6), the three-way folder mode beside the
// QA gate (S7/S9), the plan-locked tree (S7), the bind confirmation card (S8),
// and — the one non-cosmetic change — the REAL internal QA path (S9). The gate
// is default-on for project sandboxes, so the live head is refused: the draft
// is frozen, an internal lead reviewer is staffed, the org-private round runs
// and accepts, and promotion then issues the QA-accepted frozen version. Both
// promotions in this script take that road; the gate is never turned off.
//
// T-400 (2026-08-31) added THE TOOLS, at the foot of this script and at the
// foot of the page: a section per tool — the document creator, then the QA
// checker — photographed action by action. They run LAST on purpose. The
// journey's acts have to photograph the world the story leaves them, and a
// tool that writes a draft into the sandbox halfway through would put a stray
// document in Act II's shots. The checker's own section works a draft of its
// own, because by the time it runs the journey's draft has been frozen,
// promoted and accepted, and a frozen head is read-only.
//
// T-447 (2026-10-26) added THE APP BUILDER, the last section on the page: Apps
// beside Tools, the agent-led build, the publish gate, a returns app met by a
// contractor and by the client, a rejection and where the contractor finds it,
// the cost dashboard fed from a spreadsheet, and the firm's template shelf.
// The building agent answers through the e2e fake model, as the suite drives it.
/* global document, window, MouseEvent */ // page.evaluate bodies run in the browser
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const requireFromE2e = createRequire(path.join(repoRoot, 'e2e', 'package.json'));
const { chromium, request } = requireFromE2e('@playwright/test');
// T-447 — the app builder's section needs a real workbook to upload; the e2e
// suite's own writer is reused rather than copied (Node 24 reads .ts directly).
import { costReport, XLSX_MIME } from '../../e2e/tests/support/workbook.ts';
// a screen is stored as JSON — the contracts' `serialiseAppScreen` is this call
const serialiseAppScreen = JSON.stringify;

// the ports honour the same E2E_API_PORT / E2E_WEB_PORT as e2e/playwright.config.ts
const API = `http://localhost:${process.env['E2E_API_PORT'] ?? '3210'}`;
const WEB = `http://localhost:${process.env['E2E_WEB_PORT'] ?? '5273'}`;
const OUT = path.join(fileURLToPath(new URL('.', import.meta.url)), 'shots');
// 🔒 EMPTIED FIRST, and this is not tidiness (found by T-404's recapture).
// `shots/` is gitignored, so it accumulates across runs — and when a beat is
// RENAMED, its old file stays behind. The downscale step in the recipe above
// copies `shots/*.png` wholesale, so six screenshots of the creator as it was
// BEFORE this slice re-cut it were copied into the committed folder beside
// their replacements and would have shipped as part of the page's asset set.
// The duplicate-shot guard could not catch it: it checksums the frames this
// run wrote, not the directory it wrote them into. Emptying the directory is
// the only place the two can be made the same thing.
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const PASSWORD = 'wrenfield-dev';
const ELEANOR = 'eleanor.price@calderhale.example';
const RACHEL = 'rachel.bowen@trentmoor.example';
const OWEN = 'owen.vance@calderhale.example';

const WORKING_TITLE = 'Land Quality scoping method statement — working draft';

// The seed carries one Calder & Hale plan row. A plan-locked tree derives from
// the plan, so a one-row plan makes nonsense of that beat — these four rows go
// in through the ordinary plan endpoint (what the UI's "New deliverable" and
// T-359's batch import both call) so the tree has something to derive from.
const EXTRA_ROWS = [
  {
    documentReference: 'WA-EIA-MST-002',
    title: 'EIA Scoping Method Statement — Ecology',
    metadata: { discipline: 'EEN', suitability: 'S1', security: 'OFFICIAL', nativeFormat: 'DOCX' },
  },
  {
    documentReference: 'WA-GEO-GIR-005',
    title: 'Factual Ground Investigation Report — Phase 3',
    metadata: { discipline: 'EGE', suitability: 'S2', security: 'OFFICIAL', nativeFormat: 'DOCX' },
  },
  {
    documentReference: 'WA-GEO-IRP-001',
    title: 'Interpretative Ground Investigation Report',
    metadata: { discipline: 'EGE', suitability: 'S1', security: 'OFFICIAL', nativeFormat: 'DOCX' },
  },
  {
    documentReference: 'WA-DRN-SUR-001',
    title: 'Surface Water Drainage Strategy',
    metadata: { discipline: 'EDR', suitability: 'S1', security: 'OFFICIAL', nativeFormat: 'DOCX' },
  },
];

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
    async put(p, data) { return json(await ctx.put(p, { data })); },
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
// The duplicate guard, IN CODE (review, 2026-08-31): byte-identical pairs are
// the capture's known failure — a shot of the wrong thing that happens to
// match its neighbour — and until now catching them was a manual checksum
// step a record once described as automated. Every shot's hash is kept; the
// run FAILS at the end if any two match, naming the pair.
import { createHash } from 'node:crypto';
const shotHashes = new Map();
async function shot(page, name) {
  await page.waitForTimeout(450); // let fonts/hover states settle
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  const digest = createHash('sha1').update(fs.readFileSync(file)).digest('hex');
  const twin = shotHashes.get(digest);
  if (twin !== undefined) {
    throw new Error(`duplicate shot: ${name}.png is byte-identical to ${twin}.png — the capture photographed the wrong thing`);
  }
  shotHashes.set(digest, name);
  shotCount++;
  console.log(`  shot ${name}`);
}

// the sandbox screen never auto-selects: the toolbar (Folder structure,
// Settings) and the folder tree only exist once a sandbox card is clicked
async function openOrgSandbox(page) {
  await page.goto(`${WEB}/projects/${projectId}/sandbox`);
  await page.locator('.sandbox-card').filter({ hasNotText: 'Personal' }).first().click();
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor();
}
async function enterDeliverableFolder(page) {
  await page.locator('.tree-name', { hasText: 'EEN' }).first().click();
  await page.locator('.tree-name', { hasText: 'WA-EIA-MST-001' }).first().click();
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

// The findings panel scrolls INSIDE the page rather than with it, so
// `scrollIntoView` moves the wrong thing and leaves the beat photographing
// whatever the panel happened to be showing. Walk up to whatever actually
// scrolls and put the target at its top.
async function panelTop(locator) {
  await locator.evaluate((el) => {
    let box = el.parentElement;
    while (box !== null && box.scrollHeight <= box.clientHeight) box = box.parentElement;
    if (box === null) return;
    box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top;
  });
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
const owenApi = await login(OWEN);
const me = await eleanorApi.get('/me');
const projectId = me.participants[0].projectId;

const participants = (await eleanorApi.get(`/projects/${projectId}/participants`)).items;
const owen = participants.find((p) => p.name === 'Owen Vance');
if (!owen) throw new Error('Owen Vance not on the project — reseed the DB');

const plan0 = await eleanorApi.get(`/projects/${projectId}/plan`);
const row = plan0.items.find((r) => r.documentReference === 'WA-EIA-MST-001');
if (!row) throw new Error('seeded WA-EIA-MST-001 not found — reseed the DB');
const containerId = row.containerId;
const planTitle = row.workItem.title;
console.log(`project ${projectId}, container ${containerId}`);

// the plan the tree will derive from: the seeded row gains its schema
// attributes, four more rows join it, and the org fixes its column standard
await eleanorApi.patch(`/containers/${containerId}`, {
  metadata: { discipline: 'EEN', suitability: 'S2', security: 'OFFICIAL', nativeFormat: 'DOCX' },
});
for (const r of EXTRA_ROWS) {
  if (plan0.items.some((i) => i.documentReference === r.documentReference)) continue;
  await eleanorApi.post(`/projects/${projectId}/plan`, r);
}
// T-360 — the org-standard column set, set once for every Calder & Hale member
await eleanorApi.put(`/projects/${projectId}/plan/columns`, {
  columns: ['discipline', 'suitability', 'security'],
});

const codes = (await rachelApi.get(`/projects/${projectId}/acceptance-codes`)).items;
const commentCode = codes.find((c) => c.level !== 'deliverable' && !c.isAccepting) ?? codes[0];
const reviseCode = codes.find((c) => c.level !== 'comment' && !c.isAccepting);
const acceptingCode = codes.find((c) => c.isAccepting);

const browser = await chromium.launch();
const ctxOpts = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
const eCtx = await browser.newContext(ctxOpts);
const rCtx = await browser.newContext(ctxOpts);
const oCtx = await browser.newContext(ctxOpts);
const e = await eCtx.newPage();
const r = await rCtx.newPage();
const o = await oCtx.newPage();

// ── Act I — the plan decides first ──────────────────────────────────────────
console.log('owner lane — the schema');
await signIn(r, RACHEL);
await r.goto(`${WEB}/projects/${projectId}/plan/scheme`);
await r.getByText('Deliverable schema').first().waitFor();
await r.getByRole('button', { name: 'Download Excel template' }).waitFor();
await shot(r, '00-schema');
// T-371 — the review period's project default, its own settings section beside
// the schema and deliberately not a field inside it
await r.getByText('Review period', { exact: true }).scrollIntoViewIfNeeded();
await shot(r, '00a-review-period');
// T-390 — the acceptance-code editor, its own section further down the same
// screen: what "accepted" means on this project, and which codes admit a
// deliverable to the AI's reach. The blast-radius column is the beat.
// scrollIntoViewIfNeeded is a no-op when the heading already peeks into the
// viewport, which left this beat photographing the review-period card above it
// (caught byte-identical in review) — scroll the heading to the TOP explicitly
// so the table below it is what the viewport holds
await r
  .getByText('Acceptance codes', { exact: true })
  .evaluate((el) => el.scrollIntoView({ block: 'start' }));
// the label cell is an INPUT for an owner who may edit it, so the row is found
// by its code rather than by its description
await r.getByRole('row').filter({ hasText: 'A1' }).first().waitFor();
await shot(r, '00b-acceptance-codes');
// the blast-radius beat is captured LATER, after acceptance: photographed here
// the count would read zero, and a screenshot of "this will exclude 0
// deliverables" argues the opposite of the thing it is there to show.

// T-467 / T-473 / T-481 — the owner's home as a work queue: what is waiting on her, with
// an overdue milestone among it
await r.goto(`${WEB}/projects/${projectId}`);
const queue = r.getByRole('list', { name: 'Waiting on you' });
await queue
  .getByRole('button', { name: /Overdue: WA-EIA-MST-001 should have reached S3 by/ })
  .waitFor();
await shot(r, '00c-work-queue');

// T-481 — the same milestone on the schedule: the coverage line above the register,
// and the Next milestone column carrying the date, the code and the Overdue mark on the row
await r.goto(`${WEB}/projects/${projectId}/plan`);
const strip = r.getByRole('region', { name: 'Coverage' });
await strip.getByTestId('coverage-summary').waitFor();
await r.getByRole('table', { name: 'Deliverables plan' }).getByRole('row').nth(1).waitFor();
await r.waitForTimeout(300);
await shot(r, '00d-milestones');

console.log('consultant lane —');
await signIn(e, ELEANOR);
await shot(e, '01-workspace');

await e.goto(`${WEB}/projects/${projectId}/plan`);
await e.getByText('WA-EIA-MST-001').first().waitFor();
await e.getByText('WA-DRN-SUR-001').first().waitFor();
await shot(e, '02-plan');

// T-361 — the row's detail is a card now, not a right-hand drawer
await e.getByText('WA-EIA-MST-001').first().click();
await e.getByText('Authoring team').first().waitFor();
await shot(e, '03-plan-detail');
await e.keyboard.press('Escape');

// ── Act II — drafting in the sandbox ────────────────────────────────────────
// the working draft lands first: creating it provisions Calder & Hale's
// organisation sandbox, which the structure and settings beats then configure
const doc = await eleanorApi.post(`/projects/${projectId}/sandbox-documents`, { title: WORKING_TITLE });
await eleanorApi.patch(`/sandbox-documents/${doc.id}`, { content: DRAFT_V1 });
const sandboxes = (await eleanorApi.get(`/projects/${projectId}/sandboxes`)).items;
const sandbox = sandboxes.find((s) => s.id === doc.sandboxId);
if (!sandbox || sandbox.isPersonal) throw new Error('the organisation sandbox was not provisioned');
console.log(`sandbox ${sandbox.id} (${sandbox.name})`);

await openOrgSandbox(e);

// T-364 — the structure builder's agent: a free-form ask fills the builder,
// and nothing is created until the super user confirms (ADR-0027)
await e.getByRole('button', { name: 'Folder structure' }).click();
const structure = e.getByRole('dialog');
await structure
  .getByPlaceholder('Describe the structure you want')
  .fill('One area per discipline on our plan, with survey and reporting inside each');
await structure.getByRole('button', { name: 'Propose', exact: true }).click();
await structure.getByRole('button', { name: /^Create \d+ folders?$/ }).waitFor();
await shot(e, '04-structure');
await structure.getByRole('button', { name: 'Cancel' }).click();
await structure.waitFor({ state: 'hidden' });

// T-365 + T-355 — the settings surface: three folder modes, and the QA gate
await e.getByRole('button', { name: 'Settings', exact: true }).click();
const settings = e.getByRole('dialog');
await settings
  .getByRole('combobox')
  .first()
  .selectOption({ label: 'Locked to the plan — the tree follows the deliverables' });
await shot(e, '05-settings');
await settings.getByRole('button', { name: 'Save settings' }).click();
await settings.waitFor({ state: 'hidden' });

// the derived tree: a discipline folder per plan discipline, a working folder
// per deliverable — system-owned, backfilled from the rows that already exist.
// (Saving the mode does not refetch the folder list, hence the reload.)
await openOrgSandbox(e);
await e.locator('.tree-name', { hasText: 'EEN' }).first().waitFor();
for (const discipline of ['EDR', 'EEN', 'EGE']) {
  await e
    .getByRole('row')
    .filter({ hasText: discipline })
    .getByRole('button', { name: 'Expand folder' })
    .click();
}
await shot(e, '06-plan-locked');

// the draft is filed in its deliverable's folder, which is what makes the
// bind card arrive pre-selected
const folders = (await eleanorApi.get(`/sandboxes/${sandbox.id}/folders`)).items;
const deliverableFolder = folders.find((f) => f.containerId === containerId);
if (!deliverableFolder) throw new Error('no plan-locked folder for WA-EIA-MST-001');
await eleanorApi.post(`/sandbox-documents/${doc.id}/move`, { folderId: deliverableFolder.id });

await openOrgSandbox(e);
await enterDeliverableFolder(e);
await e.getByRole('button', { name: `More actions for ${WORKING_TITLE}` }).waitFor();

// T-366 — bind confirms on a card, pre-selected from the deliverable folder
await e.getByRole('button', { name: `More actions for ${WORKING_TITLE}` }).click();
await e.locator('.dropdown-menu').getByText('Bind', { exact: false }).click();
const bind = e.getByRole('dialog');
await bind.getByText('On bind, this draft becomes').waitFor();
await shot(e, '07-bind');
await bind.getByRole('button', { name: /^Bind to / }).click();
await bind.waitFor({ state: 'hidden' });

// read-through: the bound draft now shows its plan row's title, not its own
await e.getByText(planTitle).first().waitFor();
await shot(e, '08-sandbox');

await e.goto(`${WEB}/projects/${projectId}/editor/${doc.id}`);
await e.getByText('Conceptual site model', { exact: false }).first().waitFor();
await shot(e, '09-editor');

// ── T-336/T-311 — a colleague runs the QA checker over the draft ────────────
//
// v1.md's journey names this beat and until now nothing could photograph it.
// The launcher is reached from the EDITOR's tool chip, which opens the Tools
// route with this draft already chosen — one launcher, one run shape, one place
// the scope is stated (ADR-0053 §1). The run is deterministic here: the
// substrate's fake router answers the check prompt with one MECHANICAL fix and
// one REWRITE, which is what makes the accept-all-above-the-rewrites layout
// visible rather than merely asserted.
// T-400 — THE PLAN AND THE COVERAGE STATEMENT ARE NO LONGER SHOT HERE. They
// were beats 09a and 09b, and they are now the checker's own section at the
// foot of this page, photographed step by step. One journey beat per tool is
// the rule the owner's 2026-08-31 ruling came with: the story says what
// happened, the tool's section shows how. The RUN still happens here, because
// the story depends on it — an open finding blocks promotion at Act III.
console.log('checker lane —');
await e.getByRole('button', { name: 'Check this draft' }).click();
await e.getByRole('heading', { name: 'QA checker' }).waitFor();
await e.getByRole('button', { name: 'See the plan' }).click();
await e.getByText('This is what will run').waitFor();
await e.getByRole('button', { name: 'Run the check' }).click();
await e.getByText('What was checked').waitFor({ timeout: 30_000 });

await e.getByRole('link', { name: /Open the draft/ }).click();
// the panel tabs are anchors WITHOUT hrefs, so they carry no link role
await e.locator('.panel-tabs a').filter({ hasText: 'Checks' }).click();
await e.getByText(/mechanical correction/).waitFor();
await shot(e, '09c-checker-marks');

// ⚠ AND THE MARKS ARE WORKED THROUGH BEFORE ACT III, because they have to be:
// an open finding blocks promotion exactly as an open comment thread does
// (ADR-0049 §7), so a capture that left them open would meet the open-items
// gate at the next beat instead of the QA-source one it is there to show. The
// mechanical group goes in one click; the rewrite is read and set aside, which
// is the distinction ADR-0053 §6 exists to keep on the screen.
await e.getByRole('button', { name: /^Accept \d+ mechanical/ }).click();
await e.getByRole('button', { name: /^Accept \d+ mechanical/ }).waitFor({ state: 'hidden' });
for (;;) {
  const dismiss = e.getByRole('button', { name: 'Dismiss all' }).first();
  if ((await dismiss.count()) === 0) break;
  await dismiss.click();
  await e.waitForTimeout(300);
}

// ── Act III — the internal QA round, and the gate ───────────────────────────
console.log('internal QA lane —');
// the gate, refusing: this sandbox does not promote a live head until the
// draft has been through internal QA
await openOrgSandbox(e);
await enterDeliverableFolder(e);
// T-373 — Promote opens the reconfirming window, and the window states the
// refusal beside a disabled Promote rather than letting it arrive on the click
await e.getByRole('button', { name: `Promote ${planTitle}` }).click();
await e.locator('.banner--error').waitFor();
await shot(e, '10-gate-refused');
await e.keyboard.press('Escape');

// freeze from the Editor — the head locks into the org-private series
await e.goto(`${WEB}/projects/${projectId}/editor/${doc.id}`);
await e.getByRole('button', { name: 'Freeze' }).click();
await e.getByText('Checked out — read-only until released').waitFor();
await shot(e, '11-frozen');

// staff the internal lead reviewer (API only — see the gap card on the page)
// and freeze again, which issues the internal revision and opens the round
const frozen = await eleanorApi.get(`/sandbox-documents/${doc.id}`);
const qaContainerId = frozen.freezeContainerId;
await eleanorApi.post(`/containers/${qaContainerId}/reviewers`, {
  participantId: owen.participantId,
  isLead: true,
});
await eleanorApi.post(`/sandbox-documents/${doc.id}/freeze`);
const qaRound1 = (await owenApi.get(`/containers/${qaContainerId}/cycle`)).rounds.at(-1);
console.log(`internal QA round ${qaRound1.number} on ${qaContainerId}`);

console.log('internal reviewer lane —');
await signIn(o, OWEN);
await o.goto(`${WEB}/projects/${projectId}/review/${qaContainerId}/cycle`);
await o.locator('.review-pdf canvas').first().waitFor();
await selectText(o, 'Phase 2 Ground Investigation', 8);
await o.getByPlaceholder('Add a review comment…').fill(
  'Cite the GIR by its accepted revision, not just its number — the client checks it against the library, and this goes out under our name.',
);
await o.locator('.review-drr select').first().selectOption(commentCode.id);
await o.getByRole('button', { name: 'Comment', exact: true }).click();
await o.getByText('Cite the GIR by its accepted revision', { exact: false }).first().waitFor();
await composerCleared(o);
await shot(o, '12-qa-round');

// the internal verdict, closed and issued from the same cycle screen the
// project review uses — the modal states what the accepting code does
await o.getByText('Deliverable verdict').waitFor();
await o.locator('.review-drr select').last().selectOption(acceptingCode.id);
await o.getByRole('button', { name: 'Close & issue the round' }).click();
await o.getByText('accepts the deliverable', { exact: false }).waitFor();
await shot(o, '13-qa-verdict');
await o.getByRole('button', { name: 'Accept & publish' }).click();
for (let i = 0; i < 60; i++) {
  const qa = await owenApi.get(`/containers/${qaContainerId}/cycle`);
  if (qa?.state === 'accepted') break;
  await o.waitForTimeout(500);
}

// promotion now succeeds — through the window that reconfirms it (T-373):
// what promotes and who accepted it, the plan's identity locked, the review
// group with its lead, the review period prefilled from the project
await openOrgSandbox(e);
await enterDeliverableFolder(e);
await e.getByRole('button', { name: `Promote ${planTitle}` }).click();
const promoteWindow = e.getByRole('dialog');
await promoteWindow.getByText('What promotes').waitFor();
// the window is taller than the standard viewport and the modal scrolls its own
// body, so the beat would otherwise be photographed with its lower half cut off.
// A taller viewport for this one shot captures the whole surface — every other
// beat stays on the 1440×900 the rest of the page is composed at.
await e.setViewportSize({ width: 1440, height: 1180 });
await shot(e, '13a-promotion-window');
await e.setViewportSize({ width: 1440, height: 900 });

await promoteWindow.getByRole('button', { name: 'Promote', exact: true }).click();
await e.locator('.banner--success').waitFor();
await shot(e, '14-promoted');

const round1 = (await eleanorApi.get(`/containers/${containerId}/cycle`)).rounds.at(-1);
console.log(`promoted ${round1.versionReference}, round ${round1.number}`);

// ── Act IV — promotion opens the round ──────────────────────────────────────
await e.goto(`${WEB}/projects/${projectId}/review/${containerId}`);
await e.getByText('Submitted', { exact: false }).first().waitFor();
await shot(e, '15-submitted');

console.log('reviewer lane —');
// T-372 — the appointment is Rachel's to take. Nobody has been notified
// (notifications are deferred, owner 2026-08-22): she finds it by opening the
// deliverable, and until she accepts, NOBODY may acknowledge the submission.
await r.goto(`${WEB}/projects/${projectId}/review/${containerId}`);
await r.getByText('You have been named lead reviewer').waitFor();
await shot(r, '15a-appointment');
await r.getByRole('button', { name: 'Accept the appointment' }).click();
await r.getByText('You have been named lead reviewer').waitFor({ state: 'detached' });

await r.getByRole('button', { name: 'Acknowledge submission' }).waitFor();
await shot(r, '16-acknowledge');
await r.getByRole('button', { name: 'Acknowledge submission' }).click();
await r.getByText('Open for review', { exact: false }).first().waitFor().catch(() => {});

await r.goto(`${WEB}/projects/${projectId}/review/${containerId}/cycle`);
await r.locator('.review-pdf canvas').first().waitFor();

// comment 1 — anchored to the conceptual site model passage, coded
await selectText(r, 'conceptual site model', 12);
await r.getByPlaceholder('Add a review comment…').fill(
  'The CSM must state the assumed thickness of made ground per parcel — the perched water table west of Ashcombe Lane makes this contractually material.',
);
// the comment-code select is the first select in the DRR column; the lead's
// verdict select sits below it and must not be touched here
await r.locator('.review-drr select').first().selectOption(commentCode.id);
await shot(r, '17-commenting');
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
await shot(r, '18-round-open');

// T-356 — moderation in the open (ADR-0007). Rachel amends the third comment to
// absorb a duplicate; the beat is the editor open with the amendment typed, and
// the act itself follows. The comments are ordered by creation, so nth(2) is the
// "reporting by parcel" one.
//
// The scroll is explicit and deliberate: `scrollIntoViewIfNeeded` is a no-op
// when the target already peeks into the viewport, which is how 00b-acceptance-
// codes came out a byte-identical duplicate of the card above it (caught in
// review, 1479b26). Scroll the DRR column's head to the TOP so the comment
// being moderated is what the viewport holds.
await r.getByRole('button', { name: 'Edit as lead reviewer' }).nth(2).click();
await r
  .getByLabel('Moderate this comment')
  .fill(
    'Consider reporting by parcel rather than by route section for the appendix tables. ' +
      'Amended by the lead reviewer: this absorbs the duplicate raised separately on the same point.',
  );
// the DRR column scrolls independently of the page, so the scroll has to be
// driven from the element being photographed — and from the TEXTAREA rather
// than the column, or the editor's own Save/Cancel stay below the fold.
// `scrollTop = 0` puts the start of the amended comment in view: a box scrolled
// to its tail photographs an edit whose subject is invisible.
await r.getByLabel('Moderate this comment').evaluate((el) => {
  el.scrollTop = 0;
  el.scrollIntoView({ block: 'center' });
});
await shot(r, '18a-moderation');
await r.getByRole('button', { name: 'Save amendment' }).click();
await r.getByText('absorbs the duplicate', { exact: false }).first().waitFor();

// the wall: the authoring side sees nothing of the open round
await e.goto(`${WEB}/projects/${projectId}/review/${containerId}/cycle`);
await e.locator('.review-pdf canvas').first().waitFor();
await shot(e, '19-wall');

// T-375 — the same wall on the review record, which is where it is a design
// decision rather than a side-effect: the open round's rows are ABSENT, under a
// notice saying content exists and why it is out of reach. Silence would read as
// absence, and absence is a different and wrong fact.
await e.goto(`${WEB}/projects/${projectId}/review/${containerId}/record`);
await e.getByText('Its comments are withheld', { exact: false }).waitFor();
await shot(e, '19a-record-wall');

// per-reviewer completion on the status page
await r.goto(`${WEB}/projects/${projectId}/review/${containerId}`);
await r.getByRole('button', { name: 'Mark my review complete' }).click();
await r.getByText('Review complete').first().waitFor();
await shot(r, '20-completion');

// ── Act V — issue, then answer every comment ────────────────────────────────
await r.goto(`${WEB}/projects/${projectId}/review/${containerId}/cycle`);
await r.locator('.review-pdf canvas').first().waitFor();
await r.getByText('Deliverable verdict').waitFor();
await r.locator('.review-drr select').last().selectOption(reviseCode.id);
await r.getByRole('button', { name: 'Close & issue the round' }).click();
await r.getByText('The snapshot freezes', { exact: false }).waitFor();
await shot(r, '21-issue-modal');
await r.getByRole('button', { name: 'Issue for revision' }).click();
await r.getByText('Issued', { exact: false }).first().waitFor().catch(() => {});

// the consultant answers — the ADR-0004 two-way choice. Navigate rather than
// reload: this page was last on the review record (the walled read above), and
// a reload would land back there rather than on the round.
await e.goto(`${WEB}/projects/${projectId}/review/${containerId}/cycle`);
await e.locator('.review-pdf canvas').first().waitFor();
await e.getByRole('button', { name: 'Respond' }).first().waitFor();
await e.getByRole('button', { name: 'Respond' }).first().click();
await e.getByPlaceholder('The response — how the comment is addressed…').fill(
  'Made-ground thickness now stated per parcel in the CSM table; the Ashcombe Lane perched water table is called out explicitly.',
);
await e.getByPlaceholder('The revised passage that answers it — the link into the next version…').fill(
  'the tiered approach in LCRM Stage 1 before any intrusive scoping',
);
await shot(e, '22-respond');
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
await shot(e, '23-responses');

// ── Act VI — acceptance makes it true ───────────────────────────────────────
// version two takes the same road: the gate holds for every promotion, and one
// QA acceptance buys exactly one revision, so v2 runs its own internal pass
await eleanorApi.patch(`/sandbox-documents/${doc.id}`, { content: DRAFT_V2 });
await eleanorApi.post(`/sandbox-documents/${doc.id}/freeze`);
const qaRound2 = (await owenApi.get(`/containers/${qaContainerId}/cycle`)).rounds.at(-1);
await owenApi.post(`/rounds/${qaRound2.id}/deliverable-code`, { acceptanceCodeId: acceptingCode.id });
await owenApi.post(`/rounds/${qaRound2.id}/issue`);
const p2 = await eleanorApi.post(`/sandbox-documents/${doc.id}/promotion`);
console.log(`promoted ${p2.versionReference} from ${p2.source}, round ${p2.roundNumber}`);
await rachelApi.post(`/rounds/${p2.roundId}/acknowledge`);

// T-375 — the cycle screen now carries only the round under review; the
// earlier rounds are not a stack of collapsed sheets here but bands in the one
// record, which is the next shot
await r.goto(`${WEB}/projects/${projectId}/review/${containerId}/cycle`);
await r.locator('.review-pdf canvas').first().waitFor();
await r.getByText('Round 2', { exact: false }).first().waitFor();
await shot(r, '24-round2');

// the record itself: two rounds in ONE appended table, round one closed off by
// the deliverable code it concluded with, each response pointing at the change
// in P02 that answered it
await r.goto(`${WEB}/projects/${projectId}/review/${containerId}/record`);
await r.getByText('Round 1 closed', { exact: false }).waitFor();
await r.getByText('Changed in P02', { exact: false }).first().scrollIntoViewIfNeeded();
await shot(r, '24a-record');

// acceptance — after the click, wait on the RECORD (the API), not on page
// text: "Accepted" also matches the verdict select's own label, and
// navigating early aborts the in-flight issue call. Navigate rather than
// reload: this page was last on the review record, not the round.
await r.goto(`${WEB}/projects/${projectId}/review/${containerId}/cycle`);
await r.locator('.review-pdf canvas').first().waitFor();
await r.getByText('Deliverable verdict').waitFor();
await r.locator('.review-drr select').last().selectOption(acceptingCode.id);
await r.getByRole('button', { name: 'Close & issue the round' }).click();
await r.getByText('accepts the deliverable', { exact: false }).waitFor();
await shot(r, '25-accept-modal');
await r.getByRole('button', { name: 'Accept & publish' }).click();
for (let i = 0; i < 60; i++) {
  const cyc = await rachelApi.get(`/containers/${containerId}/cycle`);
  if (cyc?.state === 'accepted') break;
  await r.waitForTimeout(500);
}

// the controlled record in the project library
await r.goto(`${WEB}/projects/${projectId}/documents`);
await r.getByText('WA-EIA-MST-001').first().waitFor();
await shot(r, '26-library');

// ── T-431/T-432/T-436 — the accepted chapter leaves the platform ───────────
//
// The last beat of the deliverable's life, and the first one that reaches
// somebody with NO INFORA ACCOUNT. The door is on the library row, beside the
// transmittal that stays inside the project. Rachel is the owner organisation's
// super user, which is the strictest of the three levels and the default, so
// she issues rather than requests.
//
// ⚠ THE RECIPIENT'S PAGE IS OPENED IN A CONTEXT WITH NO SESSION, and that is
// the beat rather than a detail: the whole claim is that the link is the
// access. Photographing it from Rachel's own browser would prove nothing,
// because Rachel can already read the document. Opening it also RECORDS THE
// FIRST OPEN (T-436), which is what puts a real receipt in the log shot below
// rather than a fabricated one.
console.log('issuing outside the project —');
// T-461: the row's actions moved into its "…" menu
await r.getByRole('button', { name: 'Actions for WA-EIA-MST-001' }).click();
await r.getByText('Issue externally…').click();
const issueModal = r.getByRole('dialog');
await issueModal.getByText('Anyone holding the link can open it', { exact: false }).waitFor();
await issueModal.getByLabel('Recipient name').fill('Mrs A Patel');
await issueModal.getByLabel('Email address').fill('a.patel@ashcombe-parish.example');
await issueModal
  .getByLabel('Why it is being sent')
  .fill('Statutory consultation response — Ashcombe Lane land parcels');
await issueModal
  .getByLabel('Message to the recipient')
  .fill(
    'The accepted Land Quality scoping method statement referred to in our letter of the 3rd. ' +
      'The link reaches this revision only and expires in 30 days.',
  );
await r.waitForTimeout(200);
await shot(r, '26a-external-issue');
await issueModal.getByRole('button', { name: 'Issue', exact: true }).click();

// the link, handed back to the sender — there is no mail transport yet (T-323
// and T-330 wait on external lead time), so this IS how it reaches her today
const issuedModal = r.getByRole('dialog');
await issuedModal.getByText('is issued to', { exact: false }).waitFor();
await shot(r, '26b-external-link');
const externalLink = await issuedModal.locator('input, code, .mono').first().innerText().catch(() => '');
await issuedModal.getByRole('button', { name: 'Done' }).click();

// the token, read from the record rather than scraped off the screen — the
// modal composes the link from it and the API is the authority on what it is
const issues = await rachelApi.get(`/containers/${containerId}/external-issues`);
const issuedRow = issues.items.find((i) => i.state === 'issued' && i.linkToken !== null);
if (!issuedRow) throw new Error('no issued external row to open');
if (externalLink !== '' && !externalLink.includes(issuedRow.linkToken)) {
  throw new Error('the link on screen does not carry the token the record holds');
}

// 🔒 NO SESSION, NO SHELL, NO PROJECT. A fresh context with no cookies at all.
const xCtx = await browser.newContext(ctxOpts);
const x = await xCtx.newPage();
await x.goto(`${WEB}/external/${issuedRow.linkToken}`);
await x.getByText('Mrs A Patel', { exact: false }).first().waitFor();
await x.waitForTimeout(400);
await shot(x, '26c-external-document');
await xCtx.close();

// and the receipt, back inside the project: the same transmittal log that
// answers "who has this been issued to" for the other two kinds now also
// answers "and have they read it" (T-436).
await r.goto(`${WEB}/projects/${projectId}/review/${containerId}`);
await r.getByText('Transmittals and acknowledgements').first().waitFor();
await r.getByText('Opened', { exact: false }).first().waitFor();
await r
  .getByText('Transmittals and acknowledgements')
  .first()
  .evaluate((el) => el.scrollIntoView({ block: 'center' }));
await r.waitForTimeout(300);
await shot(r, '26d-transmittal-receipt');

// the status page at Complete. (The library modal's embedded PDF is a
// MimeHandlerView — Chromium never composites it into a screenshot, headed or
// headless, so that beat is not capturable.)
await r.goto(`${WEB}/projects/${projectId}/review/${containerId}`);
await r.getByText('Complete').first().waitFor();
await shot(r, '27-accepted-status');

// T-390 — the blast radius, now that A1 has actually admitted a deliverable
console.log('the scheme, after acceptance —');
await r.goto(`${WEB}/projects/${projectId}/plan/scheme`);
await r.getByRole('row').filter({ hasText: 'A1' }).first().waitFor();
await r.getByRole('button', { name: 'Stop grounding' }).first().click();
await r.getByRole('dialog').getByText('from the next question asked', { exact: false }).waitFor();
await shot(r, '27a-blast-radius');
await r.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

// ── Act VII — ending a deliverable that is no longer current ────────────────
// T-389 — the acts that did not exist anywhere before this slice: nothing set
// `superseded`, and withdrawal reached only a producer's own unpublished plan
// row. The owner ends a published deliverable; the producing organisation asks.
console.log('ending a deliverable —');
await r.goto(`${WEB}/projects/${projectId}/documents`);
await r.getByText('WA-EIA-MST-001').first().waitFor();
await r.getByRole('button', { name: 'Actions for WA-EIA-MST-001' }).click();
await r.getByText('Withdraw…', { exact: true }).click();
await r.getByText('Read by everyone who can see this deliverable', { exact: false }).waitFor();
await shot(r, '28-withdraw');
await r.getByRole('textbox').last().fill('The ground model it rests on has been re-issued and no longer supports its conclusions');
await r.getByRole('button', { name: 'Withdraw', exact: true }).click();
await r.getByText('stands as a record', { exact: false }).waitFor();
await shot(r, '29-withdrawn');

// T-388/T-391 — the record, from the producing side: the deliverable stands on
// the plan, badged with WHY it is out of the AI's reach, and the reason its
// producer can read because visibility follows the container.
await e.goto(`${WEB}/projects/${projectId}/plan`);
await e.getByText('WA-EIA-MST-001').first().waitFor();
await e.getByText('WA-EIA-MST-001').first().click();
await e.getByText('Not used for AI answers', { exact: false }).first().waitFor();
await shot(e, '30-context-state');


// ══ THE TOOLS — a section per tool, photographed action by action (T-400) ═══
//
// The owner's ruling of 2026-08-31 widened this page's charter: it carries the
// journey AND the tools, so that no product surface ships without a picture.
// These run LAST and deliberately: the journey's acts have to photograph the
// world the story leaves, and a tool that writes a draft into the sandbox
// halfway through would put a stray document in Act II's shots. Nothing below
// is in the user stories — the tools are things a consultant opens, not beats
// in the deliverable's life — so nothing below writes to user-stories.md
// either.

// ── the document creator ────────────────────────────────────────────────────
console.log('the document creator —');
await e.goto(`${WEB}/projects/${projectId}/tools`);
await e.getByText('Document creator').first().waitFor();
await e.getByText('QA checker').first().waitFor();
await shot(e, 't1-01-tools');

// T-403 — the tiles are CARDS now, and the whole card is the link
const creatorTile = e.getByRole('link', { name: /Document creator/ });
await creatorTile.click();
await e.getByRole('heading', { name: 'Document creator' }).waitFor();
await e.getByText('What this document is').waitFor();
await shot(e, 't1-02-launcher');

// T-406 — four plain questions where "shape" used to be. Each one carries the
// chosen option's own sentence, so the answer explains itself.
await e.getByLabel('What kind of document is this?').selectOption({ label: 'External document' });
await e.getByLabel('What language should it be written in?').selectOption({ label: 'Non-technical' });
await e.getByLabel('Is this a whole document, a chapter or a section?').selectOption({ label: 'Chapter' });
// the style guide the project loaded — the first thing drafting has ever been
// given to write TO, rather than only to be marked against
const styleBox = e.locator('.style-guide-option input[type=checkbox]').first();
if (await styleBox.count()) await styleBox.check();
await shot(e, 't1-03-characteristics');

// T-407 — the outline is COMPOSED. A shipped outline seeds it, and every
// section it puts on screen is then the author's to edit or remove.
await e.getByRole('button', { name: 'Assessment chapter section' }).click();
await e.getByPlaceholder('Heading').first().waitFor();
await e
  .getByText('The outline')
  .first()
  .evaluate((el) => el.scrollIntoView({ block: 'start' }));
await e.waitForTimeout(200);
await shot(e, 't1-04-outline-seeded');

// and edited: one section's purpose rewritten in the author's own words, and
// one removed outright — a template seeds, it does not lock
await e
  .getByPlaceholder('What should go in this section?')
  .first()
  .fill(
    'The statutory test this section answers, in one paragraph, and where in the record it comes from.',
  );
await e.getByRole('button', { name: 'Remove section' }).last().click();
await e.waitForTimeout(200);

// T-412 — AND ONE SECTION GAINS A SUB-SECTION, which is the beat's whole
// subject and was missing from the first recapture of this slice: the controls
// were on screen and nothing had been composed with them, so the feature was
// built, tested and unphotographed. Found by reading the shot back rather than
// by reasoning from the code, which is what §G.1 exists to catch.
await e.getByRole('button', { name: 'Add a sub-section' }).nth(1).click();
await e.getByPlaceholder('Sub-section heading').fill('Survey dates and limitations');
await e
  .getByPlaceholder('What should go in this sub-section?')
  .fill('When each survey was carried out, and what the record says it did not cover.');
await e.waitForTimeout(200);
await shot(e, 't1-05-outline-edited');

await e
  .getByLabel('What is this document for?')
  .fill(
    'The land contamination section for the Ashcombe Lane parcels: the test it answers, the ' +
      'baseline as the ground investigation records it, the effect on the parcels and the ' +
      'mitigation the record already commits to.',
  );
await e.getByLabel('Title').fill('Land contamination — Ashcombe Lane parcels');
await e.getByLabel('Where it goes').selectOption({ label: sandbox.name });
await e
  .getByText('The brief, and where it goes')
  .evaluate((el) => el.scrollIntoView({ block: 'start' }));
await e.waitForTimeout(200);
await shot(e, 't1-06-brief');

// T-405 — the sources say WHAT EACH DOCUMENT IS, not only what it is called.
// They are bound BEFORE anything is drafted; that ordering is the design.
// T-470: the tick-list is now the one Scope control — open it, search a
// reference code, tick the document; the panel stays open for the shot.
const sourcesCard = e.locator('.card').filter({ hasText: 'Sources this draft may use' });
await sourcesCard.getByRole('button', { name: /Scope:/ }).click();
for (const code of ['WA-GEO-GIR-004', 'WA-ENV-BAS-003']) {
  await e.getByRole('combobox', { name: 'Scope' }).fill(code);
  await e.getByRole('option', { name: new RegExp(code) }).first().click();
}
await e.getByRole('combobox', { name: 'Scope' }).fill('');
await e
  .getByText('Sources this draft may use')
  .evaluate((el) => el.scrollIntoView({ block: 'start' }));
await e.waitForTimeout(200);
await shot(e, 't1-07-sources');

// T-408 — the plan is the PROPOSED DOCUMENT: an overview, then what will be
// written into each section, every description correctable in place.
await e.getByRole('button', { name: 'See the plan' }).click();
await e.getByText('The document this will write').waitFor();
await e
  .getByText('The document this will write')
  .evaluate((el) => el.scrollIntoView({ block: 'start' }));
await e.waitForTimeout(200);
await shot(e, 't1-08-proposal');

// T-409 — and the agent pane: say what is wrong with one section's
// description and the agent rewrites that one description. It edits a
// PARAMETER; the step list below is computed in code and nothing here can
// reach it.
await e.getByRole('button', { name: /Ask the agent/ }).first().click();
await e.getByPlaceholder(/this should set out/).waitFor();
await e
  .getByPlaceholder(/this should set out/)
  .fill('No — set the three ground constraints out as bullets, one line each.');
await e.getByRole('button', { name: 'Revise this description' }).evaluate((el) => el.scrollIntoView({ block: 'center' }));
await e.waitForTimeout(200);
await shot(e, 't1-09-agent-pane');

await e.getByRole('button', { name: 'Revise this description' }).click();
await e.getByText('Your wording').first().waitFor({ timeout: 30_000 });
await e.getByText('Your wording').first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
await e.waitForTimeout(200);
await shot(e, 't1-10-agent-revised');

// T-410 — no price anywhere on this page, and the step list is still here and
// still not editable. The chip at the bottom is what creates the document.
await e
  .getByRole('button', { name: 'Accept the plan and create the document' })
  .evaluate((el) => el.scrollIntoView({ block: 'end' }));
await e.waitForTimeout(200);
await shot(e, 't1-11-steps');

await e.getByRole('button', { name: 'Accept the plan and create the document' }).click();
await e.getByText('What was made').waitFor({ timeout: 60_000 });
await e.getByText('What was made').evaluate((el) => el.scrollIntoView({ block: 'start' }));
await e.waitForTimeout(200);
await shot(e, 't1-12-result');

// where it landed: the working area the launcher named, opened, under the
// author's own headings
await openOrgSandbox(e);
await e.getByText('Land contamination — Ashcombe Lane parcels').first().waitFor();
await e.waitForTimeout(400);
await shot(e, 't1-13-landing');

// T-413 (ADR-0053 addendum A4) — the creator's OTHER front door, and the beat
// that replaced the bound-container refusal. `Q-037` was ruled on 2026-09-01 by
// cutting the plan→creator link rather than by deciding what may cross it, so
// the refusal screen has no reason to exist and neither has its photograph.
// What is worth photographing instead is the door that does exist: started from
// the working area you are standing in, with the destination already set to it.
await e.getByRole('button', { name: 'Create with AI' }).click();
await e.getByRole('heading', { name: 'Document creator' }).waitFor();
await e.getByText('Set from the working area you started in').waitFor();
await e
  .getByText('Set from the working area you started in')
  .evaluate((el) => el.scrollIntoView({ block: 'center' }));
await e.waitForTimeout(200);
await shot(e, 't1-14-from-the-working-area');

// ── the QA checker ──────────────────────────────────────────────────────────
//
// On a draft of its own, and that is honest rather than convenient: the
// journey's draft has been frozen, promoted, reviewed and accepted by now, and
// a frozen head is read-only — the triage below rewrites the text it works on.
console.log('the QA checker —');
const CHECK_TITLE = 'Land Quality method statement — Ashcombe Lane working copy';
const checkDoc = await eleanorApi.post(`/projects/${projectId}/sandbox-documents`, {
  title: CHECK_TITLE,
});
await eleanorApi.patch(`/sandbox-documents/${checkDoc.id}`, { content: DRAFT_V1 });

// The Tools page itself is photographed once, at the head of the creator's
// section above — the checker's tile stands beside the creator's in that one
// shot, and a second frame of the same page would be a byte-identical
// duplicate rather than a beat.
await e.goto(`${WEB}/projects/${projectId}/tools`);
// T-403 — the tiles are cards, and the whole card is the link
await e.getByRole('link', { name: /QA checker/ }).click();
await e.getByRole('heading', { name: 'QA checker' }).waitFor();
await e.getByLabel('Which draft').selectOption({ label: CHECK_TITLE });
await e.waitForTimeout(200);
await shot(e, 't2-02-draft');

// a preset is a starting point, not a mode: Quick, and then one check turned
// off by hand — the families and the depth stay individually adjustable, and
// the depth select is only there because the accuracy check is still on
//
// T-421 — the two presets are ONE segmented control now, so the position is a
// `radio` and no longer a `button`. Selected by role rather than by class, so
// this step still describes what the screen offers rather than how it is built.
await e.getByRole('radio', { name: 'Quick check' }).click();
await e
  .locator('label')
  .filter({ hasText: 'Internal consistency' })
  .locator('input[type=checkbox]')
  .uncheck();
await e.waitForTimeout(200);
await shot(e, 't2-03-adjusted');

// the two document-selection affordances, named differently because they are
// two guarantees — and the second honest refusal, which lives on THIS screen
// rather than the creator's: uploading a file straight into a check is not
// built (T-399), and the control says so instead of standing there doing
// nothing
// T-471: the attach list is now the Working set picker — open, search by title, tick
await e
  .locator('.card')
  .filter({ hasText: 'Attach a document' })
  .getByRole('button', { name: /▤/ })
  .click();
await e.getByRole('combobox', { name: 'Working set' }).fill(WORKING_TITLE);
await e.getByRole('listbox', { name: 'Working set' }).getByRole('option', { name: new RegExp(WORKING_TITLE) }).first().click();
await e.waitForTimeout(200);
await shot(e, 't2-04-attach');

await e.getByRole('button', { name: 'See the plan' }).click();
await e.getByText('This is what will run').waitFor();
await e
  .getByRole('button', { name: 'Run the check' })
  .evaluate((el) => el.scrollIntoView({ block: 'end' }));
await e.waitForTimeout(200);
await shot(e, 't2-05-plan');

// T-418 — the run in flight.
//
// ⚠ **THE FIRST ATTEMPT AT THIS BEAT PHOTOGRAPHED THE PLAN CARD**, and the
// shot was indistinguishable from `t2-05-plan`. The progress box lives exactly
// as long as the run does, and against the stand-in router a whole check
// finishes in a couple of hundred milliseconds — so the box appeared, the
// `waitFor` passed, and the run was over before the shutter. Found by reading
// the photograph back, not by reasoning about the code.
//
// 🔒 **THE FIX IS IN THIS RECIPE, NOT IN THE PRODUCT AND NOT IN THE SUBSTRATE.**
// The run response is held for two seconds by a route handler in the BROWSER,
// which is a property of this capture and of nothing else: no product code
// knows about it, the e2e server is untouched, and the delay cannot leak into
// the e2e suite or into anyone's dev environment. Teaching the substrate to be
// slow would have put a performance fiction into a shared fixture to make one
// screenshot work.
//
// `times: 1` rather than a route-then-unroute pair: the handler is still in
// flight while the page is being screenshotted, and unrouting under it raced
// — the second run of the walkthrough hit a half-torn-down handler and the
// capture died after this beat with "Route is already handled". One shot,
// self-retiring, no teardown to get wrong.
await e.route(
  '**/tools/qa-check/runs',
  async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await route.fulfill({ response });
  },
  { times: 1 },
);
await e.getByRole('button', { name: 'Run the check' }).click();
await e.getByText('Running the check').waitFor({ timeout: 30_000 });
await shot(e, 't2-06-progress');

// the SAME run finishing — the progress box gives way to the result card when
// the blocking request resolves. Clicking again would start a second check.
await e.getByText('What was checked').waitFor({ timeout: 60_000 });
// the result card is the LAST thing on a long form. `block: 'end'` aligns its
// HEADING with the bottom edge and leaves the coverage sentence under it out of
// frame, and the page's own scroll is not the window's — this surface scrolls
// an inner container. Put the heading at the TOP of whatever scrolls.
await panelTop(e.getByText('What was checked'));
await e.waitForTimeout(300);
await shot(e, 't2-06-run');

// into the draft: the marks, anchored in the text they are about
await e.getByRole('link', { name: /Open the draft/ }).click();
await e.locator('.panel-tabs a').filter({ hasText: 'Checks' }).click();
await e.getByText(/open finding/).waitFor();
await e.locator('mark[data-thread]').first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
await e.waitForTimeout(300);
await shot(e, 't2-07-marks');

// two views of ONE set: the panel groups the findings by the check that raised
// them, and an entry points into the draft. Clicking "Go to it" selects the
// passage in the text and flashes its mark — which is the visible half of the
// claim that the marks and the list came from one read rather than two.
// (Clicking the mark itself does the reverse; it leaves no lasting mark on the
// screen, so this direction is the one that can be photographed.)
await e.locator('.finding').filter({ hasText: 'passive' }).getByText('Go to it').click();
await e.waitForTimeout(250);
await shot(e, 't2-08-panel');

// ── the drift banner, staged rather than skipped ────────────────────────────
// The degrade path's only visible sentence: edit the text a finding points at,
// then try to take its fix. The anchor no longer matches, so nothing is
// written and the screen says so — the finding stays OPEN rather than being
// applied to the wrong words.
//
// T-435 — THE SENTENCE THIS STAGES ON MOVED, AND SO DID WHERE THE FINDING
// CAME FROM. The mechanical fix used to be invented by the stand-in router;
// the seeded project now carries an accepted TERM rule, so it is raised for
// real by the code pass — on “the routewide works” in §1, which is the phrase
// the rule actually names. Drift is staged by editing that phrase.
const canvas = e.locator('.doc-body textarea').first();
await canvas.evaluate((el) => {
  const at = el.value.indexOf('the routewide works');
  el.focus();
  el.setSelectionRange(at, at + 'the routewide works'.length);
});
await e.keyboard.type('the Wrenfield to Ashcombe connection works');
await canvas.evaluate((el) => el.blur());
await e.waitForTimeout(800);
const mechanicalCard = e.locator('.finding').filter({ hasText: 'rules use' });
await mechanicalCard.getByRole('button', { name: 'Accept', exact: true }).click();
await e.getByText(/moved since the check ran/).waitFor();
await e.waitForTimeout(300);
await shot(e, 't2-09-drift');

// "nothing is written" is the beat's whole claim, so it is ASSERTED, not
// implied (review, 2026-08-31): the document must still hold the drifted
// sentence — the fix must NOT have been applied — before the restore below,
// which would otherwise mask a write that had happened.
{
  const after = await eleanorApi.get(`/sandbox-documents/${checkDoc.id}`);
  if (!after.content.includes('the Wrenfield to Ashcombe connection works')) {
    throw new Error('drift beat: the accept wrote despite the drift — the banner is photographing a lie');
  }
}

// the sentence goes back exactly as the check read it, so the anchors match
// again — otherwise every beat below would photograph the same refusal
await eleanorApi.patch(`/sandbox-documents/${checkDoc.id}`, { content: DRAFT_V1 });
await e.reload();
await e.locator('.panel-tabs a').filter({ hasText: 'Checks' }).click();
await e.getByText(/open finding/).waitFor();

// the accept-all, and what sits below it with none. The panel scrolls
// independently of the page, so the scroll is driven on the panel's own
// scrolling ancestor — `scrollIntoView` would move the PAGE and leave the
// panel where it was.
await panelTop(e.getByRole('button', { name: /^Accept \d+ mechanical/ }));
await e.waitForTimeout(300);
await shot(e, 't2-10-accept-all');

// the rewrite, read before it is taken — one at a time, by hand
const rewriteCard = e.locator('.finding').filter({ hasText: 'passive' });
await panelTop(rewriteCard);
await e.waitForTimeout(300);
await shot(e, 't2-11-rewrite');

// ⚠ THE ORDER OF TAKING THEM IS THE REWRITE FIRST, AND IT IS FORCED BY A REAL
// PRODUCT PROPERTY (T-435). An anchor is an absolute span, and a bulk apply
// runs DESCENDING so that applying one span never moves the next — within that
// one call. Two SEPARATE accepts have no such protection: the mechanical fix
// now lands in §1, before the rewrite in §3, so taking it first shortens the
// text above the rewrite and the rewrite's own accept then drifts and is
// refused. (It used to land after the rewrite, by accident of where the
// stand-in router put it, and nobody had to know.) Taking the rewrite first
// leaves the mechanical span untouched, because it sits above. The shots keep
// their order and their claim: `t2-10` is the LAYOUT — accept-all above the
// rewrites — which is what ADR-0053 §6 is about, not which is clicked first.
await rewriteCard.getByRole('button', { name: 'Accept', exact: true }).click();
await rewriteCard.waitFor({ state: 'detached' });

await e.getByRole('button', { name: /^Accept \d+ mechanical/ }).click();
await e.getByRole('button', { name: /^Accept \d+ mechanical/ }).waitFor({ state: 'hidden' });

// the bulk dismissal: declining a whole group is one professional judgement,
// not one per finding — and it records no reason, deliberately
const remaining = e.locator('.suggest-panel').getByRole('button', { name: 'Dismiss all' }).first();
await panelTop(remaining);
await e.waitForTimeout(300);
await shot(e, 't2-12-dismiss');
await remaining.click();
await e.waitForTimeout(500);
console.log('the tools — done');

// ── best in class (T-485) ───────────────────────────────────────────────────
//
// The three best-in-class batches (T-455–T-484) built screens that had no
// photograph. They run LAST, like the tools, and for the same reason: each
// works a fixture of its own (a plan row, a draft, a library reference) so that
// nothing here puts a stray document into the journey's acts. Two of them
// (supersede, currency) call the e2e substrate's own reset doors, which exist
// for exactly this and are not mounted on the real app.
// The owner's work queue and the schedule's milestone beats are in Act I
// instead, because they photograph the SEEDED world and the journey changes it.
const stamp3 = String(Date.now()).slice(-6);
const roster3 = (await eleanorApi.get(`/projects/${projectId}/participants`)).items;
const idOf3 = (name) => roster3.find((p) => p.name === name).participantId;
console.log('Ask —');
{
  const reset = await fetch(`${API}/__e2e/reset-seeded-currency`, { method: 'POST' });
  if (!reset.ok) throw new Error('reset-seeded-currency failed');
  await r.goto(`${WEB}/projects/${projectId}/ask`);
  const box = r.getByPlaceholder('Ask about the project');
  await box.fill('What does BS 5930 require for an alpha-category ground investigation?');
  await box.press('Enter');
  const chip = r.locator('button.cite.lib', { hasText: 'WA-STD-BS5930-001' }).first();
  await chip.waitFor({ timeout: 30_000 });
  await r.locator('.cf-reach').first().waitFor();
  await chip.hover();
  await r.getByRole('dialog', { name: 'Source: WA-STD-BS5930-001' }).waitFor();
  await shot(r, 'b1-ask-answer');

  // the scope control narrows by the project's own vocabulary, so one source
  // carries the discipline term the beat then picks
  {
    const scheme = await eleanorApi.get(`/projects/${projectId}/classification-scheme`);
    const discipline = scheme.facets.find((f) => f.key === 'discipline');
    const geo = discipline.terms.find((t) => t.label === 'Geotechnical');
    const { sources } = await eleanorApi.get(`/projects/${projectId}/grounding-scope`);
    let done = false;
    for (const src of sources) {
      for (const api of [eleanorApi, rachelApi]) {
        const res = await api.ctx.put(`/containers/${src.containerId}/classifications`, { data: { facetId: discipline.id, termId: geo.id } });
        if (res.status() === 204) done = true;
        if (done) break;
      }
      if (done) break;
    }
    if (!done) throw new Error('no source could be classified Geotechnical');
  }
  await e.goto(`${WEB}/projects/${projectId}/ask`);
  await e.getByRole('button', { name: /Scope:/ }).click();
  await e.getByRole('combobox', { name: 'Scope' }).fill('geo');
  await e.getByRole('option').first().waitFor();
  await e.getByRole('option').first().click();
  await e.getByRole('status').filter({ hasText: 'can be read' }).waitFor();
  await shot(e, 'b1-ask-scope');
  await e.keyboard.press('Escape');

  await e.getByRole('button', { name: /Working set/ }).click();
  await e.keyboard.type('Land');
  await e.getByRole('option').first().waitFor();
  await e.getByRole('option').first().click();
  await shot(e, 'b1-ask-working-set');
}

console.log('the library —');
const textPdf = (lines) => {
  const esc2 = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const stream = `BT /F1 12 Tf 72 720 Td ${lines.map((l) => `(${esc2(l)}) Tj 0 -16 Td`).join(' ')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object, at) => {
    offsets.push(Buffer.byteLength(body));
    body += `${at + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
};
{
  const stamp = Date.now();
  const pdf = (name, text) => ({ name, mimeType: 'application/pdf', buffer: textPdf([text]) });
  await r.goto(`${WEB}/projects/${projectId}/documents`);
  await r.getByRole('button', { name: /Add reference material/ }).waitFor();
  await r.getByLabel('Reference material files').setInputFiles([
    pdf(`Construction-noise-standard-${stamp}.pdf`, 'Construction noise limits for the scheme are set out below.'),
    pdf(`Ecology-guidance-${stamp}.pdf`, 'Guidance on protected species surveys.'),
    pdf(`Air-quality-${stamp}.pdf`, 'Dust and air quality monitoring requirements.'),
  ]);
  await r.getByRole('status', { name: 'Reference material upload' }).filter({ hasText: '3 of 3 uploaded' }).waitFor();
  await shot(r, 'b2-add-reference');

  await r.getByRole('button', { name: /^Intake/ }).click();
  const intake = r.getByRole('table', { name: 'Reference material intake' });
  await intake.getByLabel(new RegExp(`^Title for Construction-noise-standard-${stamp}`)).waitFor();
  await shot(r, 'b2-intake');

  // the document page of the seeded standard: its currency card
  const lib = await rachelApi.get(`/projects/${projectId}/library`);
  const std = lib.items.find((i) => i.documentReference === 'WA-STD-BS5930-001');
  await r.goto(`${WEB}/projects/${projectId}/documents/${std.containerId}`);
  const currency = r.locator('.card', { hasText: 'Currency' }).filter({ hasText: 'Confirm current' });
  await currency.waitFor();
  await currency.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await shot(r, 'b2-currency');
}

console.log('supersede —');
{
  const reset = await fetch(`${API}/__e2e/reset-supersede-impact`, { method: 'POST' });
  if (!reset.ok) throw new Error('reset-supersede-impact failed');
  const lib = await eleanorApi.get(`/projects/${projectId}/library`);
  const report = lib.items.find((i) => i.documentReference === 'WA-GEO-GIR-004');
  await e.goto(`${WEB}/projects/${projectId}/documents/${report.containerId}`);
  await e.getByRole('radiogroup', { name: 'Document page sections' }).getByRole('radio', { name: 'Relationships' }).click();
  await e.getByLabel('Cited by').waitFor();
  await e.getByLabel('Cited by').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await shot(e, 'b2-cited-by');

  // the owner's own library document that points at the report, so the dialog has something to say
  {
    const baseline = lib.items.find((i) => i.documentReference === 'WA-ENV-BAS-003');
    try {
      const edge = await rachelApi.post(`/containers/${baseline.containerId}/relationships`, { toContainerId: report.containerId, type: 'references' });
      await rachelApi.post(`/relationships/${edge.id}/confirmation`, {});
    } catch {
      console.log('  (relationship already there)');
    }
  }
  await r.goto(`${WEB}/projects/${projectId}/documents`);
  const table = r.getByRole('table', { name: 'Project library' });
  await table.getByRole('row').nth(1).waitFor();
  await r.getByRole('searchbox', { name: 'Search Project library' }).fill('WA-GEO-GIR-004');
  await r.getByText('Filtered', { exact: true }).waitFor();
  await r.waitForLoadState('networkidle');
  await table.getByRole('checkbox', { name: 'Select WA-GEO-GIR-004' }).check();
  await r.getByRole('region', { name: 'Selected rows' }).getByRole('button', { name: 'Supersede…' }).click();
  const dialog = r.getByRole('dialog');
  await dialog.getByRole('region', { name: 'What relies on this' }).waitFor();
  await dialog.getByPlaceholder('Type a code or title to search').fill('WA-WAT-FRA-001');
  await dialog.getByRole('option', { name: /WA-WAT-FRA-001/ }).click();
  await shot(r, 'b2-supersede-impact');
  await dialog.getByRole('button', { name: 'Supersede', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });

  await e.goto(`${WEB}/projects/${projectId}/notifications`);
  const note = e.getByRole('row', { name: /A document you cited was superseded/ });
  await note.waitFor();
  await shot(e, 'b2-notification');
  await note.click();
  await e.locator('.panel-tabs').getByText('Checks', { exact: false }).first().click();
  const live = e.getByRole('region', { name: 'Out-of-date sources' });
  await live.waitFor();
  await shot(e, 'b2-superseded-check');
}

console.log('the working draft —');
{
  const row = await eleanorApi.post(`/projects/${projectId}/plan`, {
    documentReference: `WA-GAP-ECO-${stamp3}`,
    title: `Land quality summary ${stamp3}`,
    metadata: { discipline: 'ecology' },
  });
  await eleanorApi.post(`/containers/${row.containerId}/authors`, { participantId: idOf3('Eleanor Price'), isLead: true });
  const grant = await eleanorApi.post(`/containers/${row.containerId}/reviewers`, { participantId: idOf3('Rachel Bowen'), isLead: true });
  await rachelApi.post(`/reviewers/${grant.id}/confirmation`, {});
  await rachelApi.post(`/reviewers/${grant.id}/acceptance`, {});
  const gdoc = await eleanorApi.post(`/projects/${projectId}/sandbox-documents`, {
    title: `Land quality summary ${stamp3} draft`,
    containerId: row.containerId,
  });
  await eleanorApi.patch(`/sandboxes/${gdoc.sandboxId}/settings`, { promotionRequiresQa: false });
  await e.goto(`${WEB}/projects/${projectId}/editor/${gdoc.id}`);
  const ask = e.getByPlaceholder('Ask for a draft into this document');
  await ask.fill('Draft the land quality summary');
  await ask.press('Enter');
  const proposed = e.locator('.proposed').first();
  await proposed.locator('.gap-marker').waitFor();
  await shot(e, 'b3-gap-proposed');
  await proposed.getByRole('button', { name: /Accept/ }).click();
  await e.locator('.canvas-mirror mark.mark--gap').waitFor();
  await e.getByText('Checks (1)', { exact: true }).click();
  await e.getByRole('region', { name: 'Gaps' }).waitFor();
  await shot(e, 'b3-gap-marked');

  await e.getByRole('button', { name: /Promote/ }).first().click();
  const dlg = e.getByRole('dialog');
  await dlg.getByRole('list', { name: 'Open gaps' }).waitFor();
  await shot(e, 'b3-promotion-refused');
  await dlg.getByRole('button', { name: /Cancel|Close/ }).first().click();
  await dlg.waitFor({ state: 'hidden' });

  const mark = e.getByRole('button', { name: /Who wrote paragraph 1:/ });
  await mark.hover();
  await e.getByRole('dialog', { name: 'Who wrote paragraph 1' }).waitFor();
  await shot(e, 'b3-authorship');
  await e.keyboard.press('Escape');
}

console.log('internal review, presence, history —');
{
  const title = `Ground conditions chapter ${stamp3}`;
  const doc = await eleanorApi.post(`/projects/${projectId}/sandbox-documents`, { title });
  await eleanorApi.patch(`/sandbox-documents/${doc.id}`, { content: 'Ground conditions chapter, ready for a colleague to check.' });
  await e.goto(`${WEB}/projects/${projectId}/editor/${doc.id}`);
  await e.locator('.doc-body textarea').waitFor();
  await e.getByRole('button', { name: 'Request internal review…' }).click();
  const dlg = e.getByRole('dialog');
  await dlg.getByText(/freezes the draft as the next P revision/).waitFor();
  await dlg.getByRole('combobox').click();
  await dlg.getByRole('option', { name: /Owen Vance/ }).click();
  await dlg.getByPlaceholder('What should they look at?').fill('Please check the ground-water section.');
  await shot(e, 'b4-internal-review');
  await dlg.getByRole('button', { name: /Cancel|Close/ }).first().click();
  await dlg.waitFor({ state: 'hidden' });

  // presence and the changed dot: a colleague opens the same draft, then edits it
  const findRow = async (page) => {
    await page.goto(`${WEB}/projects/${projectId}/sandbox`);
    await page.getByRole('searchbox', { name: /Search/ }).fill(title);
    const row = page.getByRole('row').filter({ hasText: title });
    await row.waitFor();
    return row;
  };
  const eRow = await findRow(e);
  const oRow = await findRow(o);
  await oRow.getByRole('button', { name: title, exact: true }).click();
  await o.getByRole('button', { name: 'History' }).waitFor();
  await owenApi.patch(`/sandbox-documents/${doc.id}`, { content: 'Owen’s change to the ground conditions chapter.' });
  await eRow.getByRole('img', { name: 'Changed since you last opened it' }).waitFor({ timeout: 90_000 });
  await eRow.locator('.presence-avatar[title="Owen Vance"]').waitFor({ timeout: 90_000 });
  await shot(e, 'b4-presence');

  await eRow.getByRole('button', { name: /More actions/ }).click();
  await e.locator('.dropdown-menu').getByText('History', { exact: false }).click();
  const panel = e.getByRole('dialog');
  await panel.getByRole('list', { name: 'Working versions' }).waitFor();
  await e.waitForTimeout(300);
  await shot(e, 'b4-history');
  await e.keyboard.press('Escape');
}

console.log('the checker, further —');
{
  const title = `Findings polish ${stamp3}`;
  const content = `${title}

1. Baseline sources
The GIR records PAH exceedances at three trial pits south of the Wrenfield substation and a perched water table within the made ground.

2. Conceptual site model
A conceptual site model has been prepared for each land parcel crossed by the route. The Scheme crosses nine parcels.

3. Assessment methodology
Where the preliminary risk assessment identifies a potentially unacceptable risk, a remediation options appraisal will be scoped for the affected parcel.`;
  const doc = await eleanorApi.post(`/projects/${projectId}/sandbox-documents`, { title });
  await eleanorApi.patch(`/sandbox-documents/${doc.id}`, { content });
  await e.goto(`${WEB}/projects/${projectId}/tools/qa-check?documentId=${doc.id}`);
  await e.getByRole('heading', { name: 'QA checker' }).waitFor();
  const rules = e.getByRole('table', { name: 'Writing rule kinds and how each is checked' });
  await rules.waitFor();
  await e.locator('.strength-map').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await e.waitForTimeout(200);
  await shot(e, 't2-13-strength-map');

  const toggle = e.getByRole('checkbox', { name: /Second look at the model/ });
  await toggle.check();
  await e.locator('[data-disproving-cost]').waitFor();
  await toggle.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await e.waitForTimeout(200);
  await shot(e, 't2-14-second-look');
  await toggle.uncheck();

  await e.getByRole('button', { name: 'See the plan' }).click();
  await e.getByRole('button', { name: 'Run the check' }).click();
  await e.getByText('Covered:').waitFor({ timeout: 60_000 });
  await e.getByRole('link', { name: 'Open the draft to work through them' }).click();
  await e.getByText(/^Checks/).first().click();
  const severity = e.getByRole('radiogroup', { name: 'Show findings by severity' });
  await severity.waitFor();
  await severity.getByRole('radio', { name: /^Required \d+$/ }).click();
  await e.getByText(/^Showing \d+ of \d+\./).waitFor();
  await shot(e, 't2-15-filters');
  await e.getByRole('radiogroup', { name: 'How to lay the findings out' }).getByRole('radio', { name: 'Table' }).click();
  await e.getByRole('button', { name: 'Show all' }).click();
  await e.getByRole('table', { name: 'Findings' }).waitFor();
  await e.waitForTimeout(300);
  await shot(e, 't2-16-table');
}

console.log('moving around —');
{
  await r.goto(`${WEB}/projects/${projectId}`);
  await r.getByRole('button', { name: /⌘K/ }).waitFor();
  await r.keyboard.press('Meta+k');
  const palette = r.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('textbox').fill('WA-GEO-GIR');
  await palette.getByRole('option').first().waitFor();
  await shot(r, 'b5-palette');
  await r.keyboard.press('Escape');

  const ref = `UNDO-${stamp3}`;
  await eleanorApi.post(`/projects/${projectId}/plan`, { documentReference: ref, title: `Surface water outfall note ${stamp3}` });
  await e.goto(`${WEB}/projects/${projectId}/plan`);
  await e.getByRole('searchbox', { name: 'Search Deliverables plan' }).fill(ref);
  await e.getByRole('button', { name: `Details for ${ref}` }).click();
  const panel = e.getByRole('dialog');
  await panel.getByRole('button', { name: 'Remove from plan…' }).click();
  await panel.getByRole('textbox').last().fill('Descoped by mistake');
  await panel.getByRole('button', { name: 'Remove from plan', exact: true }).click();
  const toast = e.getByRole('status').filter({ hasText: 'removed from the plan' });
  await toast.waitFor();
  await shot(e, 'b5-undo');
  await toast.getByRole('button', { name: 'Undo' }).click();
  await e.getByRole('status').filter({ hasText: 'Undone.' }).waitFor();
}

console.log('threads and compare —');
{
  const nadiaApi = await login('nadia.okonjo@redgate.example');
  const ref = `WA-THR-ECO-${stamp3}`;
  const row = await eleanorApi.post(`/projects/${projectId}/plan`, { documentReference: ref, title: `Contamination baseline ${stamp3}` });
  const cid = row.containerId;
  const roster = (await eleanorApi.get(`/projects/${projectId}/participants`)).items;
  const idOf = (name) => roster.find((p) => p.name === name).participantId;
  await eleanorApi.post(`/containers/${cid}/authors`, { participantId: idOf('Eleanor Price'), isLead: true });
  const lead = await eleanorApi.post(`/containers/${cid}/reviewers`, { participantId: idOf('Rachel Bowen'), isLead: true });
  await rachelApi.post(`/reviewers/${lead.id}/confirmation`, {});
  await rachelApi.post(`/reviewers/${lead.id}/acceptance`, {});
  await rachelApi.post(`/containers/${cid}/shares`, { organisationId: roster.find((p) => p.name === 'Nadia Okonjo').organisationId });
  await rachelApi.post(`/containers/${cid}/reviewers`, { participantId: idOf('Nadia Okonjo') });

  const P01 = [
    'Section one covers the baseline conditions across the corridor',
    'Section two reports the groundwater levels at each monitoring point',
    'Section three sets out the dewatering method for the compound',
  ].join('\n\n');
  const ADD = ['including the 2024 boreholes', 'recorded over three seasons', 'agreed with the regulator'];
  const P02 = [
    'Section one covers the baseline conditions including the 2024 boreholes across the corridor',
    'Section two reports the groundwater levels recorded over three seasons at each monitoring point',
    'Section three sets out the dewatering method agreed with the regulator for the compound',
  ].join('\n\n');
  const doc = await eleanorApi.post(`/projects/${projectId}/sandbox-documents`, { title: `Contamination baseline ${stamp3} draft`, containerId: cid });
  await eleanorApi.patch(`/sandbox-documents/${doc.id}`, { content: P01 });
  await eleanorApi.patch(`/sandboxes/${doc.sandboxId}/settings`, { promotionRequiresQa: false });
  const p01 = await eleanorApi.post(`/sandbox-documents/${doc.id}/promotion`, {});
  await rachelApi.post(`/rounds/${p01.roundId}/acknowledge`, {});

  const topics = ['baseline', 'groundwater', 'dewatering', 'monitoring', 'access', 'programme'];
  const ids = [];
  for (const [i, topic] of topics.entries()) {
    const author = i % 2 === 0 ? rachelApi : nadiaApi;
    const c = await author.post(`/rounds/${p01.roundId}/comments`, { body: `Please say more about the ${topic}.` });
    ids.push(c.id);
  }
  // the reviewing side, round open: the threads, and a progress line per reviewer
  await r.goto(`${WEB}/projects/${projectId}/review/${cid}/cycle`);
  await r.getByRole('list', { name: 'Threads' }).waitFor();
  await r.locator('[data-progress-line]').first().waitFor();
  await shot(r, 'b6-threads');

  const codes = (await rachelApi.get(`/projects/${projectId}/acceptance-codes`)).items;
  await rachelApi.post(`/rounds/${p01.roundId}/deliverable-code`, { acceptanceCodeId: codes.find((c) => c.code === 'S3').id });
  await rachelApi.post(`/rounds/${p01.roundId}/issue`, {});
  for (const [i, id] of ids.slice(0, 3).entries()) {
    await eleanorApi.post(`/review-comments/${id}/response`, { body: 'Added.', nextVersionAnchor: { quote: ADD[i] } });
  }
  for (const id of ids.slice(3)) {
    await eleanorApi.post(`/review-comments/${id}/response`, { body: 'Considered.', noChangeReason: 'Out of scope for this section.' });
  }
  await eleanorApi.patch(`/sandbox-documents/${doc.id}`, { content: P02 });
  await eleanorApi.post(`/sandbox-documents/${doc.id}/promotion`, {});
  await e.goto(`${WEB}/projects/${projectId}/documents/${cid}`);
  await e.getByRole('radio', { name: 'Compare', exact: true }).click();
  await e.locator('[data-compare-count]').waitFor();
  await e.locator('[data-compare] ins').first().waitFor();
  await shot(e, 'b6-compare');
  await nadiaApi.ctx.dispose();
}

// ══ THE APP BUILDER — a tool section (T-447) ═══════════════════════════════
// The app builder (Apps, beside Tools) photographed in the order a firm meets it:
// the Apps page; describing an app to the agent with the state panel beside it;
// the publish gate refusing in words; the published returns app as a contractor
// fills it in; the client's dashboard (a chart by contractor, "includes N not
// yet accepted", Accept / Reject on a row); a rejection with its reason; the
// contractor's home page; the cost dashboard fed from a spreadsheet; the
// firm's template shelf.
//
// ⚠ **THE BUILDING AGENT ANSWERS THROUGH THE E2E FAKE MODEL** (fake-builder-agent.ts,
// wired in e2e-server.ts), exactly as the end-to-end suite drives it: it drafts the
// returns app, asks the questions it may not answer, and records the person's
// answers in words. What is on screen is the product's own response to it. The real
// agent is slower and less predictable (docs/walks/t446.md photographed it).
//
// Driven through the API rather than clicked: the two contractors' earlier
// returns (the same act the form performs — Nadia's October one IS typed into the
// form), and the cost dashboard's table and screen, which stand in for a build the
// returns app already shows being done. The spreadsheet is uploaded and attached
// on the builder's own panel.
console.log('the app builder —');
{
  const nadiaApi = await login('nadia.okonjo@redgate.example');
  const nCtx = await browser.newContext(ctxOpts);
  const n = await nCtx.newPage();
  const appName = `Monthly sustainability returns ${stamp3}`;
  const roster = (await rachelApi.get(`/projects/${projectId}/participants`)).items;
  const redgateName = 'Redgate Ecology';

  // 1 — the Apps page, a name typed into the New app box
  await e.goto(`${WEB}/projects/${projectId}/apps`);
  await e.getByRole('heading', { name: 'Apps', exact: true }).waitFor();
  await e.getByText('Apps built for this project').waitFor();
  await e.getByLabel('New app').fill(appName);
  await shot(e, 'c1-apps-page');
  await e.getByRole('button', { name: 'Create', exact: true }).click();
  await e.getByRole('link', { name: new RegExp(appName) }).click();
  await e.getByRole('button', { name: 'Build it with the agent' }).click();
  await e.getByRole('complementary', { name: 'The state of the app' }).waitFor();
  const appId = /\/apps\/([0-9a-f-]+)\/build$/.exec(e.url())[1];

  // 2 — open it to the two other firms (the person's act; the agent has none),
  // describe the app, and the panel fills in beside the conversation
  const panel = e.getByRole('complementary', { name: 'The state of the app' });
  const openTo = panel.locator('select', { has: e.locator('option', { hasText: 'Open it to…' }) });
  for (const organisation of ['Trentmoor Energy', redgateName]) {
    await openTo.selectOption({ label: organisation });
    await panel.getByRole('button', { name: 'Open it to this organisation' }).click();
    await panel.locator('.builder-list li', { hasText: organisation }).waitFor();
  }
  const box = e.getByPlaceholder('e.g. Build me a monthly sustainability returns app for three contractors.');
  await box.fill('Build me a monthly sustainability returns app for three contractors.');
  await e.getByRole('button', { name: 'Send' }).click();
  await e.getByText('I have drafted a monthly returns app').waitFor();
  await panel.locator('[data-screen-id="client-dashboard"]').waitFor();
  await e.waitForTimeout(300);
  await shot(e, 'c2-agent-and-panel');

  // 3 — the publish gate: opening it now is refused, in words, naming each question
  await e.goto(`${WEB}/projects/${projectId}/apps/${appId}`);
  await e.getByRole('button', { name: 'Check and open' }).click();
  await e.getByText(/cannot be opened yet: 3 questions still need an answer/).waitFor();
  await shot(e, 'c3-publish-refused');

  // 4 — she answers in her own words; the agent records them, adds the chart she
  // asked for, and she opens the app herself
  await e.goto(`${WEB}/projects/${projectId}/apps/${appId}/build`);
  await e.getByPlaceholder('e.g. Build me a monthly sustainability returns app for three contractors.').fill(
    'Yes — the returns are contractual. Everyone may open Submit a return. Only Trentmoor Energy may open Client dashboard. And add a chart of energy by contractor to the dashboard.',
  );
  await e.getByRole('button', { name: 'Send' }).click();
  await e.getByText('I added a chart of energy used by contractor').waitFor();
  const gate = e.getByRole('complementary', { name: 'The state of the app' }).getByRole('status');
  await gate.getByText('Every required question has an answer').waitFor();
  await e.getByRole('complementary', { name: 'The state of the app' }).getByRole('button', { name: 'Open it', exact: true }).click();
  await e.getByText('Open as version', { exact: false }).waitFor();

  // earlier returns, entered by each firm as itself (the form's own act)
  const tableId = (await eleanorApi.get(`/apps/${appId}`)).tables.find((t) => t.name === 'Monthly returns').id;
  const month = (m, kwh, waste) => ({ values: { month: m, energy_kwh: kwh, waste_tonnes: waste, water_m3: 310 }, submit: true });
  await eleanorApi.post(`/app-tables/${tableId}/rows`, month('September 2026', 41200, 6.4));
  await eleanorApi.post(`/app-tables/${tableId}/rows`, month('October 2026', 39800, 5.9));
  await nadiaApi.post(`/app-tables/${tableId}/rows`, month('September 2026', 18400, 3.1));

  // 5 — the contractor's form: Nadia types October's return and, before she
  // submits, the screen is photographed filled in
  await signIn(n, 'nadia.okonjo@redgate.example');
  await n.goto(`${WEB}/projects/${projectId}/apps/${appId}`);
  await n.getByLabel('Month', { exact: true }).waitFor();
  await n.getByLabel('Month', { exact: true }).fill('October 2026');
  await n.getByLabel('Energy used (kWh)').fill('31900');
  await n.getByLabel('Waste to landfill (tonnes)').fill('3.4');
  await n.getByLabel('Water used (m³)').fill('295');
  await shot(n, 'c4-contractor-form');
  await n.getByRole('button', { name: 'Submit this month' }).click();
  await n.getByRole('row').filter({ hasText: 'October 2026' }).first().waitFor();

  // 6 — the client's dashboard. September's two returns were accepted from it
  // (the buttons Rachel will use below); October's three wait.
  await r.goto(`${WEB}/projects/${projectId}/apps/${appId}`);
  for (const who of ['Calder & Hale', redgateName]) {
    // the same return also sits, read-only, in the contractor's own form screen — the dashboard's button is the enabled one
    const accept = r.locator(`button[aria-label="Accept the return from ${who}, September 2026"]:not([disabled])`);
    await accept.last().click();
    const accepted = r.getByRole('row').filter({ hasText: who }).filter({ hasText: 'September 2026' }).filter({ hasText: 'Accepted' }).last();
    // the decision is recorded and the screen reloads its rows; if the reload raced the
    // click, reading the page again shows the same recorded decision
    await accepted.waitFor({ timeout: 8000 }).catch(async () => {
      await r.reload();
      await accepted.waitFor();
    });
  }
  await r.getByText(/Includes \d+ not yet accepted/).first().waitFor();
  await r.locator('.app-chart').first().waitFor();
  await r.locator('.app-chart').nth(1).evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await r.waitForTimeout(300);
  await shot(r, 'c5-client-dashboard');

  // 7 — the client rejects Redgate's October return from the row, with a reason
  const rejectName = `Reject the return from ${redgateName}, October 2026`;
  await r.getByRole('button', { name: rejectName }).last().click();
  const reason = 'Electricity is up by almost three quarters on September. Please check the meter reading and send it again.';
  await r.getByLabel(`Why is the return from ${redgateName}, October 2026 being rejected?`).fill(reason);
  await r.getByRole('button', { name: rejectName }).last().evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await shot(r, 'c6-rejection-reason');
  await r.getByRole('button', { name: `Confirm the rejection of the return from ${redgateName}, October 2026` }).click();
  await r.getByRole('row').filter({ hasText: redgateName }).filter({ hasText: 'Rejected' }).first().waitFor();

  // 8 — the contractor's home page: the rejection is waiting on her, with the reason
  await n.goto(WEB + '/');
  const waiting = n.getByRole('list', { name: /^Waiting on you/ }).getByRole('listitem').filter({ hasText: 'was rejected' });
  await waiting.first().waitFor();
  await shot(n, 'c7-contractor-home');

  // 9 — the cost dashboard fed from a spreadsheet. The table and its dashboard
  // are set up over the API; the file is uploaded and attached on the panel.
  const costApp = await eleanorApi.post(`/projects/${projectId}/apps`, {
    name: `Ground investigation cost dashboard ${stamp3}`,
    organisationIds: [roster.find((p) => p.name === 'Rachel Bowen').organisationId],
    participantIds: [],
  });
  const costTable = await eleanorApi.post(`/apps/${costApp.id}/tables`, {
    name: 'Monthly costs',
    columns: [
      { key: 'month', label: 'Month', type: 'text', required: true },
      { key: 'cost', label: 'Cost', type: 'number', required: true },
    ],
    kind: 'data',
    hasAcceptance: false,
  });
  await eleanorApi.patch(`/apps/${costApp.id}/definition`, {
    definition: {
      connections: [],
      interfaces: [
        {
          id: 'dashboard',
          label: 'Cost dashboard',
          appTableId: costTable.id,
          openToOrganisationIds: [],
          source: serialiseAppScreen({
            version: 1,
            blocks: [
              { kind: 'heading', text: 'Ground investigation cost to date' },
              { kind: 'total', columnKey: 'cost', label: 'Spent to date (£)' },
              { kind: 'barChart', label: 'Cost by month', categoryColumn: 'month', valueColumn: 'cost' },
              { kind: 'rowTable', columnKeys: ['month', 'cost'], showOrganisation: false, showState: false },
            ],
          }),
        },
      ],
      schedule: 'manual',
      analysisPrompt: null,
      answeredQuestions: [`contractual-data:${costTable.id}`, 'who-may-open:dashboard'],
    },
  });
  await eleanorApi.post(`/apps/${costApp.id}/publish`, {});
  await e.goto(`${WEB}/projects/${projectId}/apps/${costApp.id}/build`);
  const source = e.getByRole('group', { name: 'Source of Monthly costs' });
  await source.getByRole('button', { name: 'Feed this table from a spreadsheet' }).click();
  await source.getByLabel('Or upload one to your sandbox').setInputFiles({
    name: `Ground investigation cost report ${stamp3}.xlsx`,
    mimeType: XLSX_MIME,
    buffer: costReport([['July', 41500], ['August', 58200], ['September', 47800]]),
  });
  await source.getByText(/row 3: Month, Cost \(£\) — 3 rows/).waitFor();
  await source.getByRole('button', { name: 'Feed the table from these cells' }).click();
  await source.getByText('Imported 3 rows from v0.1.').waitFor();
  await source.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await shot(e, 'c8-cost-source');

  // a colleague who may not build uploads next month's file; nobody touches the app
  const docs = await owenApi.get(`/projects/${projectId}/sandbox-documents`);
  const report = docs.items.find((d) => d.title === `Ground investigation cost report ${stamp3}`);
  const replaced = await owenApi.ctx.post(`/sandbox-documents/${report.id}/file`, {
    multipart: {
      file: {
        name: 'cost report.xlsx',
        mimeType: XLSX_MIME,
        buffer: costReport([['July', 41500], ['August', 58200], ['September', 47800], ['October', 52300]]),
      },
    },
  });
  if (replaced.status() !== 200) throw new Error(`replacing the cost report failed: ${replaced.status()}`);
  await r.goto(`${WEB}/projects/${projectId}/apps/${costApp.id}`);
  await r.locator('strong', { hasText: /199,800/ }).first().waitFor();
  await r.locator('.app-chart').first().waitFor();
  await shot(r, 'c9-cost-dashboard');

  // 10 — the template shelf: the firm keeps the returns app as a template
  await e.goto(`${WEB}/projects/${projectId}/apps/${appId}`);
  await e.getByRole('button', { name: 'Keep this as a template' }).click();
  await e.getByText(/Kept on your firm’s shelf/).waitFor();
  await e.goto(`${WEB}/workspace/playbooks`);
  await e.getByText(appName).first().waitFor();
  await shot(e, 'c10-template-shelf');

  await nadiaApi.ctx.dispose();
  await nCtx.close();
}

await browser.close();
await eleanorApi.ctx.dispose();
await rachelApi.ctx.dispose();
await owenApi.ctx.dispose();
console.log(`done — ${shotCount} shots in ${OUT}`);
