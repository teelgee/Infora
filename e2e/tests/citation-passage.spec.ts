// T-468 acceptance — a citation lands on the passage.
//
// *In plain terms: ask a question, hover the source under the answer and the
// exact passage the AI read appears beside the document's name and revision;
// click it and the document page opens with that passage highlighted.*
//
// The answer is produced the same way the skeleton acceptance produces one (the
// fake providers' deterministic draft cites a live library source); what is
// checked here is the browser half: the card, and the landing.
import { expect, test } from '@playwright/test';
import { SEEDED } from './support/api';

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';

test('hovering an Ask citation shows the recorded passage; clicking lands on it, highlighted', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(SEEDED.consultant);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(PROJECT).first().click();
  await page.getByRole('link', { name: 'Ask' }).first().click();

  await page.getByPlaceholder('Ask about the project').fill('What did the ground investigation record?');
  await page.getByPlaceholder('Ask about the project').press('Enter');

  // the source sits at the end of the claim it backs; it is a real button
  const chip = page.locator('button.cite.lib').first();
  await expect(chip).toBeVisible({ timeout: 30_000 });
  const reference = (await chip.innerText()).replace('▤', '').trim();

  // hover: the card appears within a second, with the document and the passage
  const started = Date.now();
  await chip.hover();
  const card = page.getByRole('dialog', { name: `Source: ${reference}` });
  await expect(card).toBeVisible({ timeout: 1000 });
  await expect(card.locator('.source-card-title')).toHaveText(reference);
  await expect(card.locator('blockquote.source-card-passage')).not.toBeEmpty({ timeout: 1000 });
  expect(Date.now() - started).toBeLessThan(2500);

  // keyboard: the same card opens on focus and closes on Escape
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await chip.focus();
  await expect(card).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);

  // click: the document page, scrolled to the passage and marked
  await chip.click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]+\?version=[0-9a-f-]+&passage=[0-9a-f-]+/);
  // a text version marks the passage in its own text; a version that has a PDF
  // rendition opens the PDF and shows the verbatim passage in a banner above it
  // (an <object> cannot be highlighted inside). Which one the seeded world
  // cites varies with the fake index, so either is the landing.
  const landing = page.locator('mark[data-passage], [data-passage-banner]').first();
  await expect(landing).toBeVisible();
  await expect(landing).not.toBeEmpty();
});
