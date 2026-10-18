// T-452 — pointing at the cells, in the browser: the cost-reporting dashboard
// built end to end on the seeded world (ADR-0059).
//
// Eleanor Price (Calder & Hale) has a published dashboard over a declared table
// with a chart on it. In the builder's panel she uploads the cost report, picks
// the table Infora found in it, confirms which heading fills which column, and
// sees the rows land. Then Owen Vance — a colleague who may NOT build — replaces
// the spreadsheet with next month's, and nobody touches the app: Rachel Bowen,
// the project owner, opens the dashboard and the chart and the total are next
// month's figures, drawn once each — not last month's beside them.
import { expect, test, type Page } from '@playwright/test';
import type {
  AppRecord,
  AppTableRecord,
  ListAppRowsResponse,
  ListRosterResponse,
  ListSandboxDocumentsResponse,
  MeResponse,
} from '@infora/contracts';
import { serialiseAppScreen } from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';
import { costReport, XLSX_MIME } from './support/workbook';

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';

async function signIn(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(PROJECT)).toBeVisible();
}

test('the cost dashboard: attach from the panel, rows land, and a colleague’s new file redraws the chart', async ({
  page,
}) => {
  const stamp = Date.now();
  const rachel = await ApiSession.login(SEEDED.owner);
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const owen = await ApiSession.login('owen.vance@calderhale.example');
  const me = await eleanor.get<MeResponse>('/me');
  const projectId = me.participants.find((p) => p.projectName === PROJECT)!.projectId;
  const roster = (await rachel.get<ListRosterResponse>(`/projects/${projectId}/participants`)).items;
  const trentmoor = roster.find((r) => r.name === 'Rachel Bowen' && r.removedAt === null)!.organisationId;

  // ── the app as it stands before the source: a table and a dashboard ───────
  const app = await eleanor.post<AppRecord>(`/projects/${projectId}/apps`, {
    name: `Cost dashboard ${stamp}`,
    organisationIds: [trentmoor],
    participantIds: [],
  });
  const table = await eleanor.post<AppTableRecord>(`/apps/${app.id}/tables`, {
    name: 'Monthly costs',
    columns: [
      { key: 'month', label: 'Month', type: 'text', required: true },
      { key: 'cost', label: 'Cost', type: 'number', required: true },
    ],
    kind: 'data',
    hasAcceptance: false,
  });
  await eleanor.patch(`/apps/${app.id}/definition`, {
    definition: {
      connections: [],
      interfaces: [
        {
          id: 'dashboard',
          label: 'Cost dashboard',
          appTableId: table.id,
          openToOrganisationIds: [],
          source: serialiseAppScreen({
            version: 1,
            blocks: [
              { kind: 'total', columnKey: 'cost', label: 'Spent to date' },
              { kind: 'barChart', label: 'Cost by month', categoryColumn: 'month', valueColumn: 'cost' },
            ],
          }),
        },
      ],
      schedule: 'manual',
      analysisPrompt: null,
      answeredQuestions: [`contractual-data:${table.id}`, 'who-may-open:dashboard'],
    },
  });
  await eleanor.post(`/apps/${app.id}/publish`, {});

  // ── Eleanor, in the builder's panel ──────────────────────────────────────
  await signIn(page, SEEDED.consultant);
  await page.goto(`/projects/${projectId}/apps/${app.id}/build`);
  const source = page.getByRole('group', { name: 'Source of Monthly costs' });
  await source.getByRole('button', { name: 'Feed this table from a spreadsheet' }).click();
  await source.getByLabel('Or upload one to your sandbox').setInputFiles({
    name: `Cost report ${stamp}.xlsx`,
    mimeType: XLSX_MIME,
    buffer: costReport([['Oct', 100], ['Nov', 120]]),
  });
  // the one table under the report's title line is found and offered…
  await expect(source.getByText('Sheet “Costs”, row 3: Month, Cost (£) — 2 rows')).toBeVisible();
  // …and the headings are matched to the columns, for her to confirm
  await expect(source.getByLabel('Month (required)')).toHaveValue('Month');
  await expect(source.getByLabel('Cost (required)')).toHaveValue('Cost (£)');
  await source.getByRole('button', { name: 'Feed the table from these cells' }).click();

  // the rows land, and the panel says so in the server's words
  await expect(source.getByText('Imported 2 rows from v0.1.')).toBeVisible();
  await expect(source.getByText(/The table reflects v0\.1\./)).toBeVisible();

  // ── Owen replaces the spreadsheet; nobody touches the app ────────────────
  const docs = await owen.get<ListSandboxDocumentsResponse>(`/projects/${projectId}/sandbox-documents`);
  const report = docs.items.find((d) => d.title === `Cost report ${stamp}`)!;
  const replaced = await owen.context.post(`/sandbox-documents/${report.id}/file`, {
    multipart: {
      file: { name: 'cost report.xlsx', mimeType: XLSX_MIME, buffer: costReport([['Oct', 100], ['Nov', 125], ['Dec', 90]]) },
    },
  });
  expect(replaced.status()).toBe(200);
  const rows = (await eleanor.get<ListAppRowsResponse>(`/app-tables/${table.id}/rows`)).items;
  expect(
    rows.filter((r) => r.retiredAt === null).map((r) => [r.values['month'], r.values['cost'], r.enteredByName]),
  ).toEqual([
    ['Oct', 100, 'Owen Vance'],
    ['Nov', 125, 'Owen Vance'],
    ['Dec', 90, 'Owen Vance'],
  ]);

  // ── Rachel opens the dashboard: next month's figures, each drawn once ────
  await page.context().clearCookies();
  await signIn(page, SEEDED.owner);
  await page.goto(`/projects/${projectId}/apps/${app.id}`);
  await expect(page.getByText('Spent to date')).toBeVisible();
  // 100 + 125 + 90 — not 535, which is what last month's rows beside them add to
  await expect(page.locator('strong', { hasText: /^315$/ })).toBeVisible();
  const chart = page.locator('.app-chart').first();
  await expect(chart.getByText('Dec', { exact: true })).toBeVisible();
  await expect(chart.getByText('125', { exact: true })).toBeVisible();
  // November's superseded 120 is history, not a second bar
  await expect(chart.getByText('120', { exact: true })).toHaveCount(0);

  // ── and the panel shows what the table now reflects ───────────────────────
  await page.context().clearCookies();
  await signIn(page, SEEDED.consultant);
  await page.goto(`/projects/${projectId}/apps/${app.id}/build`);
  const after = page.getByRole('group', { name: 'Source of Monthly costs' });
  await expect(after.getByText(/The table reflects v0\.2\./)).toBeVisible();
  await expect(
    after.getByText('Imported 3 rows from v0.2. The 2 rows from the previous import were superseded.'),
  ).toBeVisible();
});

test('the panel shows a failed import in words, and refresh-now after the fix', async ({ page }) => {
  const stamp = Date.now();
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const owen = await ApiSession.login('owen.vance@calderhale.example');
  const me = await eleanor.get<MeResponse>('/me');
  const projectId = me.participants.find((p) => p.projectName === PROJECT)!.projectId;
  const app = await eleanor.post<AppRecord>(`/projects/${projectId}/apps`, {
    name: `Cost receipts ${stamp}`,
    organisationIds: [],
    participantIds: [],
  });
  const table = await eleanor.post<AppTableRecord>(`/apps/${app.id}/tables`, {
    name: 'Monthly costs',
    columns: [
      { key: 'month', label: 'Month', type: 'text', required: true },
      { key: 'cost', label: 'Cost', type: 'number', required: true },
    ],
    kind: 'data',
    hasAcceptance: false,
  });
  const uploaded = await owen.context.post(`/projects/${projectId}/sandbox-uploads`, {
    multipart: { file: { name: `Receipts ${stamp}.xlsx`, mimeType: XLSX_MIME, buffer: costReport([['Oct', 100]]) } },
  });
  const documentId = ((await uploaded.json()) as { id: string }).id;
  await eleanor.post(`/app-tables/${table.id}/source`, {
    sandboxDocumentId: documentId,
    sheet: 'Costs',
    headerRow: ['Month', 'Cost (£)'],
    mapping: [
      { header: 'Month', columnKey: 'month' },
      { header: 'Cost (£)', columnKey: 'cost' },
    ],
  });
  // November's figure arrives as words
  await owen.context.post(`/sandbox-documents/${documentId}/file`, {
    multipart: { file: { name: 'r.xlsx', mimeType: XLSX_MIME, buffer: costReport([['Oct', 100], ['Nov', 'TBC']]) } },
  });

  await signIn(page, SEEDED.consultant);
  await page.goto(`/projects/${projectId}/apps/${app.id}/build`);
  const source = page.getByRole('group', { name: 'Source of Monthly costs' });
  await expect(source.getByText('Last import failed')).toBeVisible();
  await expect(
    source.getByText('Nothing was imported from v0.2. Row 5, “Cost (£)” holds something that is not a number.'),
  ).toBeVisible();
  // the table still reflects the last version that read cleanly
  await expect(source.getByText(/The table reflects v0\.1 — the file is now at v0\.2\./)).toBeVisible();

  // Owen fixes the file; it imports on landing, and refresh-now re-derives it
  await owen.context.post(`/sandbox-documents/${documentId}/file`, {
    multipart: { file: { name: 'r.xlsx', mimeType: XLSX_MIME, buffer: costReport([['Oct', 100], ['Nov', 110]]) } },
  });
  await source.getByRole('button', { name: 'Refresh from the file now' }).click();
  await expect(
    source.getByText('Imported 2 rows from v0.3. The 2 rows from the previous import were superseded.'),
  ).toBeVisible();
  await expect(source.getByText(/The table reflects v0\.3\./)).toBeVisible();
});
