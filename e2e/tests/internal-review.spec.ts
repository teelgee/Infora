// T-478 — "Request internal review" in one dialog, driven in the browser: from a
// working draft's editor, pick the QA reviewer, add a note, press Request review
// — the draft freezes as P01, the reviewer is named, the internal round opens,
// the badge beside the document's name reads "In internal QA P01" and the note
// is waiting in the draft's comments. A fresh draft is used (not the seeded
// chapter) because an open round locks the head and would change what the other
// specs find on the seeded chapter; the seeded colleague stands in as reviewer.
import { expect, test } from '@playwright/test';
import type { SandboxDocument } from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';

test.describe.configure({ mode: 'serial' });

let consultant: ApiSession;
let projectId: string;
let documentId: string;
let documentTitle: string;

test.beforeAll(async () => {
  consultant = await ApiSession.login(SEEDED.consultant);
  const me = await consultant.get<{ participants: Array<{ projectId: string }> }>('/me');
  projectId = me.participants[0]!.projectId;
  documentTitle = `T-478 review ${Date.now()}`;
  const doc = await consultant.post<SandboxDocument>(`/projects/${projectId}/sandbox-documents`, {
    title: documentTitle,
  });
  documentId = doc.id;
  await consultant.patch<SandboxDocument>(`/sandbox-documents/${documentId}`, {
    content: 'Ground conditions chapter, ready for a colleague to check.',
  });
});

test.afterAll(async () => {
  await consultant.dispose();
});

test('one dialog takes a working draft to an open internal round', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(SEEDED.consultant);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(PROJECT).first().click();
  await page.goto(`/projects/${projectId}/editor/${documentId}`);
  await expect(page.locator('.doc-body textarea')).toHaveValue(/Ground conditions chapter/);

  // before: a working draft, the badge beside the name
  const crumb = page.locator('.topbar .crumb');
  await expect(crumb.getByText(documentTitle)).toBeVisible();
  await expect(crumb.getByText(/Working/)).toBeVisible();

  await page.getByRole('button', { name: 'Request internal review…' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/freezes the draft as the next P revision/)).toBeVisible();
  await dialog.getByRole('combobox').click();
  await dialog.getByRole('option', { name: /Owen Vance/ }).click();
  await dialog.getByPlaceholder('What should they look at?').fill('Please check the ground-water section.');
  await dialog.getByRole('button', { name: 'Request review' }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByText(/Internal round opened — P01 with Owen Vance/)).toBeVisible();
  await expect(crumb.getByText('In internal QA P01')).toBeVisible();
  // editing is locked while the round is open; the request is no longer offered
  await expect(page.getByRole('button', { name: 'Request internal review…' })).toHaveCount(0);

  // the note waits in the draft's comments
  await page.locator('.panel-tabs').getByText('Comments').click();
  await expect(page.getByText('Review request: Please check the ground-water section.')).toBeVisible();
});
