// T-465 — an accidental removal is undone in one click, and the record keeps
// both acts: the toast carries Undo for as long as the act is reversible, and
// the document page's activity lists the removal and the restoration.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ApiSession, SEEDED } from './support/api';

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';
type PlanRow = { containerId: string; documentReference: string | null };

async function loginAs(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(PROJECT)).toBeVisible();
  await page.getByText(PROJECT).click();
}

test('remove a planned deliverable by mistake, undo it in one click, and read both acts on the document page', async ({ page }) => {
  const stamp = Date.now();
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const me = await eleanor.get<{ participants: Array<{ projectId: string; projectName: string }> }>('/me');
  const projectId = me.participants.find((p) => p.projectName === PROJECT)!.projectId;
  const ref = `T465-${String(stamp).slice(-6)}`;
  const row = await eleanor.post<PlanRow>(`/projects/${projectId}/plan`, { documentReference: ref, title: `Undo me ${stamp}` });
  await eleanor.dispose();

  await loginAs(page, SEEDED.consultant);
  await page.getByRole('link', { name: /Plan/ }).click();
  await page.getByRole('searchbox', { name: 'Search Deliverables plan' }).fill(ref);
  await page.getByRole('button', { name: `Details for ${ref}` }).click();
  const panel = page.getByRole('dialog');
  await panel.getByRole('button', { name: 'Remove from plan…' }).click();
  await panel.getByRole('textbox').last().fill('Descoped by mistake');
  await panel.getByRole('button', { name: 'Remove from plan', exact: true }).click();

  // the toast says what happened and offers the reverse act
  const toast = page.getByRole('status').filter({ hasText: 'removed from the plan' });
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Undone.' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Remove from plan…' })).toBeVisible(); // live again
  await page.keyboard.press('Escape');

  // both acts on the record
  await page.goto(`/projects/${projectId}/documents/${row.containerId}`);
  await page.getByRole('radiogroup', { name: 'Document page sections' }).getByRole('radio', { name: 'Activity' }).click();
  const activity = page.getByRole('list', { name: 'Activity' });
  await expect(activity).toContainText('Removed from the plan — Descoped by mistake');
  await expect(activity).toContainText('Restored to the plan');
  await expect(activity).toContainText('Eleanor Price');
});
