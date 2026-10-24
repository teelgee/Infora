// T-461 — a selection on the library is one act: tick rows, the bar appears,
// one dialog transmits them all; the selection exports to Excel in the plan's
// own shape (the round trip itself is proven in bulk-acts.test.ts).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { SEEDED } from './support/api';

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';

async function loginAs(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(PROJECT).first()).toBeVisible();
  await page.getByText(PROJECT).first().click();
}

test('two ticked rows are one transmittal dialog, and the selection exports to Excel', async ({ page }) => {
  await loginAs(page, SEEDED.owner);
  await page.getByRole('link', { name: /Project library/ }).click();
  // the register is paged, and every run of the intake spec adds "T472-…"
  // reference rows that sort ahead of the seeded "WA-…" codes; the selection
  // acts on the visible page, so sort by code descending to keep both on it
  await page.goto(`${page.url().split('?')[0]}?sort=reference&direction=desc`);
  const table = page.getByRole('table', { name: 'Project library' });
  await expect(table.getByRole('row').nth(1)).toBeVisible();
  // two of the owner organisation's own live documents
  await table.getByRole('checkbox', { name: 'Select WA-GEO-GIR-004' }).check();
  await table.getByRole('checkbox', { name: 'Select WA-CON-SCC-002' }).check();
  const bar = page.getByRole('region', { name: 'Selected rows' });
  await expect(bar).toContainText('2 selected');

  // export first: the selection is still intact
  const download = page.waitForEvent('download');
  await bar.getByRole('button', { name: 'Export to Excel' }).click();
  expect((await download).suggestedFilename()).toMatch(/^deliverables-\d{4}-\d{2}-\d{2}\.xlsx$/);

  // one dialog for both rows
  await bar.getByRole('button', { name: 'Transmit…' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Transmit 2 documents')).toBeVisible();
  await dialog.getByPlaceholder('Search organisations').fill('Redgate');
  await dialog.getByRole('option', { name: /Redgate/ }).click();
  await dialog.getByRole('button', { name: 'Transmit', exact: true }).click();
  await expect(page.getByText(/Transmitted 2 documents/)).toBeVisible();
  // the selection is spent with the act
  await expect(page.getByRole('region', { name: 'Selected rows' })).toHaveCount(0);
});
