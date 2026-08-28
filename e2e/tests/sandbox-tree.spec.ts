// T-179 — the SharePoint-shaped sandbox folder tree, driven in the browser:
// folders nest, a document lives *inside* its folder (hidden until the folder is
// expanded), the breadcrumb navigates in and out, and a document re-files through
// the Move dialog (the keyboard-accessible twin of drag-and-drop). Proves the
// folder-tree rebuild of ADR-0036's drawer.
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

test('a document nests inside a folder, hides until expanded, and re-files via Move', async ({ page }) => {
  await loginAs(page, SEEDED.consultant);
  await page.getByRole('link', { name: /Sandbox/ }).click();

  // a fresh sandbox, so the tree starts empty and deterministic
  const sandboxName = `Tree e2e ${Date.now()}`;
  await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
  const sbModal = page.getByRole('dialog');
  await sbModal.getByPlaceholder('e.g. Ecology working area').fill(sandboxName);
  await sbModal.getByRole('button', { name: 'Next' }).click(); // wizard step 1 → people (private default)
  await sbModal.getByRole('button', { name: 'Create sandbox' }).click();
  await expect(sbModal).toBeHidden();

  // a folder at the sandbox root
  const folderName = `Ecology ${Date.now()}`;
  await page.getByRole('button', { name: /New folder/ }).click();
  const folderModal = page.getByRole('dialog');
  await folderModal.getByPlaceholder('e.g. Ecology').fill(folderName);
  await folderModal.getByRole('button', { name: 'Create folder' }).click();
  await expect(folderModal).toBeHidden();
  await expect(page.getByRole('button', { name: folderName, exact: true })).toBeVisible();

  // navigate into the folder (breadcrumb grows), then create a document there
  await page.getByRole('button', { name: folderName, exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Folder path' }).getByText(folderName)).toBeVisible();
  const docTitle = `Nested draft ${Date.now()}`;
  await page.getByRole('button', { name: /New document/ }).click();
  const docModal = page.getByRole('dialog');
  await docModal.getByPlaceholder('e.g. Ecology draft').fill(docTitle);
  await docModal.getByRole('button', { name: 'Create document' }).click();
  await expect(docModal).toBeHidden();
  await expect(page.getByRole('row').filter({ hasText: docTitle })).toBeVisible();

  // back at the sandbox root the document is nested — hidden until the folder expands
  await page.getByRole('navigation', { name: 'Folder path' }).getByRole('button', { name: sandboxName }).click();
  await expect(page.getByRole('row').filter({ hasText: docTitle })).toHaveCount(0);
  await page.getByRole('row').filter({ hasText: folderName }).getByRole('button', { name: 'Expand folder' }).click();
  await expect(page.getByRole('row').filter({ hasText: docTitle })).toBeVisible();

  // re-file the document to the sandbox root via the Move dialog (Move lives
  // behind the row's "More actions" kebab now — T-227)
  await page
    .getByRole('row')
    .filter({ hasText: docTitle })
    .getByRole('button', { name: `More actions for ${docTitle}` })
    .click();
  await page.locator('.dropdown-menu').getByText('Move', { exact: false }).click();
  const moveModal = page.getByRole('dialog');
  await expect(moveModal).toBeVisible();
  await moveModal.getByRole('button', { name: 'Move here' }).click();
  await expect(moveModal).toBeHidden();

  // it now sits at the root: visible at the top level, and the folder it left is empty
  await expect(page.getByRole('row').filter({ hasText: docTitle })).toBeVisible();
  await page.getByRole('button', { name: folderName, exact: true }).click(); // navigate into the folder
  await expect(page.getByRole('navigation', { name: 'Folder path' }).getByText(folderName)).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: docTitle })).toHaveCount(0); // the document has left it
  await expect(page.getByText('This folder is empty', { exact: false })).toBeVisible();
});
