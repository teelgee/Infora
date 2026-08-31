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
async function shot(page, name) {
  await page.waitForTimeout(450); // let fonts/hover states settle
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
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
console.log('checker lane —');
await e.getByRole('button', { name: 'Check this draft' }).click();
await e.getByRole('heading', { name: 'QA checker' }).waitFor();
await e.getByRole('button', { name: 'See the plan' }).click();
await e.getByText('This is what will run').waitFor();
// the plan is the BEAT, and it lands below the fold on this form — the
// explicit scroll is the recipe's own rule for a below-fold section. Scroll to
// the RUN BUTTON, which sits under the plan: bringing the top of the plan into
// view still leaves its coverage sentence off the bottom, and that sentence is
// the half worth photographing.
await e.getByRole('button', { name: 'Run the check' }).scrollIntoViewIfNeeded();
await e.waitForTimeout(300);
await shot(e, '09a-checker-plan');

await e.getByRole('button', { name: 'Run the check' }).click();
await e.getByText('What was checked').waitFor({ timeout: 30_000 });
await shot(e, '09b-checker-coverage');

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
await e.getByText('Checked out — frozen, read-only').waitFor();
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
await r.getByRole('row').filter({ hasText: 'WA-EIA-MST-001' }).getByRole('button', { name: 'Withdraw…' }).click();
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

await browser.close();
await eleanorApi.ctx.dispose();
await rachelApi.ctx.dispose();
await owenApi.ctx.dispose();
console.log(`done — ${shotCount} shots in ${OUT}`);
