// T-222 (Slice A3 P1, ADR-0043) — sandbox DMS parity, driven in the browser.
// An uploaded docx can be renamed and its native file replaced; each replace is
// a new working revision the ambient history records; and — like every canonical
// rewrite — a replace is refused while the head is checked out (frozen), then
// succeeds again once released. Grounding is untouched (the sandbox never grounds).
import { expect, test, type Page } from '@playwright/test';
import type { ListSandboxDocumentsResponse, ListSandboxHistoryResponse, SandboxDocument } from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

test.describe.configure({ mode: 'serial' });

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// a fake but well-named docx — the DMS keeps the native file canonical and does
// not parse it on upload/replace (only "open in editor" reads the bytes)
const fakeDocx = (tag: string): Buffer => Buffer.from(`PK fake docx — ${tag}`);

// row actions beyond freeze/promote live behind the row's "More actions" kebab
// (T-227); the menu is portalled to <body>.
async function rowMenuAction(page: Page, row: ReturnType<Page['getByRole']>, item: string): Promise<void> {
  await row.getByRole('button', { name: /More actions/ }).click();
  await page.locator('.dropdown-menu').getByText(item, { exact: false }).click();
}

async function loginAs(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(PROJECT).first()).toBeVisible();
  await page.getByText(PROJECT).first().click();
}

test('upload → rename → replace (revision increments) → frozen replace refused → released replace succeeds', async ({
  page,
}) => {
  const consultant = await ApiSession.login(SEEDED.consultant);
  const me = await consultant.get<{ participants: Array<{ projectId: string }> }>('/me');
  const projectId = me.participants[0]!.projectId;

  const workingRevision = async (docId: string): Promise<string | undefined> => {
    const list = await consultant.get<ListSandboxDocumentsResponse>(`/projects/${projectId}/sandbox-documents`);
    return list.items.find((d) => d.id === docId)?.workingRevision;
  };
  const historyLength = async (docId: string): Promise<number> =>
    (await consultant.get<ListSandboxHistoryResponse>(`/sandbox-documents/${docId}/history`)).items.length;

  // ── upload a docx via the DMS upload path (there is no upload UI yet) ────────
  const stamp = Date.now();
  const title = `T222 drainage ${stamp}`;
  const uploaded = await consultant.context.post(`/projects/${projectId}/sandbox-uploads`, {
    multipart: { file: { name: `${title}.docx`, mimeType: DOCX_MIME, buffer: fakeDocx('v1') } },
  });
  expect(uploaded.ok()).toBeTruthy();
  const docId = ((await uploaded.json()) as SandboxDocument).id;
  // the upload is the genesis working revision (ADR-0041)
  expect(await workingRevision(docId)).toBe('v0.1');
  expect(await historyLength(docId)).toBe(1);

  // ── the sandbox surface (flat overview across the org's sandboxes) ──────────
  await loginAs(page, SEEDED.consultant);
  await page.getByRole('link', { name: /Sandbox/ }).click();

  let row = page.getByRole('row').filter({ hasText: title });
  await expect(row).toBeVisible();
  // the row shows its format at a glance
  await expect(row.getByText('DOCX')).toBeVisible();

  // ── rename (an unbound document) ────────────────────────────────────────────
  const renamed = `T222 drainage strategy ${stamp}`;
  // T-477 — the title turns into an input in the row; Enter saves
  await rowMenuAction(page, row, 'Rename');
  const renameBox = page.getByRole('textbox', { name: 'Document name' });
  await renameBox.fill(renamed);
  await renameBox.press('Enter');
  row = page.getByRole('row').filter({ hasText: renamed });
  await expect(row).toBeVisible();

  // ── replace the native file → a new working revision, recorded in history ───
  await rowMenuAction(page, row, 'Replace file');
  let replaceDialog = page.getByRole('dialog');
  await replaceDialog
    .locator('input[type="file"]')
    .setInputFiles({ name: `${renamed} v2.docx`, mimeType: DOCX_MIME, buffer: fakeDocx('v2') });
  await replaceDialog.getByRole('button', { name: 'Replace file' }).click();
  await expect(page.getByText(/File replaced/)).toBeVisible();
  expect(await workingRevision(docId)).toBe('v0.2');
  expect(await historyLength(docId)).toBe(2);

  // ── freeze (check out) → the head is locked ─────────────────────────────────
  await row.getByRole('button', { name: 'Freeze' }).click();
  await expect(page.getByText(/Checked out/)).toBeVisible();
  await expect(row.getByRole('button', { name: 'Release' })).toBeVisible();

  // ── a replace is refused while frozen (it rewrites canonical bytes) ─────────
  await rowMenuAction(page, row, 'Replace file');
  replaceDialog = page.getByRole('dialog');
  await replaceDialog
    .locator('input[type="file"]')
    .setInputFiles({ name: `${renamed} v3.docx`, mimeType: DOCX_MIME, buffer: fakeDocx('v3-blocked') });
  await replaceDialog.getByRole('button', { name: 'Replace file' }).click();
  await expect(page.getByText(/Replace refused/)).toBeVisible();
  // the revision did not move
  expect(await workingRevision(docId)).toBe('v0.2');

  // ── release → the document is editable again ────────────────────────────────
  await row.getByRole('button', { name: 'Release' }).click();
  await expect(page.getByText(/Released/)).toBeVisible();

  // ── replace now succeeds → v0.3 ─────────────────────────────────────────────
  await rowMenuAction(page, row, 'Replace file');
  replaceDialog = page.getByRole('dialog');
  await replaceDialog
    .locator('input[type="file"]')
    .setInputFiles({ name: `${renamed} v3.docx`, mimeType: DOCX_MIME, buffer: fakeDocx('v3') });
  await replaceDialog.getByRole('button', { name: 'Replace file' }).click();
  await expect(page.getByText(/File replaced/)).toBeVisible();
  expect(await workingRevision(docId)).toBe('v0.3');
  expect(await historyLength(docId)).toBe(3);

  await consultant.dispose();
});

test('the Upload file toolbar button lands a native docx, with Replace available on its row', async ({ page }) => {
  await loginAs(page, SEEDED.consultant);
  await page.getByRole('link', { name: /Sandbox/ }).click();

  const name = `T222 uploaded ${Date.now()}`;
  // the hidden file picker the "Upload file" button opens (accepts Office files)
  await page
    .locator('input[type="file"][accept*=".docx"]')
    .setInputFiles({ name: `${name}.docx`, mimeType: DOCX_MIME, buffer: fakeDocx('ui') });
  // T-477 — the progress list says each file's state, one line per file
  await expect(
    page.getByRole('list', { name: 'Uploads' }).locator('li').filter({ hasText: name }).getByText('Uploaded', { exact: true }),
  ).toBeVisible();

  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toBeVisible();
  await expect(row.getByText('DOCX')).toBeVisible();
  // an uploaded document offers Replace file (unlike an authored one)
  await rowMenuAction(page, row, 'Replace file');
  await expect(page.getByRole('dialog')).toBeVisible();
});
