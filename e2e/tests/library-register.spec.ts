// T-460 — the library on the register: search narrows the list and says so,
// a filter chip comes off, the query survives a reload (it lives in the URL),
// a saved view is listed and applies, and a view shared within one firm is
// absence to another.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ApiSession, SEEDED } from './support/api';

test.describe.configure({ mode: 'serial' });

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';

async function loginAs(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(PROJECT)).toBeVisible();
  await page.getByText(PROJECT).click();
}

test('search narrows the register, says it is filtering, and survives a reload', async ({ page }) => {
  await loginAs(page, SEEDED.owner);
  await page.getByRole('link', { name: /Project library/ }).click();
  const table = page.getByRole('table', { name: 'Project library' });
  await expect(table.getByRole('row').nth(1)).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search Project library' }).fill('WA-GEO');
  await expect(page.getByText('Filtered', { exact: true })).toBeVisible();
  // the code match ranks first and is a reference match, not a text match. (The
  // e2e substrate's fake embedding maps every document to one vector, so the
  // text arm admits every row here; ordering is what the substrate can prove.)
  const first = table.getByRole('row').nth(1);
  await expect(first).toContainText(/WA-GEO/);
  await expect(first.getByText('matches the text')).toHaveCount(0);
  // the query is in the address, so a reload keeps it
  await expect(page).toHaveURL(/q=WA-GEO/);
  await page.reload();
  await expect(page.getByRole('searchbox', { name: 'Search Project library' })).toHaveValue('WA-GEO');
  await expect(page.getByText('Filtered', { exact: true })).toBeVisible();
});

test('a filter chip narrows to reference material and comes off again', async ({ page }) => {
  await loginAs(page, SEEDED.owner);
  await page.goto(`${page.url().replace(/\/$/, '')}/documents?kind=reference`);
  await expect(page.getByText('Reference material ×')).toBeVisible();
  const table = page.getByRole('table', { name: 'Project library' });
  await expect(table.getByRole('row').nth(1)).toBeVisible();
  await expect(table.getByText(/Reference material/).first()).toBeVisible();
  await page.getByRole('button', { name: /Reference material ×/ }).click();
  await expect(page.getByText('Reference material ×')).toHaveCount(0);
});

test('a saved view is listed, applies, and never crosses the wall', async ({ page, browser }) => {
  // Eleanor (Calder & Hale, org admin) saves a shared view through the API
  const api = await ApiSession.login(SEEDED.consultant);
  const me = await api.get<{ participants: Array<{ projectId: string; projectName: string }> }>('/me');
  const projectId = me.participants.find((p) => p.projectName === PROJECT)!.projectId;
  const name = `Geotech ${Date.now()}`;
  await api.post(`/projects/${projectId}/saved-views`, { register: 'library', name, filter: { q: 'GEO', state: 'live' }, shared: true });
  await api.dispose();

  await loginAs(page, SEEDED.consultant);
  await page.getByRole('link', { name: /Project library/ }).click();
  await page.getByRole('button', { name: 'Saved views' }).click();
  await page.locator('.dropdown-menu').getByText(name, { exact: false }).click();
  await expect(page.getByRole('searchbox', { name: 'Search Project library' })).toHaveValue('GEO');
  await expect(page.getByRole('button', { name: 'Saved views' })).toContainText(name);

  // the owner organisation never sees Calder & Hale's view
  const other = await browser.newContext();
  const page2 = await other.newPage();
  await loginAs(page2, SEEDED.owner);
  await page2.getByRole('link', { name: /Project library/ }).click();
  await page2.getByRole('button', { name: 'Saved views' }).click();
  await expect(page2.locator('.dropdown-menu')).toBeVisible();
  await expect(page2.locator('.dropdown-menu').getByText(name, { exact: false })).toHaveCount(0);
  await other.close();
});
