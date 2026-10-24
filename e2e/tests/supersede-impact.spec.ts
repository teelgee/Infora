// T-474 acceptance — superseding the seeded ground-investigation report puts a
// finding on the seeded chapter's citing sentence; Redgate (Org C) sees nothing;
// and the owner's dialog never changes because Calder & Hale (Org B) has a
// private draft that cites the report.
//
// *In plain terms: Trentmoor (the owner) replaces WA-GEO-GIR-004 with another
// document. The dialog it acts from talks only about Trentmoor's own work —
// nothing of Calder & Hale's. Afterwards, a Calder & Hale author finds a
// notification waiting, opens the chapter it points at and reads, in the Checks
// tab, which sentence rests on the replaced report. Redgate, which cited
// nothing, is told nothing and can read no trace of it.*
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { ListNotificationsResponse } from '@infora/contracts';
import { API_URL } from '../playwright.config';
import { ApiSession, SEEDED } from './support/api';

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';
const REPORT = 'WA-GEO-GIR-004';
const REPLACEMENT = 'WA-WAT-FRA-001';
const CHAPTER = 'Chapter 9 — Ground conditions and contamination';
const PRIVATE_DRAFT = 'Dewatering approach — private draft';
const EVENT = 'A document you cited was superseded';

test.describe.configure({ mode: 'serial' });

// found in the first test, while the report is still on the library list
let reportId = '';

async function loginAs(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(PROJECT).first()).toBeVisible();
  await page.getByText(PROJECT).first().click();
}

// The supersession is an owner's act the product can undo but a spec must not
// leave behind: every later spec reads the report as live (see e2e-server.ts).
const reset = async () => {
  const res = await fetch(`${API_URL}/__e2e/reset-supersede-impact`, { method: 'POST' });
  expect(res.ok).toBe(true);
};
test.beforeAll(reset);
test.afterAll(reset);

test('before anything changes: "cited by" is each organisation\'s own, never a total', async ({ page }) => {
  const owner = await ApiSession.login(SEEDED.owner);
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const me = await owner.get<{ participants: Array<{ projectId: string }> }>('/me');
  const projectId = me.participants[0]!.projectId;
  const library = await owner.get<{ items: Array<{ documentReference: string; containerId: string }> }>(
    `/projects/${projectId}/library`,
  );
  reportId = library.items.find((i) => i.documentReference === REPORT)!.containerId;

  // Calder & Hale's own two documents are listed for Calder & Hale...
  // (earlier specs' own questions to the assistant may be listed beside them as
  // past answers; the two drafts are the ones this spec is about)
  const theirs = await eleanor.get<{ items: Array<{ kind: string; title: string }> }>(`/containers/${reportId}/cited-by`);
  // (and drafts earlier runs of other specs left behind, which is why this is "contains")
  expect(theirs.items.filter((i) => i.kind === 'draft').map((i) => i.title)).toEqual(
    expect.arrayContaining([CHAPTER, PRIVATE_DRAFT]),
  );
  // ...and the owner's Relationships tab on the same report shows none of them
  await loginAs(page, SEEDED.owner);
  await page.goto(`/projects/${projectId}/documents/${reportId}`);
  await page.getByRole('radiogroup', { name: 'Document page sections' }).getByRole('radio', { name: 'Relationships' }).click();
  await expect(page.getByText('Classification and relationships')).toBeVisible();
  await expect(page.getByText(CHAPTER)).toHaveCount(0);
  await expect(page.getByText(PRIVATE_DRAFT)).toHaveCount(0);
});

test('the owner supersedes the report; the dialog talks only about the owner\'s own work', async ({ page }) => {
  await loginAs(page, SEEDED.owner);
  await page.getByRole('link', { name: /Project library/ }).click();
  const table = page.getByRole('table', { name: 'Project library' });
  await expect(table.getByRole('row').nth(1)).toBeVisible();
  // the register is paged and grows with every run, and the dialog offers
  // replacements only from the visible page: sort by code descending so the
  // report and its replacement both sit on page one
  await page.goto(`${page.url().split('?')[0]}?sort=reference&direction=desc`);
  await expect(table.getByRole('row').nth(1)).toBeVisible();
  await table.getByRole('checkbox', { name: `Select ${REPORT}` }).check();
  await page.getByRole('region', { name: 'Selected rows' }).getByRole('button', { name: 'Supersede…' }).click();

  const dialog = page.getByRole('dialog');
  // Calder & Hale has two documents that cite the report. None of that is the
  // owner's to read: the dialog speaks of the owner's own side only.
  const impact = dialog.getByRole('region', { name: 'What relies on this' });
  await expect(impact).toBeVisible();
  await expect(dialog).not.toContainText(CHAPTER);
  await expect(dialog).not.toContainText(PRIVATE_DRAFT);
  await expect(dialog).not.toContainText('Calder');

  await dialog.getByPlaceholder('Search deliverables').fill(REPLACEMENT);
  await dialog.getByRole('option', { name: new RegExp(REPLACEMENT) }).click();
  await dialog.getByRole('button', { name: 'Supersede', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Calder & Hale finds a notification, and the Checks tab shows the sentence that rests on the report', async ({ page }) => {
  await loginAs(page, SEEDED.consultant);
  // the notification is waiting on the project home. It points at the most
  // recently edited of Calder & Hale's affected drafts — on a fresh seed that is
  // the chapter; on a re-run other specs' leftovers may be newer, so the label
  // is not pinned and the chapter is opened by its own address below.
  const row = page.getByRole('row', { name: new RegExp(EVENT) });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(/\/editor\//);
  await page.getByText('Checks', { exact: false }).first().click();
  await expect(page.getByRole('region', { name: 'Out-of-date sources' })).toContainText(
    `${REPORT} v2 has been superseded by ${REPLACEMENT}`,
  );

  // the seeded chapter itself: the sentence that rests on the report is named
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const me = await eleanor.get<{ participants: Array<{ projectId: string }> }>('/me');
  const projectId = me.participants[0]!.projectId;
  const documents = await eleanor.get<{ items: Array<{ id: string; title: string }> }>(
    `/projects/${projectId}/sandbox-documents`,
  );
  const chapter = documents.items.find((d) => d.title === CHAPTER)!;
  await page.goto(`/projects/${projectId}/editor/${chapter.id}`);
  await page.getByText('Checks', { exact: false }).first().click();
  const live = page.getByRole('region', { name: 'Out-of-date sources' });
  await expect(live).toBeVisible();
  await expect(live).toContainText('computed now, not a saved finding');
  await expect(live).toContainText(`${REPORT} v2 has been superseded by ${REPLACEMENT}`);
  await expect(live).toContainText('Made ground was found to a depth of 2.4 m');
});

test('Redgate (Org C) is told nothing and can read no trace of it', async ({ page }) => {
  const nadia = await ApiSession.login(SEEDED.secondConsultant);
  const list = await nadia.get<ListNotificationsResponse>('/notifications');
  expect(list.items.filter((n) => n.eventType === 'cited-document-superseded')).toEqual([]);
  // Redgate cannot even see the report, so there is no "cited by" to read
  const owner = await ApiSession.login(SEEDED.owner);
  expect((await nadia.raw('get', `/containers/${reportId}/cited-by`)).status()).toBe(404);

  // and the same on screen: nothing waiting for Redgate
  await loginAs(page, SEEDED.secondConsultant);
  await expect(page.getByText(EVENT)).toHaveCount(0);

  // the owner is told nothing of its own act, and its dialog's numbers never named B
  const mine = await owner.get<ListNotificationsResponse>('/notifications');
  expect(mine.items.filter((n) => n.eventType === 'cited-document-superseded')).toEqual([]);
});
