// T-457 — the document page: one page per container, reached from the plan,
// the library, the review list and the side menu; its tabs; and the wall
// negative (a firm outside the share gets no page).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { SEEDED } from './support/api';

test.describe.configure({ mode: 'serial' });

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';

async function loginAs(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(PROJECT)).toBeVisible();
  await page.getByText(PROJECT).click();
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
  await expect(page2.getByText('This document is not on a plan you can see.')).toBeVisible();
  await other.close();
});
