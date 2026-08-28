// T-187 — the New-sandbox wizard, driven in the browser: the owner super-user
// picks Shared, chooses an organisation, then who has access, and the resulting
// card shows the shared scope with the admitted organisation (ADR-0042).
import { expect, test } from '@playwright/test';
import { SEEDED } from './support/api';

test.describe.configure({ mode: 'serial' });

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';

test('the owner super-user creates a shared sandbox through the wizard', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(SEEDED.owner); // Rachel — owner super-user
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(PROJECT)).toBeVisible();
  await page.getByText(PROJECT).click();
  await page.getByRole('link', { name: /Sandbox/ }).click();

  const name = `Wizard shared ${Date.now()}`;
  await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
  const w = page.getByRole('dialog');

  // step 1 — name + shared access
  await w.getByPlaceholder('e.g. Ecology working area').fill(name);
  await w.getByRole('combobox').selectOption({ label: 'Shared — across organisations' });
  await w.getByRole('button', { name: 'Next' }).click();

  // step 2 — choose the organisation
  await expect(w.getByText('Step 2 of 3')).toBeVisible();
  await w.locator('.pick-row', { hasText: 'Calder & Hale' }).click();
  await w.getByRole('button', { name: 'Next' }).click();

  // step 3 — everyone in the chosen organisations (default), then create
  await expect(w.getByText('Step 3 of 3')).toBeVisible();
  await w.getByRole('button', { name: 'Create sandbox' }).click();
  await expect(w).toBeHidden();

  // the card reads as shared, with the admitted organisation
  const card = page.locator('.sandbox-card', { hasText: name });
  await expect(card).toContainText('Shared');
  await expect(card).toContainText('with Calder & Hale');
});
