// T-458 — the four partial views retire: a plan row's quick edits open in the
// register's side panel (the kit's Drawer), with the description and metadata
// editor inside it; the review status page no longer restates the document's
// facts and points to the document page instead.
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

test('a plan row’s Details open the side panel with the metadata editor; the status page points to the document page', async ({ page }) => {
  await loginAs(page, SEEDED.consultant);
  await page.getByRole('link', { name: /Plan/ }).click();
  await page.getByRole('searchbox', { name: 'Search Deliverables plan' }).fill('WA-EIA-MST-001');
  await page.getByRole('button', { name: 'Details for WA-EIA-MST-001' }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveClass(/drawer/); // the side panel, not a modal card
  await expect(panel.getByText('Description and metadata')).toBeVisible();
  await expect(panel.getByText('Authoring team')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // the review status page: no facts card, a pointer to the page that holds them
  await page.getByRole('link', { name: 'Review' }).click();
  await page.getByRole('searchbox', { name: 'Search Review list' }).fill('WA-EIA-MST-001');
  await page.getByRole('table', { name: 'Review list' }).getByRole('row').filter({ hasText: 'WA-EIA-MST-001' }).first().getByRole('cell').nth(2).click();
  await expect(page).toHaveURL(/\/review\/[0-9a-f-]+$/);
  await expect(page.getByText('Producing organisation')).toHaveCount(0);
  // two doors to the same page: the header's (T-457) and the retired card's pointer
  await page.getByRole('button', { name: 'document page', exact: true }).click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]+$/);
});
