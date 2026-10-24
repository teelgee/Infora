// T-293 acceptance — the progress rail claims nothing it has not read.
//
// The browser half exists for one property that a unit test cannot reach: what
// the rail says BEFORE anything has run. A rail driven by a client-side timer
// looks right most of the time, and the moment it is provably wrong is the
// moment there is no record behind it — an empty conversation, or a run in
// flight. So this asserts the negative: on a freshly opened Ask surface the
// rail is present, states that nothing has been recorded, and shows no stage.
import { expect, test } from '@playwright/test';
import { SEEDED } from './support/api';

test('browser: the rail shows a stated absence, not a lit-up first stage', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(SEEDED.consultant);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Wrenfield–Ashcombe 400kV Connection').first().click();
  await page.getByRole('link', { name: 'Ask' }).first().click();

  const rail = page.locator('.progress-rail');
  await expect(rail).toBeVisible();
  await expect(rail).toContainText('No plan has been recorded yet');
  // not one stage is claimed — the rail renders the plan's steps, and there is
  // no plan
  await expect(page.locator('.pr-step')).toHaveCount(0);
});
