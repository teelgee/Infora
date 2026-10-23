// T-464 — no screen shows a control that does nothing: the composer's
// placeholder chips and the editor's disabled create cards are gone, the
// workspace rail carries only what is built, and every page opens with one
// line and a "Learn more".
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { SEEDED } from './support/api';

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';

async function login(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(PROJECT)).toBeVisible();
}

test('the workspace rail carries only built sections, and the landing has no dead Ask bar', async ({ page }) => {
  await login(page, SEEDED.consultant);
  const rail = page.getByRole('navigation').first();
  for (const gone of ['Ask', 'Editor', 'Personal sandbox', 'Tools']) {
    await expect(rail.getByRole('link', { name: gone, exact: true })).toHaveCount(0);
  }
  await expect(rail.getByRole('link', { name: 'Your knowledge' })).toBeVisible();
  await expect(rail.getByRole('link', { name: 'How the AI works' })).toBeVisible();
  await expect(page.getByText('arrives with the workspace slice')).toHaveCount(0);
});

test('the Ask composer has no placeholder chips; the editor offers only what it can create; a heading has one line and Learn more', async ({ page }) => {
  await login(page, SEEDED.consultant);
  await page.getByText(PROJECT).click();
  await page.getByRole('link', { name: 'Ask' }).click();
  for (const chip of ['Web search', 'Sandbox search', 'Prompts', 'Style', 'Attach a file', '⚙ Tools']) {
    await expect(page.getByText(chip, { exact: true })).toHaveCount(0);
  }
  await page.getByRole('link', { name: 'Editor' }).click();
  await expect(page.locator('.create-card')).toHaveCount(1);
  await expect(page.locator('.create-card.disabled')).toHaveCount(0);
  await page.getByRole('link', { name: /Project library/ }).click();
  await expect(page.getByText('Every document the project relies on', { exact: false })).toBeVisible();
  await expect(page.getByText('Superseded and withdrawn documents leave this list')).toHaveCount(0);
  await page.getByRole('button', { name: 'Learn more' }).click();
  await expect(page.getByText('Superseded and withdrawn documents leave this list', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Show less' }).click();
  await expect(page.getByText('Superseded and withdrawn documents leave this list')).toHaveCount(0);
});
