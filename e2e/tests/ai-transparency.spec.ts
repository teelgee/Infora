// T-463 — "How the AI works here": the owner's super user turns the checker
// off with a reason; the tile leaves Tools and the button leaves the editor for
// a consultant; the audit names who and why; the switch goes back on.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ApiSession, SEEDED } from './support/api';

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';
type SandboxDocument = { id: string; title: string };

async function loginAs(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(PROJECT).first()).toBeVisible();
  await page.getByText(PROJECT).first().click();
}

test('switching the checker off removes it from Tools and the editor, and the page records who and why', async ({ page, browser }) => {
  // a working draft for Eleanor, so the editor has a Check button to lose
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const me = await eleanor.get<{ participants: Array<{ projectId: string; projectName: string }> }>('/me');
  const projectId = me.participants.find((p) => p.projectName === PROJECT)!.projectId;
  const doc = await eleanor.post<SandboxDocument>(`/projects/${projectId}/sandbox-documents`, { title: `T-463 draft ${Date.now()}` });
  await eleanor.dispose();

  // Rachel — the owner's super user — throws the switch
  await loginAs(page, SEEDED.owner);
  await page.getByRole('button', { name: 'How the AI works here' }).click();
  await expect(page.getByRole('heading', { name: 'How the AI works here' })).toBeVisible();
  const table = page.getByRole('table', { name: 'How the AI works here' });
  const checkerRow = table.getByRole('row').filter({ hasText: 'QA checker' });
  await expect(checkerRow).toContainText('Never');
  await checkerRow.getByRole('button', { name: 'Turn off QA checker' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').fill('The client has not yet agreed automated checking on its documents.');
  await dialog.getByRole('button', { name: 'Turn off for this project' }).click();
  await expect(checkerRow.getByText('Off', { exact: true })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Switch history' })).toContainText('Rachel Bowen');
  await expect(page.getByRole('table', { name: 'Switch history' })).toContainText('not yet agreed automated checking');

  // Eleanor meets absence: no tile, no button
  const other = await browser.newContext();
  const page2 = await other.newPage();
  await loginAs(page2, SEEDED.consultant);
  await page2.getByRole('link', { name: 'Tools', exact: true }).click();
  await expect(page2.getByRole('heading', { name: 'Tools', exact: true })).toBeVisible();
  await expect(page2.getByText('Document creator')).toBeVisible();
  await expect(page2.getByText('QA checker')).toHaveCount(0);
  await page2.goto(`/projects/${projectId}/editor/${doc.id}`);
  await expect(page2.getByRole('button', { name: 'Comment' })).toBeVisible();
  await expect(page2.getByRole('button', { name: 'Check this draft' })).toHaveCount(0);
  await other.close();

  // and back on, so the seed is as it was
  await checkerRow.getByRole('button', { name: 'Turn on QA checker' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('Agreed with the client.');
  await page.getByRole('dialog').getByRole('button', { name: 'Turn on', exact: true }).click();
  await expect(checkerRow.getByText('On', { exact: true })).toBeVisible();
});
