// T-473 acceptance — a seeded standard past its re-check date shows the mark on
// its citations and sits in the owner's queue.
//
// *In plain terms: the project's British Standard on ground investigation was
// confirmed current fourteen months ago and a standard is re-checked every
// twelve, so its re-check is two months overdue. The owner's super user finds it
// waiting on the home screen, opens it and sees why; asks a question the
// standard answers and sees a small mark on its source, with the fact in words
// on the card beneath; then presses "Confirm current" and the queue row goes.*
//
// The standard is still READ while it is overdue: the answer cites it. Only the
// fact travels with it.
import { expect, test } from '@playwright/test';
import { API_URL } from '../playwright.config';
import { SEEDED } from './support/api';

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';
const REFERENCE = 'WA-STD-BS5930-001';
const TITLE = 'BS 5930 — Code of practice for ground investigations';

test.describe.configure({ mode: 'serial' });

// Confirming is a person's act and the product cannot take it back, so the
// substrate puts the seed's own state back first (see e2e-server.ts) and a
// second run on the same seed starts where the first did.
test.beforeAll(async () => {
  const res = await fetch(`${API_URL}/__e2e/reset-seeded-currency`, { method: 'POST' });
  expect(res.ok).toBe(true);
});

test('an overdue standard waits in the queue, marks its citations, and leaves the queue once confirmed', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(SEEDED.owner);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(PROJECT).first().click();

  // ── the queue: the re-check is waiting on the owner's super user ───────────
  const queue = page.getByRole('list', { name: 'Waiting on you' });
  const item = queue.getByRole('button', { name: new RegExp(`Re-check: ${TITLE} — due `) });
  await expect(item).toBeVisible();

  // ── one click to where it is done: the document page's Currency card ────────
  await item.click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]+$/);
  const documentUrl = page.url();
  const card = page.locator('.card', { hasText: 'Currency' }).filter({ hasText: 'Confirm current' });
  await expect(card).toContainText('Re-check overdue');
  await expect(card).toContainText('Rachel Bowen');
  await expect(card).toContainText('would run for 12 months');

  // ── Ask: the standard is still read, and its source carries the mark ───────
  await page.getByRole('link', { name: 'Ask' }).first().click();
  const box = page.getByPlaceholder('Ask about the project');
  await box.fill('What does BS 5930 require for an alpha-category ground investigation?');
  await box.press('Enter');
  const chip = page.locator('button.cite.lib', { hasText: REFERENCE }).first();
  await expect(chip).toBeVisible({ timeout: 30_000 });
  // a visible glyph with a name, not colour alone
  const mark = chip.locator('.cite-currency');
  await expect(mark).toBeVisible();
  await expect(mark).toHaveAttribute('aria-label', 'Re-check overdue');
  // the hover card says it in words
  await chip.hover();
  const source = page.getByRole('dialog', { name: `Source: ${REFERENCE}` });
  await expect(source).toBeVisible();
  await expect(source.locator('.source-card-currency')).toContainText('Re-check overdue since');
  await expect(source.locator('.source-card-currency')).toContainText('confirmed current by Rachel Bowen');
  await page.keyboard.press('Escape');

  // ── confirm it: the queue row goes ─────────────────────────────────────────
  await page.goto(documentUrl);
  await page.getByRole('button', { name: 'Confirm current' }).click();
  await expect(card).toContainText('Confirmed current');
  await expect(card).not.toContainText('Re-check overdue');
  await page.goto(documentUrl.replace(/\/documents\/.+$/, ''));
  await expect(queue).toBeVisible();
  await expect(queue.getByRole('button', { name: new RegExp(`Re-check: ${TITLE}`) })).toHaveCount(0);
});
