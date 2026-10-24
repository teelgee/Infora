// T-457 — the document page: one page per container, reached from the plan,
// the library, the review list and the side menu; its tabs; and the wall
// negative (a firm outside the share gets no page).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { DeliverableShare, GetLibraryResponse, ListRosterResponse, MeResponse } from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

test.describe.configure({ mode: 'serial' });

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';

async function loginAs(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(PROJECT).first()).toBeVisible();
  await page.getByText(PROJECT).first().click();
}

const tab = (page: Page, name: string) =>
  page.getByRole('radiogroup', { name: 'Document page sections' }).getByRole('radio', { name });

test('a plan row lands on the document page, whose tabs carry the record', async ({ page }) => {
  await loginAs(page, SEEDED.owner);
  await page.getByRole('link', { name: /Plan/ }).click();
  // a real row (the table renders skeleton rows while it loads): one with a
  // coded reference in it. The plan's visible columns are the organisation's
  // own standard (T-360), so the reference is read off the row wherever it sits
  const firstRow = page.getByRole('row').filter({ has: page.locator('td .mono') }).first();
  await expect(firstRow).toBeVisible();
  const rowText = await firstRow.innerText();
  await firstRow.locator('td .mono').first().click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).not.toHaveText(/Project schedule|Deliverable plan/);
  expect(rowText).toContain((await heading.innerText()).trim());
  // the overview says who can see it
  await expect(page.getByRole('list', { name: 'Who can see this' })).toBeVisible();
  // the tabs switch the body
  await tab(page, 'Versions').click();
  await expect(page.getByRole('list', { name: 'Versions' }).or(page.getByText(/No versions yet/))).toBeVisible();
  await tab(page, 'Activity').click();
  await expect(page.getByText(/What happened|Nothing has happened/)).toBeVisible();
  await tab(page, 'Relationships').click();
  await expect(page.getByText('Classification and relationships')).toBeVisible();
  await tab(page, 'Overview').click();
  await expect(page.getByText('Deliverable', { exact: true })).toBeVisible();
});

test('the library row, the review list and the side menu reach the same page', async ({ page }) => {
  await loginAs(page, SEEDED.owner);
  await page.getByRole('link', { name: /Project library/ }).click();
  // the register is paged, and the intake spec's "T472-…" rows sort ahead of
  // the seeded "WA-…" codes: sort by code descending so a seeded row is on page one
  await page.goto(`${page.url().split('?')[0]}?sort=reference&direction=desc`);
  // a live-deliverable row, by its coded reference (the screen's notice panels
  // have rows of their own above the register)
  const row = page.getByRole('row').filter({ hasText: /WA-[A-Z]{3}-[A-Z]{3}-\d{3}/ }).first();
  await expect(row).toBeVisible();
  const reference = (await row.innerText()).match(/WA-[A-Z]{3}-[A-Z]{3}-\d{3}/)![0];
  await row.click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(reference);

  // the review list's reference cell is the door to the page
  await page.getByRole('link', { name: /^Review$/ }).click();
  // T-462 — the review list is a paged register: find the row by its code first
  await page.getByRole('searchbox', { name: 'Search Review list' }).fill(reference);
  await page.getByRole('button', { name: reference, exact: true }).first().click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(reference);
});

test('a firm outside the share gets no page', async ({ page, browser }) => {
  // the owner finds a Calder & Hale deliverable and its page address
  await loginAs(page, SEEDED.owner);
  await page.getByRole('link', { name: /Plan/ }).click();
  const calder = page.getByRole('row').filter({ hasText: 'Calder & Hale' }).first();
  await expect(calder).toBeVisible();
  await calder.click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);
  const target = page.url();

  // Org C, the second consultant, in a fresh browser context: not on a plan it can see
  const other = await browser.newContext();
  const page2 = await other.newPage();
  await loginAs(page2, SEEDED.secondConsultant);
  await page2.goto(target);
  await expect(page2.getByText('This document is not one you can open.')).toBeVisible();
  await other.close();
});

// T-483 — the page opens for anyone who may READ the document, not only for
// the people on its plan row.
const READER_TABS = ['Overview', 'Versions', 'Relationships', 'Activity'];

test('a consultant opens a standard’s page and reads its currency and what cites it', async ({ page }) => {
  await loginAs(page, SEEDED.consultant);
  await page.getByRole('link', { name: /Project library/ }).click();
  // the seeded standard, found by its own code (the local database is bloated)
  await page.getByRole('searchbox', { name: /Search/ }).first().fill('WA-STD-BS5930-001');
  await page.getByRole('row').filter({ hasText: 'WA-STD-BS5930-001' }).first().click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('WA-STD-BS5930-001');
  // four tabs, and none of the plan's
  for (const name of READER_TABS) await expect(tab(page, name)).toBeVisible();
  await expect(tab(page, 'Review record')).toHaveCount(0);
  await expect(tab(page, 'Transmittals')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Edit details/ })).toHaveCount(0);
  // the currency card is on the overview
  await expect(page.getByText('Currency', { exact: true })).toBeVisible();
  await expect(page.getByText('Document', { exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Who can see this' })).toHaveCount(0);
  // the relationships tab is read-only
  await tab(page, 'Relationships').click();
  await expect(page.getByText('Classification and relationships')).toBeVisible();
});

test('a consultant reads "Cited by" on the standard its own work rests on', async ({ page }) => {
  await loginAs(page, SEEDED.consultant);
  await page.getByRole('link', { name: /Project library/ }).click();
  await page.getByRole('searchbox', { name: /Search/ }).first().fill('WA-GEO-GIR-004');
  await page.getByRole('row').filter({ hasText: 'WA-GEO-GIR-004' }).first().click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);
  await tab(page, 'Relationships').click();
  await expect(page.getByText('Cited by', { exact: true })).toBeVisible();
});

test('Redgate opens another firm’s shared deliverable and sees no plan-only tab', async ({ page }) => {
  const rachel = await ApiSession.login(SEEDED.owner);
  const nadia = await ApiSession.login(SEEDED.secondConsultant);
  const me = await nadia.get<MeResponse>('/me');
  const projectId = me.participants.find((p) => p.projectName === PROJECT)!.projectId;
  const roster = (await rachel.get<ListRosterResponse>(`/projects/${projectId}/participants`)).items;
  const redgateOrgId = roster.find((r) => r.name === 'Nadia Okonjo' && r.removedAt === null)!.organisationId;
  // a Calder & Hale deliverable on the library (the owner sees every row)
  const library = (await rachel.get<GetLibraryResponse>(`/projects/${projectId}/library`)).items;
  const calder = library.find((i) => i.kind === 'deliverable' && i.producerName.includes('Calder'))!;
  expect(calder).toBeTruthy();
  // the owner shares it with Redgate and Redgate acknowledges, through the product's own routes
  const shareRes = await rachel.raw('post', `/containers/${calder.containerId}/shares`, { organisationId: redgateOrgId });
  expect([201, 409]).toContain(shareRes.status());
  const shareId = shareRes.status() === 201 ? ((await shareRes.json()) as DeliverableShare).id : null;
  try {
    expect([201, 409]).toContain((await nadia.raw('post', `/containers/${calder.containerId}/acknowledgement`, {})).status());
    await loginAs(page, SEEDED.secondConsultant);
    await page.goto(`/projects/${projectId}/documents/${calder.containerId}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(calder.documentReference);
    for (const name of READER_TABS) await expect(tab(page, name)).toBeVisible();
    await expect(tab(page, 'Review record')).toHaveCount(0);
    await expect(tab(page, 'Transmittals')).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Who can see this' })).toHaveCount(0);
    await expect(page.getByText('Authoring team')).toHaveCount(0);
    await tab(page, 'Activity').click();
    await expect(page.getByText(/What happened|Nothing has happened/)).toBeVisible();
  } finally {
    // leave the seed as it was: the share is the spec's own, so the spec closes it
    if (shareId) await rachel.post(`/shares/${shareId}/revocation`, {});
  }
});

test('an organisation outside the share is told this is not a document it can open', async ({ page }) => {
  const rachel = await ApiSession.login(SEEDED.owner);
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const me = await eleanor.get<MeResponse>('/me');
  const projectId = me.participants.find((p) => p.projectName === PROJECT)!.projectId;
  // Redgate's own deliverable, shared with nobody
  const library = (await rachel.get<GetLibraryResponse>(`/projects/${projectId}/library`)).items;
  const redgate = library.find((i) => i.documentReference === 'WA-ECO-PEA-001')!;
  expect(redgate).toBeTruthy();
  await loginAs(page, SEEDED.consultant);
  await page.goto(`/projects/${projectId}/documents/${redgate.containerId}`);
  await expect(page.getByText('This document is not one you can open.')).toBeVisible();
  for (const name of READER_TABS) await expect(tab(page, name)).toHaveCount(0);
});
