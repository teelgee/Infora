// The Scope control and the working-set picker open from a button inside a
// card on the document creator. A card cuts off anything that hangs out of it,
// so the list used to be shown half-hidden at the card's bottom edge.
//
// *In plain terms: open each list on the creator and check it is a whole list
// on top of the page — not inside the card, entirely on screen, and its last
// row can be clicked.*
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { SEEDED } from './support/api';

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';

async function openCreator(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email').fill(SEEDED.consultant);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(PROJECT).first().click();
  await page.getByRole('link', { name: 'Tools', exact: true }).click();
  await page.getByRole('link', { name: /Document creator/ }).click();
  await expect(page.getByRole('heading', { name: 'Document creator' })).toBeVisible();
}

for (const [cardTitle, chipName, listName] of [
  ['Sources this draft may use', /Scope:/, 'Scope'],
  ['Your own drafts, as background', /Working set/, 'Working set'],
] as const) {
  test(`creator: the "${listName}" list opens whole, on top of its card, and its last row is clickable`, async ({ page }) => {
    await openCreator(page);
    const card = page.locator('.card').filter({ hasText: cardTitle }).last();
    await card.scrollIntoViewIfNeeded();
    await card.getByRole('button', { name: chipName }).click();
    const input = page.getByRole('combobox', { name: listName });
    await expect(input).toBeFocused();

    const panel = page.locator('.scope-panel');
    await expect(panel).toBeVisible();
    // on the page itself, not inside the card that would cut it off
    expect(await panel.evaluate((el) => el.parentElement === document.body)).toBe(true);
    expect(await panel.evaluate((el) => el.closest('.card') === null)).toBe(true);

    // wholly on screen
    const box = (await panel.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);

    // the last row can be reached, and a click on it lands (the card would have eaten it)
    const options = panel.getByRole('option'); // not the page's native <select> options
    // the list loads after the panel opens: wait for a row, or for the empty-state line
    await expect(options.first().or(page.locator('.multi-picker-empty'))).toBeVisible();
    if ((await options.count()) > 0) {
      const last = options.last();
      // the list scrolls inside the panel; scroll the last row into view there
      await last.scrollIntoViewIfNeeded();
      await expect(last).toBeInViewport({ ratio: 1 });
      await last.click();
      await expect(last).toHaveAttribute('aria-selected', 'true');
    }
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
  });
}
