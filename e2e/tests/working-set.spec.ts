// T-471 acceptance — the working set, on Ask.
//
// *In plain terms: on Ask, hand the AI two of your own drafts from a working
// area only you are in — open the picker, click the first, click the second,
// press Done — and ask. The answer says "Drawing on your working area — 2
// documents" and cites neither. Then a colleague in the same firm who is NOT in
// that working area opens the same conversation: they are told there were two
// documents from a working area they are not in, and are shown neither title.*
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type {
  GetHistoryResponse,
  MeResponse,
  Sandbox,
  SandboxDocument,
} from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';
// the seeded colleague at Calder & Hale who works the same scheme (see README)
const COLLEAGUE = 'owen.vance@calderhale.example';

async function login(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(PROJECT).first()).toBeVisible();
}

test('Ask: pin two drafts in four clicks, read "Drawing on your working area — 2 documents", cite neither; a colleague outside that working area sees only the count', async ({ page, browser }) => {
  // ── arrange, through the API: a working area only Eleanor is in, with two drafts ──
  const stamp = Date.now();
  const alpha = `WS draft alpha ${stamp}`;
  const beta = `WS draft beta ${stamp}`;
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const projectId = (await eleanor.get<MeResponse>('/me')).participants[0]!.projectId;
  const area = await eleanor.post<Sandbox>(`/projects/${projectId}/sandboxes`, {
    name: `Only Eleanor ${stamp}`,
    scope: 'named_user',
  });
  for (const title of [alpha, beta]) {
    const doc = await eleanor.post<SandboxDocument>(`/projects/${projectId}/sandbox-documents`, { title, sandboxId: area.id });
    await eleanor.raw('patch', `/sandbox-documents/${doc.id}`, { content: `${title}: the ground model assumes made ground to 2 m.` });
  }

  // ── the colleague is NOT in that working area: the picker never offers them its drafts ──
  const colleague = await ApiSession.login(COLLEAGUE);
  const offered = await colleague.get<{ items: Array<{ title: string }> }>(
    `/projects/${projectId}/working-area?q=${encodeURIComponent(`WS draft`)}`,
  );
  expect(offered.items.map((item) => item.title)).toEqual([]);

  // ── the browser ──────────────────────────────────────────────────────────
  await login(page, SEEDED.consultant);
  await page.getByText(PROJECT).first().click();
  await page.getByRole('link', { name: 'Ask' }).first().click();

  // click 1: open the picker. Typing to search is not a click.
  await page.getByRole('button', { name: /Working set/ }).click();
  await page.keyboard.type(`WS draft`);
  const rowAlpha = page.getByRole('option', { name: new RegExp(alpha) });
  const rowBeta = page.getByRole('option', { name: new RegExp(beta) });
  await expect(rowAlpha).toBeVisible();
  // each row says which working area it sits in
  await expect(rowAlpha).toContainText(`Only Eleanor ${stamp}`);
  // click 2 and 3: the two drafts
  await rowAlpha.click();
  await expect(rowAlpha).toHaveAttribute('aria-selected', 'true');
  await rowBeta.click();
  await expect(rowBeta).toHaveAttribute('aria-selected', 'true');
  // click 4: Done
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Working set · 2/ })).toBeVisible();

  // ── ask, and read the label ───────────────────────────────────────────────
  const composer = page.getByPlaceholder('Ask about the project');
  await composer.fill('Given my two drafts and the library, what have we missed?');
  await composer.press('Enter');
  const label = page.locator('.cf-working-set').first();
  await expect(label).toContainText('Drawing on your working area — 2 documents', { timeout: 30_000 });
  // the titles are on hover, not on the line
  await expect(label).not.toContainText(alpha);
  await label.hover();
  await expect(page.getByRole('dialog', { name: /working set/i })).toContainText(alpha);
  await expect(page.getByRole('dialog', { name: /working set/i })).toContainText(beta);

  // no citation to either draft: not on the page's citation chips, not in the answer's text
  await expect(page.locator('button.cite', { hasText: /WS draft/ })).toHaveCount(0);
  await expect(page.locator('.bubble').first()).not.toContainText('[A');

  // …and not in the record: the run's citations name library sources only
  const history = await eleanor.get<GetHistoryResponse>(`/projects/${projectId}/history`);
  const conversationId = history.items[0]!.conversationId;
  const thread = await eleanor.get<{ runs: Array<{ citations: unknown[]; workingSet?: unknown[] }> }>(`/conversations/${conversationId}`);
  const run = thread.runs.at(-1)!;
  expect(run.workingSet).toHaveLength(2);
  expect(JSON.stringify(run.citations)).not.toContain('WS draft');

  // ── a colleague outside that working area opens the same thread ───────────
  const colleagueContext = await browser.newContext();
  const colleaguePage = await colleagueContext.newPage();
  await login(colleaguePage, COLLEAGUE);
  await colleaguePage.goto(`/projects/${projectId}/ask?conversation=${conversationId}`);
  await expect(colleaguePage.locator('.cf-working-set').first()).toContainText(
    '2 documents from a working area you are not in',
    { timeout: 30_000 },
  );
  // the count, never the titles — not on the page, and not in what the server sent
  await expect(colleaguePage.getByText(alpha)).toHaveCount(0);
  await expect(colleaguePage.getByText(beta)).toHaveCount(0);
  const theirs = await colleague.get<{ runs: Array<{ workingSet?: unknown[] }> }>(`/conversations/${conversationId}`);
  expect(theirs.runs.at(-1)!.workingSet).toEqual([{ hidden: true }, { hidden: true }]);
  expect(JSON.stringify(theirs)).not.toContain('WS draft');
  await colleagueContext.close();

  await eleanor.dispose();
  await colleague.dispose();
});
