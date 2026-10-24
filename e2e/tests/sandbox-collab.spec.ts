// T-477 — Working together in the sandbox, driven in the browser as the seeded
// users: a teammate's edit shows as a dot on your row (and who is in the draft
// shows as a face); a History panel restores an old version as a NEW one after
// asking, and names the frozen version; an upload lands in the folder you were
// looking at; a title is renamed where it stands.
//
// Every test makes its own documents with unique titles and finds them by
// searching, never by assuming they are on the first page.
import { expect, test, type Page } from '@playwright/test';
import type { Sandbox, SandboxDocument, SandboxFolder } from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

test.describe.configure({ mode: 'serial' });

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';
const OWEN = 'owen.vance@calderhale.example'; // Calder & Hale, like the consultant
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function loginAs(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(PROJECT).first()).toBeVisible();
  await page.getByText(PROJECT).first().click();
}

async function projectIdOf(session: ApiSession): Promise<string> {
  const me = await session.get<{ participants: Array<{ projectId: string; projectName: string }> }>('/me');
  return me.participants.find((p) => p.projectName === PROJECT)!.projectId;
}

/** Open the sandbox's all-documents overview and find one document's row by searching. */
async function findRow(page: Page, title: string) {
  await page.getByRole('link', { name: /Sandbox/ }).click();
  await page.getByRole('searchbox', { name: /Search/ }).fill(title);
  const row = page.getByRole('row').filter({ hasText: title });
  await expect(row).toBeVisible();
  return row;
}

async function openMenu(page: Page, row: ReturnType<Page['getByRole']>, item: string) {
  await row.getByRole('button', { name: /More actions/ }).click();
  await page.locator('.dropdown-menu').getByText(item, { exact: false }).click();
}

test('a teammate’s edit shows as a dot within a minute and who is in the draft as a face; opening it clears the dot', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const owen = await ApiSession.login(OWEN);
  const projectId = await projectIdOf(eleanor);
  const title = `Collab dot ${Date.now()}`;
  const doc = await eleanor.post<SandboxDocument>(`/projects/${projectId}/sandbox-documents`, { title });
  await eleanor.patch(`/sandbox-documents/${doc.id}`, { content: 'Eleanor’s first draft' });

  // Eleanor is looking at her sandbox: her own save is no news to her
  await loginAs(page, SEEDED.consultant);
  const row = await findRow(page, title);
  await expect(row.getByRole('img', { name: 'Changed since you last opened it' })).toHaveCount(0);

  // Owen — a second browser, a second person of the same firm — opens the draft in the editor
  const ctx = await browser.newContext();
  const owenPage = await ctx.newPage();
  await loginAs(owenPage, OWEN);
  const owenRow = await findRow(owenPage, title);
  await owenRow.getByRole('button', { name: title, exact: true }).click();
  await expect(owenPage.getByRole('button', { name: 'History' })).toBeVisible();

  // …and saves a change (through the API: the editor's own save is covered elsewhere)
  await owen.patch(`/sandbox-documents/${doc.id}`, { content: 'Owen’s change' });

  // within a minute (the screen asks every 20 s): the dot, and Owen’s face
  await expect(row.getByRole('img', { name: 'Changed since you last opened it' })).toBeVisible({ timeout: 60_000 });
  await expect(row.locator('.presence-avatar[title="Owen Vance"]')).toBeVisible({ timeout: 60_000 });

  // Eleanor opens the draft: the editor's heartbeat clears the dot
  await row.getByRole('button', { name: title, exact: true }).click();
  await expect(page.getByRole('button', { name: 'History' })).toBeVisible();
  await page.waitForTimeout(1500); // the heartbeat is fire-and-forget; let it land before looking again
  const back = await findRow(page, title);
  await expect(back.getByRole('img', { name: 'Changed since you last opened it' })).toHaveCount(0, { timeout: 45_000 });

  await ctx.close();
  await eleanor.dispose();
  await owen.dispose();
});

test('History restores v0.2 as a new v0.5 after asking, names the frozen version, and opens from the editor too', async ({ page }) => {
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const projectId = await projectIdOf(eleanor);
  const title = `Collab history ${Date.now()}`;
  const doc = await eleanor.post<SandboxDocument>(`/projects/${projectId}/sandbox-documents`, { title });
  for (const content of ['one', 'two', 'three', 'four']) await eleanor.patch(`/sandbox-documents/${doc.id}`, { content });

  await loginAs(page, SEEDED.consultant);
  const row = await findRow(page, title);
  await openMenu(page, row, 'History');
  const panel = page.getByRole('dialog');
  await expect(panel.getByText(`History — ${title}`)).toBeVisible();
  const versions = panel.getByRole('list', { name: 'Working versions' });
  await expect(versions.locator('li')).toHaveCount(4);

  // Restore asks first, in words; Cancel leaves everything as it was
  const v2 = versions.locator('li').filter({ hasText: 'v0.2' });
  await v2.getByRole('button', { name: 'Restore' }).click();
  await expect(v2.getByText('Restore v0.2? It becomes v0.5; nothing in the history is rewritten.')).toBeVisible();
  await v2.getByRole('button', { name: 'Cancel' }).click();
  await expect(v2.getByText(/It becomes v0\.5/)).toHaveCount(0);
  expect((await eleanor.get<{ items: unknown[] }>(`/sandbox-documents/${doc.id}/history`)).items).toHaveLength(4);

  // …and confirming writes v0.5
  await v2.getByRole('button', { name: 'Restore' }).click();
  await v2.getByRole('button', { name: 'Restore v0.2' }).click();
  await expect(page.getByText(/Restored v0\.2 as v0\.5/)).toBeVisible();
  const after = await eleanor.get<{ items: Array<{ versionReference: string }> }>(`/sandbox-documents/${doc.id}/history`);
  expect(after.items.map((i) => i.versionReference)).toEqual(['v0.5', 'v0.4', 'v0.3', 'v0.2', 'v0.1']);
  expect((await eleanor.get<SandboxDocument>(`/sandbox-documents/${doc.id}`)).content).toBe('two');

  // freeze it: the history names the version that was frozen
  await page.getByRole('row').filter({ hasText: title }).getByRole('button', { name: `Freeze ${title}` }).click();
  await expect(page.getByText(/Checked out/)).toBeVisible();
  await openMenu(page, page.getByRole('row').filter({ hasText: title }), 'History');
  const frozen = page.getByRole('dialog').getByRole('list', { name: 'Working versions' });
  await expect(frozen.locator('li').filter({ hasText: 'v0.5' }).getByText('Frozen', { exact: true })).toBeVisible();
  await expect(frozen.locator('li').filter({ hasText: 'v0.4' }).getByText('Frozen')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // the same panel from the editor's top bar
  await page.getByRole('row').filter({ hasText: title }).getByRole('button', { name: title, exact: true }).click();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  const fromEditor = page.getByRole('dialog');
  await expect(fromEditor.getByText(`History — ${title}`)).toBeVisible();
  await expect(fromEditor.getByRole('list', { name: 'Working versions' }).locator('li')).toHaveCount(5);
  await eleanor.dispose();
});

test('an upload lands in the folder you were looking at, with a progress line per file', async ({ page }) => {
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const projectId = await projectIdOf(eleanor);
  const stamp = Date.now();
  const sandbox = await eleanor.post<Sandbox>(`/projects/${projectId}/sandboxes`, { name: `Upload target ${stamp}`, scope: 'single_org' });
  const folder = await eleanor.post<SandboxFolder>(`/sandboxes/${sandbox.id}/folders`, { name: `Surveys ${stamp}` });

  await loginAs(page, SEEDED.consultant);
  await page.getByRole('link', { name: /Sandbox/ }).click();
  await page.locator('.sandbox-card', { hasText: sandbox.name }).click();
  await page.getByRole('button', { name: folder.name, exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Folder path' }).getByText(folder.name)).toBeVisible();

  const good = `Survey note ${stamp}`;
  await page.locator('input[type="file"][accept*=".docx"]').setInputFiles([
    { name: `${good}.docx`, mimeType: DOCX_MIME, buffer: Buffer.from('PK fake docx') },
    { name: `Not supported ${stamp}.txt`, mimeType: 'text/plain', buffer: Buffer.from('plain') },
  ]);

  // one line per file: the good one done, the other failed with its reason, and neither stops the other
  const lines = page.getByRole('list', { name: 'Uploads' });
  await expect(lines.locator('li').filter({ hasText: good }).getByText('Uploaded', { exact: true })).toBeVisible();
  await expect(lines.locator('li').filter({ hasText: `Not supported ${stamp}.txt` }).getByText('Not uploaded')).toBeVisible();

  // the new row is in the folder the user stood in
  await expect(page.getByRole('row').filter({ hasText: good })).toBeVisible();
  const landed = (await eleanor.get<{ items: SandboxDocument[] }>(`/projects/${projectId}/sandbox-documents`)).items.find((d) => d.title === good)!;
  expect(landed.sandboxId).toBe(sandbox.id);
  expect(landed.folderId).toBe(folder.id);
  await eleanor.dispose();
});

test('a title is renamed where it stands: Enter saves, Escape cancels, leaving the box saves', async ({ page }) => {
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const projectId = await projectIdOf(eleanor);
  const stamp = Date.now();
  const title = `Collab rename ${stamp}`;
  const doc = await eleanor.post<SandboxDocument>(`/projects/${projectId}/sandbox-documents`, { title });
  const titleNow = async () => (await eleanor.get<SandboxDocument>(`/sandbox-documents/${doc.id}`)).title;

  await loginAs(page, SEEDED.consultant);
  let row = await findRow(page, title);

  // Enter saves
  await openMenu(page, row, 'Rename');
  const box = page.getByRole('textbox', { name: 'Document name' });
  await expect(box).toBeFocused();
  await box.fill(`Collab renamed ${stamp}`);
  await box.press('Enter');
  // the new name no longer matches the search that found the row, so search on the stamp
  await page.getByRole('searchbox', { name: /Search/ }).fill(`${stamp}`);
  await expect(page.getByRole('row').filter({ hasText: `Collab renamed ${stamp}` })).toBeVisible();
  await expect.poll(titleNow).toBe(`Collab renamed ${stamp}`);

  // Escape cancels
  row = page.getByRole('row').filter({ hasText: `Collab renamed ${stamp}` });
  await openMenu(page, row, 'Rename');
  const box2 = page.getByRole('textbox', { name: 'Document name' });
  await box2.fill('Should not be kept');
  await box2.press('Escape');
  await expect(page.getByRole('textbox', { name: 'Document name' })).toHaveCount(0);
  await expect(row.getByText(`Collab renamed ${stamp}`)).toBeVisible();
  expect(await titleNow()).toBe(`Collab renamed ${stamp}`);

  // blur saves
  await openMenu(page, row, 'Rename');
  const box3 = page.getByRole('textbox', { name: 'Document name' });
  await box3.fill(`Collab blurred ${stamp}`);
  await page.getByRole('heading', { name: 'Sandbox', level: 1 }).click();
  await expect(page.getByRole('row').filter({ hasText: `Collab blurred ${stamp}` })).toBeVisible();
  await expect.poll(titleNow).toBe(`Collab blurred ${stamp}`);
  await eleanor.dispose();
});
