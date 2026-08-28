// T-181 — the per-sandbox super-user settings surface, driven in the browser: a
// super-user of the owning org (the seeded consultant is elevated) sees Settings,
// switches folder creation to "members work within the structure", and the surface
// reflects the locked structure. Proves ADR-0040's settings model end to end.
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

test('a super-user configures a sandbox to lock its folder structure', async ({ page }) => {
  await loginAs(page, SEEDED.consultant); // elevated (guest super-user of Calder & Hale)
  await page.getByRole('link', { name: /Sandbox/ }).click();

  await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
  const sb = page.getByRole('dialog');
  await sb.getByPlaceholder('e.g. Ecology working area').fill(`Config area ${Date.now()}`);
  await sb.getByRole('button', { name: 'Next' }).click(); // wizard step 1 → people (private default)
  await sb.getByRole('button', { name: 'Create sandbox' }).click();
  await expect(sb).toBeHidden();

  // default: New folder offered, and (as a super-user) a Settings control
  await expect(page.getByRole('button', { name: /New folder/ })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog');
  await expect(settings).toBeVisible();
  // the folder-creation select is the first: the QA gate (T-355) sits below it,
  // and in plan-locked mode a third (inside-a-deliverable) select appears between
  await settings.getByRole('combobox').first().selectOption({ label: 'Members work within the existing structure' });
  await settings.getByRole('button', { name: 'Save settings' }).click();
  await expect(settings).toBeHidden();

  // the surface now shows the locked structure
  await expect(page.getByText('Locked structure — folders are set by a super-user')).toBeVisible();
});
