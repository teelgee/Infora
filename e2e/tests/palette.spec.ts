// T-466 — any seeded document is three keystrokes away from anywhere: ⌘K,
// a few letters, Enter. "?" lists the shortcuts; F lands in a register's box.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { SEEDED } from './support/api';

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';

async function loginAs(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(PROJECT)).toBeVisible();
  await page.getByText(PROJECT).click();
}

test('⌘K, a code, Enter lands on the document; ? lists the shortcuts; F lands in the register search', async ({ page }) => {
  await loginAs(page, SEEDED.owner);
  // from the home page, the visible hint is in the top bar
  await expect(page.getByRole('button', { name: /⌘K/ })).toBeVisible();
  await page.keyboard.press('Meta+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  await palette.getByRole('textbox').fill('WA-GEO-GIR');
  await expect(palette.getByRole('option').filter({ hasText: 'WA-GEO-GIR-004' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('WA-GEO-GIR-004');

  // the page's own actions are in the palette (reference material has no review; the owner's super user may edit its details)
  await page.keyboard.press('Meta+k');
  await expect(page.getByRole('dialog', { name: 'Command palette' }).getByRole('option').filter({ hasText: 'Edit details…' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0);

  // ? shows the shortcuts
  await page.keyboard.press('Shift+?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toContainText('J / K');
  await page.keyboard.press('Escape');

  // F lands in a register's search box; typing there is never intercepted
  await page.getByRole('link', { name: /Project library/ }).click();
  await expect(page.getByRole('table', { name: 'Project library' })).toBeVisible();
  await page.keyboard.press('f');
  await expect(page.getByRole('searchbox', { name: 'Search Project library' })).toBeFocused();
  await page.keyboard.type('f');
  await expect(page.getByRole('searchbox', { name: 'Search Project library' })).toHaveValue('f');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
