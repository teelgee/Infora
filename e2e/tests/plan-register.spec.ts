// T-462 — the plan, the review list and the sandbox overview on the register:
// one search box finds a deliverable by its code on the plan and ranks it
// first; the review view is the same list seen for reviewing, with its own
// columns and its own door; the sandbox overview searches by name.
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

test('the plan finds a deliverable by code in one box, keeps the organisation-standard columns, and survives a reload', async ({ page }) => {
  await loginAs(page, SEEDED.owner);
  await page.getByRole('link', { name: /Project schedule|Deliverable plan|Plan/ }).first().click();
  const table = page.getByRole('table', { name: 'Deliverables plan' });
  await expect(table.getByRole('row').nth(1)).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Reference' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search Deliverables plan' }).fill('WA-GEO');
  await expect(page.getByText('Filtered', { exact: true })).toBeVisible();
  await expect(table.getByRole('row').nth(1)).toContainText('WA-GEO');
  await expect(page).toHaveURL(/q=WA-GEO/);
  await page.reload();
  await expect(page.getByRole('searchbox', { name: 'Search Deliverables plan' })).toHaveValue('WA-GEO');
  // reference material carries its own title now (T-462), not a placeholder
  await page.getByRole('searchbox', { name: 'Search Deliverables plan' }).fill('WA-CON-SCC-002');
  await expect(table.getByRole('row').nth(1)).toContainText('Statement of community consultation');
});

test('the review list is the plan seen for reviewing: its own columns, and a row opens the status page', async ({ page }) => {
  await loginAs(page, SEEDED.owner);
  await page.getByRole('link', { name: 'Review' }).click();
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible();
  const table = page.getByRole('table', { name: 'Review list' });
  await expect(table.getByRole('columnheader', { name: 'Reviewers' })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Authors' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search Review list' }).fill('WA-EIA-MST-001');
  const row = table.getByRole('row').filter({ hasText: 'WA-EIA-MST-001' }).first();
  await row.getByRole('cell').nth(2).click();
  await expect(page).toHaveURL(/\/review\/[0-9a-f-]+$/);
});

test('the sandbox overview searches working documents by name', async ({ page }) => {
  await loginAs(page, SEEDED.consultant);
  await page.getByRole('link', { name: /Sandbox/ }).click();
  const box = page.getByRole('searchbox', { name: 'Search All documents' });
  await expect(box).toBeVisible();
  const table = page.getByRole('table', { name: 'All documents' });
  await expect(table.getByRole('row').nth(1)).toBeVisible();
  await box.fill('zzz-no-such-document');
  await expect(page.getByText('No working document matches that name or code.')).toBeVisible();
  await box.fill('');
  await expect(table.getByRole('row').nth(1)).toBeVisible();
});
