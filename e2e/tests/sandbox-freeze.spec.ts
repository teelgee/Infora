// T-180 — Freeze is a real check-out, driven in the browser: hitting Freeze locks
// the head (the row shows a Release control), and Release unlocks it again. Proves
// the owner-reported "Freeze does nothing" is fixed (ADR-0032 addendum).
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

test('Freeze checks the document out (locks); Release unlocks it', async ({ page }) => {
  await loginAs(page, SEEDED.consultant);
  await page.getByRole('link', { name: /Sandbox/ }).click();

  await page.getByRole('button', { name: 'Sandbox' }).click();
  const sb = page.getByRole('dialog');
  await sb.getByPlaceholder('e.g. Ecology working area').fill(`Freeze e2e ${Date.now()}`);
  await sb.getByRole('button', { name: 'Create sandbox' }).click();
  await expect(sb).toBeHidden();

  const docTitle = `Checkout draft ${Date.now()}`;
  await page.getByRole('button', { name: /New document/ }).click();
  const dm = page.getByRole('dialog');
  await dm.getByPlaceholder('e.g. Ecology draft').fill(docTitle);
  await dm.getByRole('button', { name: 'Create document' }).click();
  await expect(dm).toBeHidden();

  const row = page.getByRole('row').filter({ hasText: docTitle });
  // before: Freeze offered, no Release
  await expect(row.getByRole('button', { name: 'Freeze' })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Release' })).toHaveCount(0);

  // check out
  await row.getByRole('button', { name: 'Freeze' }).click();
  await expect(page.getByText(/Checked out/)).toBeVisible();
  await expect(row.getByRole('button', { name: 'Release' })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Freeze' })).toHaveCount(0);

  // release
  await row.getByRole('button', { name: 'Release' }).click();
  await expect(page.getByText(/Released/)).toBeVisible();
  await expect(row.getByRole('button', { name: 'Freeze' })).toBeVisible();
});
