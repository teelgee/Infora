// T-182 — the create-folder-structure builder, driven in the browser: a super-user
// types an indented outline, previews the nested tree, and creates the whole
// structure at once (ADR-0040). Templates are a deliberate follow-up.
import { expect, test } from '@playwright/test';
import { SEEDED } from './support/api';

test.describe.configure({ mode: 'serial' });

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';

async function loginAs(page: import('@playwright/test').Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(PROJECT)).toBeVisible();
  await page.getByText(PROJECT).click();
}

test('a super-user builds a nested folder structure in one action', async ({ page }) => {
  await loginAs(page, SEEDED.consultant); // elevated super-user of Calder & Hale
  await page.getByRole('link', { name: /Sandbox/ }).click();

  await page.getByRole('button', { name: 'Sandbox' }).click();
  const sb = page.getByRole('dialog');
  await sb.getByPlaceholder('e.g. Ecology working area').fill(`Structure e2e ${Date.now()}`);
  await sb.getByRole('button', { name: 'Create sandbox' }).click();
  await expect(sb).toBeHidden();

  await page.getByRole('button', { name: /Folder structure/ }).click();
  const builder = page.getByRole('dialog');
  await expect(builder).toBeVisible();
  await builder.getByRole('textbox').fill('Environmental\n  Ecology\n  Noise\nEngineering\n  Civil');
  // the preview counts the tree; the CTA reflects it
  const create = builder.getByRole('button', { name: /Create 5 folders/ });
  await expect(create).toBeVisible();
  await create.click();
  await expect(builder).toBeHidden();

  // the top-level folders are now in the tree
  await expect(page.getByRole('button', { name: 'Environmental', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Engineering', exact: true })).toBeVisible();
  // and the nesting is real: expand Environmental to reveal Ecology
  await page.getByRole('row').filter({ hasText: 'Environmental' }).getByRole('button', { name: 'Expand folder' }).click();
  await expect(page.getByRole('button', { name: 'Ecology', exact: true })).toBeVisible();
});
