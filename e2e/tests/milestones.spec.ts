// T-481 — milestones on the plan row, and the coverage view. The owner's
// schedule opens with a strip counting where every planned document stands,
// with Overdue and No draft bound yet as filters; an overdue milestone is on
// the owner's home, one click from the row; the producer's plan editor adds a
// milestone in the row's side panel, and the owner reads it there but cannot
// change it.
//
// The seeded project carries one milestone already late (WA-EIA-MST-001 should
// have reached S3 a week before the seed ran, and has no status code at all),
// so the overdue count is one on a fresh seed and stays one: the producer's
// milestone below is dated 2099.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { coverageSummary } from '@infora/contracts';
import type { GetPlanCoverageResponse } from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';
type PlanRow = { containerId: string };

async function loginAs(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(PROJECT).first()).toBeVisible();
  await page.getByText(PROJECT).first().click();
}
async function projectIdOf(session: ApiSession) {
  const me = await session.get<{ participants: Array<{ projectId: string; projectName: string }> }>('/me');
  return me.participants.find((p) => p.projectName === PROJECT)!.projectId;
}

test('the owner’s schedule counts where every planned document stands, and the two flags narrow the register', async ({ page }) => {
  const rachel = await ApiSession.login(SEEDED.owner);
  const projectId = await projectIdOf(rachel);
  const coverage = await rachel.get<GetPlanCoverageResponse>(`/projects/${projectId}/plan/coverage`);
  await rachel.dispose();
  // the seeded truth (the board sentence "one in review, three with no draft"
  // does not hold of the seed: it holds a planned scoping statement and an
  // accepted appraisal; other specs add rows of their own, so the exact numbers
  // are checked against the read, and what the seed fixes is checked as a floor)
  expect(coverage.counts.planned).toBeGreaterThanOrEqual(1);
  expect(coverage.counts.accepted).toBeGreaterThanOrEqual(1);
  expect(coverage.overdueMilestones).toBe(1);
  expect(coverage.overdueRows).toBe(1);

  await loginAs(page, SEEDED.owner);
  await page.getByRole('link', { name: /Project schedule|Deliverable plan|Plan/ }).first().click();
  const strip = page.getByRole('region', { name: 'Coverage' });
  await expect(strip.getByTestId('coverage-summary')).toHaveText(coverageSummary(coverage));
  await expect(strip.getByTestId('coverage-summary')).toContainText('1 milestone overdue');
  // the owner is not shown a firm's private internal checks, only draft bound
  await expect(strip.getByRole('button', { name: /^Frozen for internal review/ })).toHaveCount(0);

  const table = page.getByRole('table', { name: 'Deliverables plan' });
  // Overdue: just the late row, marked in words and not by colour alone
  await strip.getByRole('button', { name: /^Overdue/ }).click();
  await expect(page).toHaveURL(/overdue=true/);
  await expect(table.getByRole('row')).toHaveCount(2); // header + the one late row
  await expect(table.getByRole('row').nth(1)).toContainText('WA-EIA-MST-001');
  await expect(table.getByRole('row').nth(1)).toContainText('S3');
  await expect(table.getByRole('row').nth(1).getByText('Overdue', { exact: true })).toBeVisible();
  await strip.getByRole('button', { name: /^Overdue/ }).click();
  await expect(page).not.toHaveURL(/overdue=true/);

  // No draft bound yet: every row the strip counted as planned, on the server
  await strip.getByRole('button', { name: /^No draft bound yet/ }).click();
  await expect(page).toHaveURL(/stage=planned/);
  // one page holds fifty rows, and other specs add planned rows on every run, so
  // the count is capped at the page size; the seeded row is then found by search
  await expect(table.getByRole('row')).toHaveCount(Math.min(coverage.counts.planned, 50) + 1);
  await page.getByRole('searchbox', { name: 'Search Deliverables plan' }).fill('WA-EIA-MST-001');
  await expect(table.getByRole('row').filter({ hasText: 'WA-EIA-MST-001' })).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search Deliverables plan' }).fill('');

  // the whole plan downloads in the shape it imports in
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export plan' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^deliverables-.*\.xlsx$/);
});

test('an overdue milestone is on the owner’s home, one click from its row', async ({ page }) => {
  await loginAs(page, SEEDED.owner);
  const item = page
    .getByRole('list', { name: 'Waiting on you' })
    .getByRole('button', { name: /Overdue: WA-EIA-MST-001 should have reached S3 by/ });
  await expect(item).toBeVisible();
  await item.click();
  await expect(page).toHaveURL(/\/plan\?q=WA-EIA-MST-001/);
  const table = page.getByRole('table', { name: 'Deliverables plan' });
  await expect(table.getByRole('row').nth(1)).toContainText('WA-EIA-MST-001');
  // the row's own panel is open, showing the milestone where it is changed
  await expect(page.getByRole('dialog').getByRole('group', { name: 'Milestones' })).toContainText('S3');
});

test('a producer’s plan editor adds a milestone in the row’s panel; the owner reads it and cannot change it', async ({ page, browser }) => {
  const stamp = Date.now();
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const projectId = await projectIdOf(eleanor);
  const ref = `T481-${String(stamp).slice(-6)}`;
  const row = await eleanor.post<PlanRow>(`/projects/${projectId}/plan`, { documentReference: ref, title: `Milestone me ${stamp}` });

  await loginAs(page, SEEDED.consultant);
  await page.getByRole('link', { name: /Plan/ }).first().click();
  await page.getByRole('searchbox', { name: 'Search Deliverables plan' }).fill(ref);
  await page.getByRole('button', { name: `Details for ${ref}` }).click();
  const panel = page.getByRole('dialog');
  const milestones = panel.getByRole('group', { name: 'Milestones' });
  await expect(milestones).toBeVisible();
  await milestones.getByLabel('Milestone status code').selectOption('S3');
  await milestones.getByLabel('Milestone target date').fill('2099-01-31');
  await milestones.getByRole('button', { name: 'Add milestone' }).click();
  await expect(milestones.getByLabel('Target date for S3')).toHaveValue('2099-01-31');
  await page.keyboard.press('Escape');
  // the register's Next milestone column now says it, and it is not overdue
  const table = page.getByRole('table', { name: 'Deliverables plan' });
  const planRow = table.getByRole('row').filter({ hasText: ref });
  await expect(planRow).toContainText('S3');
  await expect(planRow.getByText('Overdue', { exact: true })).toHaveCount(0);

  // the same milestone reaches the owner, who reads it and has no controls
  const stored = await eleanor.get<{ items: Array<{ containerId: string; milestones: Array<{ statusCode: string; targetDate: string }> }> }>(`/projects/${projectId}/plan?q=${ref}`);
  expect(stored.items.find((r) => r.containerId === row.containerId)?.milestones).toMatchObject([{ statusCode: 'S3', targetDate: '2099-01-31' }]);
  await eleanor.dispose();

  // a second, separate browser: the owner's own session, not the producer's
  const owner = await (await browser.newContext()).newPage();
  await loginAs(owner, SEEDED.owner);
  await owner.getByRole('link', { name: /Project schedule|Plan/ }).first().click();
  await owner.getByRole('searchbox', { name: 'Search Deliverables plan' }).fill(ref);
  await owner.getByRole('button', { name: `Details for ${ref}` }).click();
  const ownerView = owner.getByRole('dialog').getByRole('group', { name: 'Milestones' });
  await expect(ownerView).toContainText('S3');
  await expect(ownerView.getByRole('button', { name: 'Add milestone' })).toHaveCount(0);
  await expect(ownerView.getByLabel('Target date for S3')).toHaveCount(0);
});
