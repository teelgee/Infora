// T-443 — runs and insights, end to end on the seeded three-organisation world
// (ADR-0056 §3, §5), and a chart block on a published screen.
//
// *In plain terms: a consultancy builds a returns app with a place for the
// analysis to land, three firms enter figures, and each of them presses Run.
// What each run covers, and who can read what it wrote, is the whole test.*
//
// **Every negative is driven AS THE OTHER PARTY over HTTP.** Trentmoor Energy
// owns the scheme, Calder & Hale builds the app, Redgate Ecology is a second
// consultancy working the same project — all three legitimately on it, which is
// what makes "Redgate cannot read Calder & Hale's insight" worth asserting.
import { expect, test } from '@playwright/test';
import type {
  AppRecord,
  AppRowResponse,
  AppRunRecord,
  AppTableRecord,
  GetAppResponse,
  ListAppRowsResponse,
  ListAppRunsResponse,
  ListRosterResponse,
  MeResponse,
} from '@infora/contracts';
import { serialiseAppScreen } from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

const stamp = Date.now();

test('a run acts as whoever pressed it, computes in code, and lands an insight only its own firm and the client can read', async () => {
  const rachel = await ApiSession.login(SEEDED.owner); // Trentmoor Energy — the client
  const eleanor = await ApiSession.login(SEEDED.consultant); // Calder & Hale — builds it
  const nadia = await ApiSession.login(SEEDED.secondConsultant); // Redgate Ecology — the peer

  const me = await eleanor.get<MeResponse>('/me');
  const projectId = me.participants.find(
    (p) => p.projectName === 'Wrenfield–Ashcombe 400kV Connection',
  )!.projectId;
  const roster = (await rachel.get<ListRosterResponse>(`/projects/${projectId}/participants`)).items;
  const trentmoorOrgId = roster.find((r) => r.name === 'Rachel Bowen')!.organisationId;
  const redgateOrgId = roster.find((r) => r.name === 'Nadia Okonjo')!.organisationId;

  const app = await eleanor.post<AppRecord>(`/projects/${projectId}/apps`, {
    name: `Returns with insights ${stamp}`,
    description: 'Monthly environmental returns, with the analysis kept as a record.',
    organisationIds: [trentmoorOrgId, redgateOrgId],
    participantIds: [],
  });
  const returns = await eleanor.post<AppTableRecord>(`/apps/${app.id}/tables`, {
    name: 'Monthly returns',
    columns: [
      { key: 'month', label: 'Month', type: 'text', required: true },
      { key: 'landfill', label: 'Waste to landfill (tonnes)', type: 'number', required: true },
    ],
    kind: 'data',
    hasAcceptance: true,
  });

  // ── Step 2 also declares WHERE THE ANALYSIS LANDS (T-443's widening) ──────
  //
  // Its columns are Infora's, not the builder's: a run has to know where the
  // sentence goes. What is sent here is deliberately wrong, and what comes back
  // is what the platform fixed.
  const insights = await eleanor.post<AppTableRecord>(`/apps/${app.id}/tables`, {
    name: 'Insights',
    columns: [{ key: 'whatever', label: 'Whatever', type: 'text', required: false }],
    kind: 'insight',
    hasAcceptance: true,
  });
  expect(insights.columns.map((c) => c.key)).toEqual([
    'as_at',
    'insight',
    'rows_covered',
    'definitions_version',
  ]);
  expect(insights.hasAcceptance).toBe(false);

  // ── Step 5 and 6 — the schedule stays a stored intention; the prompt is
  // what the analysis is asked to say ─────────────────────────────────────
  await eleanor.patch(`/apps/${app.id}/definition`, {
    definition: {
      connections: [],
      interfaces: [],
      schedule: 'monthly',
      analysisPrompt: 'Say how much waste went to landfill and how many returns are in.',
      answeredQuestions: [],
    },
  });
  const opened = await eleanor.post<AppRecord>(`/apps/${app.id}/publish`, {});
  expect(opened.state).toBe('open');
  // T-442's label survives: the schedule is stored, and nothing on a clock runs
  expect(opened.published?.schedule).toBe('monthly');

  // ── Two firms enter a return each ────────────────────────────────────────
  await eleanor.post<AppRowResponse>(`/app-tables/${returns.id}/rows`, {
    values: { month: `August ${stamp}`, landfill: 12.4 },
    submit: true,
  });
  await nadia.post<AppRowResponse>(`/app-tables/${returns.id}/rows`, {
    values: { month: `August ${stamp}`, landfill: 3.1 },
    submit: true,
  });

  const runAs = async (session: ApiSession) =>
    (await session.post<{ run: AppRunRecord }>(`/apps/${app.id}/runs`, { trigger: 'manual' })).run;
  const insightRows = async (session: ApiSession) =>
    (await session.get<ListAppRowsResponse>(`/app-tables/${insights.id}/rows`)).items;

  // ── The run acts as the person who pressed it, narrowed to what they read ─
  const byEleanor = await runAs(eleanor);
  expect(byEleanor.rowsCovered).toBe(1); // Calder & Hale's own return, and no other
  expect(byEleanor.tablesCovered).toEqual([returns.id]); // never the insight table itself
  expect(byEleanor.outcome).toBe('an insight was written');
  expect(byEleanor.insightRowId).not.toBeNull();
  expect(byEleanor.asName).toBe('Eleanor Price');
  expect(byEleanor.definitionsVersion).toBe(opened.publishedVersion);

  const byRachel = await runAs(rachel);
  expect(byRachel.rowsCovered).toBe(2); // the client reads both submitted returns

  // ── The insight is a ROW, and the row predicate decides who reads it ──────
  const eleanorSees = await insightRows(eleanor);
  expect(eleanorSees).toHaveLength(1);
  expect(eleanorSees[0]!.organisationName).toBe('Calder & Hale');
  expect(eleanorSees[0]!.values['rows_covered']).toBe(1);
  expect(eleanorSees[0]!.values['definitions_version']).toBe(opened.publishedVersion);
  // the figures in the sentence are the platform's arithmetic, handed to the
  // model to write about — 12.4, which is Calder & Hale's own row and nobody
  // else's
  expect(String(eleanorSees[0]!.values['insight'])).toContain('12.4');

  // the client reads its own insight AND the one Calder & Hale's run wrote
  const rachelSees = await insightRows(rachel);
  expect(rachelSees).toHaveLength(2);
  expect(rachelSees.map((row) => row.organisationName).sort()).toEqual([
    'Calder & Hale',
    'Trentmoor Energy',
  ]);
  // the client's own insight covered both returns — 12.4 + 3.1
  expect(String(rachelSees.find((r) => r.organisationName === 'Trentmoor Energy')!.values['insight']))
    .toContain('15.5');

  // and the other consultancy on the same project reads neither
  expect(await insightRows(nadia)).toHaveLength(0);

  // ── A run by somebody who cannot see a shared table's rows covers only
  //    their own — and covers more the moment the owner shares it ───────────
  const nadiaBefore = await runAs(nadia);
  expect(nadiaBefore.rowsCovered).toBe(1);
  const shared = await rachel.post<AppTableRecord>(`/app-tables/${returns.id}/shares`, {
    organisationId: redgateOrgId,
  });
  const nadiaAfter = await runAs(nadia);
  expect(nadiaAfter.rowsCovered).toBe(2);
  // revoking narrows the next run again; insights already produced stay as they
  // were (ADR-0056 §6)
  await rachel.post(`/app-tables/${returns.id}/shares/${shared.shares[0]!.id}/revocation`, {});
  expect((await runAs(nadia)).rowsCovered).toBe(1);
  expect(await insightRows(nadia)).toHaveLength(3); // her own three, still hers

  // ── The run list says what happened, to each firm about its OWN runs ──────
  //
  // Narrowed in review 2026-09-07 to the export list's rule: a firm reads its
  // own runs and the project owner reads them all — a rival firm reading that
  // another firm's run covered two rows learns about a submission it was never
  // given. What a run row carries is counts and a phrase Infora wrote, never
  // the insight's words.
  const runsAsPeer = await nadia.get<ListAppRunsResponse>(`/apps/${app.id}/runs`);
  expect(runsAsPeer.items.length).toBeGreaterThanOrEqual(3);
  for (const run of runsAsPeer.items) {
    expect(run.asName).toBe('Nadia Okonjo');
    expect(['an insight was written', 'the analysis could not be written']).toContain(run.outcome);
  }
  expect(JSON.stringify(runsAsPeer.items)).not.toContain('12.4');
  const runsAsOwner = await rachel.get<ListAppRunsResponse>(`/apps/${app.id}/runs`);
  expect(runsAsOwner.items.length).toBeGreaterThanOrEqual(5);

  // ── A run on a closed app is refused, so nothing is written into one ──────
  await rachel.post(`/apps/${app.id}/closure`, {});
  const refused = await rachel.raw('post', `/apps/${app.id}/runs`, { trigger: 'manual' });
  expect(refused.status()).toBe(409);
  expect(await refused.text()).toContain('closed');

  await Promise.all([rachel.dispose(), eleanor.dispose(), nadia.dispose()]);
});

// T-443's second widening — a chart block on a published screen, drawn in the
// browser over the rows the viewer received.
//
// **Driven through the browser on purpose.** The API half of this is asserted
// above; what this test adds is that the block Infora stored is actually drawn,
// as SVG, with each viewer's own figures on it — the thing the owner's
// acceptance walk (T-446) will look at when judging blocks against code.
test('a published screen draws a chart over the viewer’s own readable rows', async ({ page }) => {
  const rachel = await ApiSession.login(SEEDED.owner);
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const nadia = await ApiSession.login(SEEDED.secondConsultant);

  const me = await eleanor.get<MeResponse>('/me');
  const projectId = me.participants.find(
    (p) => p.projectName === 'Wrenfield–Ashcombe 400kV Connection',
  )!.projectId;
  const roster = (await rachel.get<ListRosterResponse>(`/projects/${projectId}/participants`)).items;
  const trentmoorOrgId = roster.find((r) => r.name === 'Rachel Bowen')!.organisationId;
  const redgateOrgId = roster.find((r) => r.name === 'Nadia Okonjo')!.organisationId;

  const app = await eleanor.post<AppRecord>(`/projects/${projectId}/apps`, {
    name: `Returns with a chart ${stamp}`,
    organisationIds: [trentmoorOrgId, redgateOrgId],
    participantIds: [],
  });
  const table = await eleanor.post<AppTableRecord>(`/apps/${app.id}/tables`, {
    name: 'Monthly returns',
    columns: [
      { key: 'month', label: 'Month', type: 'text', required: true },
      { key: 'landfill', label: 'Waste to landfill (tonnes)', type: 'number', required: true },
    ],
    kind: 'data',
    hasAcceptance: false,
  });

  // the screen a builder saves — a chart and a table over the same columns,
  // written in the grammar and stored through the ordinary definition PATCH
  await eleanor.patch(`/apps/${app.id}/definition`, {
    definition: {
      connections: [],
      interfaces: [
        {
          id: 'dashboard',
          label: 'Returns dashboard',
          appTableId: table.id,
          openToOrganisationIds: [],
          source: serialiseAppScreen({
            version: 1,
            blocks: [
              { kind: 'heading', text: 'Waste to landfill' },
              {
                kind: 'barChart',
                label: 'Waste to landfill by month',
                categoryColumn: 'month',
                valueColumn: 'landfill',
              },
              {
                kind: 'lineChart',
                label: 'The trend',
                categoryColumn: 'month',
                valueColumn: 'landfill',
                showTrend: true,
              },
              { kind: 'pieChart', label: 'Share by month', categoryColumn: 'month', valueColumn: 'landfill' },
            ],
          }),
        },
      ],
      schedule: 'manual',
      analysisPrompt: null,
      answeredQuestions: [],
    },
  });

  // a chart naming a column the table never declared is refused at the same
  // boundary a table block is — the whole definition, not the one block
  const hostile = await eleanor.raw('patch', `/apps/${app.id}/definition`, {
    definition: {
      connections: [],
      interfaces: [
        {
          id: 'dashboard',
          label: 'Returns dashboard',
          appTableId: table.id,
          openToOrganisationIds: [],
          source: JSON.stringify({
            version: 1,
            blocks: [
              {
                kind: 'barChart',
                label: 'x',
                categoryColumn: 'month',
                valueColumn: 'landfill',
                imageUrl: 'https://exfiltrate.example/chart.png',
              },
            ],
          }),
        },
      ],
      schedule: 'manual',
      analysisPrompt: null,
      answeredQuestions: [],
    },
  });
  expect(hostile.status()).toBe(400);

  await eleanor.post(`/apps/${app.id}/publish`, {});
  await eleanor.post<AppRowResponse>(`/app-tables/${table.id}/rows`, {
    values: { month: 'August', landfill: 12 },
    submit: false,
  });
  await eleanor.post<AppRowResponse>(`/app-tables/${table.id}/rows`, {
    values: { month: 'September', landfill: 8 },
    submit: false,
  });
  await nadia.post<AppRowResponse>(`/app-tables/${table.id}/rows`, {
    values: { month: 'August', landfill: 30 },
    submit: false,
  });
  // the screen is on the published copy, offered to everyone the app is open to
  const published = await eleanor.get<GetAppResponse>(`/apps/${app.id}`);
  expect((published.app.published?.interfaces ?? []).map((i) => i.label)).toEqual([
    'Returns dashboard',
  ]);

  // ── The builder's own firm opens it in a browser ─────────────────────────
  await page.goto('/');
  await page.getByLabel('Email').fill(SEEDED.consultant);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Wrenfield–Ashcombe 400kV Connection')).toBeVisible();
  await page.goto(`/projects/${projectId}/tools/apps/${app.id}`);

  const chart = page.locator('.app-chart').first();
  await expect(chart).toBeVisible();
  await expect(chart.locator('svg')).toBeVisible();
  // Calder & Hale's own two rows, and NOT Redgate's 30 — the chart is drawn
  // over the rows the API handed this viewer
  await expect(chart.getByText('12', { exact: true })).toBeVisible();
  await expect(chart.getByText('8', { exact: true })).toBeVisible();
  await expect(chart.getByText('30', { exact: true })).toHaveCount(0);
  // the trend line's honest sentence is on the screen, not only in the code
  await expect(page.getByText('not a forecast')).toBeVisible();

  await Promise.all([rachel.dispose(), eleanor.dispose(), nadia.dispose()]);
});
