// T-454 (Slice A3 P2, ADR-0043 and its 2026-10-18 dated note) — the editing
// pane, driven in the browser.
//
// TWO TESTS, AND WHY THEY ARE SPLIT. The first needs no editing engine and
// runs everywhere, CI included: an uploaded spreadsheet offers "Edit in
// browser", the pane opens on its working versions, and a person from another
// organisation cannot open the editor at all — not the pass, not the pane.
//
// The second is the ticket's done-when, against the REAL engine: two seeded
// people of one firm open the same uploaded .xlsx in two browsers, each types
// into it, each saves, and BOTH panes see every save land as a new v0.x — and
// the file Infora holds afterwards carries both people's edits, which is what
// co-editing means. It needs Collabora running (`docker compose --profile
// editing up -d`) and the substrate told where it is (EDITOR_ENGINE_URL,
// WOPI_HOST_URL). CI starts no engine, so there it SKIPS, saying why — it is
// never reported as passed without having run.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Browser, type Page } from '@playwright/test';
import type { EditingSession, ListSandboxHistoryResponse, SandboxDocument } from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

test.describe.configure({ mode: 'serial' });

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const OWEN = 'owen.vance@calderhale.example';
// a real workbook (three rows, one sheet), so the engine opens it and Infora
// re-extracts its text after every save
const workbook = readFileSync(fileURLToPath(new URL('../fixtures/t454-cost-report.xlsx', import.meta.url)));

async function loginAs(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(PROJECT)).toBeVisible();
  await page.getByText(PROJECT).click();
}

async function uploadWorkbook(session: ApiSession, projectId: string, title: string): Promise<string> {
  const res = await session.context.post(`/projects/${projectId}/sandbox-uploads`, {
    multipart: { file: { name: `${title}.xlsx`, mimeType: XLSX_MIME, buffer: workbook } },
  });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as SandboxDocument).id;
}

test('an uploaded spreadsheet opens in the editing pane; another firm cannot open the editor at all', async ({ page }) => {
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const me = await eleanor.get<{ participants: Array<{ projectId: string }> }>('/me');
  const projectId = me.participants[0]!.projectId;
  const title = `T454 cost report ${Date.now()}`;
  const docId = await uploadWorkbook(eleanor, projectId, title);

  // ── the sandbox row offers it, and the pane opens on the file ───────────────
  await loginAs(page, SEEDED.consultant);
  await page.getByRole('link', { name: /Sandbox/ }).click();
  const row = page.getByRole('row').filter({ hasText: title });
  await row.getByRole('button', { name: /More actions/ }).click();
  await page.locator('.dropdown-menu').getByText('Edit in browser').click();
  await expect(page).toHaveURL(new RegExp(`/sandbox/edit/${docId}$`));
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const versions = page.getByRole('complementary', { name: 'Working versions' });
  await expect(versions.getByTestId('working-version').first()).toContainText('v0.1');
  // with an engine the editor frame is there; without one the pane says so in
  // words — never a blank frame
  await expect(
    page.locator(`iframe[title="Editor — ${title}"]`).or(page.getByText('In-browser editing isn’t set up on this server')),
  ).toBeVisible();

  // ── Redgate is on the project but outside this firm's sandbox ───────────────
  const nadia = await ApiSession.login(SEEDED.secondConsultant);
  expect((await nadia.raw('post', `/sandbox-documents/${docId}/editing-session`)).status()).toBe(404);
  await page.context().clearCookies();
  await loginAs(page, SEEDED.secondConsultant);
  await page.goto(`/projects/${projectId}/sandbox/edit/${docId}`);
  await expect(page.getByText('This file isn’t available to you.')).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
});

/** Open the pane in a fresh browser as `email`, and wait for the engine to load the workbook. */
async function openEditor(browser: Browser, email: string, projectId: string, docId: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, email);
  await page.goto(`/projects/${projectId}/sandbox/edit/${docId}`);
  const editor = page.frameLocator('iframe[title^="Editor — "]');
  const nameBox = editor.locator('#pos_window-input-address');
  await expect(nameBox).toBeVisible({ timeout: 90_000 });
  // the Development Edition greets each new browser with a three-slide "what's
  // new" card a moment after the document loads; it is dismissed the way a
  // person would — to its last slide, and Close
  const welcome = editor.locator('.iframe-welcome-modal');
  if (await welcome.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true, () => false)) {
    const card = editor.frameLocator('.iframe-welcome-modal');
    await card.getByRole('link', { name: '3', exact: true }).click();
    await card.getByRole('button', { name: 'Close' }).click();
    await expect(welcome).toBeHidden();
  }
  return { context, page, editor, nameBox };
}

async function typeIntoCellAndSave(
  opened: Awaited<ReturnType<typeof openEditor>>,
  cell: string,
  text: string,
) {
  await opened.nameBox.fill(cell);
  await opened.nameBox.press('Enter');
  await opened.page.waitForTimeout(500);
  await opened.page.keyboard.type(text);
  await opened.page.keyboard.press('Enter');
  await opened.editor.getByRole('button', { name: 'Save', exact: true }).first().click();
}

test('two people co-edit one uploaded .xlsx in two browsers, and both see each save land as v0.x', async ({ browser }) => {
  test.setTimeout(300_000);
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const me = await eleanor.get<{ participants: Array<{ projectId: string }> }>('/me');
  const projectId = me.participants[0]!.projectId;
  const docId = await uploadWorkbook(eleanor, projectId, `T454 co-edit ${Date.now()}`);
  const probe = await eleanor.post<EditingSession>(`/sandbox-documents/${docId}/editing-session`, {});
  test.skip(
    probe.editorUrl === null,
    'No editing engine on this substrate (EDITOR_ENGINE_URL unset, or the engine unreachable — CI starts none). Run with `docker compose --profile editing up -d` and WOPI_HOST_URL set as the README says.',
  );

  const asEleanor = await openEditor(browser, SEEDED.consultant, projectId, docId);
  const asOwen = await openEditor(browser, OWEN, projectId, docId);
  const latest = (page: Page) =>
    page.getByRole('complementary', { name: 'Working versions' }).getByTestId('working-version').first();

  // Eleanor types and saves — both panes see v0.2, under her name
  await typeIntoCellAndSave(asEleanor, 'C5', 'Eleanor 450');
  for (const { page } of [asEleanor, asOwen]) {
    await expect(latest(page)).toContainText('v0.2', { timeout: 60_000 });
    await expect(latest(page)).toContainText('Eleanor Price');
  }

  // Owen, in the same live document, types and saves — both see v0.3, his
  await typeIntoCellAndSave(asOwen, 'D5', 'Owen 120');
  for (const { page } of [asEleanor, asOwen]) {
    await expect(latest(page)).toContainText('v0.3', { timeout: 60_000 });
    await expect(latest(page)).toContainText('Owen Vance');
  }

  // the file Infora now holds carries BOTH people's edits: one live document,
  // not two copies racing each other
  const doc = await eleanor.get<SandboxDocument>(`/sandbox-documents/${docId}`);
  expect(doc.content).toContain('Eleanor 450');
  expect(doc.content).toContain('Owen 120');
  // the version history over the ordinary API shows the saves
  const history = await eleanor.get<ListSandboxHistoryResponse>(`/sandbox-documents/${docId}/history`);
  expect(history.items.map((i) => i.versionReference).slice(0, 3)).toEqual(['v0.3', 'v0.2', 'v0.1']);
  // and while the editor is open the file is checked out — the lock rides it
  expect(doc.headLocked).toBe(true);

  await asEleanor.context.close();
  await asOwen.context.close();
});
