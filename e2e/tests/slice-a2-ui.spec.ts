// T-167 — the producing-side interfaces, driven in the browser: the deliverable
// register's New-deliverable modal and the searchable Bind dialog are real
// in-app dialogs (no window.prompt), and a bound document is visible by its
// coded reference in the sandbox. Proves the Slice A2.1 UI overhaul.
import { expect, test } from '@playwright/test';
import { SEEDED } from './support/api';

test.describe.configure({ mode: 'serial' });

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';
const REFERENCE = `WA-UIQ-ECO-${String(Date.now()).slice(-4)}`;

async function loginAs(page: import('@playwright/test').Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(PROJECT)).toBeVisible();
  await page.getByText(PROJECT).click();
}

test('the New-deliverable modal creates a row in the register (no prompt)', async ({ page }) => {
  await loginAs(page, SEEDED.consultant);
  await page.getByRole('link', { name: /Plan/ }).click();

  await page.getByRole('button', { name: /New deliverable/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  await dialog.getByPlaceholder('e.g. EIA Scoping Method Statement').fill('Ecology chapter (UI e2e)');
  await dialog.getByPlaceholder('WA-BB-GEO-004').fill(REFERENCE); // no scheme seeded → manual reference
  await dialog.getByRole('button', { name: 'Create deliverable' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText(REFERENCE)).toBeVisible(); // the row is in the register
});

test('the Bind dialog picks a deliverable from a searchable list; the bound code shows in the sandbox', async ({
  page,
}) => {
  await loginAs(page, SEEDED.consultant);

  // a fresh sandbox document
  await page.getByRole('link', { name: /Sandbox/ }).click();
  await page.getByRole('button', { name: /New document/ }).click();
  const docTitle = `Ecology draft ${Date.now()}`;
  const create = page.getByRole('dialog');
  await create.getByPlaceholder('e.g. Ecology draft').fill(docTitle);
  await create.getByRole('button', { name: 'Create document' }).click();
  await expect(create).toBeHidden();

  // bind it via the searchable dialog
  const row = page.getByRole('row').filter({ hasText: docTitle });
  await row.getByRole('button', { name: /Bind/ }).click();
  const bind = page.getByRole('dialog');
  await expect(bind).toBeVisible();
  await bind.getByPlaceholder(/Search your deliverables/).fill('ECO');
  await bind.getByText(REFERENCE).click();
  await bind.getByRole('button', { name: 'Bind deliverable' }).click();
  await expect(bind).toBeHidden();

  // the bound document now shows its coded reference (navigable), not just a badge
  await expect(page.getByRole('row').filter({ hasText: docTitle }).getByText(REFERENCE)).toBeVisible();
});
