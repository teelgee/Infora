// T-488 — the app builder's last walk defects, in the browser on the seeded
// world: a file downloaded from a working area; a number and a date typed into
// proper boxes; the buttons only the people who may use them see; and the line
// that tells someone who may not build why there is no "New app" box.
//
// The negatives are driven as the other party over HTTP (Rachel Bowen at the
// client, who is not in Eleanor's working area), and in the browser as Owen Vance,
// whose own firm has not let him build.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { AppRecord, AppTableRecord, ListAppRowsResponse, MeResponse } from '@infora/contracts';
import { serialiseAppScreen } from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';
const stamp = Date.now();
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function signIn(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(PROJECT).first()).toBeVisible();
}

test('a file in a working area can be downloaded from the row menu, and only by people who may open it', async ({ page }) => {
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const rachel = await ApiSession.login(SEEDED.owner);
  const me = await eleanor.get<MeResponse>('/me');
  const projectId = me.participants.find((p) => p.projectName === PROJECT)!.projectId;

  const title = `T488 cost report ${stamp}`;
  const bytes = Buffer.from(`PK fake docx — downloaded ${stamp}`);
  const uploaded = await eleanor.context.post(`/projects/${projectId}/sandbox-uploads`, {
    multipart: { file: { name: `${title}.docx`, mimeType: DOCX_MIME, buffer: bytes } },
  });
  expect(uploaded.ok()).toBeTruthy();
  const documentId = ((await uploaded.json()) as { id: string }).id;

  await signIn(page, SEEDED.consultant);
  await page.getByText(PROJECT).first().click();
  await page.getByRole('link', { name: /Sandbox/ }).click();
  const row = page.getByRole('row').filter({ hasText: title });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /More actions/ }).click();
  const downloading = page.waitForEvent('download');
  await page.locator('.dropdown-menu').getByText('Download', { exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(`${title}.docx`);
  expect(readFileSync((await download.path())!).equals(bytes)).toBe(true);

  // the client is not in Eleanor's working area: the file is as absent as the document
  expect((await rachel.raw('get', `/sandbox-documents/${documentId}/file`)).status()).toBe(404);

  await eleanor.dispose();
  await rachel.dispose();
});

test('a number and a date are typed into a number box and a date box, and arrive as a number and a date', async ({ page }) => {
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const me = await eleanor.get<MeResponse>('/me');
  const projectId = me.participants.find((p) => p.projectName === PROJECT)!.projectId;

  const app = await eleanor.post<AppRecord>(`/projects/${projectId}/apps`, {
    name: `Typed boxes ${stamp}`,
    organisationIds: [],
    participantIds: [],
  });
  const table = await eleanor.post<AppTableRecord>(`/apps/${app.id}/tables`, {
    name: 'Invoices',
    columns: [
      { key: 'supplier', label: 'Supplier', type: 'text', required: true },
      { key: 'cost', label: 'Cost (£)', type: 'number', required: true },
      { key: 'paid_on', label: 'Paid on', type: 'date', required: false },
    ],
    kind: 'data',
    hasAcceptance: false,
  });
  await eleanor.patch(`/apps/${app.id}/definition`, {
    definition: {
      connections: [],
      interfaces: [
        {
          id: 'enter',
          label: 'Enter an invoice',
          appTableId: table.id,
          openToOrganisationIds: [],
          source: serialiseAppScreen({
            version: 1,
            blocks: [
              { kind: 'rowForm', columnKeys: ['supplier', 'cost', 'paid_on'], submitLabel: 'Add the invoice' },
              { kind: 'total', columnKey: 'cost', label: 'Invoiced so far' },
              { kind: 'barChart', label: 'Cost by supplier', categoryColumn: 'supplier', valueColumn: 'cost' },
            ],
          }),
        },
      ],
      schedule: 'manual',
      analysisPrompt: null,
      answeredQuestions: [`contractual-data:${table.id}`, 'who-may-open:enter'],
    },
  });
  expect((await eleanor.raw('post', `/apps/${app.id}/publish`, {})).status()).toBe(200);

  await signIn(page, SEEDED.consultant);
  await page.goto(`/projects/${projectId}/apps/${app.id}`);
  const supplier = page.getByLabel('Supplier');
  const cost = page.getByLabel('Cost (£)');
  const paidOn = page.getByLabel('Paid on');
  await expect(supplier).toHaveAttribute('type', 'text');
  await expect(cost).toHaveAttribute('type', 'number');
  await expect(paidOn).toHaveAttribute('type', 'date');

  await supplier.fill('Brightwell Piling');
  await cost.fill('12400.5');
  await paidOn.fill('2026-10-31');
  await page.getByRole('button', { name: 'Add the invoice' }).click();

  // the total reads as money with a thousands separator — the column says £
  await expect(page.locator('strong', { hasText: '£12,400.5' })).toBeVisible();
  const rows = (await eleanor.get<ListAppRowsResponse>(`/app-tables/${table.id}/rows`)).items;
  expect(rows).toHaveLength(1);
  // a number column sends a number, a date column the ISO date
  expect(rows[0]!.values).toEqual({ supplier: 'Brightwell Piling', cost: 12400.5, paid_on: '2026-10-31' });

  await eleanor.dispose();
});

test('“Close the app” and “Give it to…” are offered to the people who may use them, and not to a colleague', async ({ page }) => {
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const me = await eleanor.get<MeResponse>('/me');
  const projectId = me.participants.find((p) => p.projectName === PROJECT)!.projectId;
  const app = await eleanor.post<AppRecord>(`/projects/${projectId}/apps`, {
    name: `Ownership buttons ${stamp}`,
    organisationIds: [],
    participantIds: [],
  });
  const table = await eleanor.post<AppTableRecord>(`/apps/${app.id}/tables`, {
    name: 'Notes',
    columns: [{ key: 'note', label: 'Note', type: 'text', required: true }],
    kind: 'data',
    hasAcceptance: false,
  });
  await eleanor.patch(`/apps/${app.id}/definition`, {
    definition: {
      connections: [],
      interfaces: [
        {
          id: 'notes',
          label: 'Notes',
          appTableId: table.id,
          openToOrganisationIds: [],
          source: serialiseAppScreen({
            version: 1,
            blocks: [{ kind: 'rowTable', columnKeys: ['note'], showOrganisation: false, showState: false }],
          }),
        },
      ],
      schedule: 'manual',
      analysisPrompt: null,
      answeredQuestions: [`contractual-data:${table.id}`, 'who-may-open:notes'],
    },
  });
  expect((await eleanor.raw('post', `/apps/${app.id}/publish`, {})).status()).toBe(200);

  // Eleanor owns it and is her firm's super user: both buttons
  await signIn(page, SEEDED.consultant);
  await page.goto(`/projects/${projectId}/apps/${app.id}`);
  await expect(page.getByRole('button', { name: 'Close the app' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Give it to this person' })).toBeVisible();

  // Owen, in the same firm but not elevated, can open the app and is offered neither
  await page.context().clearCookies();
  await signIn(page, 'owen.vance@calderhale.example');
  await page.goto(`/projects/${projectId}/apps/${app.id}`);
  await expect(page.getByRole('heading', { name: /Ownership buttons/ }).or(page.getByText(`Ownership buttons ${stamp}`).first())).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close the app' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Give it to this person' })).toHaveCount(0);

  await eleanor.dispose();
});

test('someone who may not build is told why there is no “New app” box', async ({ page }) => {
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const me = await eleanor.get<MeResponse>('/me');
  const projectId = me.participants.find((p) => p.projectName === PROJECT)!.projectId;

  await signIn(page, 'owen.vance@calderhale.example');
  await page.goto(`/projects/${projectId}/apps`);
  await expect(page.getByText('Apps built for this project')).toBeVisible();
  await expect(page.getByLabel('New app')).toHaveCount(0);
  await expect(
    page.getByText('Your organisation decides who among its people may build apps; you have not been given that right.'),
  ).toBeVisible();

  // and a builder is not told it
  await page.context().clearCookies();
  await signIn(page, SEEDED.consultant);
  await page.goto(`/projects/${projectId}/apps`);
  await expect(page.getByLabel('New app')).toBeVisible();
  await expect(page.getByText('you have not been given that right')).toHaveCount(0);

  await eleanor.dispose();
});
