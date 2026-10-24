// T-167 — the producing-side interfaces, driven in the browser: the deliverable
// register's New-deliverable modal and the searchable Bind dialog are real
// in-app dialogs (no window.prompt), and a bound document is visible by its
// coded reference in the sandbox. Proves the Slice A2.1 UI overhaul.
//
// Scheme-agnostic (T-183 follow-up): a sibling spec (slice-a2.spec) defines a
// project-wide coding scheme on the shared seeded project, so this run must work
// whether the New-deliverable modal shows the manual reference field (no scheme)
// or the scheme's coded fields. The deliverable's unique TITLE is the anchor
// throughout — the Bind combobox filters on title as well as reference.
import { expect, test } from '@playwright/test';
import { SEEDED } from './support/api';

test.describe.configure({ mode: 'serial' });

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';
const stamp = String(Date.now()).slice(-5);
const DELIVERABLE_TITLE = `Ecology chapter UI e2e ${stamp}`;

async function loginAs(page: import('@playwright/test').Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(PROJECT).first()).toBeVisible();
  await page.getByText(PROJECT).first().click();
}

test('the New-deliverable modal creates a row in the register (no prompt)', async ({ page }) => {
  await loginAs(page, SEEDED.consultant);
  await page.getByRole('link', { name: /Plan/ }).click();

  await page.getByRole('button', { name: /New deliverable/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  await dialog.getByPlaceholder('e.g. EIA Scoping Method Statement').fill(DELIVERABLE_TITLE);
  // T-376 — there is ONE reference control, because there is one state. This
  // used to branch on whether a manual reference field was present, which was a
  // race against the scheme read rather than a real fork: the read always
  // returns a scheme, so the manual field only ever appeared mid-load and then
  // detached under the test. Deleting the branch was the fix to the product;
  // the test simply stopped needing it.
  await expect(dialog.getByPlaceholder('WA-BB-GEO-004')).toHaveCount(0);
  const fields = dialog.getByRole('combobox');
  for (let i = 0; i < (await fields.count()); i++) {
    await fields.nth(i).selectOption({ index: 1 }); // the first real value (index 0 is the "—" placeholder)
  }
  await dialog.getByRole('button', { name: 'Create deliverable' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText(DELIVERABLE_TITLE)).toBeVisible(); // the row is in the register
});

test('the Bind dialog picks a deliverable from a searchable list; the bound code shows in the sandbox', async ({
  page,
}) => {
  await loginAs(page, SEEDED.consultant);

  // a fresh sandbox document
  await page.getByRole('link', { name: /Sandbox/ }).click();
  await page.getByRole('button', { name: /New document/ }).click();
  const docTitle = `Ecology draft ${Date.now()}`;
  const create = page.getByRole('dialog');
  await create.getByPlaceholder('e.g. Ecology draft').fill(docTitle);
  await create.getByRole('button', { name: 'Create document' }).click();
  await expect(create).toBeHidden();

  // bind it via the searchable dialog — search by the deliverable's title (the
  // combobox filters on title as well as coded reference)
  const row = page.getByRole('row').filter({ hasText: docTitle });
  // Bind now lives behind the row's "More actions" kebab (T-227)
  await row.getByRole('button', { name: /More actions/ }).click();
  await page.locator('.dropdown-menu').getByText('Bind', { exact: false }).click();
  const bind = page.getByRole('dialog');
  await expect(bind).toBeVisible();
  await bind.getByPlaceholder(/Search your deliverables/).fill(`UI e2e ${stamp}`);
  await bind.getByText(DELIVERABLE_TITLE).click();
  // T-366: the confirmation card names the target and states the consequence
  await expect(bind.getByText('On bind, this draft becomes')).toBeVisible();
  await bind.getByRole('button', { name: /Bind to / }).click();
  await expect(bind).toBeHidden();

  // T-366 read-through: the bound row now shows its PLAN ROW's title, with the
  // coded reference (navigable) and no Unbound badge — the working title is dormant
  const boundRow = page.getByRole('row').filter({ hasText: DELIVERABLE_TITLE });
  await expect(boundRow.getByText('Unbound')).toHaveCount(0);
  await expect(boundRow.locator('.mono')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: docTitle })).toHaveCount(0);
});
