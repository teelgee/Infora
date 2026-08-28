// T-184 — the sandbox selector as informative cards: each shows the owning
// organisation and whether it is private or shared; clicking a card reveals its
// folder tree below (ADR-0036 display). Replaces the flat chip list.
import { expect, test } from '@playwright/test';
import { SEEDED } from './support/api';

test.describe.configure({ mode: 'serial' });

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';

test('a sandbox card shows owner + scope, and clicking it reveals the tree', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(SEEDED.consultant);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(PROJECT)).toBeVisible();
  await page.getByText(PROJECT).click();
  await page.getByRole('link', { name: /Sandbox/ }).click();

  const name = `Card demo ${Date.now()}`;
  await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByPlaceholder('e.g. Ecology working area').fill(name);
  await modal.getByRole('button', { name: 'Next' }).click(); // wizard step 1 → people (private default)
  await modal.getByRole('button', { name: 'Create sandbox' }).click();
  await expect(modal).toBeHidden();

  // the card carries the owning org and the (private) scope
  const card = page.locator('.sandbox-card', { hasText: name });
  await expect(card).toContainText('Calder & Hale');
  await expect(card).toContainText('Single organisation');

  // created → auto-selected → the tree/breadcrumb is shown
  await expect(page.getByRole('navigation', { name: 'Folder path' })).toBeVisible();
  // toggle the card off → the tree hides; on again → it returns
  await card.click();
  await expect(page.getByRole('navigation', { name: 'Folder path' })).toHaveCount(0);
  await card.click();
  await expect(page.getByRole('navigation', { name: 'Folder path' })).toBeVisible();
});
