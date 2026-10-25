// T-476 acceptance — findings polish, the strength map and the disproving pass,
// driven in the browser (ADR-0053 addenda A8 and A9).
//
// *In plain terms: Eleanor runs the QA checker on a draft the fake model finds
// several things wrong with, some required and some advisory. In the editor's
// Checks tab one click on "Required" narrows the list to the required ones, and
// the same findings can be read as a table. Back on the launcher she sees which
// kinds of finding are settled in code and which are the model's reading; she
// switches on the optional second look, sees what it would add beside the
// switch — and nowhere else, not on the plan — and runs it. The result says how
// many findings the model raised and how many the second look withdrew.*
//
// Repeatable on one seed: the draft is created here, by this file, with a title
// of its own, and everything is looked up by the ids it made.
import { expect, test } from '@playwright/test';
import type { Finding, ListFindingsResponse, SandboxDocument } from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

test.describe.configure({ mode: 'serial' });

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';
const stamp = String(Date.now()).slice(-6);
const TITLE = `Findings polish ${stamp}`;

// every quote the fake model looks for is in here, so it raises its judgement
// findings (one required, two advisory), and "Scheme" gives the code pass its
// own — the mix the filter row is for
const CONTENT = `${TITLE}

1. Baseline sources
The GIR records PAH exceedances at three trial pits south of the Wrenfield substation and a perched water table within the made ground.

2. Conceptual site model
A conceptual site model has been prepared for each land parcel crossed by the route. The Scheme crosses nine parcels.

3. Assessment methodology
Where the preliminary risk assessment identifies a potentially unacceptable risk, a remediation options appraisal will be scoped for the affected parcel.`;

let eleanor: ApiSession;
let projectId: string;
let documentId: string;

test.beforeAll(async () => {
  eleanor = await ApiSession.login(SEEDED.consultant);
  const me = await eleanor.get<{ participants: Array<{ projectId: string }> }>('/me');
  projectId = me.participants[0]!.projectId;
  const doc = await eleanor.post<SandboxDocument>(`/projects/${projectId}/sandbox-documents`, { title: TITLE });
  documentId = doc.id;
  await eleanor.patch(`/sandbox-documents/${documentId}`, { content: CONTENT });
});

test.afterAll(async () => {
  await eleanor?.dispose();
});

test('forty-odd findings narrow to the required ones in one click, and read as a table', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(SEEDED.consultant);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(PROJECT).first()).toBeVisible();

  // the launcher, with this draft already bound (the editor route is this route)
  await page.goto(`/projects/${projectId}/tools/qa-check?documentId=${documentId}`);
  await expect(page.getByRole('heading', { name: 'QA checker' })).toBeVisible();

  // ── the strength map (A8): a description, on the launcher ────────────────
  const rules = page.getByRole('table', { name: 'Writing rule kinds and how each is checked' });
  await expect(rules).toContainText('Settled in code');
  await expect(rules).toContainText('The model’s reading');
  await expect(rules.getByRole('row').filter({ hasText: 'Judgement' })).toContainText('The model’s reading');
  await expect(rules.getByRole('row').filter({ hasText: 'Preferred wording' })).toContainText('Settled in code');

  // ── run it once with the pass OFF, and open the draft's Checks tab ───────
  await page.getByRole('button', { name: 'See the plan' }).click();
  // the plan shows no price line, and nothing about the second look
  const plan = page.locator('.card').filter({ hasText: 'Covers:' });
  await expect(plan).toBeVisible();
  await expect(plan).not.toContainText(/cost|£|\$/i);
  await expect(plan).not.toContainText('argued against');
  await page.getByRole('button', { name: 'Run the check' }).click();
  await expect(page.getByText('Covered:')).toBeVisible({ timeout: 60_000 });
  // off: the coverage sentence says nothing of a disproving pass
  await expect(page.getByText('Covered:').locator('..')).not.toContainText('disproving');

  await page.getByRole('link', { name: 'Open the draft to work through them' }).click();
  await page.getByText(/^Checks/).first().click();

  const severity = page.getByRole('radiogroup', { name: 'Show findings by severity' });
  await expect(severity).toBeVisible();
  // the counts are on the switches
  const required = severity.getByRole('radio', { name: /^Required \d+$/ });
  const advisory = severity.getByRole('radio', { name: /^Advisory \d+$/ });
  await expect(required).toBeVisible();
  await expect(advisory).toBeVisible();
  const requiredCount = Number((await required.textContent())!.replace(/\D/g, ''));
  const allCount = Number((await severity.getByRole('radio', { name: /^All \d+$/ }).textContent())!.replace(/\D/g, ''));
  expect(requiredCount).toBeGreaterThan(0);
  expect(allCount).toBeGreaterThan(requiredCount);

  // ONE click narrows to the required ones
  await required.click();
  await expect(page.getByText(`Showing ${requiredCount} of ${allCount}.`)).toBeVisible();
  const badges = page.locator('.finding .badge');
  await expect(badges.first()).toBeVisible();
  for (const text of await badges.allTextContents()) expect(text.trim()).toBe('Required');
  expect(await badges.count()).toBe(requiredCount);

  // the same findings as a table, same filter
  await page.getByRole('radiogroup', { name: 'How to lay the findings out' }).getByRole('radio', { name: 'Table' }).click();
  const table = page.getByRole('table', { name: 'Findings' });
  await expect(table).toBeVisible();
  await expect(table.getByRole('columnheader')).toContainText(['Ref', 'Severity', 'Check', 'Rule or source', 'Where', 'State']);
  expect(await table.locator('tbody tr').count()).toBe(requiredCount);
  await expect(table.locator('tbody')).not.toContainText('Advisory');

  // everything again, in one click
  await page.getByRole('button', { name: 'Show all' }).click();
  expect(await table.locator('tbody tr').count()).toBe(allCount);

  // ── and it sorts: the click on "Where" produces the order the register sorts by.
  // (T-486 c — this click used to assert nothing.) "Where" sorts by the finding's
  // position in the draft (the start of its anchored span), which the cell does
  // not print, so the expected order is worked out from the same findings read
  // over the API: the cells as they stand, stably sorted by that position — the
  // register's own comparator, applied to the register's own starting order.
  const findings = (await eleanor.get<ListFindingsResponse>(`/sandbox-documents/${documentId}/findings`)).items;
  const cellFor = (finding: Finding) => {
    const quote = finding.anchor.verbatim;
    return `“${quote.length > 48 ? `${quote.slice(0, 48)}…` : quote}”`;
  };
  const whereHeader = table.getByRole('columnheader', { name: /Where/ });
  const headers = await table.getByRole('columnheader').allTextContents();
  const whereColumn = headers.findIndex((text) => /Where/.test(text));
  expect(whereColumn).toBeGreaterThanOrEqual(0);
  const whereCells = async () =>
    (await table.locator('tbody tr').evaluateAll((rows, column) =>
      rows.map((row) => row.querySelectorAll('td')[column as number]?.textContent?.trim() ?? ''), whereColumn));
  const startOf = new Map<string, number>();
  for (const finding of findings) {
    const label = cellFor(finding);
    // two different places printing the same words would make the cell ambiguous
    // and the comparison below meaningless — say so rather than pass quietly
    if (startOf.has(label) && startOf.get(label) !== finding.anchor.span.start) {
      throw new Error(`two findings print the same “Where” text (${label}) at different places`);
    }
    startOf.set(label, finding.anchor.span.start);
  }
  const startingOrder = await whereCells();
  expect(startingOrder).toHaveLength(allCount);
  for (const label of startingOrder) expect(startOf.has(label), `no finding prints ${label}`).toBe(true);
  // the precondition: the column holds at least two different places, or an
  // order assertion over it would prove nothing
  expect(new Set(startingOrder.map((label) => startOf.get(label))).size).toBeGreaterThanOrEqual(2);
  const sortedLike = (sign: 1 | -1) =>
    [...startingOrder].sort((a, b) => (startOf.get(a)! - startOf.get(b)!) * sign);

  // a person clicks the heading cell, wherever in it — so the click here is on the
  // cell itself (its middle), not on the small button inside it. Before T-486 the
  // button was only as big as the word, a click on the cell's middle landed beside
  // it, and nothing sorted; now the button fills the cell.
  await whereHeader.click();
  await expect(whereHeader).toHaveAttribute('aria-sort', 'ascending');
  expect(await whereCells()).toEqual(sortedLike(1));
  // a second click reverses it
  await whereHeader.click();
  await expect(whereHeader).toHaveAttribute('aria-sort', 'descending');
  expect(await whereCells()).toEqual(sortedLike(-1));
  // and the two orders are not the same list — the clicks did something
  expect(sortedLike(1)).not.toEqual(sortedLike(-1));
});

test('the second look: its price beside its switch and nowhere else, and its withdrawals counted', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(SEEDED.consultant);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(PROJECT).first()).toBeVisible();
  await page.goto(`/projects/${projectId}/tools/qa-check?documentId=${documentId}`);
  await expect(page.getByRole('heading', { name: 'QA checker' })).toBeVisible();

  // off by default, and nothing about a price anywhere on the launcher
  const toggle = page.getByRole('checkbox', { name: /Second look at the model/ });
  await expect(toggle).not.toBeChecked();
  await expect(page.locator('[data-disproving-cost]')).toHaveCount(0);

  // switching it on shows what it adds, beside the switch
  await toggle.check();
  const cost = page.locator('[data-disproving-cost]');
  await expect(cost).toContainText(/Adds about \d+ more model calls?/);

  // the plan declares the step — and still shows no price line (A3 stands)
  await page.getByRole('button', { name: 'See the plan' }).click();
  const plan = page.locator('.card').filter({ hasText: 'Covers:' });
  await expect(plan).toContainText('argue that each finding it raised is wrong');
  await expect(plan).not.toContainText(/cost|£|\$|tokens/i);
  // the only place a figure about the pass appears is beside its switch
  await expect(page.locator('[data-disproving-cost]')).toHaveCount(1);

  await page.getByRole('button', { name: 'Run the check' }).click();
  await expect(page.getByText('Covered:')).toBeVisible({ timeout: 60_000 });
  // N raised, M withdrawn — the fake model talks itself out of the hedging note
  await expect(page.getByText('Covered:').locator('..')).toContainText(/\d+ raised, 1 withdrawn by the disproving pass/);
});
