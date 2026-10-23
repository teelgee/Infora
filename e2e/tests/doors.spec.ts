// T-456 — doors for what was already built: a sandbox document's history with
// restore, delete to the bin and restore from it, the firm's drafting-manual
// door on the Knowledge shelf, and "who can see this" on a plan row. Each
// capability existed in the API with no screen; these prove the screens reach
// them, in the browser, as the seeded users.
import { expect, test } from '@playwright/test';
import type { SandboxDocument } from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

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

test('history lists the working versions; delete moves a draft to the bin and restore brings it back', async ({ page }) => {
  // a fresh draft, made through the API so the test owns its title
  const api = await ApiSession.login(SEEDED.consultant);
  const me = await api.get<{ participants: Array<{ projectId: string; projectName: string }> }>('/me');
  const projectId = me.participants.find((p) => p.projectName === PROJECT)!.projectId;
  const title = `Doors draft ${Date.now()}`;
  const doc = await api.post<SandboxDocument>(`/projects/${projectId}/sandbox-documents`, { title });
  // two saves, so the history has v0.1 and v0.2 and a restore has something to restore
  await api.patch(`/sandbox-documents/${doc.id}`, { content: 'first draft' });
  await api.patch(`/sandbox-documents/${doc.id}`, { content: 'second draft' });
  await api.dispose();

  await loginAs(page, SEEDED.consultant);
  await page.getByRole('link', { name: /Sandbox/ }).click();
  const row = page.getByRole('row', { name: new RegExp(title) });
  await expect(row).toBeVisible();
  // T-455 — the lifecycle badge on the row
  await expect(row.getByText(/^Working v0\.\d+$/)).toBeVisible();

  // History… lists v0.1 as the current version
  await row.getByRole('button', { name: `More actions for ${title}` }).click();
  await page.locator('.dropdown-menu').getByText('History', { exact: false }).click();
  const history = page.getByRole('dialog');
  await expect(history.getByText(`History — ${title}`)).toBeVisible();
  const versions = history.getByRole('list', { name: 'Working versions' });
  await expect(versions.getByText('v0.2')).toBeVisible();
  await expect(versions.getByText('v0.1')).toBeVisible();
  // restore v0.1 — it lands as v0.3, and the history is not rewritten
  await versions.locator('li').filter({ hasText: 'v0.1' }).getByRole('button', { name: 'Restore' }).click();
  await expect(history).toBeHidden();
  await expect(page.getByText(/Restored v0\.1 as v0\.3/)).toBeVisible();
  await expect(row.getByText('Working v0.3')).toBeVisible();

  // Delete… → the bin → Restore
  await row.getByRole('button', { name: `More actions for ${title}` }).click();
  await page.locator('.dropdown-menu').getByText('Delete', { exact: false }).click();
  const confirm = page.getByRole('dialog');
  await expect(confirm.getByText(`Delete “${title}”?`)).toBeVisible();
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByRole('row', { name: new RegExp(title) })).toHaveCount(0);

  await page.getByRole('button', { name: /Deleted/ }).click();
  const bin = page.getByRole('dialog');
  await expect(bin.getByText('Deleted documents')).toBeVisible();
  const binRow = bin.getByRole('list', { name: 'Deleted documents' }).locator('li').filter({ hasText: title });
  await expect(binRow).toBeVisible();
  // the consultant is her organisation's admin, so the erase door is drawn too
  await expect(binRow.getByRole('button', { name: /Erase permanently/ })).toBeVisible();
  await binRow.getByRole('button', { name: 'Restore' }).click();
  await expect(binRow).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('row', { name: new RegExp(title) })).toBeVisible();
  expect(doc.id).toBeTruthy();
});

test('the firm shelf offers the drafting-manual door to an org admin', async ({ page }) => {
  await loginAs(page, SEEDED.consultant);
  await page.getByRole('link', { name: /Knowledge/ }).click();
  await expect(page.getByText('Load a drafting manual')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose file' })).toBeVisible();
});

test('a plan row says who can see it, and the owner holds the share door', async ({ page }) => {
  await loginAs(page, SEEDED.owner);
  await page.getByRole('link', { name: /Plan/ }).click();
  await page.getByRole('row').nth(1).click();
  const detail = page.getByRole('dialog');
  await expect(detail.getByText('Who can see this')).toBeVisible();
  await expect(detail.getByRole('list', { name: 'Who can see this' })).toBeVisible();
});
